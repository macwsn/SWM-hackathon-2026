"""
Gemini Live API integration for real-time assistance when caregiver is unavailable.

This service uses Gemini Flash 3.1 model to provide friendly navigation support
for blind users when no human caregiver is available.

PERSONALITY:
Friendly support for a blind person, helping them navigate using images provided
every 2 seconds along with GPS coordinates.

USAGE:
1. Set GEMINI_API_KEY in .env or config
2. Call is_caregiver_available() to check if fallback needed
3. Call assist_navigation() with image and location data (one-time description)
4. Call start_live_session() to start bidirectional audio streaming
5. Call send_audio_chunk() to send audio to Gemini
6. Call end_live_session() to end the audio session
"""

import asyncio
import base64
import json
import logging
import time
from typing import Optional, Dict

import httpx
import websockets

from config import GEMINI_API_KEY, GEMINI_MODEL, GEMINI_LIVE_MODEL, USE_MOCK_GEMINI
from routers.websocket_manager import manager

logger = logging.getLogger(__name__)

# System prompt for navigation assistance
_NAVIGATION_PROMPT = """You are a friendly assistant helping a blind person with navigation.

YOUR ROLE:
- You help a blind person navigate safely
- You receive camera images every ~2 seconds
- You receive GPS coordinates of the user's location
- You describe the surroundings in a helpful and concise manner
- The blind person may ask you for help or specific guidance in describing the environment.

COMMUNICATION STYLE:
- Speak friendly and patiently
- Use short, clear sentences (maximum 2-3 sentences)
- Focus on obstacles and important environmental elements
- Mention directions (left, right, straight)
- Provide approximate distances when possible

PRIORITY:
1. Safety - warn about obstacles
2. Orientation - help understand surroundings
3. Navigation - suggest safe directions of movement

Respond ONLY IN ENGLISH, maximum 2-3 sentences."""


