import os
from dotenv import load_dotenv

load_dotenv()

# Redis configuration
REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379")

# Model configuration
DEPTH_MODEL_DEVICE: str = os.getenv("MODEL_DEVICE", "cuda")
INDOOR_MODEL_ID: str = os.getenv("INDOOR_MODEL_ID", "depth-anything/Depth-Anything-V2-Metric-Indoor-Small-hf")
OUTDOOR_MODEL_ID: str = os.getenv("OUTDOOR_MODEL_ID", "depth-anything/Depth-Anything-V2-Metric-Outdoor-Small-hf")
HUGGINGFACE_CACHE: str = os.getenv("HUGGINGFACE_CACHE", "/models/cache")

# Processing configuration
DEPTH_PROC_W: int = int(os.getenv("DEPTH_PROC_W", "480"))
DEPTH_PROC_H: int = int(os.getenv("DEPTH_PROC_H", "360"))
BATCH_SIZE: int = int(os.getenv("BATCH_SIZE", "1"))

# Worker configuration
WORKER_ID: str = os.getenv("WORKER_ID", "depth-worker-a-1")
LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

# Performance
MAX_DEPTH_M: float = 20.0
MIN_DEPTH_M: float = 0.1

