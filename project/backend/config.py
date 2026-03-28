import os
from dotenv import load_dotenv

load_dotenv()

# ──────────────────────────────────────────────────────────────
# API Keys
# ──────────────────────────────────────────────────────────────
GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")

# ──────────────────────────────────────────────────────────────
# Mock Services
# ──────────────────────────────────────────────────────────────
USE_MOCK_GEMINI: bool = os.getenv("USE_MOCK_GEMINI", "true").lower() == "true"
USE_MOCK_SMELTER: bool = os.getenv("USE_MOCK_SMELTER", "true").lower() == "true"
USE_MOCK_LOCATION: bool = os.getenv("USE_MOCK_LOCATION", "true").lower() == "true"
USE_MOCK_DEPTH: bool = os.getenv("USE_MOCK_DEPTH", "false").lower() == "true"

# ──────────────────────────────────────────────────────────────
# CORS Configuration
# ──────────────────────────────────────────────────────────────
CORS_ORIGINS: list[str] = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,https://localhost:5173,http://localhost:3000,http://localhost:80"
).split(",")

# ──────────────────────────────────────────────────────────────
# Depth Model Configuration
# ──────────────────────────────────────────────────────────────
DEPTH_MODEL_DEVICE: str = os.getenv("DEPTH_MODEL_DEVICE", "cpu")
DEPTH_INFERENCE_INTERVAL: float = float(os.getenv("DEPTH_INFERENCE_INTERVAL", "0.5"))

OBSTACLE_THRESHOLD_INDOOR: float = float(os.getenv("OBSTACLE_THRESHOLD_INDOOR", "1.5"))
OBSTACLE_THRESHOLD_OUTDOOR: float = float(os.getenv("OBSTACLE_THRESHOLD_OUTDOOR", "2.0"))

# Frame is resized to this resolution before depth inference (main speedup)
DEPTH_PROC_W: int = int(os.getenv("DEPTH_PROC_W", "480"))
DEPTH_PROC_H: int = int(os.getenv("DEPTH_PROC_H", "360"))

# ──────────────────────────────────────────────────────────────
# File Paths
# ──────────────────────────────────────────────────────────────
VIDEO_INPUT_DIR: str = os.getenv("VIDEO_INPUT_DIR", "./video_input")
MODEL_WEIGHTS_DIR: str = os.getenv("MODEL_WEIGHTS_DIR", "./models")
