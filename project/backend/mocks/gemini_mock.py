"""
MOCK: Gemini API responses.

REAL DATA EXPECTED (to replace this module):
- Input: JPEG image bytes + GPS location dict {"lat": float, "lon": float}
- indoor_outdoor output: "indoor" | "outdoor"
- describe_surroundings output: Polish text, max 2 sentences, describing scene
- simple_description output: 1 short Polish sentence about user movement

TO ENABLE REAL GEMINI:
1. Set GEMINI_API_KEY in .env
2. Set USE_MOCK_GEMINI=false in .env
The GeminiService in services/gemini_service.py handles the real API.
"""

import random
import time
import asyncio
from routers.websocket_manager import manager

SIMPLE_DESCRIPTIONS = [
    "Użytkownik idzie prosto.",
    "Użytkownik skręcił w lewo.",
    "Użytkownik skręcił w prawo.",
    "Użytkownik zwalnia.",
    "Użytkownik przyspiesza.",
    "Użytkownik zatrzymał się.",
    "Użytkownik wchodzi do budynku.",
    "Użytkownik wychodzi z budynku.",
    "Użytkownik idzie po schodach w górę.",
    "Użytkownik idzie po schodach w dół.",
    "Użytkownik mija zaparkowane samochody.",
    "Użytkownik zbliża się do skrzyżowania.",
]

SURROUNDINGS_DESCRIPTIONS = [
    "Jesteś na chodniku w centrum miasta. Przed tobą skrzyżowanie, po lewej sklep spożywczy, po prawej zaparkowane samochody.",
    "Jesteś w zamkniętym pomieszczeniu. Przed tobą drzwi, po lewej okno. Słychać ruch uliczny z zewnątrz.",
    "Jesteś na otwartej przestrzeni, prawdopodobnie parku. Chodnik wiedzie prosto przed tobą, po obu stronach ławki.",
    "Jesteś w korytarzu budynku. Przed tobą schody w górę, po prawej drzwi do toalety.",
    "Jesteś na przejściu dla pieszych. Sygnalizacja świetlna przed tobą, czekaj na zielone.",
    "Jesteś na chodniku przy ruchliwej ulicy. Samochody przejeżdżają po twojej prawej stronie.",
]


class GeminiMock:
    def __init__(self):
        self._indoor_outdoor = "outdoor"
        self._last_state_change = time.time()

    def get_indoor_outdoor(self) -> str:
        """Fixed to 'indoor' (mock). Real Gemini will detect this from the frame."""
        return "indoor"

    def get_describe_surroundings(self) -> str:
        return random.choice(SURROUNDINGS_DESCRIPTIONS)

    async def run(self):
        """Broadcasts simple movement descriptions to stats panel every 1 second."""
        while True:
            await asyncio.sleep(1.0)
            description = random.choice(SIMPLE_DESCRIPTIONS)
            await manager.broadcast("stats", {
                "type": "gemini_description",
                "text": description,
                "response_ms": round(random.uniform(150, 700), 1),
                "timestamp": time.time(),
            })


gemini_mock = GeminiMock()
