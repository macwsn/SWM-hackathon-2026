"""
VisionAssist – Main FastAPI Server
WebSocket-based real-time obstacle detection for visually impaired users.

Modern implementation using:
- FastAPI Lifespan (modern startup/shutdown)
- Metric Depth Anything V2 Large (absolute depth in meters)
- Print-based diagnostics (reliable scrolling)
"""

import asyncio
import json
import logging
import time
from contextlib import asynccontextmanager

import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from config import config
from providers.depth_provider import DepthAnythingProvider
from providers.tts_provider import WebSpeechTTS
from analysis.obstacle_analyzer import ObstacleAnalyzer
from analysis.alert_generator import AlertGenerator
from utils.frame_processor import FrameProcessor

# ── Logging ──────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s │ %(name)-28s │ %(levelname)-7s │ %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("visionassist")

# ── Global Providers ─────────────────────────────────────────────────────

depth_provider_indoor = DepthAnythingProvider(config.depth.model_name_indoor)
depth_provider_outdoor = DepthAnythingProvider(config.depth.model_name_outdoor)
tts_provider = WebSpeechTTS()
obstacle_analyzer = ObstacleAnalyzer()
alert_generator = AlertGenerator()
frame_processor = FrameProcessor()

models_loaded = False

# ── Lifespan ──────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load ML models at server startup."""
    global models_loaded

    print("\n" + "!" * 60)
    print("!!! VISIONASSIST BACKEND STARTING !!!")
    print("=" * 60)

    try:
        print(f"-> Loading indoor model: {config.depth.model_name_indoor}...")
        depth_provider_indoor.load_model()
        print("✓ Indoor model loaded successfully!")

        print(f"-> Loading outdoor model: {config.depth.model_name_outdoor}...")
        depth_provider_outdoor.load_model()
        print("✓ Outdoor model loaded successfully!")
        
        # Self-test the pipeline
        print("-> Running self-test with dummy frame...")
        dummy_frame = np.zeros((config.frame.process_height, config.frame.process_width, 3), dtype=np.uint8)
        dummy_frame[100:200, 100:200] = 255 # White square
        test_depth = depth_provider_indoor.estimate_depth(dummy_frame)
        test_enriched = obstacle_analyzer.analyze(test_depth)
        print(
            f"✓ Self-test complete. Obstacles found: {len(test_enriched)} "
            f"| min={float(test_depth.min()):.2f}m max={float(test_depth.max()):.2f}m"
        )

        models_loaded = True
        print(f"🚀 SERVER READY: http://{config.server.host}:{config.server.port}")
        print(f"📡 WEBSOCKET: ws://{config.server.host}:{config.server.port}/ws")
        print("=" * 60 + "\n")

    except Exception as e:
        print(f"\n❌ STARTUP ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        models_loaded = False

    yield
    print("VisionAssist Backend Shutting Down...")


# ── FastAPI App ──────────────────────────────────────────────────────────

app = FastAPI(
    title="VisionAssist API",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.server.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── REST Endpoints ───────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    return {
        "status": "ok" if models_loaded else "degraded",
        "models_loaded": models_loaded,
        "depth_model_indoor": config.depth.model_name_indoor,
        "depth_model_outdoor": config.depth.model_name_outdoor,
    }

# ── WebSocket Endpoint ──────────────────────────────────────────────────

guardian_connections = set()

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket, role: str = "user"):
    await ws.accept()
    logger.info(f"Client connected: {ws.client} with role: {role}")

    if role == "guardian":
        guardian_connections.add(ws)

    is_processing = False
    current_fps = 0.0
    frame_count = 0
    processed_frames = 0
    fps_start = time.time()

    try:
        while True:
            raw = await ws.receive_text()
            try:
                message = json.loads(raw)
            except:
                continue

            if message.get("type") == "frame":
                if role == "guardian":
                    continue  # Guardians shouldn't send frames

                if is_processing or not models_loaded:
                    continue

                is_processing = True
                try:
                    frame_data = message.get("data", "")
                    depth_mode = message.get("depth_mode", "indoor")
                    processed_frames += 1
                    # Process frame in background thread
                    result = await asyncio.get_event_loop().run_in_executor(
                        None, 
                        lambda: _process_frame(frame_data, current_fps, processed_frames, depth_mode)
                    )
                    await ws.send_json(result)

                    if guardian_connections:
                        broadcast_data = {
                            "type": "broadcast",
                            "frame": frame_data,
                            "analysis": result
                        }
                        for g_ws in list(guardian_connections):
                            try:
                                await g_ws.send_json(broadcast_data)
                            except Exception:
                                pass
                except Exception as e:
                    logger.error(f"Error processing frame: {e}")
                finally:
                    is_processing = False

                # Update FPS
                frame_count += 1
                if time.time() - fps_start >= 1.0:
                    current_fps = frame_count / (time.time() - fps_start)
                    frame_count = 0
                    fps_start = time.time()

            elif message.get("type") == "ping":
                await ws.send_json({"type": "pong"})

    except WebSocketDisconnect:
        logger.info(f"Client disconnected: {ws.client}")
        if role == "guardian" and ws in guardian_connections:
            guardian_connections.remove(ws)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        if role == "guardian" and ws in guardian_connections:
            guardian_connections.remove(ws)


def _process_frame(frame_data: str, current_fps: float, frame_index: int, depth_mode: str) -> dict:
    t_start = time.time()

    # 1. Decode
    frame = frame_processor.decode_base64_frame(frame_data)
    if frame is None:
        return {"type": "error", "message": "Decode failure"}

    # 2. Resize
    frame_resized = frame_processor.resize_frame(frame)

    # 3. Depth
    selected_mode = "outdoor" if depth_mode == "outdoor" else "indoor"
    depth_provider = depth_provider_outdoor if selected_mode == "outdoor" else depth_provider_indoor
    depth_map = depth_provider.estimate_depth(frame_resized)
    depth_min_m = float(np.percentile(depth_map, 1))
    depth_max_m = float(np.percentile(depth_map, 99))

    # 4. Analyze (Sector-based)
    obstacles = obstacle_analyzer.analyze(depth_map)
    
    # 5. Cooldowns
    alertable = obstacle_analyzer.filter_cooldowns(obstacles)

    # 6. Alerts
    alerts = alert_generator.generate(alertable)

    # 7. Visualization (depth image throttled to reduce transfer/encoding lag)
    heatmap_every_n = max(1, int(config.frame.heatmap_every_n_frames))
    should_send_heatmap = frame_index % heatmap_every_n == 0
    depth_b64 = None
    if should_send_heatmap:
        depth_b64 = frame_processor.encode_depth_map(
            depth_map,
            min_depth_m=config.depth.min_depth_m,
            max_depth_m=config.depth.max_depth_m,
        )

    t_elapsed = (time.time() - t_start) * 1000

    return {
        "type": "analysis",
        "obstacles": [
            {
                "label": d.label,
                "distance": round(d.distance, 2),
                "direction": d.direction.value,
                "severity": d.severity.value,
            } for d in obstacles
        ],
        "alerts": [
            {
                "text": a.text,
                "severity": a.severity.value,
            } for a in alerts
        ],
        "depth_map": depth_b64,
        "depth_min_m": round(depth_min_m, 2),
        "depth_max_m": round(depth_max_m, 2),
        "depth_mode": selected_mode,
        "fps": round(current_fps, 1),
        "ms": round(t_elapsed, 1),
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=config.server.host, port=config.server.port)
