"""
WebRTC signaling server for bidirectional voice call: user ↔ caregiver.

Protocol (via WebSocket /ws/webrtc/{role}):
  role: "user" | "caregiver"

Messages relayed between peers (client → server → other peer):
  {"type": "call-request"}       — user wants to call caregiver
  {"type": "offer",  "sdp": str} — WebRTC SDP offer
  {"type": "answer", "sdp": str} — WebRTC SDP answer
  {"type": "ice-candidate", "candidate": {...}} — ICE candidates
  {"type": "hangup"}             — end the call

Messages sent by server:
  {"type": "incoming-call"}      — server notifies caregiver of call-request
  {"type": "peer-connected",   "role": str}  — other peer joined signaling
  {"type": "peer-disconnected","role": str}  — other peer left signaling
"""

import logging
from typing import Dict, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["webrtc"])
logger = logging.getLogger(__name__)

# Simple single-room signaling (one active call at a time)
_peers: Dict[str, Optional[WebSocket]] = {"user": None, "caregiver": None}


@router.websocket("/ws/webrtc/{role}")
async def webrtc_signaling(ws: WebSocket, role: str):
    if role not in ("user", "caregiver"):
        await ws.close(code=4000)
        return

    await ws.accept()
    _peers[role] = ws
    logger.info(f"[WebRTC] {role} connected to signaling")

    other_role = "caregiver" if role == "user" else "user"

    # Notify the other peer
    if _peers.get(other_role):
        try:
            await _peers[other_role].send_json({"type": "peer-connected", "role": role})
        except Exception:
            pass

    try:
        while True:
            data = await ws.receive_json()

            # Forward all messages to the counterpart
            other = _peers.get(other_role)
            if other:
                try:
                    await other.send_json(data)
                except Exception as exc:
                    logger.warning(f"[WebRTC] relay to {other_role} failed: {exc}")
            else:
                logger.debug(f"[WebRTC] no {other_role} connected, dropping {data.get('type')}")

    except WebSocketDisconnect:
        _peers[role] = None
        other = _peers.get(other_role)
        if other:
            try:
                await other.send_json({"type": "peer-disconnected", "role": role})
            except Exception:
                pass
        logger.info(f"[WebRTC] {role} disconnected")
    except Exception as exc:
        logger.error(f"[WebRTC] {role} error: {exc}")
        _peers[role] = None