class GeminiLiveService:
    """Service for Gemini Live API navigation assistance."""

    def __init__(self):
        self._last_call_time = 0.0
        self._min_interval = 2.0  # Minimum 2 seconds between calls
        self._conversation_history = []
        self._max_history = 5  # Keep last 5 exchanges for context

        # Live audio session state
        self._live_ws = None  # WebSocket connection to Gemini Live API
        self._user_ws = None  # WebSocket connection to user frontend
        self._live_session_task = None  # Background task for receiving audio from Gemini

    def is_caregiver_available(self) -> bool:
        """
        Check if any caregiver is currently connected via WebSocket.

        Returns:
            True if at least one caregiver is connected, False otherwise.
        """
        caregiver_count = len(manager.connections.get("caregiver", set()))
        return caregiver_count > 0

    def is_live_session_active(self) -> bool:
        """
        Check if a Gemini Live session is currently active.

        Returns:
            True if live session is active, False otherwise.
        """
        return self._live_ws is not None

    async def assist_navigation(
        self,
        image_bytes: bytes,
        location: Dict[str, float],
        context: Optional[str] = None
    ) -> str:
        """
        Provide navigation assistance using Gemini Flash 3.1.
        
        Args:
            image_bytes: JPEG image bytes from camera
            location: GPS coordinates {"lat": float, "lon": float}
            context: Optional context about user's request

        Returns:
            Polish language navigation guidance (2-3 sentences)
        """
        # Rate limiting
        now = time.time()
        if now - self._last_call_time < self._min_interval:
            wait_time = self._min_interval - (now - self._last_call_time)
            logger.info(f"[GeminiLive] Rate limiting: waiting {wait_time:.1f}s")
            await asyncio.sleep(wait_time)

        self._last_call_time = time.time()

        # Use mock if configured
        if USE_MOCK_GEMINI or not GEMINI_API_KEY:
            return self._mock_response()

        try:
            lat = location.get("lat", 0.0)
            lon = location.get("lon", 0.0)

            # Build prompt with location context
            user_prompt = f"GPS Location: {lat:.6f}, {lon:.6f}\n\n"
            if context:
                user_prompt += f"Context: {context}\n\n"
            user_prompt += "What do you see in the user's surroundings? Describe obstacles and suggest a safe direction of movement."

            result = await self._call_gemini(image_bytes, user_prompt)

            # Store in conversation history
            self._conversation_history.append({
                "location": location,
                "response": result,
                "timestamp": time.time()
            })
            if len(self._conversation_history) > self._max_history:
                self._conversation_history.pop(0)

            return result

        except Exception as exc:
            logger.error(f"[GeminiLive] Navigation assist failed: {exc}")
            return "Przepraszam, nie mogę teraz pomóc. Spróbuj ponownie za chwilę."

    async def _call_gemini(self, image_bytes: bytes, user_prompt: str) -> str:
        """Make API call to Gemini standard model for vision/text tasks.

        Note: Uses GEMINI_MODEL (e.g., gemini-2.5-flash-lite) for standard REST API.
        The GEMINI_LIVE_MODEL is only for WebSocket Live API in start_live_session().
        """
        # Build API URL with STANDARD model (not LIVE model) for REST API
        url = (
            f"https://generativelanguage.googleapis.com/v1beta"
            f"/models/{GEMINI_MODEL}:generateContent"
        )

        payload = {
            "contents": [{
                "parts": [
                    {"text": f"{_NAVIGATION_PROMPT}\n\n{user_prompt}"},
                    {
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": base64.b64encode(image_bytes).decode(),
                        }
                    },
                ]
            }],
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 150,  # Keep responses concise
            }
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{url}?key={GEMINI_API_KEY}",
                json=payload
            )
            resp.raise_for_status()
            data = resp.json()
            return data["candidates"][0]["content"]["parts"][0]["text"].strip()
    
    def _mock_response(self) -> str:
        """Mock response for testing without API key."""
        import random
        responses = [
            "Przed Tobą chodnik, droga wolna. Idź prosto.",
            "Uwaga! Przeszkoda 2 metry przed Tobą po prawej stronie. Skręć lekko w lewo.",
            "Jesteś na chodniku. Po lewej słyszysz ruch uliczny. Trzymaj się prawej strony.",
            "Za 3 metry schody w dół. Zwolnij i trzymaj się poręczy po prawej.",
            "Droga czysta, możesz iść dalej prosto. Po lewej budynek, po prawej parking.",
        ]
        return random.choice(responses)

    async def start_live_session(self, user_ws):
        """
        Start a live bidirectional audio session with Gemini Live API.

        Args:
            user_ws: WebSocket connection to the user frontend
        """
        if self._live_ws is not None:
            await self.end_live_session()

        self._user_ws = user_ws

        if USE_MOCK_GEMINI or not GEMINI_API_KEY:
            logger.warning("[GeminiLive] Mock mode enabled, no real API connection")
            return

        try:
            ws_url = (
                "wss://generativelanguage.googleapis.com/ws/"
                "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
                f"?key={GEMINI_API_KEY}"
            )

            self._live_ws = await websockets.connect(ws_url)

            setup_message = {
                "setup": {
                    "model": f"models/{GEMINI_LIVE_MODEL}",
                    "generationConfig": {
                        "responseModalities": ["AUDIO"],
                        "speechConfig": {
                            "voiceConfig": {
                                "prebuiltVoiceConfig": {
                                    "voiceName": "Puck"
                                }
                            }
                        }
                    },
                    "realtimeInputConfig": {
                        "turnCoverage": "TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO"
                    },
                    "systemInstruction": {
                        "parts": [{
                            "text": _NAVIGATION_PROMPT
                        }]
                    }
                }
            }

            await self._live_ws.send(json.dumps(setup_message))
            first_resp = await self._live_ws.recv()
            setup_status = json.loads(first_resp)

            if "setupComplete" not in setup_status:
                logger.warning(f"[GeminiLive] Unexpected setup response: {list(setup_status.keys())}")

            self._live_session_task = asyncio.create_task(self._receive_audio_loop())

        except Exception as exc:
            logger.error(f"[GeminiLive] Failed to start live session: {exc}")
            self._live_ws = None
            self._user_ws = None
            raise

    async def send_audio_chunk(self, audio_base64: str):
        """
        Send audio chunk from user to Gemini Live API.

        Args:
            audio_base64: Base64-encoded PCM audio (16-bit, 16kHz, mono)
        """
        if USE_MOCK_GEMINI or not GEMINI_API_KEY or self._live_ws is None:
            return

        if hasattr(self._live_ws, 'closed') and self._live_ws.closed:
            return

        try:
            message = {
                "realtimeInput": {
                    "audio": {
                        "data": audio_base64,
                        "mimeType": "audio/pcm"
                    }
                }
            }
            await self._live_ws.send(json.dumps(message))
        except Exception as exc:
            logger.error(f"[GeminiLive] Failed to send audio chunk: {exc}")

    async def send_video_frame(self, image_base64: str):
        """
        Send video frame from user's camera to Gemini Live API.

        Args:
            image_base64: Base64-encoded JPEG image
        """
        if USE_MOCK_GEMINI or not GEMINI_API_KEY or self._live_ws is None:
            return

        if hasattr(self._live_ws, 'closed') and self._live_ws.closed:
            return

        try:
            message = {
                "realtimeInput": {
                    "video": {
                        "data": image_base64,
                        "mimeType": "image/jpeg"
                    }
                }
            }
            await self._live_ws.send(json.dumps(message))
        except Exception as exc:
            logger.error(f"[GeminiLive] Failed to send video frame: {exc}")

    async def end_live_session(self):
        """End the live audio session with Gemini."""
        if self._live_session_task:
            self._live_session_task.cancel()
            try:
                await self._live_session_task
            except asyncio.CancelledError:
                pass
            except Exception as exc:
                logger.error(f"[GeminiLive] Error cancelling receive loop: {exc}")
            self._live_session_task = None

        if self._live_ws:
            try:
                await self._live_ws.close()
            except Exception as exc:
                logger.error(f"[GeminiLive] Error closing WebSocket: {exc}")
            self._live_ws = None

        self._user_ws = None

    async def _receive_audio_loop(self):
        """Background task to receive audio responses from Gemini and forward to user."""
        logger.info("[GeminiLive] 🎧 Starting audio receive loop...")
        logger.debug(f"[GeminiLive] WebSocket state: {self._live_ws.state if self._live_ws else 'None'}")
        logger.debug(f"[GeminiLive] User WebSocket: {'Connected' if self._user_ws else 'None'}")

        message_count = 0
        try:
            while self._live_ws and self._user_ws:
                logger.debug(f"[GeminiLive] ⏳ Waiting for message from Gemini...")
                message_str = await self._live_ws.recv()
                message_count += 1

                logger.info(f"[GeminiLive] 📥 Received message #{message_count} from Gemini")
                logger.debug(f"[GeminiLive] Raw message (first 200 chars): {message_str[:200]}...")
                logger.debug(f"[GeminiLive] Message length: {len(message_str)} bytes")

                try:
                    message = json.loads(message_str)
                    logger.debug(f"[GeminiLive] Parsed message keys: {list(message.keys())}")
                    logger.debug(f"[GeminiLive] Full message JSON:\n{json.dumps(message, indent=2)}")
                except json.JSONDecodeError as e:
                    logger.error(f"[GeminiLive] ❌ Failed to parse JSON: {e}")
                    logger.error(f"[GeminiLive] Raw message: {message_str}")
                    continue

                # Per GEMINI_LIVE.md: Server sends BidiGenerateContentServerMessage
                # Check for audio content in the response
                if "serverContent" in message:
                    logger.info("[GeminiLive] 📦 Processing serverContent message")
                    server_content = message["serverContent"]
                    logger.debug(f"[GeminiLive] serverContent keys: {list(server_content.keys())}")

                    # INTERRUPTION HANDLING (Important for Live API)
                    # Per GEMINI_LIVE.md: "interrupted" field indicates user interrupted model generation
                    if server_content.get("interrupted", False):
                        logger.info("[GeminiLive] ⚠️ AI interrupted by user speech - stopping playback")
                        logger.debug(f"[GeminiLive] Interrupted flag: {server_content.get('interrupted')}")
                        # Notify frontend to stop audio playback immediately and clear queue
                        await manager.send_to(self._user_ws, {
                            "type": "ai_interrupted"
                        })
                        logger.debug("[GeminiLive] ✅ Sent interruption notification to user")

                    # Check for audio parts in modelTurn
                    if "modelTurn" in server_content:
                        logger.info("[GeminiLive] 🎵 Processing modelTurn with potential audio content")
                        model_turn = server_content["modelTurn"]
                        logger.debug(f"[GeminiLive] modelTurn keys: {list(model_turn.keys())}")

                        parts = model_turn.get("parts", [])
                        logger.debug(f"[GeminiLive] Number of parts: {len(parts)}")

                        for idx, part in enumerate(parts):
                            logger.debug(f"[GeminiLive] Processing part #{idx+1}, keys: {list(part.keys())}")

                            if "inlineData" in part:
                                logger.info(f"[GeminiLive] 📎 Found inlineData in part #{idx+1}")
                                inline_data = part["inlineData"]

                                # Extract audio data
                                audio_data = inline_data.get("data", "")
                                mime_type = inline_data.get("mimeType", "")

                                logger.debug(f"[GeminiLive] Audio data length: {len(audio_data)} bytes")
                                logger.debug(f"[GeminiLive] MIME type: {mime_type}")

                                if audio_data and "audio" in mime_type:
                                    logger.info(f"[GeminiLive] ✅ Valid audio chunk found, forwarding to user")
                                    # Forward audio to user
                                    await manager.send_to(self._user_ws, {
                                        "type": "ai_audio_chunk",
                                        "data": audio_data
                                    })
                                    logger.info(f"[GeminiLive] 📥 Forwarded audio chunk to user ({len(audio_data)} bytes)")
                                else:
                                    logger.warning(f"[GeminiLive] ⚠️ Part has inlineData but not valid audio")
                                    logger.debug(f"[GeminiLive] audio_data empty: {not audio_data}, mime_type: {mime_type}")
                            else:
                                logger.debug(f"[GeminiLive] Part #{idx+1} has no inlineData, keys: {list(part.keys())}")

                    # Check for turn completion
                    if server_content.get("turnComplete", False):
                        logger.info("[GeminiLive] 🔄 Turn complete from Gemini")
                        logger.debug(f"[GeminiLive] turnComplete value: {server_content.get('turnComplete')}")

                    # Check for generation completion
                    if server_content.get("generationComplete", False):
                        logger.info("[GeminiLive] ✅ Generation complete from Gemini")
                        logger.debug(f"[GeminiLive] generationComplete value: {server_content.get('generationComplete')}")

                elif "setupComplete" in message:
                    logger.info("[GeminiLive] ✅ Setup confirmed by Gemini (in receive loop)")
                    logger.debug(f"[GeminiLive] setupComplete details: {message.get('setupComplete')}")

                elif "usageMetadata" in message:
                    logger.info("[GeminiLive] 📊 Received usage metadata")
                    logger.debug(f"[GeminiLive] Usage metadata: {json.dumps(message.get('usageMetadata'), indent=2)}")

                elif "sessionResumptionUpdate" in message:
                    # Session resumption update - this is sent by Gemini to manage session state
                    # This is normal during long sessions and doesn't indicate an error
                    logger.info("[GeminiLive] 🔄 Received session resumption update")
                    resumption_data = message.get("sessionResumptionUpdate", {})
                    logger.debug(f"[GeminiLive] Session resumption data: {json.dumps(resumption_data, indent=2)}")
                    # No action needed - Gemini is managing the session state

                else:
                    logger.warning(f"[GeminiLive] ⚠️ Received unknown message type")
                    logger.warning(f"[GeminiLive] Message keys: {list(message.keys())}")
                    logger.debug(f"[GeminiLive] Full unknown message: {json.dumps(message, indent=2)}")

        except asyncio.CancelledError:
            logger.info("[GeminiLive] 🛑 Receive loop cancelled")
            logger.debug(f"[GeminiLive] Total messages received before cancellation: {message_count}")
        except websockets.exceptions.ConnectionClosed as exc:
            logger.error(f"[GeminiLive] ❌ WebSocket connection closed in receive loop")
            logger.error(f"[GeminiLive] Close code: {exc.code}, reason: {exc.reason}")
            logger.error(f"[GeminiLive] Total messages received: {message_count}")
        except Exception as exc:
            logger.error(f"[GeminiLive] ❌ Error in receive loop: {exc}")
            logger.error(f"[GeminiLive] Exception type: {type(exc).__name__}")
            logger.error(f"[GeminiLive] Total messages received before error: {message_count}")
            import traceback
            logger.error(f"[GeminiLive] Stack trace:\n{traceback.format_exc()}")

            # Notify user of error
            if self._user_ws:
                try:
                    await manager.send_to(self._user_ws, {
                        "type": "ai_call_error",
                        "error": str(exc)
                    })
                    logger.debug("[GeminiLive] ✅ Sent error notification to user")
                except Exception as notify_exc:
                    logger.error(f"[GeminiLive] ❌ Failed to notify user of error: {notify_exc}")


# Global singleton instance
gemini_live_service = GeminiLiveService()

