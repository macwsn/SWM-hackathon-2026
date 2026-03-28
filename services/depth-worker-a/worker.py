"""
Depth Worker A - GPU-Accelerated Depth Inference Service

This worker:
1. Listens on Redis queue: BLPOP frame:queue
2. Decodes incoming frame data (JPEG bytes + metadata)
3. Runs depth inference using Depth Anything V2
4. Publishes results to Redis: PUBLISH depth:ready

Frame format (JSON):
{
    "session_id": "user-123",
    "timestamp": 1234567890.123,
    "frame_data": "base64_encoded_jpeg",
    "is_indoor": true,
    "width": 1920,
    "height": 1080
}

Result format (JSON):
{
    "session_id": "user-123",
    "timestamp": 1234567890.123,
    "depth_map": "base64_encoded_numpy_compressed",
    "inference_time_ms": 123.45,
    "is_indoor": true,
    "shape": [1080, 1920],
    "worker_id": "depth-worker-a-1"
}
"""

import asyncio
import base64
import json
import logging
import signal
import sys
import time
from io import BytesIO

import cv2
import numpy as np
import redis.asyncio as aioredis
from prometheus_client import Counter, Histogram, start_http_server

from config import REDIS_URL, WORKER_ID, LOG_LEVEL
from depth_model import DepthModel

# Logging setup
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format=f"[{WORKER_ID}] %(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Prometheus metrics
FRAMES_PROCESSED = Counter('depth_frames_processed_total', 'Total frames processed')
INFERENCE_TIME = Histogram('depth_inference_seconds', 'Time spent on depth inference')
ERRORS = Counter('depth_errors_total', 'Total errors')

# Graceful shutdown
shutdown_event = asyncio.Event()


def signal_handler(sig, frame):
    logger.info(f"Received signal {sig}, initiating graceful shutdown...")
    shutdown_event.set()


signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


class DepthWorker:
    def __init__(self):
        self.redis = None
        self.depth_model = DepthModel()
        
    async def initialize(self):
        """Initialize Redis connection and load models."""
        logger.info(f"Initializing {WORKER_ID}...")
        
        # Connect to Redis
        self.redis = await aioredis.from_url(REDIS_URL, decode_responses=False)
        logger.info("✓ Connected to Redis")
        
        # Load depth models (synchronous, runs in executor)
        logger.info("Loading depth models (this may take a few minutes)...")
        await asyncio.get_event_loop().run_in_executor(None, self.depth_model.initialize)
        logger.info("✓ Depth models loaded")
        
    async def run(self):
        """Main worker loop - listens on Redis queue and processes frames."""
        logger.info(f"{WORKER_ID} started! Listening on frame:queue...")
        
        while not shutdown_event.is_set():
            try:
                # BLPOP: Blocking pop from frame queue (timeout 1 second)
                result = await self.redis.blpop("frame:queue", timeout=1)
                
                if result is None:
                    continue  # Timeout, check shutdown event
                
                _, frame_data = result  # (queue_name, data)
                
                # Process frame
                await self.process_frame(frame_data)
                
            except Exception as e:
                logger.error(f"Error in main loop: {e}", exc_info=True)
                ERRORS.inc()
                await asyncio.sleep(0.1)  # Brief pause before retrying
        
        logger.info("Worker shutdown complete")
    
    async def process_frame(self, frame_data: bytes):
        """Process a single frame and publish depth result."""
        try:
            # Decode JSON payload
            payload = json.loads(frame_data.decode())
            session_id = payload["session_id"]
            timestamp = payload["timestamp"]
            is_indoor = payload.get("is_indoor", False)
            frame_b64 = payload["frame_data"]
            
            # Decode JPEG
            frame_bytes = base64.b64decode(frame_b64)
            frame_array = np.frombuffer(frame_bytes, dtype=np.uint8)
            frame_bgr = cv2.imdecode(frame_array, cv2.IMREAD_COLOR)
            frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
            
            # Run depth inference
            t0 = time.perf_counter()
            depth_map, inference_time_ms = await asyncio.get_event_loop().run_in_executor(
                None, self.depth_model.predict_depth, frame_rgb, is_indoor
            )
            total_time = (time.perf_counter() - t0) * 1000
            
            # Compress depth map for transmission (using numpy's compressed format)
            depth_buffer = BytesIO()
            np.savez_compressed(depth_buffer, depth=depth_map)
            depth_b64 = base64.b64encode(depth_buffer.getvalue()).decode()
            
            # Build result payload
            result = {
                "session_id": session_id,
                "timestamp": timestamp,
                "depth_map": depth_b64,
                "inference_time_ms": inference_time_ms,
                "total_time_ms": total_time,
                "is_indoor": is_indoor,
                "shape": list(depth_map.shape),
                "worker_id": WORKER_ID,
            }
            
            # Publish to depth:ready channel
            await self.redis.publish("depth:ready", json.dumps(result))
            
            # Update metrics
            FRAMES_PROCESSED.inc()
            INFERENCE_TIME.observe(inference_time_ms / 1000)
            
            logger.debug(
                f"Processed frame for {session_id}: "
                f"inference={inference_time_ms:.1f}ms, total={total_time:.1f}ms"
            )
            
        except Exception as e:
            logger.error(f"Error processing frame: {e}", exc_info=True)
            ERRORS.inc()
    
    async def cleanup(self):
        """Cleanup resources."""
        if self.redis:
            await self.redis.close()
            logger.info("Redis connection closed")


async def main():
    """Main entry point."""
    # Start Prometheus metrics server
    start_http_server(8000)
    logger.info("Prometheus metrics available at http://localhost:8000")
    
    worker = DepthWorker()
    
    try:
        await worker.initialize()
        await worker.run()
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        sys.exit(1)
    finally:
        await worker.cleanup()


if __name__ == "__main__":
    asyncio.run(main())

