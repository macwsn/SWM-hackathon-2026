import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from config import DEPTH_INFERENCE_INTERVAL, CORS_ORIGINS
from mocks.gemini_mock import gemini_mock
from mocks.location_mock import location_mock
from routers import user_ws, caregiver_ws, stats_ws, processor_ws, webrtc, multi_ws
from routers.websocket_manager import manager
from services.depth_model import depth_model_service
from services.obstacle_detector import obstacle_detector

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Create required directories
os.makedirs("video_input", exist_ok=True)
os.makedirs("models", exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────────────
    await depth_model_service.initialize()
    asyncio.create_task(location_mock.run(), name="location_mock")
    asyncio.create_task(gemini_mock.run(), name="gemini_mock")
    asyncio.create_task(processor_ws.auto_update_depth_mode_loop(), name="auto_depth_mode_loop")
    logger.info("All background tasks started")
    yield
    # ── Shutdown (nothing to clean) ───────────────────────────────────


app = FastAPI(
    title="Blind Assistant API",
    description="Real-time obstacle detection and assistance for visually impaired users.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.include_router(user_ws.router)
app.include_router(caregiver_ws.router)
app.include_router(stats_ws.router)
app.include_router(processor_ws.router)
app.include_router(webrtc.router)
app.include_router(multi_ws.router)


@app.post("/api/log")
async def frontend_log(request: Request):
    """Receive log messages from frontend (for debugging on mobile without devtools)."""
    body = await request.json()
    level = body.get("level", "info").upper()
    msg = body.get("message", "")
    source = body.get("source", "frontend")
    logger.log(
        getattr(logging, level, logging.INFO),
        f"[{source}] {msg}",
    )
    return {"ok": True}


@app.get("/health")
async def health():
    """
    Comprehensive health check endpoint for Docker healthcheck.
    Verifies that all critical services are ready before accepting traffic.
    """
    # Check depth model status
    depth_ready = depth_model_service.is_loaded

    # Check WebSocket manager is initialized
    ws_manager_ready = manager is not None

    # Overall status: only healthy if all critical components are ready
    all_ready = depth_ready and ws_manager_ready

    return {
        "status": "healthy" if all_ready else "starting",
        "ready": all_ready,
        "components": {
            "depth_model": "ready" if depth_ready else "loading",
            "websocket_manager": "ready" if ws_manager_ready else "initializing",
        },
        "connections": {
            ch: len(ws_set)
            for ch, ws_set in manager.connections.items()
        } if ws_manager_ready else {},
    }


@app.get("/health/websocket")
async def websocket_health():
    """
    WebSocket-specific health check.
    Ensures WebSocket infrastructure is ready to accept connections.
    """
    ws_manager_ready = manager is not None
    depth_ready = depth_model_service.is_loaded

    # WebSocket is considered ready when manager is initialized and depth model is loaded
    # (depth model is needed for obstacle detection during streaming)
    websocket_ready = ws_manager_ready and depth_ready

    if not websocket_ready:
        return {
            "status": "not_ready",
            "ready": False,
            "message": "WebSocket service is still initializing",
            "components": {
                "manager": "ready" if ws_manager_ready else "initializing",
                "depth_model": "ready" if depth_ready else "loading",
            }
        }, 503

    return {
        "status": "ready",
        "ready": True,
        "message": "WebSocket service is ready to accept connections",
        "active_connections": {
            channel: len(connections)
            for channel, connections in manager.connections.items()
        },
    }


@app.get("/caregiver/status")
async def caregiver_status():
    """Check if any caregiver is currently available."""
    caregiver_count = len(manager.connections.get("caregiver", set()))
    return {
        "available": caregiver_count > 0,
        "count": caregiver_count,
        "fallback_mode": "gemini_live" if caregiver_count == 0 else "human_caregiver"
    }
