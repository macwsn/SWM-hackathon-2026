import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from routers.websocket_manager import manager

router = APIRouter(tags=["websocket"])
logger = logging.getLogger(__name__)


@router.websocket("/ws/stats")
async def stats_websocket(ws: WebSocket):
    """
    WebSocket for the statistics/diagnostics panel (read-only).

    Receives (broadcast by backend):
      {"type": "depth_frame",        "data": "<base64 JPEG>", "min_distance": float, "inference_ms": float, "is_indoor": bool}
      {"type": "gemini_description", "text": str, "response_ms": float, "timestamp": float}
      {"type": "metrics",            "depth_ms": float, "fps": float, "frame_count": int, "is_indoor": bool, "min_distance": float, "timestamp": float}
      {"type": "alert",              "text": str, "distance": float, "timestamp": float}
    """
    await manager.connect("stats", ws)
    try:
        while True:
            await ws.receive_text()  # keep connection alive; panel is passive
    except WebSocketDisconnect:
        manager.disconnect("stats", ws)
    except Exception as exc:
        logger.error(f"[WS/stats] {exc}")
        manager.disconnect("stats", ws)
