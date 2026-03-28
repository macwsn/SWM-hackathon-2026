"""
VisionAssist – TTS Providers
Multiple TTS implementations with easy swap capability.
"""

import io
import logging
from typing import Union

from providers.base import TTSProvider

logger = logging.getLogger(__name__)


class WebSpeechTTS(TTSProvider):
    """
    Client-side TTS using Web Speech API.
    Returns text string – actual synthesis happens in the browser.
    """

    def synthesize(self, text: str, lang: str = "pl") -> str:
        return text


class Pyttsx3TTS(TTSProvider):
    """
    Offline TTS using pyttsx3 (local engine).
    Returns WAV audio bytes.
    """

    def __init__(self):
        self.engine = None

    def _init_engine(self):
        if self.engine is None:
            import pyttsx3
            self.engine = pyttsx3.init()
            self.engine.setProperty("rate", 160)
            self.engine.setProperty("volume", 1.0)
            # Try to set Polish voice
            voices = self.engine.getProperty("voices")
            for voice in voices:
                if "polish" in voice.name.lower() or "pl" in voice.id.lower():
                    self.engine.setProperty("voice", voice.id)
                    logger.info(f"Using Polish voice: {voice.name}")
                    break

    def synthesize(self, text: str, lang: str = "pl") -> bytes:
        self._init_engine()

        buffer = io.BytesIO()
        self.engine.save_to_file(text, "_tts_temp.wav")
        self.engine.runAndWait()

        # Read the temp file (pyttsx3 doesn't support in-memory)
        try:
            with open("_tts_temp.wav", "rb") as f:
                return f.read()
        except FileNotFoundError:
            logger.error("TTS failed to generate audio file")
            return b""


class GeminiLiveTTS(TTSProvider):
    """
    Placeholder for Gemini Live API integration.
    Will be implemented when the API becomes available.
    """

    def synthesize(self, text: str, lang: str = "pl") -> Union[bytes, str]:
        raise NotImplementedError(
            "Gemini Live API is not yet available. "
            "Use WebSpeechTTS or Pyttsx3TTS as fallback."
        )
