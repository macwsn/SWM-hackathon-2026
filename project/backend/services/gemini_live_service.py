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
_NAVIGATION_PROMPT = """Jesteś przyjaznym asystentem pomagającym osobie niewidomej w nawigacji.

TWOJA ROLA:
- Pomagasz osobie niewidomej poruszać się bezpiecznie
- Otrzymujesz obraz z kamery co ~2 sekundy
- Otrzymujesz współrzędne GPS lokalizacji użytkownika
- Opisujesz otoczenie w sposób pomocny i zwięzły
- Osoba niewidoma może Cię poprosić o pomoc lub konkretne wskazówki w opisaniu otoczenia.

STYL KOMUNIKACJI:
- Mów przyjaźnie i cierpliwie
- Używaj krótkich, jasnych zdań (maksymalnie 2-3 zdania)
- Koncentruj się na przeszkodach i istotnych elementach otoczenia
- Wspominaj o kierunkach (lewo, prawo, prosto)
- Podawaj szacunkowe odległości gdy to możliwe

PRIORYTET:
1. Bezpieczeństwo - ostrzegaj o przeszkodach
2. Orientacja - pomagaj zrozumieć otoczenie
3. Nawigacja - sugeruj bezpieczne kierunki ruchu

Odpowiadaj TYLKO PO POLSKU, maksymalnie 2-3 zdania."""


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
        logger.info(f"[GeminiLive] Caregiver availability check: {caregiver_count} connected")
        return caregiver_count > 0

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
            user_prompt = f"Lokalizacja GPS: {lat:.6f}, {lon:.6f}\n\n"
            if context:
                user_prompt += f"Kontekst: {context}\n\n"
            user_prompt += "Co widzisz w otoczeniu użytkownika? Opisz przeszkody i sugeruj bezpieczny kierunek ruchu."

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
        logger.info("[GeminiLive] 🚀 Starting live session...")
        logger.debug(f"[GeminiLive] User WebSocket: {user_ws}")

        if self._live_ws is not None:
            logger.warning("[GeminiLive] ⚠️ Live session already active, ending previous session")
            await self.end_live_session()

        self._user_ws = user_ws

        # Use mock if configured
        if USE_MOCK_GEMINI or not GEMINI_API_KEY:
            logger.info("[GeminiLive] 🎭 Using MOCK live session (no real API connection)")
            logger.debug(f"[GeminiLive] Mock mode: USE_MOCK_GEMINI={USE_MOCK_GEMINI}, API_KEY_configured={bool(GEMINI_API_KEY)}")
            return

        try:
            # Connect to Gemini Live WebSocket API (Beta endpoint for Multimodal Live)
            # URL format: wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=API_KEY
            ws_url = (
                "wss://generativelanguage.googleapis.com/ws/"
                "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
                f"?key={GEMINI_API_KEY}"
            )

            # Log URL without exposing full API key
            safe_url = ws_url.replace(GEMINI_API_KEY, f"{GEMINI_API_KEY[:10]}...")
            logger.info(f"[GeminiLive] 🔌 Connecting to Gemini Live API...")
            logger.debug(f"[GeminiLive] WebSocket URL: {safe_url}")
            logger.debug(f"[GeminiLive] Model: {GEMINI_LIVE_MODEL}")

            self._live_ws = await websockets.connect(ws_url)
            logger.info(f"[GeminiLive] ✅ WebSocket connection established")
            logger.debug(f"[GeminiLive] WebSocket state: {self._live_ws.state}")

            # 1. SETUP PHASE - Send initial configuration
            # Per GEMINI_LIVE.md: BidiGenerateContentSetup message format
            setup_message = {
                "setup": {
                    "model": f"models/{GEMINI_LIVE_MODEL}",
                    "generationConfig": {  # Note: camelCase for API compatibility
                        "responseModalities": ["AUDIO"],
                        "speechConfig": {
                            "voiceConfig": {
                                "prebuiltVoiceConfig": {
                                    "voiceName": "Puck"  # Voice optimized for navigation (try 'Puck', 'Charon', or 'Kore')
                                }
                            }
                        }
                    },
                    "systemInstruction": {
                        "parts": [{
                            "text": _NAVIGATION_PROMPT
                        }]
                    }
                }
            }

            logger.info(f"[GeminiLive] 📤 Sending setup message...")
            logger.debug(f"[GeminiLive] Setup message: {json.dumps(setup_message, indent=2)}")

            await self._live_ws.send(json.dumps(setup_message))
            logger.info(f"[GeminiLive] ✅ Setup message sent successfully")

            # Wait for setup completion before allowing audio
            logger.info(f"[GeminiLive] ⏳ Waiting for setup completion from Gemini...")
            first_resp = await self._live_ws.recv()
            logger.debug(f"[GeminiLive] 📥 Raw response from Gemini: {first_resp}")

            setup_status = json.loads(first_resp)
            logger.info(f"[GeminiLive] 📥 Received setup response from Gemini")
            logger.debug(f"[GeminiLive] Setup response JSON: {json.dumps(setup_status, indent=2)}")

            if "setupComplete" in setup_status:
                logger.info("[GeminiLive] ✅ Setup Complete - Ready for audio streaming")
                logger.debug(f"[GeminiLive] Setup completion details: {setup_status.get('setupComplete', {})}")
            else:
                logger.warning(f"[GeminiLive] ⚠️ Unexpected setup response structure")
                logger.warning(f"[GeminiLive] Expected 'setupComplete' field, got: {list(setup_status.keys())}")
                logger.warning(f"[GeminiLive] Full response: {json.dumps(setup_status, indent=2)}")

            # 2. Start background task to receive audio responses
            logger.info("[GeminiLive] 🎧 Starting background audio receive loop...")
            self._live_session_task = asyncio.create_task(self._receive_audio_loop())
            logger.info("[GeminiLive] ✅ Live session fully initialized and ready")

        except websockets.exceptions.WebSocketException as exc:
            logger.error(f"[GeminiLive] ❌ WebSocket error during connection: {exc}")
            logger.error(f"[GeminiLive] WebSocket exception type: {type(exc).__name__}")
            logger.error(f"[GeminiLive] WebSocket exception details: {str(exc)}")
            self._live_ws = None
            self._user_ws = None
            raise
        except json.JSONDecodeError as exc:
            logger.error(f"[GeminiLive] ❌ JSON decode error in setup response: {exc}")
            logger.error(f"[GeminiLive] Failed to parse response, raw data may be logged above")
            self._live_ws = None
            self._user_ws = None
            raise
        except Exception as exc:
            logger.error(f"[GeminiLive] ❌ Unexpected error during live session start: {exc}")
            logger.error(f"[GeminiLive] Exception type: {type(exc).__name__}")
            logger.error(f"[GeminiLive] Exception details: {str(exc)}")
            import traceback
            logger.error(f"[GeminiLive] Stack trace:\n{traceback.format_exc()}")
            self._live_ws = None
            self._user_ws = None
            raise

    async def send_audio_chunk(self, audio_base64: str):
        """
        Send audio chunk from user to Gemini Live API.

        Args:
            audio_base64: Base64-encoded PCM audio (16-bit, 16kHz, mono)
        """
        if USE_MOCK_GEMINI or not GEMINI_API_KEY:
            # Mock mode - just log
            logger.debug(f"[GeminiLive] 🎭 MOCK: Received {len(audio_base64)} bytes of audio")
            return

        if self._live_ws is None:
            logger.warning("[GeminiLive] ⚠️ Cannot send audio - no active live session")
            logger.debug(f"[GeminiLive] WebSocket state: {self._live_ws}")
            return

        if self._live_ws.closed:
            logger.error("[GeminiLive] ❌ Cannot send audio - WebSocket is closed")
            logger.error(f"[GeminiLive] WebSocket close code: {self._live_ws.close_code}")
            logger.error(f"[GeminiLive] WebSocket close reason: {self._live_ws.close_reason}")
            return

        try:
            # 2. REALTIME INPUT PHASE
            # Per GEMINI_LIVE.md: Use 'realtimeInput' with 'audio' field (not deprecated 'mediaChunks')
            message = {
                "realtimeInput": {
                    "audio": {
                        "data": audio_base64,
                        "mimeType": "audio/pcm"  # Ensure this matches 16kHz Mono PCM format
                    }
                }
            }

            logger.debug(f"[GeminiLive] 📤 Sending audio chunk ({len(audio_base64)} bytes)...")
            await self._live_ws.send(json.dumps(message))
            logger.debug(f"[GeminiLive] ✅ Audio chunk sent successfully")

        except websockets.exceptions.ConnectionClosed as exc:
            logger.error(f"[GeminiLive] ❌ WebSocket closed while sending audio: {exc}")
            logger.error(f"[GeminiLive] Close code: {exc.code}, reason: {exc.reason}")
        except Exception as exc:
            logger.error(f"[GeminiLive] ❌ Failed to send audio chunk: {exc}")
            logger.error(f"[GeminiLive] Exception type: {type(exc).__name__}")
            import traceback
            logger.debug(f"[GeminiLive] Stack trace:\n{traceback.format_exc()}")

    async def end_live_session(self):
        """End the live audio session with Gemini."""
        logger.info("[GeminiLive] 🔴 Ending live session...")
        logger.debug(f"[GeminiLive] Session task active: {self._live_session_task is not None}")
        logger.debug(f"[GeminiLive] WebSocket active: {self._live_ws is not None}")
        logger.debug(f"[GeminiLive] User WebSocket active: {self._user_ws is not None}")

        # Cancel the receive loop
        if self._live_session_task:
            logger.info("[GeminiLive] 🛑 Cancelling receive loop task...")
            self._live_session_task.cancel()
            try:
                await self._live_session_task
                logger.info("[GeminiLive] ✅ Receive loop task cancelled successfully")
            except asyncio.CancelledError:
                logger.debug("[GeminiLive] Receive loop task cancellation confirmed")
            except Exception as exc:
                logger.error(f"[GeminiLive] ❌ Error while cancelling receive loop: {exc}")
            self._live_session_task = None

        # Close WebSocket to Gemini
        if self._live_ws:
            logger.info("[GeminiLive] 🔌 Closing WebSocket connection to Gemini...")
            logger.debug(f"[GeminiLive] WebSocket state before close: {self._live_ws.state}")
            try:
                await self._live_ws.close()
                logger.info("[GeminiLive] ✅ WebSocket closed successfully")
            except Exception as exc:
                logger.warning(f"[GeminiLive] ⚠️ Error closing WebSocket: {exc}")
                logger.debug(f"[GeminiLive] Exception type: {type(exc).__name__}")
            self._live_ws = None

        self._user_ws = None
        logger.info("[GeminiLive] ✅ Live session ended successfully")
        logger.debug("[GeminiLive] All resources cleaned up")

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

