# Aditya Milk Dairy – single container: React build served by Flask + gunicorn.
# Works on Render, Railway, Fly.io, any VPS with Docker.

# ---- 1. build the website
FROM node:20-alpine AS web
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- 2. Python API + built website
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 DEV_MODE=0 PORT=10000
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt
COPY backend/ backend/
COPY --from=web /app/frontend/dist frontend/dist
WORKDIR /app/backend
EXPOSE 10000
# seed.py applies migrations and loads starter business data only the first time (safe on every start)
CMD python seed.py --no-demo && gunicorn -w 2 --threads 4 -b 0.0.0.0:${PORT} --timeout 60 --access-logfile - run:app
