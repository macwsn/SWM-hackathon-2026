import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
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


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "depth_model_loaded": depth_model_service.is_loaded,
        "connections": {
            ch: len(ws_set)
            for ch, ws_set in manager.connections.items()
        },
    }
