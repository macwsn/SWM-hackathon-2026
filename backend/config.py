"""
VisionAssist – Configuration
Centralized settings for the backend server, models, and alert thresholds.
"""

from dataclasses import dataclass, field


@dataclass
class ServerConfig:
    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: list[str] = field(default_factory=lambda: ["*"])


@dataclass
class DepthConfig:
    model_name_indoor: str = "depth-anything/Depth-Anything-V2-Metric-Indoor-Small-hf"
    model_name_outdoor: str = "depth-anything/Depth-Anything-V2-Metric-Outdoor-Small-hf"
    device: str = "cuda"  # "cuda" or "cpu"
    use_fp16: bool = True
    enable_tf32: bool = True
    min_depth_m: float = 0.1
    max_depth_m: float = 20.0


# YOLO Config removed for simplicity as per user request


@dataclass
class AlertConfig:
    # Distance thresholds in meters (smaller = closer)
    critical_distance_m: float = 1.2
    warning_distance_m: float = 2.5
    info_distance_m: float = 4.0
    # Cooldown in seconds per sector
    alert_cooldown: float = 0.8
    # Language for alerts
    language: str = "pl"
    # Max alerts per analysis cycle
    max_alerts_per_cycle: int = 3


@dataclass
class FrameConfig:
    # Processing resolution (smaller = faster)
    process_width: int = 480
    process_height: int = 360
    jpeg_quality: int = 70
    # Target FPS for processing
    target_fps: float = 10.0
    # Send heatmap image every N processed frames (1 = every frame)
    heatmap_every_n_frames: int = 1


@dataclass
class AppConfig:
    server: ServerConfig = field(default_factory=ServerConfig)
    depth: DepthConfig = field(default_factory=DepthConfig)
    alert: AlertConfig = field(default_factory=AlertConfig)
    frame: FrameConfig = field(default_factory=FrameConfig)


# Global config instance
config = AppConfig()
