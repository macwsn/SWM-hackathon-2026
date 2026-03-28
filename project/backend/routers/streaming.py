import logging
import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.fishjam_service import fishjam_service

router = APIRouter(prefix="/api/streaming", tags=["streaming"])
logger = logging.getLogger(__name__)

class TokenResponse(BaseModel):
    room_id: str
    peer_id: str
    token: str

@router.get("/token")
async def get_streaming_token(role: str):
    """
    Returns a Fishjam peer token.
    `role` can be 'user', 'caregiver', 'stats', etc.
    """
    if not fishjam_service.room_id:
        raise HTTPException(status_code=503, detail="Fishjam server not available or room not created.")
        
    peer_name = f"{role}-{os.urandom(4).hex()}"
    peer_id, token = fishjam_service.get_token(peer_name)
    
    if not token:
        raise HTTPException(status_code=500, detail="Failed to generate streaming token.")
        
    return {
        "room_id": fishjam_service.room_id,
        "peer_id": peer_id,
        "token": token
    }
