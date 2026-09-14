#!/usr/bin/env python3
"""
Drukstacja - Skrypt migracyjny i seedujący bazę PostgreSQL (Railway)
Tworzy tabele 'filaments', 'orders', 'products' i seeduje katalog materiałów oraz sklepu.
"""
import os
import sys
import json
from pathlib import Path
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import Json

# Ładowanie zmiennych środowiskowych z backend/.env lub .env w katalogu głównym
env_paths = [
    Path(__file__).parent / ".env",
    Path(__file__).parent.parent / ".env",
    Path(".env")
]
for p in env_paths:
    if p.exists():
        load_dotenv(p)
        break


from filament_catalog import public_filament_row, seed_filaments

# Katalog Sunlu — źródło prawdy: filament_catalog.py (+ JSON dla frontendu).
# Ceny zł/kg są w seedzie do kalkulatora; GET /api/filaments ich nie zwraca.
SEED_FILAMENTS = seed_filaments()


# --------------------------------------------------------------------------
# SKLEP — KATALOG PRODUKTÓW (slug kategorii, nie etykieta UI)
# brass inserts → hardware, PLA + Magigoo → materialy, deburring → narzedzia
# gotowe-printy / akcesoria: puste (gotowe-printy = tylko zabawki użytkowe)
# --------------------------------------------------------------------------
SEED_PRODUCTS = [
    {
        "id": "sku_brass_inserts",
        "sku": "sku_brass_inserts",
        "name": "Zestaw Wkładek Gwintowanych M3 / M4 (Brass Inserts 100 szt.)",
        "description": "Wytrzymałe wkładki mosiężne do zgrzewania w druku 3D.",
        "category": "hardware",
        "badge": "Bestseller",
        "icon": "🔩",
        "price": 49.00,
        "currency": "PLN",
        "image_url": None,
        "stock": 80,
        "in_stock": True,
        "active": True,
    },
    {
        "id": "sku_pla_jet_black",
        "sku": "sku_pla_jet_black",
        "name": "Filament PLA Drukstacja Precision 1.75mm (1kg - Jet Black)",
        "description": "Zoptymalizowany filament pod szybki druk o wysokiej precyzji.",
        "category": "materialy",
        "badge": "High Flow",
        "icon": "🧵",
        "price": 79.00,
        "currency": "PLN",
        "image_url": None,
        "stock": 40,
        "in_stock": True,
        "active": True,
    },
    {
        "id": "sku_magigoo_original",
        "sku": "sku_magigoo_original",
        "name": "Klej adhezyjny Magigoo 3D (Original 50ml)",
        "description": "Profesjonalny podkład zapobiegający odklejaniu wydruków.",
        "category": "materialy",
        "badge": "Pro",
        "icon": "🧪",
        "price": 65.00,
        "currency": "PLN",
        "image_url": None,
        "stock": 25,
        "in_stock": True,
        "active": True,
    },
    {
        "id": "sku_deburring_tool",
        "sku": "sku_deburring_tool",
        "name": "Precyzyjny nożyk deburring tool do obróbki krawędzi",
        "description": "Ostrze obrotowe do szybkiego usuwania gratu z tworzywa.",
        "category": "narzedzia",
        "badge": "Niezbędnik",
        "icon": "🔪",
        "price": 35.00,
        "currency": "PLN",
        "image_url": None,
        "stock": 60,
        "in_stock": True,
        "active": True,
    },
]


