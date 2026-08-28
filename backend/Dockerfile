# ==============================================================================
# Salvus Disaster Intelligence & Rescue Coordination Platform
# Backend Containerfile (FastAPI + Socket.IO + SQLite/WAL)
# ==============================================================================

# Base image: Official Python 3.12 slim (Debian-based, minimal footprint)
FROM python:3.12-slim

# Set standardized Python environment variables for containerized execution
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

# Set application working directory
WORKDIR /app

# Create dedicated non-root user and system group for defense-in-depth
RUN groupadd -g 1001 appgroup && \
    useradd -u 1001 -g appgroup -s /bin/sh -m appuser

# Layer 1: Copy and install Python dependencies first to leverage Docker layer caching
COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Layer 2: Copy application source code and configuration
COPY . .

# Layer 3: Ensure data persistence directory exists and is owned by non-root user
RUN mkdir -p /app/data && \
    chown -R appuser:appgroup /app

# Switch to non-root execution user
USER appuser

# Expose default HTTP/WebSocket communication port
EXPOSE 8000

# Container Healthcheck (Uses Python standard library - zero extra package overhead)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request, sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health').getcode() == 200 else 1)"

# Start combined ASGI application (FastAPI REST API + Python-SocketIO server)
CMD ["sh", "-c", "uvicorn app.main:combined_asgi_app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
