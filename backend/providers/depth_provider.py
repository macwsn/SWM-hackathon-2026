import logging
import torch
import numpy as np
from PIL import Image
from transformers import AutoImageProcessor, AutoModelForDepthEstimation

from config import config
from providers.base import DepthProvider

logger = logging.getLogger(__name__)


class DepthAnythingProvider(DepthProvider):
    """Depth estimation using Metric Depth Anything V2 Large."""

    def __init__(self, model_name: str):
        self.model = None
        self.image_processor = None
        self.device = None
        self._use_fp16 = False
        self.model_name = model_name

    def load_model(self) -> None:
        """Load Metric Depth Anything V2 Large via transformers."""
        model_name = self.model_name
        device_name = config.depth.device

        if device_name == "cuda" and not torch.cuda.is_available():
            logger.warning("CUDA not available, falling back to CPU")
            device_name = "cpu"

        self.device = torch.device(device_name)
        self._use_fp16 = self.device.type == "cuda" and config.depth.use_fp16
        logger.info(f"Loading metric depth model: {model_name} on {device_name}")

        if self.device.type == "cuda":
            torch.backends.cudnn.benchmark = True
            if hasattr(torch.backends.cuda.matmul, "allow_tf32"):
                torch.backends.cuda.matmul.allow_tf32 = bool(config.depth.enable_tf32)
            if hasattr(torch.backends.cudnn, "allow_tf32"):
                torch.backends.cudnn.allow_tf32 = bool(config.depth.enable_tf32)

        self.image_processor = AutoImageProcessor.from_pretrained(model_name)
        self.model = AutoModelForDepthEstimation.from_pretrained(model_name)
        if self._use_fp16:
            self.model = self.model.half()
        self.model.to(self.device)
        self.model.eval()
        logger.info(
            "Metric Depth Anything V2 model loaded successfully (fp16=%s, tf32=%s)",
            self._use_fp16,
            config.depth.enable_tf32,
        )

    def estimate_depth(self, frame: np.ndarray) -> np.ndarray:
        """Estimate metric depth map from an RGB frame, output in meters."""
        if self.model is None or self.image_processor is None:
            raise RuntimeError("Model not loaded. Call load_model() first.")

        image = Image.fromarray(frame)
        inputs = self.image_processor(images=image, return_tensors="pt")
        inputs = {
            k: (v.to(self.device, non_blocking=True).half() if self._use_fp16 and torch.is_floating_point(v) else v.to(self.device, non_blocking=True))
            for k, v in inputs.items()
        }

        with torch.inference_mode():
            if self.device.type == "cuda":
                with torch.autocast(device_type="cuda", enabled=self._use_fp16):
                    outputs = self.model(**inputs)
            else:
                outputs = self.model(**inputs)

        predicted_depth = outputs.predicted_depth.float()

        depth_m = torch.nn.functional.interpolate(
            predicted_depth.unsqueeze(1),
            size=frame.shape[:2],
            mode="bicubic",
            align_corners=False,
        ).squeeze()

        depth_map = depth_m.detach().cpu().numpy().astype(np.float32)
        depth_map = np.nan_to_num(
            depth_map,
            nan=config.depth.max_depth_m,
            posinf=config.depth.max_depth_m,
            neginf=config.depth.min_depth_m,
        )
        depth_map = np.clip(depth_map, config.depth.min_depth_m, config.depth.max_depth_m)

        logger.debug(
            "Metric depth: min=%.2fm max=%.2fm mean=%.2fm",
            float(depth_map.min()),
            float(depth_map.max()),
            float(depth_map.mean()),
        )
        return depth_map
