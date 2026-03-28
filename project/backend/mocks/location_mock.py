"""
MOCK: GPS location of the blind user.

REAL DATA EXPECTED (to replace this module):
- Source: Browser Geolocation API (navigator.geolocation.watchPosition)
- Frontend sends: {"type": "location", "lat": float, "lon": float, "accuracy": float}
  via WebSocket /ws/user
- Update interval: ~1 second (browser GPS)

MOCK behavior:
- Starts at Kraków city center (50.0614, 19.9366)
- Moves at 2 m/s in a slowly changing direction
- Broadcasts location to caregiver channel every 1 second
"""

import asyncio
import math
import random
import time
from routers.websocket_manager import manager


class LocationMock:
    KRAKÓW_LAT = 50.0614
    KRAKÓW_LON = 19.9366
    SPEED_MS = 2.0  # meters per second

    def __init__(self):
        self.lat = self.KRAKÓW_LAT
        self.lon = self.KRAKÓW_LON
        self.heading = random.uniform(0.0, 360.0)
        self._last_update = time.time()

    def _meters_to_lat(self, meters: float) -> float:
        return meters / 111_320.0

    def _meters_to_lon(self, meters: float) -> float:
        return meters / (111_320.0 * math.cos(math.radians(self.lat)))

    def tick(self) -> tuple[float, float]:
        now = time.time()
        dt = now - self._last_update
        self._last_update = now

        # Slowly drift heading
        self.heading += random.gauss(0, 3)

        dist = self.SPEED_MS * dt
        dx = dist * math.sin(math.radians(self.heading))
        dy = dist * math.cos(math.radians(self.heading))
        self.lat += self._meters_to_lat(dy)
        self.lon += self._meters_to_lon(dx)
        return self.lat, self.lon

    def get_current(self) -> dict:
        return {"lat": self.lat, "lon": self.lon}

    async def run(self):
        while True:
            lat, lon = self.tick()
            await manager.broadcast("caregiver", {
                "type": "location",
                "lat": lat,
                "lon": lon,
                "speed": self.SPEED_MS,
                "heading": self.heading,
                "timestamp": time.time(),
            })
            await asyncio.sleep(1.0)


location_mock = LocationMock()