PRODUCTS_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(50) PRIMARY KEY,
    sku VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    badge VARCHAR(50),
    icon VARCHAR(16),
    price NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(8) NOT NULL DEFAULT 'PLN',
    image_url TEXT,
    stock INT NOT NULL DEFAULT 0,
    in_stock BOOLEAN NOT NULL DEFAULT true,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku VARCHAR(50);
ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS badge VARCHAR(50);
ALTER TABLE products ADD COLUMN IF NOT EXISTS icon VARCHAR(16);
ALTER TABLE products ADD COLUMN IF NOT EXISTS price NUMERIC(10, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS currency VARCHAR(8);
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock INT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS in_stock BOOLEAN;
ALTER TABLE products ADD COLUMN IF NOT EXISTS active BOOLEAN;
ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_products_active_stock ON products (active, in_stock);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products (sku);
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);
"""

INSERT_PRODUCT_SQL = """
INSERT INTO products (
    id, sku, name, description, category, badge, icon,
    price, currency, image_url, stock, in_stock, active, created_at, updated_at
) VALUES (
    %(id)s, %(sku)s, %(name)s, %(description)s, %(category)s, %(badge)s, %(icon)s,
    %(price)s, %(currency)s, %(image_url)s, %(stock)s, %(in_stock)s, %(active)s, NOW(), NOW()
)
ON CONFLICT (id) DO NOTHING;
"""

FILAMENTS_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS filaments (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    tier VARCHAR(20) NOT NULL DEFAULT 'standard',
    type VARCHAR(50) NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'single',
    hex VARCHAR(10),
    colors JSONB,
    price_per_cm3 NUMERIC(8, 4) DEFAULT 0.40,
    price_per_kg NUMERIC(8, 2),
    density NUMERIC(5, 3),
    family VARCHAR(50),
    subtype VARCHAR(50),
    in_stock BOOLEAN DEFAULT true,
    roughness NUMERIC(3, 2) DEFAULT 0.40,
    metalness NUMERIC(3, 2) DEFAULT 0.05
);
ALTER TABLE filaments ALTER COLUMN type TYPE VARCHAR(50);
ALTER TABLE filaments ALTER COLUMN category TYPE VARCHAR(50);
ALTER TABLE filaments ALTER COLUMN price_per_cm3 TYPE NUMERIC(8, 4);
ALTER TABLE filaments ADD COLUMN IF NOT EXISTS price_per_kg NUMERIC(8, 2);
ALTER TABLE filaments ADD COLUMN IF NOT EXISTS density NUMERIC(5, 3);
ALTER TABLE filaments ADD COLUMN IF NOT EXISTS family VARCHAR(50);
ALTER TABLE filaments ADD COLUMN IF NOT EXISTS subtype VARCHAR(50);
"""

INSERT_FILAMENT_SQL = """
INSERT INTO filaments (
    id, name, tier, type, category, family, subtype, hex, colors,
    price_per_cm3, price_per_kg, density, in_stock, roughness, metalness
) VALUES (
    %(id)s, %(name)s, %(tier)s, %(type)s, %(category)s, %(family)s, %(subtype)s,
    %(hex)s, %(colors)s, %(price_per_cm3)s, %(price_per_kg)s, %(density)s,
    true, %(roughness)s, %(metalness)s
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    tier = EXCLUDED.tier,
    type = EXCLUDED.type,
    category = EXCLUDED.category,
    family = EXCLUDED.family,
    subtype = EXCLUDED.subtype,
    hex = EXCLUDED.hex,
    colors = EXCLUDED.colors,
    price_per_cm3 = EXCLUDED.price_per_cm3,
    price_per_kg = EXCLUDED.price_per_kg,
    density = EXCLUDED.density,
    in_stock = true,
    roughness = EXCLUDED.roughness,
    metalness = EXCLUDED.metalness;
"""

STARTUP_DB_CONNECT_TIMEOUT_SEC = 8


def _first_value(row):
    if row is None:
        return 0
    if isinstance(row, dict):
        return next(iter(row.values()))
    return row[0]


def normalize_product_categories(cur):
    """
    Przepina istniejące SKU i stare etykiety UI na stabilne slugi.
    ON CONFLICT DO NOTHING nie aktualizuje już wstawionych wierszy.
    """
    from shop_categories import CATEGORY_ALIASES, SKU_CATEGORY

    remapped = 0
    for sku, slug in SKU_CATEGORY.items():
        cur.execute(
            """
            UPDATE products
            SET category = %s, updated_at = NOW()
            WHERE sku = %s AND category IS DISTINCT FROM %s
            """,
            (slug, sku, slug),
        )
        remapped += cur.rowcount or 0

    for alias, slug in CATEGORY_ALIASES.items():
        cur.execute(
            """
            UPDATE products
            SET category = %s, updated_at = NOW()
            WHERE lower(btrim(category)) = %s AND category IS DISTINCT FROM %s
            """,
            (slug, alias, slug),
        )
        remapped += cur.rowcount or 0
    return remapped


