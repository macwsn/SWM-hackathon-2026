"""
Depth Anything V2 metric depth estimation — HuggingFace transformers API.

Identical approach to swm2_testy/backend/providers/depth_provider.py.
Models are downloaded once and cached in ~/.cache/huggingface/.
If already cached from swm2_testy, loads immediately.

Model IDs:
  depth-anything/Depth-Anything-V2-Metric-Indoor-Small-hf   (indoor,  ViT-S)
  depth-anything/Depth-Anything-V2-Metric-Outdoor-Small-hf  (outdoor, ViT-S)
"""

import asyncio
import base64
import logging
import os
import time

import cv2
import numpy as np

from config import (
    DEPTH_MODEL_DEVICE,
    DEPTH_PROC_W,
    DEPTH_PROC_H,
    USE_MOCK_DEPTH,
)

logger = logging.getLogger(__name__)

INDOOR_MODEL_ID  = "depth-anything/Depth-Anything-V2-Metric-Indoor-Small-hf"
OUTDOOR_MODEL_ID = "depth-anything/Depth-Anything-V2-Metric-Outdoor-Small-hf"

MAX_DEPTH_M = 20.0
MIN_DEPTH_M = 0.1


class DepthModelService:
    def __init__(self):
        self._indoor_model     = None
        self._indoor_processor = None
        self._outdoor_model     = None
        self._outdoor_processor = None
        self.is_loaded = False
        self.device = None

    async def initialize(self):
        if USE_MOCK_DEPTH:
            logger.info("[Depth] USE_MOCK_DEPTH=true — skipping model load")
            return
        logger.info("[Depth] Loading models via HuggingFace transformers…")
        try:
            await asyncio.get_event_loop().run_in_executor(None, self._load_models)
            self.is_loaded = True
            logger.info("[Depth] Both models loaded ✓")
        except Exception:
            import traceback
            logger.error(f"[Depth] Failed to load:\n{traceback.format_exc()}")
            logger.warning("[Depth] Falling back to synthetic mock depth.")

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
        dummy = np.zeros((DEPTH_PROC_H, DEPTH_PROC_W, 3), dtype=np.uint8)
        self._run_infer(self._indoor_model, self._indoor_processor, dummy)
        self._run_infer(self._outdoor_model, self._outdoor_processor, dummy)
        logger.info("[Depth] Warm-up done ✓")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def predict_depth(
        self, frame_rgb: np.ndarray, is_indoor: bool = False
    ) -> tuple[np.ndarray, float]:
        t0 = time.perf_counter()

        if not self.is_loaded:
            return self._mock_depth(frame_rgb), (time.perf_counter() - t0) * 1000

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
            size=(DEPTH_PROC_H, DEPTH_PROC_W),
            mode="bicubic",
            align_corners=False,
        ).squeeze()

        depth_np = depth_m.detach().cpu().numpy().astype(np.float32)
        depth_np = np.nan_to_num(depth_np, nan=MAX_DEPTH_M, posinf=MAX_DEPTH_M, neginf=MIN_DEPTH_M)
        return np.clip(depth_np, MIN_DEPTH_M, MAX_DEPTH_M)

    def depth_to_visualization(self, depth: np.ndarray, max_depth: float = 10.0) -> bytes:
        """Plasma colormap JPEG: close = bright yellow, far = dark purple."""
        norm = ((1.0 - np.clip(depth, 0, max_depth) / max_depth) * 255).astype(np.uint8)
        colored = cv2.applyColorMap(norm, cv2.COLORMAP_PLASMA)
        _, jpeg = cv2.imencode(".jpg", colored, [cv2.IMWRITE_JPEG_QUALITY, 50])
        return jpeg.tobytes()

    def depth_to_visualization_b64(self, depth: np.ndarray) -> str:
        return base64.b64encode(self.depth_to_visualization(depth)).decode()

    # ------------------------------------------------------------------
    # Fallback synthetic depth
    # ------------------------------------------------------------------

    def _mock_depth(self, frame: np.ndarray) -> np.ndarray:
        h, w = frame.shape[:2]
        y, x = np.mgrid[0:h, 0:w].astype(np.float32)
        cx, cy = w / 2, h / 2
        dist = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
        depth = 1.0 + (dist / max(dist.max(), 1)) * 7.0
        depth += np.random.normal(0, 0.3, depth.shape).astype(np.float32)
        return np.clip(depth, 0.1, 20.0).astype(np.float32)


depth_model_service = DepthModelService()
