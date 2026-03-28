"""
WebSocket endpoint that accepts video frames from the frontend,
runs the depth model, and returns analysis results.

This mirrors the swm2_testy approach:
  Frontend plays <video> smoothly → captures frame every ~150ms
  → sends here → depth model → results sent back to same client
  + obstacle alerts broadcast to user/caregiver channels

Message from client:
  {"type": "frame", "data": "<base64 JPEG>", "depth_mode": "indoor"|"outdoor"}

Message to client:
  {
    "type": "analysis",
    "depth_frame": "<base64 JPEG>",   # colorized depth map
    "min_distance": float,            # closest obstacle in metres
    "inference_ms": float,
    "is_indoor": bool
  }
"""

import asyncio
import base64
import io
import logging
import time

import cv2
import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from PIL import Image

from config import (
    AUTO_DEPTH_MODE_DEFAULT,
    AUTO_DEPTH_MODE_INTERVAL_SECONDS,
    AUTO_DEPTH_MODE_WITH_GEMINI,
)
from routers.websocket_manager import manager
from services.depth_model import depth_model_service
from services.gemini_service import gemini_service
from services.obstacle_detector import obstacle_detector

router = APIRouter(tags=["websocket"])
logger = logging.getLogger(__name__)

# Global variable to hold the latest frame from the phone for Gemini descriptions
latest_frame = None
auto_depth_mode = AUTO_DEPTH_MODE_DEFAULT if AUTO_DEPTH_MODE_DEFAULT in ("indoor", "outdoor") else None


active_processor_ws = None

# Track connected multi-users
connected_multi_users: set[str] = set()


def get_auto_depth_mode() -> str | None:
    return auto_depth_mode


async def detect_depth_mode_from_frame(frame_rgb: np.ndarray) -> str | None:
    img = Image.fromarray(frame_rgb)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=80)
    image_bytes = buf.getvalue()

    detected = await gemini_service.get_indoor_outdoor(image_bytes)
    return detected if detected in ("indoor", "outdoor") else None


async def auto_update_depth_mode_loop() -> None:
    """Periodically classifies latest frame as indoor/outdoor and updates depth mode."""
    global auto_depth_mode

    if not AUTO_DEPTH_MODE_WITH_GEMINI:
        logger.info("[DepthMode] auto Gemini switching disabled")
        return

    logger.info(
        "[DepthMode] auto Gemini switching enabled (interval=%.0fs, initial=%s)",
        AUTO_DEPTH_MODE_INTERVAL_SECONDS,
        auto_depth_mode or "unknown",
    )

    while True:
        try:
            frame = latest_frame
            if frame is not None:
                detected = await detect_depth_mode_from_frame(frame)
                if detected in ("indoor", "outdoor"):
                    if detected != auto_depth_mode:
                        logger.info("[DepthMode] switched %s -> %s", auto_depth_mode or "unknown", detected)
                    auto_depth_mode = detected
        except Exception:
            logger.exception("[DepthMode] auto update failed")

        await asyncio.sleep(max(5.0, AUTO_DEPTH_MODE_INTERVAL_SECONDS))


@router.websocket("/ws/processor/{user_id}")
async def processor_websocket_with_id(ws: WebSocket, user_id: str):
    """Multi-user processor — broadcasts frames tagged with user_id to 'multi' channel."""
    await ws.accept()
    loop = asyncio.get_event_loop()
    connected_multi_users.add(user_id)
    logger.info(f"[Processor/{user_id}] connected")

    # Notify multi-assistant about connection
    await manager.broadcast("multi", {"type": "user_connected", "user_id": user_id})

    try:
        while True:
            try:
                data = await ws.receive_json()
                if data.get("type") != "frame":
                    continue

                b64_str = data["data"]
                b64_str += "=" * ((4 - len(b64_str) % 4) % 4)

                # Broadcast raw frame with user_id to multi-assistant
                await manager.broadcast("multi", {
                    "type": "frame",
                    "user_id": user_id,
                    "data": b64_str,
                })

                # Decode for depth inference
                raw = base64.b64decode(b64_str)
                arr = np.frombuffer(raw, dtype=np.uint8)
                frame_bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                if frame_bgr is None:
                    continue
                frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
                is_indoor = data.get("depth_mode", "outdoor") == "indoor"

                depth_map, inference_ms = await loop.run_in_executor(
                    None,
                    lambda f=frame_rgb, i=is_indoor: depth_model_service.predict_depth(f, i),
                )

                obstacle, min_dist, direction, severity = obstacle_detector.detect(depth_map, is_indoor)
                # No alerts for multi-users (no pinging)

                await ws.send_json({
                    "type": "analysis",
                    "min_distance": round(min_dist, 2),
                    "inference_ms": round(inference_ms, 1),
                    "is_indoor": is_indoor,
                })
            except WebSocketDisconnect:
                raise
            except Exception as e:
                logger.error(f"[Processor/{user_id}] error: {e}")
    except WebSocketDisconnect:
        connected_multi_users.discard(user_id)
        await manager.broadcast("multi", {"type": "user_disconnected", "user_id": user_id})
        logger.info(f"[Processor/{user_id}] disconnected")


