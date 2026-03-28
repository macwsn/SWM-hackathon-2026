import logging
import os
from fishjam import FishjamClient, RoomOptions

logger = logging.getLogger(__name__)

# Sandbox defaults if not provided
FISHJAM_URL = os.environ.get("FISHJAM_URL", "http://localhost:5002")
FISHJAM_MANAGEMENT_TOKEN = os.environ.get("FISHJAM_MANAGEMENT_TOKEN", "development")

fishjam_client = FishjamClient(FISHJAM_URL, FISHJAM_MANAGEMENT_TOKEN)

class FishjamService:
    def __init__(self):
        self.room_id = None
        
    async def initialize(self):
        try:
            # Optionally list rooms and delete/reuse them, but for hackathon we create a new one
            options = RoomOptions(
                max_peers=50,
                webhook_url=None
            )
            # Create a persistent room for the session
            # Note: fishjam_client functions are primarily synchronous requests
            room = fishjam_client.create_room(options=options)
            self.room_id = room.id
            logger.info(f"[Fishjam] Created global room: {self.room_id}")
        except Exception as e:
            logger.error(f"[Fishjam] Failed to create room: {e}")
            logger.error(f"[Fishjam] Is the server running at {FISHJAM_URL}?")

    def get_token(self, peer_name: str) -> tuple[str, str]:
        """Creates a peer in the room and returns the (peer_id, token)"""
        if not self.room_id:
            logger.error("[Fishjam] Cannot generate token; room not initialized.")
            return "", ""
        
        try:
            from fishjam import PeerOptions
            options = PeerOptions(metadata={"name": peer_name})
            peer, token = fishjam_client.create_peer(self.room_id, options=options)
            logger.info(f"[Fishjam] Created peer '{peer_name}' (ID: {peer.id})")
            return peer.id, token
        except Exception as e:
            logger.error(f"[Fishjam] Failed to create peer: {e}")
            return "", ""

fishjam_service = FishjamService()
