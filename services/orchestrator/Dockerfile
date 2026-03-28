# ═══════════════════════════════════════════════════════════════
# Orchestrator - Business logic and coordination service
# ═══════════════════════════════════════════════════════════════

FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
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

# Expose API port
EXPOSE 8002

# Health check
HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:8002/health || exit 1

# Run with Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8002", "--workers", "2"]