def ensure_products_schema(cur):
    """
    Idempotentny schemat + seed katalogu sklepu.
    CREATE IF NOT EXISTS / ON CONFLICT DO NOTHING / remap kategorii.
    """
    cur.execute(PRODUCTS_SCHEMA_SQL)
    for item in SEED_PRODUCTS:
        cur.execute(INSERT_PRODUCT_SQL, item)

    remapped = normalize_product_categories(cur)
    cur.execute("SELECT COUNT(*) FROM products;")
    products_count = int(_first_value(cur.fetchone()))
    cur.execute("SELECT COUNT(*) FROM products WHERE active = true AND in_stock = true;")
    products_available = int(_first_value(cur.fetchone()))
    return {
        "count": products_count,
        "available": products_available,
        "remapped": remapped,
    }


def ensure_filaments_schema(cur):
    """
    Idempotentny schemat + upsert katalogu Sunlu.
    Stare SKU spoza listy dostają in_stock=false (nie są wybieralne).
    """
    cur.execute(FILAMENTS_SCHEMA_SQL)
    keep_ids = []
    for item in SEED_FILAMENTS:
        payload = dict(item)
        keep_ids.append(payload["id"])
        if payload.get("colors") is not None:
            payload["colors"] = Json(payload["colors"])
        else:
            payload["colors"] = None
        cur.execute(INSERT_FILAMENT_SQL, payload)

    if keep_ids:
        cur.execute(
            "UPDATE filaments SET in_stock = false WHERE id <> ALL(%s) AND in_stock = true;",
            (keep_ids,),
        )
        retired = cur.rowcount or 0
    else:
        retired = 0

    cur.execute("SELECT COUNT(*) FROM filaments;")
    total = int(_first_value(cur.fetchone()))
    cur.execute("SELECT COUNT(*) FROM filaments WHERE in_stock = true;")
    available = int(_first_value(cur.fetchone()))
    return {"count": total, "available": available, "retired": retired}


def ensure_filaments_on_startup() -> bool:
    """Bootstrap tabeli filaments przy starcie FastAPI. Błąd DB nie wyłącza API."""
    try:
        from db import get_db_connection

        conn = get_db_connection(connect_timeout=STARTUP_DB_CONNECT_TIMEOUT_SEC)
        if conn is None:
            print("[WARN] filaments schema: brak DATABASE_URL / połączenia — katalog użyje fallback.")
            return False
        try:
            conn.autocommit = True
            with conn.cursor() as cur:
                stats = ensure_filaments_schema(cur)
            extra = f", wyłączono {stats['retired']} starych SKU" if stats["retired"] else ""
            print(
                f"[INFO] filaments schema gotowa "
                f"({stats['count']} pozycji, {stats['available']} na stanie{extra})."
            )
            return True
        finally:
            conn.close()
    except Exception as err:
        print(f"[WARN] filaments schema: {err} — katalog użyje fallback.")
        return False


def ensure_products_on_startup() -> bool:
    """
    Bootstrap tabeli products przy starcie FastAPI.

    Nigdy nie przerywa procesu: brak DATABASE_URL albo chwilowy błąd DB
    kończy się logiem — /api/products zostaje przy fallbacku in-code.
    """
    try:
        from db import get_db_connection

        conn = get_db_connection(connect_timeout=STARTUP_DB_CONNECT_TIMEOUT_SEC)
        if conn is None:
            print("[WARN] products schema: brak DATABASE_URL / połączenia — katalog użyje fallback.")
            return False
        try:
            conn.autocommit = True
            with conn.cursor() as cur:
                stats = ensure_products_schema(cur)
            extra = f", zremapowano {stats['remapped']} kategorii" if stats["remapped"] else ""
            print(
                f"[INFO] products schema gotowa "
                f"({stats['count']} SKU, {stats['available']} aktywnych{extra})."
            )
            return True
        finally:
            conn.close()
    except Exception as err:
        print(f"[WARN] products schema: {err} — katalog użyje fallback.")
        return False


