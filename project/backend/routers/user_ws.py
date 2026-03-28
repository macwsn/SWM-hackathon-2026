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
          — user pressed "Opisz otoczenie" button.
      {"type": "location", "lat": float, "lon": float}
          — real GPS from browser (when USE_MOCK_LOCATION=false).
      {"type": "start_ai_call"}
          — user pressed "POMOC" button and wants to start live AI audio call.
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
                # User wants to start live audio call with AI
                logger.info("[User] 🎙️ Start AI call request received")

                # Check if caregiver is available - if so, reject AI call
                if gemini_live_service.is_caregiver_available():
                    logger.info("[User] ❌ AI call rejected - caregiver is available, use WebRTC instead")
                    await manager.send_to(ws, {
                        "type": "ai_call_rejected",
                        "reason": "Caregiver is available, please use the regular call button"
                    })
                else:
                    # Start live session with Gemini
                    logger.info("[User] ✅ Starting Gemini Live audio session - NO caregiver available")
                    try:
                        await gemini_live_service.start_live_session(ws)
                        await manager.send_to(ws, {
                            "type": "ai_call_started"
                        })
                        logger.info("[User] ✅ AI call started successfully")
                    except Exception as start_exc:
                        logger.error(f"[User] ❌ Failed to start AI call: {start_exc}")
                        logger.error(f"[User] Exception type: {type(start_exc).__name__}")
                        import traceback
                        logger.error(f"[User] Stack trace:\n{traceback.format_exc()}")
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
                is_active = gemini_live_service.is_live_session_active()
                logger.info(f"[User] 📹 Received frame (size: {len(frame_data) if frame_data else 0} bytes), AI active: {is_active}")
                if frame_data and is_active:
                    await gemini_live_service.send_video_frame(frame_data)
                    logger.info("[User] ✅ Forwarded frame to AI")

            elif msg_type == "end_ai_call":
                # End live session with Gemini
                logger.info("[User] 🔴 End AI call request received")
                await gemini_live_service.end_live_session()
                await manager.send_to(ws, {
                    "type": "ai_call_ended"
                })

            elif msg_type == "describe_request":
                start_time = time.time()
                logger.info("[User] 🎯 Describe request received")

                # Send immediate acknowledgment
                await manager.send_to(ws, {
                    "type": "processing_status",
                    "status": "started",
                    "message": "Przetwarzam żądanie..."
                })

                frame = processor_ws.latest_frame
                if frame is None:
                    logger.warning("[User] ⚠️ No frame available yet")
                    await manager.send_to(ws, {
                        "type": "error",
                        "message": "Brak dostępnego obrazu z kamery"
                    })
                    continue

                # Prepare image
                img = Image.fromarray(frame)
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=85)
                image_bytes = buf.getvalue()
                logger.info(f"[User] 📸 Image prepared: {len(image_bytes)} bytes")

                loc = location_mock.get_current()
                logger.info(f"[User] 📍 Location: {loc.get('lat', 0):.5f}, {loc.get('lon', 0):.5f}")

                # Check if caregiver is available
                caregiver_available = gemini_live_service.is_caregiver_available()

                try:
                    if caregiver_available:
                        # Use standard Gemini service when caregiver is connected
                        source = "gemini"
                        logger.info(f"[User] 🤖 Calling Gemini API (standard model: gemini-2.5-flash-lite) - caregiver available")

                        await manager.send_to(ws, {
                            "type": "processing_status",
                            "status": "calling_ai",
                            "message": "Analyzing image with AI..."
                        })

                        # Call Gemini with timeout
                        description = await asyncio.wait_for(
                            gemini_service.describe_surroundings(image_bytes, loc),
                            timeout=GEMINI_TIMEOUT
                        )

                        elapsed = time.time() - start_time
                        logger.info(f"[User] ✅ Gemini API responded in {elapsed:.2f}s")
                    else:
                        # Use Gemini Live Flash as fallback when no caregiver
                        source = "gemini_live"
                        logger.info(f"[User] 🤖 Calling Gemini Live API (model: gemini-2.5-flash-lite) - NO caregiver available")

                        await manager.send_to(ws, {
                            "type": "processing_status",
                            "status": "calling_ai",
                            "message": "Analyzing image with AI (fallback mode)..."
                        })

                        # Call Gemini Live with timeout
                        description = await asyncio.wait_for(
                            gemini_live_service.assist_navigation(
                                image_bytes,
                                loc,
                                context="User requested surroundings description"
                            ),
                            timeout=GEMINI_TIMEOUT
                        )

                        elapsed = time.time() - start_time
                        logger.info(f"[User] ✅ Gemini Live API responded in {elapsed:.2f}s")

                    # Update status: synthesizing speech
                    await manager.send_to(ws, {
                        "type": "processing_status",
                        "status": "synthesizing",
                        "message": "Generating speech..."
                    })

                    # Try to synthesize audio, but always send the text
                    audio_b64 = await tts_service.synthesize_b64(description)

                    total_elapsed = time.time() - start_time
                    logger.info(f"[User] 🎵 TTS completed. Total time: {total_elapsed:.2f}s")

                    # Send response to user with audio if available
                    await manager.send_to(ws, {
                        "type": "tts_audio",
                        "data": audio_b64,  # Empty string if TTS failed
                        "text": description,  # Always send text (client can use Web Speech API as fallback)
                        "source": source,  # Indicate which AI service was used
                    })

                    logger.info(f"[User] 📤 Response sent to user: '{description[:50]}...'")

                    # Notify caregiver of the description
                    await manager.broadcast("caregiver", {
                        "type": "describe_response",
                        "text": description,
                        "source": source,
                    })

                except asyncio.TimeoutError:
                    elapsed = time.time() - start_time
                    logger.error(f"[User] ⏱️ Gemini API timeout after {elapsed:.2f}s")
                    await manager.send_to(ws, {
                        "type": "tts_audio",
                        "data": "",
                        "text": "Sorry, the response is taking too long. Please try again.",
                        "source": "error"
                    })
                except Exception as exc:
                    elapsed = time.time() - start_time
                    logger.error(f"[User] ❌ Error after {elapsed:.2f}s: {exc}")
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
