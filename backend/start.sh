#!/bin/sh
# Seed / migrate Postgres, then replace this process with uvicorn.
# Railway startCommand is not always a shell — prefer: sh start.sh
# A failed db_setup must not block the API (lifespan also ensures products).
python db_setup.py || echo "[WARN] db_setup failed; starting API with in-code fallback"
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8080}"