def get_db_connection():
    """Tworzy połączenie z PostgreSQL za pomocą DATABASE_URL."""
    db_url = os.getenv("DATABASE_URL")
    if len(sys.argv) > 1 and sys.argv[1].startswith(("postgres://", "postgresql://")):
        db_url = sys.argv[1]

    if not db_url:
        print("\n[BŁĄD] Nie znaleziono zmiennej DATABASE_URL w środowisku ani w plikach .env!")
        print("Możesz podać URL bezpośrednio jako argument:")
        print("    python db_setup.py postgresql://postgres:haslo@host:port/dbname\n")
        sys.exit(1)

    # Poprawka dla Railway / SQLAlchemy / psycopg2 (postgres:// -> postgresql://)
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)

    return psycopg2.connect(db_url)


def setup_database():
    """Tworzy tabelę filaments i seeduje dane."""
    print("=" * 60)
    print("  DRUKSTACJA - KONFIGURATOR BAZY POSTGRESQL (RAILWAY)")
    print("=" * 60)

    conn = None
    try:
        conn = get_db_connection()
        conn.autocommit = True
        cur = conn.cursor()

        print("[1/5] Tworzenie tabeli 'filaments' i seed katalogu Sunlu...")
        filament_stats = ensure_filaments_schema(cur)
        extra = f", wyłączono {filament_stats['retired']} starych SKU" if filament_stats["retired"] else ""
        print(
            f"      ✓ Tabela 'filaments' gotowa "
            f"({filament_stats['count']} pozycji, {filament_stats['available']} na stanie{extra})."
        )

        print("[2/5] Weryfikacja tabeli 'orders' (schemat koszyka / zleceń)...")
        cur.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
        orders_migration_sql = """
        CREATE TABLE IF NOT EXISTS orders (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID,
            file_name TEXT,
            material VARCHAR(255),
            technology TEXT,
            layer_height VARCHAR(50),
            infill INT,
            clean_supports BOOLEAN DEFAULT true,
            brass_inserts BOOLEAN DEFAULT false,
            quantity INT DEFAULT 1,
            total_price NUMERIC(10, 2),
            dimensions_mm DOUBLE PRECISION[],
            status VARCHAR(50) DEFAULT 'in_cart',
            production_file_url TEXT,
            nozzle_size VARCHAR(50),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS production_file_url TEXT;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS nozzle_size VARCHAR(50);
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        ALTER TABLE orders ALTER COLUMN file_name TYPE TEXT;
        ALTER TABLE orders ALTER COLUMN material TYPE VARCHAR(255);
        ALTER TABLE orders ALTER COLUMN technology TYPE TEXT;
        ALTER TABLE orders ALTER COLUMN production_file_url TYPE TEXT;
        ALTER TABLE orders ALTER COLUMN dimensions_mm TYPE DOUBLE PRECISION[]
            USING dimensions_mm::DOUBLE PRECISION[];
        CREATE INDEX IF NOT EXISTS idx_orders_user_status ON orders (user_id, status);
        CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC);
        """
        cur.execute(orders_migration_sql)
        print("      ✓ Tabela 'orders' ma kolumny UI (w tym nozzle_size) i indeksy user/status.")

        print("[3/5] Weryfikacja tabeli 'checkouts' (nagłówki OMS)...")
        apply_checkouts_schema(cur)
        print("      ✓ Tabela 'checkouts' i kolumna orders.checkout_id gotowe.")

        print("[4/5] Tworzenie tabeli 'products' i seed katalogu sklepu...")
        stats = ensure_products_schema(cur)
        if stats["remapped"]:
            print(f"      ✓ Znormalizowano kategorie sklepu ({stats['remapped']} wierszy → slug).")
        print(
            f"      ✓ Tabela 'products' gotowa "
            f"({stats['count']} SKU, {stats['available']} aktywnych na stanie)."
        )

        print(
            f"[5/5] Katalog filamentów: {filament_stats['available']} dostępnych "
            f"(upsert z filament_catalog.py)."
        )
        print(f"      ✓ Zakończono seedowanie!")
        print(
            f"      ✓ Łącznie w bazie: {filament_stats['count']} pozycji "
            f"({filament_stats['available']} oznaczonych jako dostępne w magazynie)."
        )
        print("\n[SUKCES] Baza PostgreSQL jest w pełni gotowa do zarządzania przez Railway Data View!")
        cur.close()

    except Exception as e:
        print(f"\n[BŁĄD] Wystąpił problem z bazą: {e}")
        sys.exit(1)
    finally:
        if conn:
            conn.close()


