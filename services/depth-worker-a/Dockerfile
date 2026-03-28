# ═══════════════════════════════════════════════════════════════
# Depth Worker A - GPU-accelerated depth map computation
# ═══════════════════════════════════════════════════════════════
#
# FAST REBUILD OPTION:
# 1. Build base image once: docker build -f Dockerfile.base -t depth-worker-base:v1 .
# 2. Uncomment the line below and comment out the multi-line FROM block
# FROM depth-worker-base:v1
#
# STANDARD BUILD (slower first time, but self-contained):
FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04

# Install Python 3.11 and system dependencies
RUN apt-get update && apt-get install -y \
    python3.11 \
    python3.11-dev \
    python3-pip \
    libgl1-mesa-glx \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set Python 3.11 as the default python3
RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1 \
    && update-alternatives --set python3 /usr/bin/python3.11

# Create working directory
WORKDIR /app

# Install uv for fast Python package management
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy pyproject.toml to install dependencies
COPY pyproject.toml .

# Install dependencies only (not the package itself yet)
# This is the SLOW layer (2.5GB download) but cached after first build
RUN uv pip install --system --no-cache \
    torch>=2.1.0 \
    torchvision>=0.16.0 \
    transformers>=4.40.0 \
    accelerate>=0.27.0 \
    opencv-python-headless>=4.8.0 \
    numpy>=1.24.0 \
    pillow>=10.0.0 \
    redis>=5.0.0 \
    hiredis>=2.2.0 \
    prometheus-client>=0.17.0 \
    python-dotenv>=1.0.0

# Copy application code
COPY . .

# Create model cache directory
RUN mkdir -p /models/cache

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV HUGGINGFACE_CACHE=/models/cache
ENV TRANSFORMERS_CACHE=/models/cache

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python3 -c "import torch; print(torch.cuda.is_available())" || exit 1

# Run the worker
CMD ["python3", "worker.py"]

