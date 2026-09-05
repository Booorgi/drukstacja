FROM python:3.10-slim

# Instalacja prusa-slicera i bibliotek systemowych do cięcia bez ekranu
RUN apt-get update && apt-get install -y --no-install-recommends \
    prusa-slicer \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Kopiowanie i instalacja bibliotek Pythona
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Kopiowanie reszty kodu backendu
COPY . .

# Port wystawiany przez aplikację
ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]
