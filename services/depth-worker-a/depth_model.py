"""
Depth Anything V2 metric depth estimation — HuggingFace transformers API.

This is the GPU-accelerated depth inference service.
Models are downloaded once and cached in HUGGINGFACE_CACHE.

Model IDs:
  depth-anything/Depth-Anything-V2-Metric-Indoor-Small-hf   (indoor,  ViT-S)
  depth-anything/Depth-Anything-V2-Metric-Outdoor-Small-hf  (outdoor, ViT-S)
"""

import logging
import os
import time

import cv2
import numpy as np

from config import (
    DEPTH_MODEL_DEVICE,
    DEPTH_PROC_W,
    DEPTH_PROC_H,
    INDOOR_MODEL_ID,
    OUTDOOR_MODEL_ID,
    MAX_DEPTH_M,
    MIN_DEPTH_M,
)

logger = logging.getLogger(__name__)


class DepthModel:
    def __init__(self):
        self._indoor_model = None
        self._indoor_processor = None
        self._outdoor_model = None
        self._outdoor_processor = None
        self.is_loaded = False
        self.device = None

    def initialize(self):
        """Load both indoor and outdoor models. Synchronous."""
        logger.info("[Depth] Loading models via HuggingFace transformers…")
        try:
            self._load_models()
            self.is_loaded = True
            logger.info("[Depth] Both models loaded ✓")
        except Exception:
            import traceback
            logger.error(f"[Depth] Failed to load:\n{traceback.format_exc()}")
            raise

    def _load_models(self):
        import torch
        from transformers import AutoImageProcessor, AutoModelForDepthEstimation

        device_name = DEPTH_MODEL_DEVICE
        if device_name == "cuda" and not torch.cuda.is_available():
            logger.warning("[Depth] CUDA not available, falling back to CPU")
            device_name = "cpu"
        self.device = torch.device(device_name)

        torch.set_num_threads(os.cpu_count() or 4)
        if self.device.type == "cuda":
            torch.backends.cudnn.benchmark = True

        logger.info(f"[Depth] Device: {device_name}")

        logger.info(f"[Depth] Loading indoor model: {INDOOR_MODEL_ID}")
        self._indoor_processor = AutoImageProcessor.from_pretrained(INDOOR_MODEL_ID)
        self._indoor_model = AutoModelForDepthEstimation.from_pretrained(INDOOR_MODEL_ID)
        self._indoor_model.to(self.device)
        self._indoor_model.eval()
        logger.info("[Depth] Indoor model loaded ✓")

        logger.info(f"[Depth] Loading outdoor model: {OUTDOOR_MODEL_ID}")
        self._outdoor_processor = AutoImageProcessor.from_pretrained(OUTDOOR_MODEL_ID)
        self._outdoor_model = AutoModelForDepthEstimation.from_pretrained(OUTDOOR_MODEL_ID)
        self._outdoor_model.to(self.device)
        self._outdoor_model.eval()
        logger.info("[Depth] Outdoor model loaded ✓")

        # Warm-up
        logger.info("[Depth] Running warm-up inference...")
        dummy = np.zeros((DEPTH_PROC_H, DEPTH_PROC_W, 3), dtype=np.uint8)
        self._run_infer(self._indoor_model, self._indoor_processor, dummy)
        self._run_infer(self._outdoor_model, self._outdoor_processor, dummy)
        logger.info("[Depth] Warm-up done ✓")

    def predict_depth(
        self, frame_rgb: np.ndarray, is_indoor: bool = False
    ) -> tuple[np.ndarray, float]:
        """
        Run depth inference on a frame.
        
        Returns:
            (depth_map, inference_time_ms)
        """
        t0 = time.perf_counter()

        if not self.is_loaded:
            raise RuntimeError("Model not loaded. Call initialize() first.")

        # Resize to processing resolution
        small = cv2.resize(frame_rgb, (DEPTH_PROC_W, DEPTH_PROC_H), interpolation=cv2.INTER_LINEAR)

        if is_indoor:
            depth = self._run_infer(self._indoor_model, self._indoor_processor, small)
        else:
            depth = self._run_infer(self._outdoor_model, self._outdoor_processor, small)

        return depth, (time.perf_counter() - t0) * 1000

    def _run_infer(self, model, processor, frame_rgb: np.ndarray) -> np.ndarray:
        import torch
        from PIL import Image

        image = Image.fromarray(frame_rgb)
        inputs = processor(images=image, return_tensors="pt")
        inputs = {k: v.to(self.device) for k, v in inputs.items()}

        with torch.inference_mode():
            outputs = model(**inputs)

        predicted_depth = outputs.predicted_depth.float()
        depth_m = torch.nn.functional.interpolate(
            predicted_depth.unsqueeze(1),
            size=frame_rgb.shape[:2],
            mode="bicubic",
            align_corners=False,
        ).squeeze()

        depth_np = depth_m.detach().cpu().numpy().astype(np.float32)
        depth_np = np.nan_to_num(depth_np, nan=MAX_DEPTH_M, posinf=MAX_DEPTH_M, neginf=MIN_DEPTH_M)
        return np.clip(depth_np, MIN_DEPTH_M, MAX_DEPTH_M)

