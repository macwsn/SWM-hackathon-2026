# ═══════════════════════════════════════════════════════════════
# Frontend - React + Vite SPA
# ═══════════════════════════════════════════════════════════════

FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
# Using --legacy-peer-deps to handle React version conflicts with @fishjam-cloud/react-client
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Build production bundle
RUN npm run build

# ───────────────────────────────────────────────────────────────
# Production stage - Nginx to serve static files
# ───────────────────────────────────────────────────────────────
FROM nginx:1.25-alpine

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]

