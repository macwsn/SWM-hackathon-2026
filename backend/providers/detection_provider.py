"""
VisionAssist – YOLO Detection Provider
Object detection using YOLOv8-nano from Ultralytics.
"""

import logging

import numpy as np
import torch
from ultralytics import YOLO

from config import config
from providers.base import Detection, DetectionProvider, Direction

logger = logging.getLogger(__name__)


class YOLODetectionProvider(DetectionProvider):
    """Object detection using YOLOv8-nano."""

    def __init__(self):
        self.model = None

    def load_model(self) -> None:
        """Load YOLOv8-nano model (auto-downloads if not present)."""
        model_name = config.detection.model_name
        device_name = config.detection.device

        if device_name == "cuda" and not torch.cuda.is_available():
            logger.warning("CUDA not available, falling back to CPU for YOLO")
            device_name = "cpu"

        logger.info(f"Loading YOLO model: {model_name} on {device_name}")
        self.model = YOLO(model_name)
        self.model.to(device_name)
        logger.info("YOLO model loaded successfully")

    def detect(self, frame: np.ndarray) -> list[Detection]:
        """
        Detect objects in an RGB frame.

        Args:
            frame: RGB image as numpy array (H, W, 3), uint8

        Returns:
            List of Detection objects with label, confidence, bbox, and direction.
        """
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load_model() first.")

        results = self.model(
            frame,
            conf=config.detection.confidence_threshold,
            verbose=False,
        )

        detections: list[Detection] = []
        frame_width = frame.shape[1]

        for result in results:
            boxes = result.boxes
            if boxes is None:
                continue

            for box in boxes:
                # Get class name
                cls_id = int(box.cls[0])
                label = self.model.names[cls_id]

                # Filter to target classes only
                if label not in config.detection.target_classes:
                    continue

                confidence = float(box.conf[0])
                x1, y1, x2, y2 = [int(c) for c in box.xyxy[0].tolist()]

                # Determine direction based on bbox center
                center_x = (x1 + x2) / 2
                relative_x = center_x / frame_width

                if relative_x < 0.33:
                    direction = Direction.LEFT
                elif relative_x > 0.66:
                    direction = Direction.RIGHT
                else:
                    direction = Direction.CENTER

                detections.append(Detection(
                    label=label,
                    confidence=confidence,
                    bbox=(x1, y1, x2, y2),
                    direction=direction,
                ))

        return detections
