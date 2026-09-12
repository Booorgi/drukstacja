#!/usr/bin/env bash
# Idempotent Cloud Agent bootstrap for Drukstacja (FastAPI backend + Next.js frontend).
# Installs system packages (PrusaSlicer + graphics libs), Python deps and Node deps,
# and pre-downloads the rembg segmentation models so the backend starts instantly.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Installing system packages (PrusaSlicer, graphics libs, build tools)"
sudo apt-get update -y
# PrusaSlicer lives in the 'universe' component on Ubuntu.
sudo apt-get install -y --no-install-recommends software-properties-common
sudo add-apt-repository -y universe
sudo apt-get update -y
sudo apt-get install -y --no-install-recommends \
  prusa-slicer \
  libgl1 \
  libglib2.0-0 \
  curl \
  python3-venv \
  python3-dev \
  build-essential

echo "==> Setting up backend Python virtualenv"
cd "${REPO_ROOT}/backend"
python3 -m venv .venv
./.venv/bin/pip install --upgrade pip
./.venv/bin/pip install -r requirements.txt

echo "==> Pre-downloading rembg segmentation models (u2net / u2netp)"
# The backend loads these at import time; caching them keeps server startup fast.
./.venv/bin/python -c "from rembg import new_session; new_session('u2net'); new_session('u2netp')" || \
  echo "[WARN] rembg model pre-download skipped (will download lazily at runtime)"

echo "==> Installing frontend Node dependencies"
cd "${REPO_ROOT}/frontend"
npm install

echo "==> Install complete."
