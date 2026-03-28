# ═══════════════════════════════════════════════════════════════
# Streaming Gateway - WebRTC ingestion and frame distribution
# ═══════════════════════════════════════════════════════════════

FROM python:3.11-slim

# Install system dependencies for WebRTC and video processing
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libavcodec-dev \
    libavformat-dev \
    libavutil-dev \
    libswscale-dev \
    libopus-dev \
    libvpx-dev \
    libsrtp2-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install uv for fast Python package management
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy pyproject.toml and install dependencies
COPY pyproject.toml .
RUN uv pip install --system --no-cache .

# Copy application code
COPY . .

# Expose WebRTC and WebSocket ports
EXPOSE 8001

# Health check
HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

# Run with Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "4"]

