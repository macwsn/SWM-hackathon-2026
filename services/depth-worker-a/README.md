# Depth Worker A - GPU-Accelerated Depth Estimation Service

## Overview

The Depth Worker A is a microservice responsible for GPU-accelerated metric depth estimation using **Depth Anything V2** models. It processes camera frames in real-time to estimate distances to obstacles.

## Architecture

```
Redis Queue (frame:queue)
         ↓
  [BLPOP Consumer]
         ↓
  [Decode JPEG Frame]
         ↓
  [Depth Anything V2]
    (GPU Inference)
         ↓
  [Compress Depth Map]
         ↓
Redis Pub/Sub (depth:ready)
```

## Features

- ✅ **Dual Model Support**: Indoor and outdoor depth estimation models
- ✅ **GPU Acceleration**: CUDA support with automatic CPU fallback
- ✅ **Horizontal Scaling**: Multiple workers can run in parallel
- ✅ **Prometheus Metrics**: Performance monitoring on port 8000
- ✅ **Graceful Shutdown**: SIGTERM/SIGINT handling
- ✅ **Model Caching**: HuggingFace models cached to persistent volume

## Input Format (Redis frame:queue)

```json
{
  "session_id": "user-123",
  "timestamp": 1234567890.123,
  "frame_data": "base64_encoded_jpeg",
  "is_indoor": true,
  "width": 1920,
  "height": 1080
}
```

## Output Format (Redis depth:ready channel)

```json
{
  "session_id": "user-123",
  "timestamp": 1234567890.123,
  "depth_map": "base64_encoded_numpy_compressed",
  "inference_time_ms": 123.45,
  "total_time_ms": 125.67,
  "is_indoor": true,
  "shape": [1080, 1920],
  "worker_id": "depth-worker-a-1"
}
```

## Environment Variables

See `.env.example` for all configuration options:

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `MODEL_DEVICE` | `cuda` | Device for inference (`cuda` or `cpu`) |
| `INDOOR_MODEL_ID` | `depth-anything/Depth-Anything-V2-Metric-Indoor-Small-hf` | HuggingFace model ID |
| `OUTDOOR_MODEL_ID` | `depth-anything/Depth-Anything-V2-Metric-Outdoor-Small-hf` | HuggingFace model ID |
| `DEPTH_PROC_W` | `480` | Frame width for processing |
| `DEPTH_PROC_H` | `360` | Frame height for processing |
| `WORKER_ID` | `depth-worker-a-1` | Unique worker identifier |
| `LOG_LEVEL` | `INFO` | Logging level |

## Local Development

```bash
# Install dependencies
uv venv
source .venv/bin/activate
uv pip install -e .

# Copy environment file
cp .env.example .env

# Run worker
python worker.py
```

## Docker Deployment

```bash
# Build image
docker build -t depth-worker:v1 .

# Run with docker-compose
docker compose up depth-worker-a

# Scale workers
docker compose up --scale depth-worker-a=4
```

## Performance

- **Inference Time**: ~120ms per frame on NVIDIA T4 GPU
- **Throughput**: ~8 FPS per worker
- **Memory**: ~2GB GPU VRAM per worker
- **Recommended**: 2-4 workers per GPU for optimal throughput

## Monitoring

Prometheus metrics available at `http://localhost:8000/metrics`:

- `depth_frames_processed_total` - Total frames processed
- `depth_inference_seconds` - Histogram of inference times
- `depth_errors_total` - Total errors encountered

## Models Used

### Depth Anything V2 - Metric Depth Estimation

- **Indoor Model**: `depth-anything/Depth-Anything-V2-Metric-Indoor-Small-hf`
  - Optimized for indoor scenes (1.5m default threshold)
  - Better performance on close-range obstacles
  
- **Outdoor Model**: `depth-anything/Depth-Anything-V2-Metric-Outdoor-Small-hf`
  - Optimized for outdoor scenes (2.0m default threshold)
  - Better performance on long-range distances

Both models use Vision Transformer Small (ViT-S) architecture for fast inference.

## Dependencies

Core dependencies (see `pyproject.toml` for full list):
- `torch>=2.1.0` - PyTorch framework
- `transformers>=4.40.0` - HuggingFace Transformers
- `opencv-python-headless>=4.8.0` - Image processing
- `redis[hiredis]>=5.0.0` - Redis client with fast parser
- `prometheus-client>=0.17.0` - Metrics

## Troubleshooting

### CUDA Out of Memory
- Reduce `DEPTH_PROC_W` and `DEPTH_PROC_H`
- Decrease number of worker replicas
- Set `MODEL_DEVICE=cpu` (slower but no VRAM limit)

### Models Not Loading
- Check HuggingFace cache volume is mounted
- Ensure network access to HuggingFace Hub
- Verify GPU drivers installed (for CUDA)

### Slow Inference
- Verify GPU is being used (check logs for "Device: cuda")
- Check Prometheus metrics for bottlenecks
- Increase worker replicas for parallelization

## Migration Notes

This service was migrated from:
- `project/backend/services/depth_model.py`

Key changes:
- Async → Sync inference (runs in executor)
- Added Redis queue consumer
- Added Prometheus metrics
- Separated config from monolith

