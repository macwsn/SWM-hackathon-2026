import asyncio
import io
import logging
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from PIL import Image

from mocks.location_mock import location_mock
from routers.websocket_manager import manager
from routers import processor_ws
from services.gemini_service import gemini_service
from services.gemini_live_service import gemini_live_service
from services.tts_service import tts_service

router = APIRouter(tags=["websocket"])
logger = logging.getLogger(__name__)

# Timeout for Gemini API calls (30 seconds)
GEMINI_TIMEOUT = 30.0


@router.websocket("/ws/user")
async def user_websocket(ws: WebSocket):
    """
    WebSocket for the blind user's panel.

    Receives from client:
      {"type": "describe_request"}
          — user pressed "DESCRIBE" button.
      {"type": "location", "lat": float, "lon": float}
          — real GPS from browser (when USE_MOCK_LOCATION=false).
      {"type": "start_ai_call"}
          — user pressed "HELP" button and wants to start live AI audio call.
      {"type": "audio_chunk", "data": "<base64 PCM audio>"}
          — audio chunk from user's microphone during live AI call.
      {"type": "end_ai_call"}
          — user ended the live AI audio call.

    Sends to client:
      {"type": "tts_audio", "data": "<base64 MP3>", "text": str}
          — obstacle alert or surroundings description to be played via Audio API.
      {"type": "obstacle_ping", "distance": float, "direction": "left"|"center"|"right", "severity": "WARNING"|"CRITICAL"}
          — spatial ping event for obstacle alerts in headphones.
      {"type": "ai_call_started"}
          — confirmation that live AI audio call has started.
      {"type": "ai_audio_chunk", "data": "<base64 PCM audio>"}
          — audio chunk from Gemini Live API to play back to user.
      {"type": "ai_interrupted"}
          — AI detected user started speaking, stop playback and clear audio queue.
      {"type": "ai_call_ended"}
          — notification that the live AI call has ended.
      {"type": "ai_call_rejected", "reason": str}
          — AI call was rejected (e.g., caregiver is available).
      {"type": "ai_call_error", "error": str}
          — error occurred during AI call session.
    """
    await manager.connect("user", ws)
    try:
        while True:
            data = await ws.receive_json()
            msg_type = data.get("type")

            if msg_type == "start_ai_call":
                # Check if caregiver is available - if so, reject AI call
                if gemini_live_service.is_caregiver_available():
                    await manager.send_to(ws, {
                        "type": "ai_call_rejected",
                        "reason": "Caregiver is available, please use the regular call button"
                    })
                else:
                    try:
                        await gemini_live_service.start_live_session(ws)
                        await manager.send_to(ws, {
                            "type": "ai_call_started"
                        })
                    except Exception as start_exc:
                        logger.error(f"[User] Failed to start AI call: {start_exc}")
                        await manager.send_to(ws, {
                            "type": "ai_call_error",
                            "message": str(start_exc)
                        })

            elif msg_type == "audio_chunk":
                # Forward audio chunk to Gemini Live session
                audio_data = data.get("data", "")
                if audio_data:
                    await gemini_live_service.send_audio_chunk(audio_data)

            elif msg_type == "frame":
                # Forward video frame to Gemini Live session if AI call is active
                frame_data = data.get("data", "")
                if frame_data and gemini_live_service.is_live_session_active():
                    await gemini_live_service.send_video_frame(frame_data)

            elif msg_type == "end_ai_call":
                await gemini_live_service.end_live_session()
                await manager.send_to(ws, {
                    "type": "ai_call_ended"
                })

            elif msg_type == "describe_request":
                start_time = time.time()

                await manager.send_to(ws, {
                    "type": "processing_status",
                    "status": "started",
                    "message": "Processing request..."
                })

                frame = processor_ws.latest_frame
                if frame is None:
                    await manager.send_to(ws, {
                        "type": "error",
                        "message": "No camera image available"
                    })
                    continue

                # Prepare image
                img = Image.fromarray(frame)
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=85)
                image_bytes = buf.getvalue()

                loc = location_mock.get_current()
                caregiver_available = gemini_live_service.is_caregiver_available()

                try:
                    if caregiver_available:
                        source = "gemini"
                        await manager.send_to(ws, {
                            "type": "processing_status",
                            "status": "calling_ai",
                            "message": "Analyzing image with AI..."
                        })
                        description = await asyncio.wait_for(
                            gemini_service.describe_surroundings(image_bytes, loc),
                            timeout=GEMINI_TIMEOUT
                        )
                    else:
                        source = "gemini_live"
                        await manager.send_to(ws, {
                            "type": "processing_status",
                            "status": "calling_ai",
                            "message": "Analyzing image with AI..."
                        })
                        description = await asyncio.wait_for(
                            gemini_live_service.assist_navigation(
                                image_bytes,
                                loc,
                                context="User requested surroundings description"
                            ),
                            timeout=GEMINI_TIMEOUT
                        )

                    await manager.send_to(ws, {
                        "type": "processing_status",
                        "status": "synthesizing",
                        "message": "Generating speech..."
                    })

                    audio_b64 = await tts_service.synthesize_b64(description)

                    await manager.send_to(ws, {
                        "type": "tts_audio",
                        "data": audio_b64,
                        "text": description,
                        "source": source,
                    })

                    await manager.broadcast("caregiver", {
                        "type": "describe_response",
                        "text": description,
                        "source": source,
                    })

                except asyncio.TimeoutError:
                    logger.error(f"[User] Gemini API timeout after {time.time() - start_time:.2f}s")
                    await manager.send_to(ws, {
                        "type": "tts_audio",
                        "data": "",
                        "text": "Sorry, the response is taking too long. Please try again.",
                        "source": "error"
                    })
                except Exception as exc:
                    logger.error(f"[User] Error processing describe request: {exc}")
                    await manager.send_to(ws, {
                        "type": "tts_audio",
                        "data": "",
                        "text": "An error occurred during processing. Please try again.",
                        "source": "error"
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
