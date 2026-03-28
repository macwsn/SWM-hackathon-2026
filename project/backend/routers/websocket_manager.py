import logging
from typing import Dict, Set
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WebSocketManager:
    """
    Central broadcast manager for all WebSocket connections.

    Channels:
    - "user"      : User (blind person) panel connections
    - "caregiver" : Caregiver/assistant panel connections
    - "stats"     : Statistics/diagnostics panel connections
    """

    def __init__(self):
        self.connections: Dict[str, Set[WebSocket]] = {
            "user": set(),
            "caregiver": set(),
            "stats": set(),
        }

    async def connect(self, channel: str, ws: WebSocket):
        await ws.accept()
        self.connections.setdefault(channel, set()).add(ws)
        logger.info(f"[WS] Connected to '{channel}'. Active: {len(self.connections[channel])}")

    def disconnect(self, channel: str, ws: WebSocket):
        self.connections.get(channel, set()).discard(ws)
        logger.info(f"[WS] Disconnected from '{channel}'")

    async def broadcast(self, channel: str, data: dict):
        dead: Set[WebSocket] = set()
        for ws in list(self.connections.get(channel, set())):
            try:
                await ws.send_json(data)
            except Exception:
                dead.add(ws)
        self.connections.get(channel, set()).difference_update(dead)

    async def send_to(self, ws: WebSocket, data: dict):
        try:
            await ws.send_json(data)
        except Exception as e:
            logger.error(f"[WS] send_to failed: {e}")


manager = WebSocketManager()
