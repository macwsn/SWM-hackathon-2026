import io
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from PIL import Image

from mocks.location_mock import location_mock
from routers.websocket_manager import manager
from routers import processor_ws
from services.gemini_service import gemini_service
from services.tts_service import tts_service

router = APIRouter(tags=["websocket"])
logger = logging.getLogger(__name__)


@router.websocket("/ws/user")
async def user_websocket(ws: WebSocket):
    """
    WebSocket for the blind user's panel.

    Receives from client:
      {"type": "describe_request"}
          — user pressed "Opisz otoczenie" button.
      {"type": "location", "lat": float, "lon": float}
          — real GPS from browser (when USE_MOCK_LOCATION=false).

    Sends to client:
      {"type": "tts_audio", "data": "<base64 MP3>", "text": str}
          — obstacle alert or surroundings description to be played via Audio API.
      {"type": "obstacle_ping", "distance": float, "direction": "left"|"center"|"right", "severity": "WARNING"|"CRITICAL"}
          — spatial ping event for obstacle alerts in headphones.
    """
    await manager.connect("user", ws)
    try:
        while True:
            data = await ws.receive_json()
            msg_type = data.get("type")

            if msg_type == "describe_request":
                frame = processor_ws.latest_frame
                if frame is None:
                    # No frame available yet
                    continue
                img = Image.fromarray(frame)
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=85)
                image_bytes = buf.getvalue()

                loc = location_mock.get_current()
                description = await gemini_service.describe_surroundings(image_bytes, loc)

                audio_b64 = await tts_service.synthesize_b64(description)
                await manager.send_to(ws, {
                    "type": "tts_audio",
                    "data": audio_b64,
                    "text": description,
                })
                await manager.broadcast("caregiver", {
                    "type": "describe_response",
                    "text": description,
                })

            elif msg_type == "location":
                # Store real GPS from browser — forwarded to caregiver & update mock state
                lat = data.get("lat")
                lon = data.get("lon")
                if lat is not None and lon is not None:
                    location_mock.lat = lat
                    location_mock.lon = lon
                    await manager.broadcast("caregiver", {
                        "type": "location",
                        "lat": lat,
                        "lon": lon,
                    })

    except WebSocketDisconnect:
        manager.disconnect("user", ws)
    except Exception as exc:
        logger.error(f"[WS/user] {exc}")
        manager.disconnect("user", ws)
