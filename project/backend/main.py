import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import DEPTH_INFERENCE_INTERVAL
from mocks.gemini_mock import gemini_mock
from mocks.location_mock import location_mock
from mocks.smelter_mock import smelter_mock
from routers import user_ws, caregiver_ws, stats_ws, webrtc, video, processor_ws
from routers.websocket_manager import manager
from services.depth_model import depth_model_service
from services.obstacle_detector import obstacle_detector
from services.tts_service import tts_service

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Create required directories
os.makedirs("video_input", exist_ok=True)
os.makedirs("models", exist_ok=True)


async def _processing_loop():
    """
    Main loop: frame → depth model → obstacle detection → alerts → broadcast.
    Runs at DEPTH_INFERENCE_INTERVAL second cadence.
    """
    loop = asyncio.get_event_loop()
    frame_count = 0

    while True:
        # If a real user is connected via /ws/processor, suppress the MOCK loop
        if processor_ws.active_processor_ws is not None:
            await asyncio.sleep(1.0)
            continue

        t_start = time.perf_counter()

        # 1. Get current frame from mock/Smelter
        frame = smelter_mock.get_current_frame()
        is_indoor = gemini_mock.get_indoor_outdoor() == "indoor"

        # 2. Depth inference (offloaded to thread pool — CPU-bound)
        depth_map, inference_ms = await loop.run_in_executor(
            None,
            lambda f=frame, i=is_indoor: depth_model_service.predict_depth(f, i),
        )

        # 3. Obstacle detection
        obstacle, min_dist = obstacle_detector.detect(depth_map, is_indoor)

        # 4. Alert if obstacle and throttle allows
        if obstacle and obstacle_detector.should_alert():
            alert_text = obstacle_detector.format_alert(min_dist, is_indoor)

            audio_b64 = await tts_service.synthesize_b64(alert_text)
            await manager.broadcast("user", {
                "type": "tts_audio",
                "data": audio_b64,
                "text": alert_text,
            })

            alert_payload = {
                "type": "alert",
                "text": alert_text,
                "distance": round(min_dist, 2),
                "is_indoor": is_indoor,
                "timestamp": time.time(),
            }
            await manager.broadcast("caregiver", alert_payload)
            await manager.broadcast("stats", alert_payload)

        # 5. Depth visualisation → stats panel
        depth_b64 = await loop.run_in_executor(
            None,
            lambda d=depth_map: depth_model_service.depth_to_visualization_b64(d),
        )
        await manager.broadcast("stats", {
            "type": "depth_frame",
            "data": depth_b64,
            "min_distance": round(min_dist, 2),
            "inference_ms": round(inference_ms, 1),
            "is_indoor": is_indoor,
        })

        # 6. Performance metrics → stats panel
        frame_count += 1
        elapsed = time.perf_counter() - t_start
        await manager.broadcast("stats", {
            "type": "metrics",
            "depth_ms": round(inference_ms, 1),
            "fps": round(1 / max(elapsed, 0.01), 1),
            "frame_count": frame_count,
            "is_indoor": is_indoor,
            "min_distance": round(min_dist, 2),
            "timestamp": time.time(),
        })

        sleep_for = max(0.0, DEPTH_INFERENCE_INTERVAL - elapsed)
        await asyncio.sleep(sleep_for)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────────────
    await depth_model_service.initialize()
    asyncio.create_task(smelter_mock.run(), name="smelter_mock")
    asyncio.create_task(location_mock.run(), name="location_mock")
    asyncio.create_task(gemini_mock.run(), name="gemini_mock")
    asyncio.create_task(_processing_loop(), name="processing_loop")
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
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(video.router)
app.include_router(user_ws.router)
app.include_router(caregiver_ws.router)
app.include_router(stats_ws.router)
app.include_router(webrtc.router)
app.include_router(processor_ws.router)


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
