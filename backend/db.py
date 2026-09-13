"""
Wspólne połączenie z Railway Postgres (DATABASE_URL).
Używane przez filamenty, zlecenia i pakiety produkcyjne .3MF.
"""
import os


def normalize_database_url(db_url: str) -> str:
    if db_url.startswith("postgres://"):
        return "postgresql://" + db_url[len("postgres://"):]
    return db_url


def get_database_url() -> str | None:
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        return None
    return normalize_database_url(db_url)


def get_db_connection():
    """Zwraca połączenie z PostgreSQL albo None, gdy brak DATABASE_URL / błąd połączenia."""
    db_url = get_database_url()
    if not db_url:
        return None
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor

        return psycopg2.connect(db_url, cursor_factory=RealDictCursor)
    except Exception as e:
        print(f"[WARN] Nie można połączyć z bazą PostgreSQL: {e}")
        return None
