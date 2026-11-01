#!/bin/bash
set -e

APP_DIR="${1:-/home/ubuntu/finvyo}"

if [ ! -d "$APP_DIR" ]; then
  APP_DIR="$(pwd)"
fi

cd "$APP_DIR"

echo "=========================================="
echo "🚀 Starting Finvyo Deployment"
echo "=========================================="
echo "Working directory: $(pwd)"

# 1. Check .env file exists and validate required security environment variables
if [ ! -f .env ]; then
  echo "❌ Error: .env file not found in $(pwd)"
  echo "Please create a .env file with DATABASE_URL, REDIS_URL, and JWT_SECRET."
  exit 1
fi

# Ensure JWT_SECRET is set and valid (min 32 chars)
if ! grep -q "^JWT_SECRET=" .env || [ -z "$(grep "^JWT_SECRET=" .env | cut -d '=' -f2)" ]; then
  echo "⚠️  JWT_SECRET missing in .env! Generating secure 64-char key..."
  NEW_SECRET=$(openssl rand -hex 32)
  echo "JWT_SECRET=${NEW_SECRET}" >> .env
  echo "✅ JWT_SECRET automatically generated and added to .env"
fi

# 2. Pull latest code from remote repository
echo "📦 Pulling latest code..."
git pull origin main

# 3. Ensure database and cache services are running
echo "🐘 Verifying database and cache services..."
docker compose up -d redis postgres

# 4. Build and swap the web container cleanly
echo "🔨 Building new web image..."
docker compose build web

echo "🔄 Swapping container with zero unnecessary dependency restarts..."
docker compose up -d --no-deps --force-recreate web

# 5. Clean up dangling images to save server disk space
echo "🧹 Pruning old unused images..."
docker image prune -f

# 6. Verify health and startup of web container
echo "⏳ Verifying application startup..."
sleep 4

CONTAINER_STATUS=$(docker inspect --format='{{.State.Status}}' finvyo-web 2>/dev/null || echo "not found")

if [ "$CONTAINER_STATUS" = "running" ]; then
  echo "✅ finvyo-web is running successfully!"
else
  echo "❌ Error: finvyo-web container failed to start (Status: $CONTAINER_STATUS)"
  echo "----------------- Recent Container Logs -----------------"
  docker compose logs --tail=50 web
  echo "---------------------------------------------------------"
  exit 1
fi

echo "=========================================="
echo "✅ Deploy complete! Running containers:"
echo "=========================================="
docker compose ps
