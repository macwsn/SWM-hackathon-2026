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
from services.tts_service import tts_service

router = APIRouter(tags=["websocket"])
logger = logging.getLogger(__name__)


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
            data = await ws.receive_json()
            if active_processor_ws != ws:
                # This connection has been superseded by a newer one
                break

            if data.get("type") != "frame":
                continue

            t0 = time.perf_counter()
            is_indoor = data.get("depth_mode", "outdoor") == "indoor"

            # Decode base64 JPEG → RGB numpy
            raw_b64 = data["data"]
            raw = base64.b64decode(raw_b64)
            arr = np.frombuffer(raw, dtype=np.uint8)
            frame_bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if frame_bgr is None:
                continue
            frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)

            # Broadcast frame to caregivers and stats panel
            frame_payload = {
                "type": "frame",
                "data": raw_b64
            }
            await manager.broadcast("caregiver", frame_payload)
            await manager.broadcast("stats", frame_payload)

            # All heavy processing (inference, detector, visualization) should be in the executor
            # to avoid blocking the event loop.
            def heavy_depth_tasks(f, indoor):
                d_map, inf_ms = depth_model_service.predict_depth(f, indoor)
                # Obstacle detection
                obs, m_dist = obstacle_detector.detect(d_map, indoor)
                # Visualization (Base64 is expensive, do it here)
                d_b64 = depth_model_service.depth_to_visualization_b64(d_map)
                return d_map, inf_ms, obs, m_dist, d_b64

            depth_map, inference_ms, obstacle, min_dist, depth_b64 = await loop.run_in_executor(
                None, heavy_depth_tasks, frame_rgb, is_indoor
            )

            if obstacle and obstacle_detector.should_alert():
                alert_text = obstacle_detector.format_alert(min_dist, is_indoor)
                audio_b64 = await tts_service.synthesize_b64(alert_text)
                await manager.broadcast("user", {
                    "type": "tts_audio", "data": audio_b64, "text": alert_text,
                })
                alert_payload = {
                    "type": "alert",
                    "text": alert_text,
                    "distance": round(min_dist, 2),
                    "is_indoor": is_indoor,
                    "timestamp": time.time(),
                }
                await manager.broadcast("caregiver", alert_payload)
            
            total_ms = round((time.perf_counter() - t0) * 1000, 1)
            
            # User only needs the distance and metadata (since visual is hidden anyway)
            analysis_lite = {
                "type": "analysis",
                "min_distance": round(min_dist, 2),
                "inference_ms": round(inference_ms, 1),
                "is_indoor": is_indoor,
                "total_ms": total_ms,
            }
            # Stats needs the full frame
            analysis_full = {
                **analysis_lite,
                "depth_frame": depth_b64,
            }
            
            await ws.send_json(analysis_lite)
            await manager.broadcast("stats", analysis_full)

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
        logger.info("[Processor] client disconnected")
    except Exception as exc:
        logger.error(f"[Processor] error: {exc}")
    finally:
        if active_processor_ws == ws:
            active_processor_ws = None
        await ws.close()
