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
import logging
import time

import cv2
import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from routers.websocket_manager import manager
from services.depth_model import depth_model_service
from services.obstacle_detector import obstacle_detector

router = APIRouter(tags=["websocket"])
logger = logging.getLogger(__name__)

# Global variable to hold the latest frame from the phone for Gemini descriptions
latest_frame = None


active_processor_ws = None

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
                is_indoor = data.get("depth_mode", "outdoor") == "indoor"

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
