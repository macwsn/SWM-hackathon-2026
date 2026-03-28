"""
VisionAssist – Frame Processor
Utility functions for decoding, encoding, and resizing video frames.
"""

import base64
import logging

import cv2
import numpy as np
from PIL import Image

from config import config

logger = logging.getLogger(__name__)


class FrameProcessor:
    """Handles frame encoding/decoding between frontend and ML models."""

    @staticmethod
    def decode_base64_frame(data: str) -> np.ndarray | None:
        """
        Decode a base64-encoded JPEG image to a numpy RGB array.

        Args:
            data: Base64 string (optionally with data URI prefix).

        Returns:
            RGB numpy array (H, W, 3) or None on failure.
        """
        try:
            # Strip data URI prefix if present
            if "," in data:
                data = data.split(",", 1)[1]

            img_bytes = base64.b64decode(data)
            nparr = np.frombuffer(img_bytes, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if frame is None:
                return None

            # Convert BGR (OpenCV) → RGB
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            return frame

        except Exception as e:
            logger.error(f"Failed to decode frame: {e}")
            return None

    @staticmethod
    def resize_frame(frame: np.ndarray) -> np.ndarray:
        """Resize frame to processing resolution defined in config."""
        target_w = config.frame.process_width
        target_h = config.frame.process_height
        return cv2.resize(frame, (target_w, target_h), interpolation=cv2.INTER_AREA)

    @staticmethod
    def encode_depth_map(depth_map: np.ndarray, min_depth_m: float, max_depth_m: float) -> str:
        """
        Encode a metric depth map (meters) to a base64 PNG for frontend visualization.
        Near values are shown as warm colors and far values as cool colors.
        """
        depth_clipped = np.clip(depth_map, min_depth_m, max_depth_m)
        denom = max(max_depth_m - min_depth_m, 1e-6)

        # Invert so near obstacles become red/hot in the heatmap.
        depth_norm = 1.0 - ((depth_clipped - min_depth_m) / denom)
        depth_vis = (depth_norm * 255).astype(np.uint8)
        depth_colored = cv2.applyColorMap(depth_vis, cv2.COLORMAP_TURBO)

        # Encode to PNG
        _, buffer = cv2.imencode(".png", depth_colored)
        b64 = base64.b64encode(buffer).decode("utf-8")
        return f"data:image/png;base64,{b64}"

    @staticmethod
    def encode_frame_jpeg(frame: np.ndarray, quality: int = 80) -> str:
        """Encode an RGB frame to base64 JPEG."""
        frame_bgr = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
        _, buffer = cv2.imencode(".jpg", frame_bgr, [cv2.IMWRITE_JPEG_QUALITY, quality])
        b64 = base64.b64encode(buffer).decode("utf-8")
        return f"data:image/jpeg;base64,{b64}"
