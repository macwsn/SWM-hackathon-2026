"""
Google Gemini API integration.

Capabilities used:
1. indoor_outdoor detection — from camera frame
2. describe_surroundings    — Polish description for the blind user (TTS)
3. simple_description       — 1-sentence movement update for stats panel

REAL DATA EXPECTED:
- image_bytes: JPEG bytes from the current camera frame
- location:    {"lat": float, "lon": float}

TO ENABLE:
1. Set GEMINI_API_KEY in .env
2. Set USE_MOCK_GEMINI=false in .env

Model used: gemini-2.5-flash-lite (multimodal vision)
"""

import base64
import asyncio
import logging
import random

import httpx

from config import GEMINI_API_KEY, USE_MOCK_GEMINI
from mocks.gemini_mock import gemini_mock, SIMPLE_DESCRIPTIONS

logger = logging.getLogger(__name__)

_GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta"
    "/models/gemini-2.5-flash-lite:generateContent"
)


class GeminiService:
    @staticmethod
    def _short(text: str, max_len: int = 220) -> str:
        text = (text or "").replace("\n", " ").strip()
        if len(text) <= max_len:
            return text
        return text[: max_len - 3] + "..."

    async def get_indoor_outdoor(self, image_bytes: bytes) -> str:
        """Returns 'indoor' or 'outdoor'."""
        if USE_MOCK_GEMINI or not GEMINI_API_KEY:
            return gemini_mock.get_indoor_outdoor()
        try:
            prompt = (
                "Is this image taken indoors or outdoors? "
                "Reply with exactly one word: 'indoor' or 'outdoor'."
            )
            result = await self._call(image_bytes, prompt)
            return "indoor" if "indoor" in result.lower() else "outdoor"
        except Exception as exc:
            logger.exception("[Gemini] indoor/outdoor failed")
            return "outdoor"

    async def describe_surroundings(
        self, image_bytes: bytes, location: dict
    ) -> str:
        """Returns Polish description of surroundings (max 2 sentences)."""
        if USE_MOCK_GEMINI or not GEMINI_API_KEY:
            return gemini_mock.get_describe_surroundings()
        try:
            lat = location.get("lat", 0)
            lon = location.get("lon", 0)
            prompt = (
                f"Jesteś asystentem dla osoby niewidomej. "
                f"Lokalizacja GPS: {lat:.5f}, {lon:.5f}. "
                "Opisz krótko co widzisz na obrazie, skupiając się na przeszkodach "
                "i ważnych elementach otoczenia. Odpowiedz po polsku, maksymalnie 2 zdania."
            )
            return await self._call(image_bytes, prompt)
        except Exception as exc:
            logger.exception("[Gemini] describe_surroundings failed")
            return "Nie udało się opisać otoczenia."

    async def get_simple_description(self, image_bytes: bytes) -> str:
        """Returns 1-sentence movement description for stats panel."""
        if USE_MOCK_GEMINI or not GEMINI_API_KEY:
            return random.choice(SIMPLE_DESCRIPTIONS)
        try:
            prompt = (
                "Opisz jednym krótkim zdaniem po polsku co robi osoba widoczna na obrazie "
                "(np. idzie prosto, skręca, stoi, wchodzi po schodach itp.)."
            )
            return await self._call(image_bytes, prompt)
        except Exception as exc:
            logger.exception("[Gemini] simple_description failed")
            return "Brak opisu."

    async def _call(self, image_bytes: bytes, prompt: str) -> str:
        payload = {
            "contents": [{
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": base64.b64encode(image_bytes).decode(),
                        }
                    },
                ]
            }]
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Retry transient upstream overloads.
            for attempt in range(2):
                resp = await client.post(
                    f"{_GEMINI_URL}?key={GEMINI_API_KEY}", json=payload
                )
                if resp.status_code != 503:
                    break
                if attempt == 0:
                    await asyncio.sleep(1.0)

            resp.raise_for_status()

            data = resp.json()
            text = self._extract_text(data)
            if text:
                logger.info(
                    "[Gemini] response prompt='%s' text='%s'",
                    self._short(prompt),
                    self._short(text),
                )
                return text

            # Gemini can return non-candidate payloads (e.g. blocked content).
            logger.error("[Gemini] Unexpected response payload: %s", data)
            raise RuntimeError("Gemini response did not contain text candidate")

    @staticmethod
    def _extract_text(data: dict) -> str:
        candidates = data.get("candidates") or []
        if not candidates:
            return ""

        first = candidates[0] or {}
        content = first.get("content") or {}
        parts = content.get("parts") or []
        if not parts:
            return ""

        text = parts[0].get("text") if isinstance(parts[0], dict) else ""
        return text.strip() if isinstance(text, str) else ""


gemini_service = GeminiService()
