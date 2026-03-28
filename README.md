# 🦯 Blind Assistant - Real-Time AI Assistive System

[![CI Status](https://github.com/radbene/SWM-Hackathon-2026/workflows/CI/badge.svg)](https://github.com/radbene/SWM-Hackathon-2026/actions)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/docker-ready-brightgreen.svg)](docker-compose.yml)

**SWM Hackathon 2026** — Production-ready microservices architecture for visually impaired assistance using AI depth estimation, real-time video streaming, and LLM-powered scene understanding.

---

## 🎯 Project Overview

**Blind Assistant** is a real-time mobile application designed to help visually impaired users navigate their environment through three core features:

1. **🚨 Obstacle Avoidance** — AI-powered depth estimation detects obstacles and provides instant audio + haptic alerts
2. **🗺️ Tour Mode** — On-demand scene descriptions using Google Gemini vision LLM with POI context
3. **👁️ Caregiver Monitoring** — Real-time video feed and GPS tracking for remote assistance

---

## ⚡ Quick Start

### **Prerequisites**
- Docker Desktop (with Docker Compose)
- 8GB+ RAM (for Depth Anything V2 models)
- (Optional) NVIDIA GPU with CUDA for faster inference

---

### **Development Mode (Hot-Reload Enabled)** 🔥

For active development with instant code updates:

```bash
# 1. Clone repository
git clone git@github.com:radbene/SWM-Hackathon-2026.git
cd SWM-Hackathon-2026

# 2. Configure environment
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY (optional for mock mode)

# 3. Start development environment
make dev
# OR: docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

**Access Points:**
- 🎨 **Frontend (Vite HMR)**: http://localhost:5173
- ⚙️ **Backend API**: http://localhost:8001/health
- 📊 **Health Check**: `make health`

**What you get:**
- ✅ **Frontend hot-reload** - Changes to `.tsx`/`.ts` files appear instantly
- ✅ **Backend auto-restart** - Changes to `.py` files reload in ~1-2s
- ✅ **No rebuilds needed** - Edit code and see results immediately
- ✅ **All services connected** - Full stack running in Docker

📖 **Full development guide:** [DEVELOPMENT.md](./DEVELOPMENT.md)

---

### **Production Mode**

For testing production builds:

```bash
# Build and start production images
make prod
# OR: docker compose up --build

# Access application
open http://localhost:3000
```

**Access Points:**
- 🌐 **Frontend (Nginx)**: http://localhost:3000
- ⚙️ **Backend API**: http://localhost:8001

---

### **Useful Commands**

```bash
make help          # Show all available commands
make dev           # Start development environment
make logs          # Show all service logs
make logs-backend  # Show backend logs only
make health        # Check service health
make stop          # Stop all services
make clean         # Remove all containers and data
```

---

### **Manual Local Development (Without Docker)**

If you prefer running services directly on your machine:

```bash
# Backend (using UV - 10x faster than pip)
cd project/backend
curl -LsSf https://astral.sh/uv/install.sh | sh  # Install uv
uv venv && source .venv/bin/activate
uv pip install -e .
cp .env.example .env && nano .env
uvicorn main:app --reload

# Frontend (new terminal)
cd project/frontend
npm install && npm run dev

# Access at https://localhost:5173
```

📖 **Detailed Setup**: See [QUICKSTART.md](QUICKSTART.md) | **UV Guide**: See [UV_SETUP.md](UV_SETUP.md)

---

## 🏗️ Architecture

### **Production Microservices Stack**

```
┌─────────────────────────────────────────────────────────┐
│  Mobile App (React Native) + Web Panels (React)        │
└────────────────────┬────────────────────────────────────┘
                     │ HTTPS/WSS
          ┌──────────▼──────────┐
          │  NGINX Reverse Proxy │
          └──────────┬───────────┘
                     │
     ┌───────────────┼────────────────┐
     │               │                │
┌────▼────┐   ┌─────▼──────┐   ┌────▼──────┐
│Streaming│   │Orchestrator│   │  Gemini   │
│ Gateway │   │  Service   │   │  Service  │
└────┬────┘   └─────┬──────┘   └───────────┘
     │              │
     └──────┬───────┘
            │ Redis Pub/Sub
     ┌──────┴──────┐
     │             │
┌────▼────┐  ┌────▼────┐
│Depth    │  │Depth    │
│Worker A │  │Worker B │
│(GPU)    │  │(CPU)    │
└─────────┘  └─────────┘
```

**7 Microservices** | **4 Isolated Networks** | **GPU-Accelerated Inference** | **Redis Pub/Sub** | **PostgreSQL + PostGIS**

📐 **Full Architecture**: [ARCHITECTURE_SUMMARY.md](ARCHITECTURE_SUMMARY.md)

---

## 📊 Key Features

| Feature | Status | Technology |
|---------|--------|-----------|
| **Obstacle Detection** | ✅ Working | Depth Anything V2 (PyTorch) |
| **Audio Alerts (TTS)** | ✅ Working | Edge-TTS (Microsoft Voices) |
| **Scene Description** | 🚧 Mock | Google Gemini 1.5 Pro |
| **GPS Tracking** | 🚧 Mock | Browser Geolocation API |
| **Video Streaming** | 🚧 Mock (MP4) | WebRTC / Smelter (planned) |
| **Caregiver Panel** | ✅ Working | React + Leaflet Maps |
| **Stats Dashboard** | ✅ Working | React + Recharts |
| **Docker Deployment** | 📋 Planned | Docker Compose + NVIDIA runtime |
| **Cloud Deployment** | 📋 Planned | AWS ECS + EC2 GPU instances |

**Legend**: ✅ Production-ready | 🚧 Mocked/In Progress | 📋 Architecture complete, not implemented

---

## 🚀 Deployment Options

### **Local Development**
- **Use Case**: Feature development, testing
- **Setup Time**: 5 minutes
- **Cost**: Free
- [Setup Guide →](QUICKSTART.md)

### **Docker Compose (Staging)**
- **Use Case**: Integration testing, demos
- **Setup Time**: 15 minutes
- **Requirements**: Docker + NVIDIA GPU
- [Setup Guide →](DEPLOYMENT.md#docker-compose)

### **AWS Cloud (Production)**
- **Use Case**: Live deployment, 100+ concurrent users
- **Setup Time**: 2-4 hours
- **Cost**: ~$300-2000/month (scale-dependent)
- [Setup Guide →](DEPLOYMENT.md#aws-deployment)

### **Field Demo (Mobile Device)**
- **Use Case**: Real-world testing with mobile phone
- **Setup Time**: 10 minutes
- **Tunneling**: Ngrok or Cloudflare Tunnel
- [Setup Guide →](DEPLOYMENT.md#field-demo-setup)

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE_SUMMARY.md](ARCHITECTURE_SUMMARY.md) | High-level system design overview |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Detailed protocol mapping, technology justification |
| [ROADMAP.md](ROADMAP.md) | 14-week implementation plan (7 phases) |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Tunneling, SSL setup, field testing guide |
| [CI-CD.md](CI-CD.md) | GitHub Actions workflows, testing strategy |
| [QUICKSTART.md](QUICKSTART.md) | Developer onboarding, troubleshooting |
| [database/init.sql](database/init.sql) | PostgreSQL schema (tables, indexes, triggers) |
| [docker-compose.yml](docker-compose.yml) | Service definitions, networking, volumes |

---

## 🛠️ Technology Stack

### **Backend**
- **Framework**: FastAPI + Uvicorn (async Python)
- **AI Model**: Depth Anything V2 (HuggingFace Transformers)
- **Vision LLM**: Google Gemini 1.5 Pro
- **TTS**: Edge-TTS (Microsoft Neural Voices)
- **Message Queue**: Redis Pub/Sub
- **Database**: PostgreSQL 15 + PostGIS

### **Frontend**
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite (with HTTPS for camera access)
- **Styling**: Tailwind CSS (Neobrutalism design)
- **Mapping**: React Leaflet + OpenStreetMap
- **Charts**: Recharts

### **Infrastructure**
- **Containerization**: Docker + Docker Compose
- **GPU Runtime**: NVIDIA Container Toolkit
- **Reverse Proxy**: Nginx (SSL termination, load balancing)
- **Storage**: MinIO (S3-compatible frame archival)
### **CI/CD**
- **Pipeline**: GitHub Actions
- **Testing**: pytest, Jest, Playwright (E2E)
- **Deployment**: AWS ECS + EC2 Auto Scaling
- **Monitoring**: Prometheus + Grafana

---

## 📈 Performance Targets

| Metric | Target | Current (MVP) |
|--------|--------|---------------|
| Frame → Alert Latency | < 500ms (p95) | ~600ms |
| Depth Inference Time | < 200ms (p95) | ~250ms (CPU) |
| Gemini Response Time | < 5s (p95) | N/A (mocked) |
| Concurrent Users | 40 @ 1 FPS | 1 (single instance) |
| System Uptime | > 99.5% | N/A (dev only) |

---

## 🗺️ Implementation Roadmap

| Phase | Duration | Status | Deliverable |
|-------|----------|--------|-------------|
| **Phase 0: MVP** | ✅ Complete | Working monolith with mocks |
| **Phase 1: Containerization** | 2 weeks | 📋 Planned | Docker Compose stack |
| **Phase 2: Redis Integration** | 2 weeks | 📋 Planned | Service decoupling |
| **Phase 3: Depth Pipeline** | 2 weeks | 📋 Planned | GPU inference optimization |
| **Phase 4: Gemini + Maps** | 2 weeks | 📋 Planned | Tour mode with real LLM |
| **Phase 5: WebRTC Streaming** | 2 weeks | 📋 Planned | Live camera from mobile |
| **Phase 6: Production Deploy** | 2 weeks | 📋 Planned | AWS deployment + CI/CD |
| **Phase 7: Field Testing** | 2 weeks | 📋 Planned | User validation |

**Estimated Completion**: 14 weeks from Phase 1 start

---

## 🤝 Contributing

This is a hackathon project for **SWM Hackathon 2026**. Contributions welcome after Phase 1 completion.

---

## 📄 License

MIT License - See [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- **Depth Anything V2**: LiheYoung et al. ([GitHub](https://github.com/DepthAnything/Depth-Anything-V2))
- **Smelter**: Software Mansion ([GitHub](https://github.com/software-mansion/smelter))
- **Google Gemini**: Multimodal LLM for scene understanding

---

**Questions?** Open an [issue](https://github.com/radbene/SWM-Hackathon-2026/issues) or check the [documentation](ARCHITECTURE_SUMMARY.md)