@router.websocket("/ws/processor")
async def processor_websocket(ws: WebSocket):
    global active_processor_ws
    await ws.accept()
    
    # Latest wins: if someone connects, they become the active processor
    active_processor_ws = ws
    loop = asyncio.get_event_loop()
    logger.info("[Processor] client connected as Active Processor")

    try:
        while True:
            try:
                data = await ws.receive_json()
                if data.get("type") != "frame":
                    continue

                t0 = time.perf_counter()

                # Decode base64 JPEG → RGB numpy
                b64_str = data["data"]
                b64_str += "=" * ((4 - len(b64_str) % 4) % 4) # Fix padding
                raw = base64.b64decode(b64_str)
                arr = np.frombuffer(raw, dtype=np.uint8)
                frame_bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                if frame_bgr is None:
                    continue
                frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
                
                # Store latest frame globally for user_ws.py
                global latest_frame
                latest_frame = frame_rgb

                if AUTO_DEPTH_MODE_WITH_GEMINI and get_auto_depth_mode() is None:
                    detected = await detect_depth_mode_from_frame(frame_rgb)
                    if detected:
                        global auto_depth_mode
                        auto_depth_mode = detected
                        logger.info("[DepthMode] initial detection -> %s", detected)

                selected_mode = get_auto_depth_mode() if AUTO_DEPTH_MODE_WITH_GEMINI else data.get("depth_mode", "outdoor")
                if selected_mode not in ("indoor", "outdoor"):
                    selected_mode = data.get("depth_mode", "outdoor")
                is_indoor = selected_mode == "indoor"

                await manager.broadcast("caregiver", {"type": "frame", "data": b64_str})
                await manager.broadcast("stats", {"type": "frame", "data": b64_str})

                # Depth inference (thread pool — CPU-bound)
                depth_map, inference_ms = await loop.run_in_executor(
                    None,
                    lambda f=frame_rgb, i=is_indoor: depth_model_service.predict_depth(f, i),
                )

                # Obstacle detection + alerts
                obstacle, min_dist, direction, severity = obstacle_detector.detect(depth_map, is_indoor)
                if obstacle and obstacle_detector.should_alert():
                    await manager.broadcast("user", {
                        "type": "obstacle_ping",
                        "distance": round(min_dist, 2),
                        "direction": direction,
                        "severity": severity,
                        "timestamp": time.time(),
                    })
                    alert_text = obstacle_detector.format_alert(min_dist, is_indoor, direction, severity)
                    alert_payload = {
                        "type": "alert",
                        "text": alert_text,
                        "distance": round(min_dist, 2),
                        "direction": direction,
                        "severity": severity,
                        "is_indoor": is_indoor,
                        "timestamp": time.time(),
                    }
                    await manager.broadcast("caregiver", alert_payload)

                # Send depth visualisation back to this client
                depth_b64 = depth_model_service.depth_to_visualization_b64(depth_map)
                total_ms = round((time.perf_counter() - t0) * 1000, 1)
                analysis_payload = {
                    "type": "analysis",
                    "depth_frame": depth_b64,
                    "min_distance": round(min_dist, 2),
                    "inference_ms": round(inference_ms, 1),
                    "is_indoor": is_indoor,
                    "total_ms": total_ms,
                }
                await ws.send_json(analysis_payload)
                await manager.broadcast("stats", analysis_payload)

                # Forward metrics to stats panel
                await manager.broadcast("stats", {
                    "type": "metrics",
                    "depth_ms": round(inference_ms, 1),
                    "fps": round(1000 / max(total_ms, 1), 1),
                    "frame_count": 0,
                    "is_indoor": is_indoor,
                    "min_distance": round(min_dist, 2),
                    "timestamp": time.time(),
                })
            except WebSocketDisconnect:
                raise
            except Exception as e:
                logger.error(f"[Processor loop] error: {e}")

    except WebSocketDisconnect:
        logger.info("[Processor] client disconnected")
