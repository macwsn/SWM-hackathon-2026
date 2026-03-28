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

from config import GEMINI_API_KEY, GEMINI_LIVE_MODEL, USE_MOCK_GEMINI
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
        """Make API call to Gemini Live model (configured via GEMINI_LIVE_MODEL)."""
        # Build API URL with model from config
        url = (
            f"https://generativelanguage.googleapis.com/v1beta"
            f"/models/{GEMINI_LIVE_MODEL}:generateContent"
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
            logger.warning("[GeminiLive] Live session already active, ending previous session")
            await self.end_live_session()

        self._user_ws = user_ws

        # Use mock if configured
        if USE_MOCK_GEMINI or not GEMINI_API_KEY:
            logger.info("[GeminiLive] 🎭 Using MOCK live session (no real API connection)")
            return

        try:
            # Connect to Gemini Live WebSocket API (Beta endpoint for Multimodal Live)
            # URL format: wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=API_KEY
            ws_url = (
                "wss://generativelanguage.googleapis.com/ws/"
                "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
                f"?key={GEMINI_API_KEY}"
            )

            logger.info(f"[GeminiLive] 🔌 Connecting to Gemini Live API...")
            self._live_ws = await websockets.connect(ws_url)
            logger.info(f"[GeminiLive] ✅ Connected to Gemini Live API")

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

            await self._live_ws.send(json.dumps(setup_message))
            logger.info(f"[GeminiLive] 📤 Sent setup message to Gemini")

            # Wait for setup completion before allowing audio
            first_resp = await self._live_ws.recv()
            setup_status = json.loads(first_resp)
            if "setupComplete" in setup_status:
                logger.info("[GeminiLive] ✅ Setup Complete - Ready for audio streaming")
            else:
                logger.warning(f"[GeminiLive] ⚠️ Unexpected setup response: {setup_status}")

            # 2. Start background task to receive audio responses
            self._live_session_task = asyncio.create_task(self._receive_audio_loop())

        except Exception as exc:
            logger.error(f"[GeminiLive] ❌ Failed to start live session: {exc}")
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

            await self._live_ws.send(json.dumps(message))
            logger.debug(f"[GeminiLive] 📤 Sent audio chunk ({len(audio_base64)} bytes)")

        except Exception as exc:
            logger.error(f"[GeminiLive] ❌ Failed to send audio chunk: {exc}")

    async def end_live_session(self):
        """End the live audio session with Gemini."""
        logger.info("[GeminiLive] 🔴 Ending live session")

        # Cancel the receive loop
        if self._live_session_task:
            self._live_session_task.cancel()
            try:
                await self._live_session_task
            except asyncio.CancelledError:
                pass
            self._live_session_task = None

        # Close WebSocket to Gemini
        if self._live_ws:
            try:
                await self._live_ws.close()
            except Exception as exc:
                logger.warning(f"[GeminiLive] Error closing WebSocket: {exc}")
            self._live_ws = None

        self._user_ws = None
        logger.info("[GeminiLive] ✅ Live session ended")

    async def _receive_audio_loop(self):
        """Background task to receive audio responses from Gemini and forward to user."""
        try:
            while self._live_ws and self._user_ws:
                message_str = await self._live_ws.recv()
                message = json.loads(message_str)

                # Per GEMINI_LIVE.md: Server sends BidiGenerateContentServerMessage
                # Check for audio content in the response
                if "serverContent" in message:
                    server_content = message["serverContent"]

                    # INTERRUPTION HANDLING (Important for Live API)
                    # Per GEMINI_LIVE.md: "interrupted" field indicates user interrupted model generation
                    if server_content.get("interrupted", False):
                        logger.info("[GeminiLive] ⚠️ AI interrupted by user speech - stopping playback")
                        # Notify frontend to stop audio playback immediately and clear queue
                        await manager.send_to(self._user_ws, {
                            "type": "ai_interrupted"
                        })

                    # Check for audio parts in modelTurn
                    if "modelTurn" in server_content:
                        parts = server_content["modelTurn"].get("parts", [])
                        for part in parts:
                            if "inlineData" in part:
                                # Extract audio data
                                audio_data = part["inlineData"].get("data", "")
                                mime_type = part["inlineData"].get("mimeType", "")

                                if audio_data and "audio" in mime_type:
                                    # Forward audio to user
                                    await manager.send_to(self._user_ws, {
                                        "type": "ai_audio_chunk",
                                        "data": audio_data
                                    })
                                    logger.debug(f"[GeminiLive] 📥 Forwarded audio chunk to user ({len(audio_data)} bytes)")

                    # Check for turn completion
                    if server_content.get("turnComplete", False):
                        logger.info("[GeminiLive] 🔄 Turn complete from Gemini")

                    # Check for generation completion
                    if server_content.get("generationComplete", False):
                        logger.info("[GeminiLive] ✅ Generation complete from Gemini")

                elif "setupComplete" in message:
                    logger.info("[GeminiLive] ✅ Setup confirmed by Gemini")

        except asyncio.CancelledError:
            logger.info("[GeminiLive] 🛑 Receive loop cancelled")
        except Exception as exc:
            logger.error(f"[GeminiLive] ❌ Error in receive loop: {exc}")
            # Notify user of error
            if self._user_ws:
                try:
                    await manager.send_to(self._user_ws, {
                        "type": "ai_call_error",
                        "error": str(exc)
                    })
                except Exception:
                    pass


# Global singleton instance
gemini_live_service = GeminiLiveService()

