# models/

Depth Anything V2 model weights are downloaded automatically from HuggingFace on first run.

Models used:
- **Indoor**:  `depth-anything/Depth-Anything-V2-Metric-Hypersim-Large-hf`  (~1.3 GB)
- **Outdoor**: `depth-anything/Depth-Anything-V2-Metric-VKITTI-Large-hf`    (~1.3 GB)

To pre-download manually:
```bash
python -c "
from transformers import AutoImageProcessor, AutoModelForDepthEstimation
AutoModelForDepthEstimation.from_pretrained('depth-anything/Depth-Anything-V2-Metric-Hypersim-Large-hf')
AutoModelForDepthEstimation.from_pretrained('depth-anything/Depth-Anything-V2-Metric-VKITTI-Large-hf')
"
```

Set `USE_MOCK_DEPTH=true` in `.env` to skip the model entirely during frontend development.
