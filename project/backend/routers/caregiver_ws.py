import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from routers.websocket_manager import manager
from services.tts_service import tts_service

router = APIRouter(tags=["websocket"])
logger = logging.getLogger(__name__)


@router.websocket("/ws/caregiver")
async def caregiver_websocket(ws: WebSocket):
    """
    WebSocket for the caregiver/assistant panel.

    Receives from client:
      {"type": "send_voice_text", "text": str}
          — caregiver typed a message; delivered to user as TTS.
          (Real-time voice goes over WebRTC, not this channel.)

    Receives (broadcast by backend):
      {"type": "alert",            "text": str, "distance": float, "is_indoor": bool, "timestamp": float}
      {"type": "describe_response","text": str}
      {"type": "location",         "lat": float, "lon": float, "speed": float, "heading": float, "timestamp": float}
    """
    await manager.connect("caregiver", ws)
    try:
        while True:
            data = await ws.receive_json()
            msg_type = data.get("type")

            if msg_type == "send_voice_text":
                text = data.get("text", "").strip()
                if text:
                    audio_b64 = await tts_service.synthesize_b64(text)
                    await manager.broadcast("user", {
                        "type": "tts_audio",
                        "data": audio_b64,
                        "text": text,
                        "from": "caregiver",
                    })

    except WebSocketDisconnect:
        manager.disconnect("caregiver", ws)
    except Exception as exc:
        logger.error(f"[WS/caregiver] {exc}")
        manager.disconnect("caregiver", ws)
