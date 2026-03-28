# ═══════════════════════════════════════════════════════════════
# Backend - FastAPI Monolith (transitioning to microservices)
# ═══════════════════════════════════════════════════════════════

FROM python:3.11-slim

# Install system dependencies for OpenCV and video processing
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create working directory
WORKDIR /app

# Install uv for fast Python package management
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy pyproject.toml and install dependencies
COPY pyproject.toml ./

# Install dependencies
RUN uv pip install --system --no-cache \
    fastapi>=0.109.0 \
    uvicorn[standard]>=0.27.0 \
    websockets>=12.0 \
    python-multipart>=0.0.6 \
    python-dotenv>=1.0.0 \
    pydantic>=2.5.0 \
    pydantic-settings>=2.1.0 \
    opencv-python-headless>=4.8.0 \
    numpy>=1.24.0 \
    pillow>=10.0.0 \
    torch>=2.1.0 \
    torchvision>=0.16.0 \
    transformers>=4.40.0 \
    accelerate>=0.27.0 \
    google-generativeai>=0.3.0 \
    httpx>=0.26.0

# Copy application code
COPY . .

# Create required directories
RUN mkdir -p video_input models

# Environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