CHECKOUTS_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS checkouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    shipping_name VARCHAR(255) NOT NULL,
    shipping_phone VARCHAR(50) NOT NULL,
    shipping_street TEXT NOT NULL,
    shipping_city VARCHAR(255) NOT NULL,
    shipping_postal_code VARCHAR(20) NOT NULL,
    shipping_country VARCHAR(8) NOT NULL DEFAULT 'PL',
    company VARCHAR(255),
    nip VARCHAR(20),
    subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0,
    shipping NUMERIC(10, 2) NOT NULL DEFAULT 0,
    total NUMERIC(10, 2) NOT NULL DEFAULT 0,
    payment_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    production_status VARCHAR(50) NOT NULL DEFAULT 'pending_payment',
    stripe_session_id VARCHAR(255),
    stripe_payment_intent_id VARCHAR(255),
    customer_email VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS shipping_name VARCHAR(255);
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS shipping_phone VARCHAR(50);
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS shipping_street TEXT;
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS shipping_city VARCHAR(255);
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS shipping_postal_code VARCHAR(20);
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS shipping_country VARCHAR(8);
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS company VARCHAR(255);
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS nip VARCHAR(20);
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10, 2);
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS shipping NUMERIC(10, 2);
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS total NUMERIC(10, 2);
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50);
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS production_status VARCHAR(50);
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS stripe_session_id VARCHAR(255);
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(255);
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255);
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_checkouts_user_created ON checkouts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkouts_payment_prod ON checkouts (payment_status, production_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_checkouts_stripe_session
    ON checkouts (stripe_session_id) WHERE stripe_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_checkouts_stripe_pi
    ON checkouts (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_id UUID;
CREATE INDEX IF NOT EXISTS idx_orders_checkout_id ON orders (checkout_id);
"""


def apply_checkouts_schema(cur):
    """Idempotentny DDL nagłówków zamówień (OMS) + FK checkout_id."""
    cur.execute(CHECKOUTS_SCHEMA_SQL)
    cur.execute(
        """
        DO $$
        BEGIN
            ALTER TABLE orders
                ADD CONSTRAINT orders_checkout_id_fkey
                FOREIGN KEY (checkout_id) REFERENCES checkouts(id) ON DELETE SET NULL;
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END
        $$;
        """
    )


def ensure_oms_schema() -> bool:
    """
    Start API: dopina schemat OMS (checkouts + orders.checkout_id).
    Nigdy nie przerywa procesu — brak DATABASE_URL / chwilowy błąd DB tylko log.
    """
    try:
        from db import get_db_connection as get_runtime_db

        conn = get_runtime_db(connect_timeout=STARTUP_DB_CONNECT_TIMEOUT_SEC)
        if conn is None:
            print("[WARN] OMS schema: brak DATABASE_URL / połączenia.")
            return False
        try:
            conn.autocommit = True
            with conn.cursor() as cur:
                cur.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
                apply_checkouts_schema(cur)
            print("[INFO] OMS schema gotowa (checkouts + orders.checkout_id).")
            return True
        finally:
            conn.close()
    except Exception as err:
        print(f"[WARN] ensure_oms_schema: {err}")
        return False


if __name__ == "__main__":
    setup_database()
