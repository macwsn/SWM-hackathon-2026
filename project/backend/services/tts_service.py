"""
Text-to-speech service using edge-tts (Microsoft Edge TTS — free, no API key).

Default voice: pl-PL-ZofiaNeural (Polish female).

TO REPLACE WITH ANOTHER TTS PROVIDER:
- Google Cloud TTS: google-cloud-texttospeech
- AWS Polly:        boto3
- ElevenLabs:       elevenlabs SDK
Replace the synthesize() method body; keep the same interface.

Returns: MP3 audio as bytes (or base64 string).
"""

import asyncio
import base64
import io
import logging

logger = logging.getLogger(__name__)


class TTSService:
    DEFAULT_VOICE = "pl-PL-ZofiaNeural"

    async def synthesize(self, text: str, voice: str | None = None) -> bytes:
        """Returns raw MP3 bytes. Empty bytes on failure."""
        try:
            import edge_tts

            communicate = edge_tts.Communicate(text, voice or self.DEFAULT_VOICE)
            buf = io.BytesIO()
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    buf.write(chunk["data"])
            return buf.getvalue()
        except Exception as exc:
            logger.error(f"[TTS] Synthesis failed: {exc}")
            return b""

    async def synthesize_b64(self, text: str) -> str:
        """Returns base64-encoded MP3."""
        raw = await self.synthesize(text)
        return base64.b64encode(raw).decode()


tts_service = TTSService()
