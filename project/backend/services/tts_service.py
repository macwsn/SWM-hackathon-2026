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
    MAX_RETRIES = 3
    RETRY_DELAY = 1.0  # seconds
    TIMEOUT = 10.0  # seconds

    async def synthesize(self, text: str, voice: str | None = None) -> bytes:
        """
        Returns raw MP3 bytes. Empty bytes on failure.

        Implements retry logic and timeout handling for edge-tts failures.
        Common failures: network issues, rate limiting, service unavailability.
        """
        if not text or not text.strip():
            logger.warning("[TTS] Empty text provided, skipping synthesis")
            return b""

        # Truncate very long texts to avoid TTS issues
        MAX_CHARS = 500
        if len(text) > MAX_CHARS:
            logger.warning(f"[TTS] Text too long ({len(text)} chars), truncating to {MAX_CHARS}")
            text = text[:MAX_CHARS] + "..."

        for attempt in range(1, self.MAX_RETRIES + 1):
            try:
                logger.info(f"[TTS] Synthesizing text (attempt {attempt}/{self.MAX_RETRIES}): {text[:50]}...")

                # Import edge_tts inside try block to catch import errors
                import edge_tts

                # Create communication object
                communicate = edge_tts.Communicate(text, voice or self.DEFAULT_VOICE)

                # Stream audio with timeout
                buf = io.BytesIO()
                try:
                    async with asyncio.timeout(self.TIMEOUT):
                        async for chunk in communicate.stream():
                            if chunk["type"] == "audio":
                                buf.write(chunk["data"])
                except asyncio.TimeoutError:
                    logger.error(f"[TTS] Timeout after {self.TIMEOUT}s on attempt {attempt}")
                    if attempt < self.MAX_RETRIES:
                        await asyncio.sleep(self.RETRY_DELAY)
                        continue
                    return b""

                audio_data = buf.getvalue()

                # Validate we got actual audio data
                if len(audio_data) < 100:  # MP3 files should be at least a few hundred bytes
                    logger.warning(f"[TTS] Suspiciously small audio data ({len(audio_data)} bytes)")
                    if attempt < self.MAX_RETRIES:
                        await asyncio.sleep(self.RETRY_DELAY)
                        continue
                    return b""

                logger.info(f"[TTS] ✓ Successfully synthesized {len(audio_data)} bytes")
                return audio_data

            except ImportError:
                logger.error("[TTS] edge-tts library not installed! Install with: pip install edge-tts")
                return b""
            except Exception as exc:
                logger.error(f"[TTS] Synthesis failed on attempt {attempt}/{self.MAX_RETRIES}: {exc}")
                if attempt < self.MAX_RETRIES:
                    await asyncio.sleep(self.RETRY_DELAY * attempt)  # Exponential backoff
                    continue
                return b""

        logger.error("[TTS] All retry attempts exhausted")
        return b""

    async def synthesize_b64(self, text: str) -> str:
        """
        Returns base64-encoded MP3.
        Returns empty string if synthesis fails.
        """
        raw = await self.synthesize(text)
        if not raw:
            logger.warning("[TTS] No audio data to encode, returning empty string")
            return ""
        return base64.b64encode(raw).decode()


tts_service = TTSService()
