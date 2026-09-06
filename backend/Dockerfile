FROM python:3.10-slim

# Instalacja prusa-slicera i nowoczesnych bibliotek graficznych (libgl1 zamiast libgl1-mesa-glx)
RUN apt-get update && apt-get install -y --no-install-recommends \
    prusa-slicer \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

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

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]
