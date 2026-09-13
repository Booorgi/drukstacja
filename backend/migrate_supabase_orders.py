#!/usr/bin/env python3
"""
Jednorazowa kopia zleceń z tabeli Supabase `orders` do Railway Postgres.

Warianty:
  1) REST Supabase (zalecane):
       SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + DATABASE_URL
       python migrate_supabase_orders.py

  2) Plik JSON (eksport z Table Editor / API):
       python migrate_supabase_orders.py --from-json orders.json

Wiersze o tym samym `id` są pomijane (ON CONFLICT DO NOTHING).
user_id z Supabase Auth zostaje bez zmian — JWT `sub` nadal pasuje.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

from dotenv import load_dotenv

for env_path in (Path(__file__).parent / ".env", Path(__file__).parent.parent / ".env", Path(".env")):
    if env_path.exists():
        load_dotenv(env_path)
        break

PAGE_SIZE = 1000
UPSERT_SQL = """
INSERT INTO orders (
    id, user_id, file_name, material, technology, layer_height, infill,
    clean_supports, brass_inserts, quantity, total_price, dimensions_mm,
    status, production_file_url, nozzle_size, created_at, updated_at
) VALUES (
    %(id)s, %(user_id)s, %(file_name)s, %(material)s, %(technology)s,
    %(layer_height)s, %(infill)s, %(clean_supports)s, %(brass_inserts)s,
    %(quantity)s, %(total_price)s, %(dimensions_mm)s, %(status)s,
    %(production_file_url)s, %(nozzle_size)s, %(created_at)s, %(updated_at)s
)
ON CONFLICT (id) DO NOTHING;
"""


def fetch_supabase_orders(supabase_url: str, service_key: str) -> list[dict]:
    base = supabase_url.rstrip("/")
    rows: list[dict] = []
    start = 0
    while True:
        req = urllib.request.Request(
            f"{base}/rest/v1/orders?select=*&order=created_at.asc",
            headers={
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
                "Range": f"{start}-{start + PAGE_SIZE - 1}",
                "Prefer": "count=exact",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                chunk = json.loads(resp.read().decode("utf-8") or "[]")
        except urllib.error.HTTPError as err:
            body = err.read().decode("utf-8", errors="replace")
            raise SystemExit(f"Błąd Supabase REST ({err.code}): {body}") from err
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < PAGE_SIZE:
            break
        start += PAGE_SIZE
    return rows


def load_json_orders(path: str) -> list[dict]:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    if isinstance(raw, dict) and "orders" in raw:
        raw = raw["orders"]
    if not isinstance(raw, list):
        raise SystemExit("Plik JSON musi być tablicą zleceń albo obiektem {\"orders\": [...]}.")
    return raw


def normalize_row(row: dict) -> dict:
    dims = row.get("dimensions_mm")
    if isinstance(dims, str):
        try:
            dims = json.loads(dims)
        except json.JSONDecodeError:
            dims = None
    return {
        "id": row.get("id"),
        "user_id": row.get("user_id") or None,
        "file_name": row.get("file_name"),
        "material": row.get("material"),
        "technology": row.get("technology"),
        "layer_height": row.get("layer_height"),
        "infill": row.get("infill"),
        "clean_supports": row.get("clean_supports") if row.get("clean_supports") is not None else True,
        "brass_inserts": row.get("brass_inserts") if row.get("brass_inserts") is not None else False,
        "quantity": row.get("quantity") if row.get("quantity") is not None else 1,
        "total_price": row.get("total_price"),
        "dimensions_mm": dims,
        "status": row.get("status") or "in_cart",
        "production_file_url": row.get("production_file_url"),
        "nozzle_size": row.get("nozzle_size"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at") or row.get("created_at"),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Kopiuje zlecenia z Supabase do Railway Postgres.")
    parser.add_argument("--from-json", dest="from_json", help="Ścieżka do eksportu JSON tabeli orders")
    parser.add_argument("--dry-run", action="store_true", help="Tylko wypisz liczbę wierszy, nic nie zapisuj")
    args = parser.parse_args()

    if args.from_json:
        rows = load_json_orders(args.from_json)
        print(f"Wczytano {len(rows)} wierszy z {args.from_json}")
    else:
        supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if not supabase_url or not service_key:
            print("Brak SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.")
            print("Podaj je w środowisku albo użyj: python migrate_supabase_orders.py --from-json orders.json")
            sys.exit(1)
        rows = fetch_supabase_orders(supabase_url, service_key)
        print(f"Pobrano {len(rows)} wierszy z Supabase.")

    if args.dry_run:
        print("Dry-run — pomijam zapis do Postgres.")
        return

    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("Brak DATABASE_URL (Railway Postgres).")
        sys.exit(1)
    if db_url.startswith("postgres://"):
        db_url = "postgresql://" + db_url[len("postgres://"):]

    import psycopg2

    conn = psycopg2.connect(db_url)
    inserted = 0
    skipped = 0
    try:
        with conn:
            with conn.cursor() as cur:
                for raw in rows:
                    payload = normalize_row(raw)
                    if not payload["id"]:
                        skipped += 1
                        continue
                    cur.execute(UPSERT_SQL, payload)
                    if cur.rowcount:
                        inserted += 1
                    else:
                        skipped += 1
        print(f"Gotowe. Wstawiono {inserted}, pominięto {skipped} (duplikaty / brak id).")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
