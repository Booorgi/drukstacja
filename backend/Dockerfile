FROM python:3.11-slim

WORKDIR /app

# Biblioteki systemowe potrzebne przez OCP/cadquery (obsluga plikow STEP)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglu1-mesa \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Railway podaje port przez zmienna PORT
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
