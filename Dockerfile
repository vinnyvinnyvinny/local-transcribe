# Stage 1: Python deps
FROM python:3.11-slim AS python-deps
RUN pip install --no-cache-dir \
    "pyannote.audio>=3.0,<4.0" \
    fastapi \
    "uvicorn[standard]" \
    huggingface-hub

# Stage 2: Node build
FROM node:20-slim AS node-build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 3: Final image
FROM node:20-slim
WORKDIR /app
# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip ffmpeg \
    && rm -rf /var/lib/apt/lists/*
# Copy Python packages from stage 1
COPY --from=python-deps /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=python-deps /usr/local/bin/uvicorn /usr/local/bin/uvicorn
# Copy built app
COPY --from=node-build /app/dist ./dist
COPY --from=node-build /app/node_modules ./node_modules
COPY --from=node-build /app/package.json ./
# Bundle the sidecar server script into the dist directory
COPY src/sidecar/server.py ./dist/sidecar/server.py
# Make packages installed from python:3.11-slim discoverable by the Debian system Python.
# Debian's python3 searches dist-packages, not site-packages; PYTHONPATH bridges the gap.
ENV PYTHONPATH=/usr/local/lib/python3.11/site-packages
# Model cache dirs and runtime config
ENV WHISPER_CACHE_DIR=/data/whisper-models
ENV PYANNOTE_CACHE_DIR=/data/pyannote-models
ENV DOCKER_ENV=1
ENV PORT=8080
EXPOSE 8080
CMD ["node", "dist/index.js"]
