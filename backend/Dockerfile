FROM python:3.10-slim

# Instalacja slicerów i bibliotek potrzebnych do uruchomienia OrcaSlicera bez GUI.
RUN apt-get update && apt-get install -y --no-install-recommends \
    prusa-slicer \
    libgl1 \
    libglu1-mesa \
    libglib2.0-0 \
    libgtk-3-0 \
    libdbus-1-3 \
    libx11-xcb1 \
    libxcb-cursor0 \
    libxkbcommon-x11-0 \
    xvfb \
    xauth \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ARG ORCA_VERSION=2.4.2
RUN curl -fsSL -o /tmp/orca.AppImage \
    "https://github.com/SoftFever/OrcaSlicer/releases/download/v${ORCA_VERSION}/OrcaSlicer_Linux_AppImage_Ubuntu2404_V${ORCA_VERSION}.AppImage" \
    && chmod +x /tmp/orca.AppImage \
    && cd /tmp \
    && ./orca.AppImage --appimage-extract >/dev/null \
    && mv /tmp/squashfs-root /opt/orca-slicer \
    && find /opt/orca-slicer -type f \( -iname 'orca-slicer' -o -iname 'orcaslicer' \) -exec ln -sf {} /usr/local/bin/orca-slicer \; \
    && test -x /usr/local/bin/orca-slicer \
    && rm -f /tmp/orca.AppImage

WORKDIR /app

# Kopiowanie i instalacja bibliotek Pythona
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download modeli u2net w trakcie budowania kontenera Docker
RUN python -c "from rembg import new_session; new_session('u2netp'); new_session('u2net')" || true

# Kopiowanie reszty kodu backendu
COPY . .

# Port aplikacji
ENV PORT=8080
EXPOSE 8080

CMD ["sh", "start.sh"]
