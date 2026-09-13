#!/bin/sh
# Seed / migrate Postgres, then replace this process with uvicorn.
# Railpack often unwraps `sh -c "... ${PORT:-8080}"` and passes the
# unexpanded port to uvicorn. Resolve PORT here instead.
python db_setup.py || echo "[WARN] db_setup failed; starting API with in-code fallback"
port="$PORT"
if [ -z "$port" ] || echo "$port" | grep -Eq '[^0-9]'; then
  port=8080
fi
exec uvicorn main:app --host 0.0.0.0 --port "$port"
