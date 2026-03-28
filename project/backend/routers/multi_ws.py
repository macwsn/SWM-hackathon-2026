import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from routers.websocket_manager import manager

router = APIRouter(tags=["websocket"])
logger = logging.getLogger(__name__)


@router.websocket("/ws/multi")
async def multi_websocket(ws: WebSocket):
    """
    WebSocket for the multi-assistant panel.
    Receives broadcast frames from multiple users.
    Handles accept_call to redirect both sides.
    """
    await manager.connect("multi", ws)
    try:
        while True:
            raw = await ws.receive_text()
            try:
                data = json.loads(raw)
                msg_type = data.get("type")

                if msg_type == "accept_call":
                    user_id = data.get("user_id")
                    if user_id:
                        logger.info(f"[Multi] Accepting call from {user_id}")
                        # Tell user to redirect to /user with auto-call
                        await manager.broadcast(f"multi_signal_{user_id}", {
                            "type": "redirect",
                            "to": "/user?call=auto",
                        })
                        # Tell multi-assistant to redirect to /caregiver with auto-call
                        await ws.send_json({
                            "type": "redirect",
                            "to": "/caregiver?call=auto",
                            "user_id": user_id,
                        })

                elif msg_type == "initiate_call":
                    user_id = data.get("user_id")
                    if user_id:
                        logger.info(f"[Multi] Initiating call to {user_id}")
                        # Send incoming_call to the target user
                        await manager.broadcast(f"multi_signal_{user_id}", {
                            "type": "incoming_call",
                            "from": "assistant",
                        })
            except Exception:
                pass
    except WebSocketDisconnect:
        manager.disconnect("multi", ws)
    except Exception as exc:
        logger.error(f"[WS/multi] {exc}")
        manager.disconnect("multi", ws)


@router.websocket("/ws/multi_signal/{user_id}")
async def multi_signal_websocket(ws: WebSocket, user_id: str):
    """
    Per-user signaling channel for multi-mode.
    User sends call_request, receives redirect.
    """
    channel = f"multi_signal_{user_id}"
    await manager.connect(channel, ws)
    logger.info(f"[MultiSignal/{user_id}] connected")
    try:
        while True:
            raw = await ws.receive_text()
            try:
                data = json.loads(raw)
                msg_type = data.get("type")

                if msg_type == "call_request":
                    # Forward to multi-assistant panel
                    await manager.broadcast("multi", {
                        "type": "call_request",
                        "user_id": user_id,
                    })
                    logger.info(f"[MultiSignal/{user_id}] call_request forwarded")

                elif msg_type == "accept_incoming_call":
                    # User accepted a call initiated by assistant
                    logger.info(f"[MultiSignal/{user_id}] accepted incoming call")
                    # Tell user to redirect to /user with auto-call
                    await ws.send_json({
                        "type": "redirect",
                        "to": "/user?call=auto",
                    })
                    # Tell multi-assistant to redirect to /caregiver
                    await manager.broadcast("multi", {
                        "type": "call_accepted_by_user",
                        "user_id": user_id,
                    })
            except Exception:
                pass
    except WebSocketDisconnect:
        manager.disconnect(channel, ws)
        logger.info(f"[MultiSignal/{user_id}] disconnected")
