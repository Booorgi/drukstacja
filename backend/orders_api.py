"""
REST API zleceń i koszyka — Railway Postgres jako jedyne źródło prawdy.

GET    /api/orders              lista zleceń zalogowanego użytkownika (?status=)
POST   /api/orders              nowa pozycja koszyka (wymaga JWT)
POST   /api/orders/rfq          zapytanie o wycenę (JWT opcjonalny)
POST   /api/orders/clear-cart   anuluj wszystkie pozycje in_cart
GET    /api/orders/{id}         pojedyncze zlecenie (właściciel)
PATCH  /api/orders/{id}         aktualizacja (właściciel)
DELETE /api/orders/{id}         anuluj pozycję koszyka (właściciel)
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from auth import AuthUser, get_current_user, get_optional_user
from db import get_db_connection
from pricing import (
    commercial_total_for_order,
    extract_quote_weight_hours,
    parse_mm_value,
)

router = APIRouter(prefix="/api/orders", tags=["orders"])

ALLOWED_STATUSES = (
    "in_cart",
    "pending_payment",
    "in_queue",
    "in_production",
    "post_processing",
    "shipped",
    "rfq_pending",
    "cancelled",
)
CREATE_STATUSES = ("in_cart", "rfq_pending")
CLIENT_PATCH_STATUSES = ("cancelled",)
PRINT_BED_MM = 256.0
PRINT_BED_EPS = 0.05
PRINT_BED_OVERSIZE_DETAIL = (
    "Model przekracza stół roboczy 256 × 256 × 256 mm. "
    "Zmniejsz skalę, aby dodać do koszyka."
)


class OrderCreate(BaseModel):
    file_name: str | None = None
    material: str | None = None
    technology: str | None = None
    layer_height: str | None = None
    infill: int | None = None
    clean_supports: bool = True
    brass_inserts: bool = False
    quantity: int = 1
    total_price: float | None = None
    dimensions_mm: list[float] | None = None
    status: str = "in_cart"
    nozzle_size: str | None = None
    production_file_url: str | None = None
    filament_weight_g: float | None = None
    print_time_hours: float | None = None
    print_time_formatted: str | None = None
    print_time_seconds: float | None = None


class OrderUpdate(BaseModel):
    file_name: str | None = None
    material: str | None = None
    technology: str | None = None
    layer_height: str | None = None
    infill: int | None = None
    clean_supports: bool | None = None
    brass_inserts: bool | None = None
    quantity: int | None = Field(default=None, ge=1)
    total_price: float | None = None
    dimensions_mm: list[float] | None = None
    status: str | None = None
    nozzle_size: str | None = None
    production_file_url: str | None = None


def require_db():
    conn = get_db_connection()
    if conn is None:
        raise HTTPException(status_code=503, detail="Baza danych jest niedostępna (DATABASE_URL).")
    return conn


def serialize_order(row: Any) -> dict:
    if row is None:
        return {}
    item = dict(row)
    for key, value in list(item.items()):
        if isinstance(value, UUID):
            item[key] = str(value)
        elif isinstance(value, Decimal):
            item[key] = float(value)
        elif isinstance(value, datetime):
            item[key] = value.isoformat()
        elif isinstance(value, list):
            item[key] = [float(v) if isinstance(v, Decimal) else v for v in value]
    return item


def _normalize_dimensions(values: list[float] | None) -> list[float] | None:
    if values is None:
        return None
    cleaned = []
    for value in values[:3]:
        try:
            cleaned.append(float(value))
        except (TypeError, ValueError):
            cleaned.append(0.0)
    while len(cleaned) < 3:
        cleaned.append(0.0)
    return cleaned


def dimensions_exceed_print_bed(values: list[float] | None, bed_mm: float = PRINT_BED_MM) -> bool:
    dims = _normalize_dimensions(values)
    if not dims or all(value <= 0 for value in dims):
        return False
    return any(value > bed_mm + PRINT_BED_EPS for value in dims)


def _ensure_printable_dimensions(payload: OrderCreate) -> None:
    if payload.status != "in_cart":
        return
    if dimensions_exceed_print_bed(payload.dimensions_mm):
        raise HTTPException(status_code=400, detail=PRINT_BED_OVERSIZE_DETAIL)


def _is_client_priced_line(payload: OrderCreate) -> bool:
    tech = (payload.technology or "").strip()
    material = payload.material or ""
    file_name = payload.file_name or ""
    if tech == "shop_sku":
        return True
    if payload.status == "rfq_pending":
        return True
    if "Wycena Inżynierska" in material or file_name.startswith("[RFQ]"):
        return True
    return False


def apply_server_print_price(payload: OrderCreate) -> None:
    """Studio print lines use commercial_unit_price. Client total_price is not trusted.

    Breloki / RFQ / shop SKUs without weight+time keep the client amount.
    """
    if payload.status != "in_cart" or _is_client_priced_line(payload):
        return
    weight, hours = extract_quote_weight_hours(
        filament_weight_g=payload.filament_weight_g,
        print_time_hours=payload.print_time_hours,
        print_time_formatted=payload.print_time_formatted,
        print_time_seconds=payload.print_time_seconds,
        technology=payload.technology,
    )
    if weight is None or hours <= 0:
        return
    payload.total_price = commercial_total_for_order(
        filament_weight_g=weight,
        print_time_hours=hours,
        material=payload.material or "PLA",
        quantity=payload.quantity or 1,
        layer_height=parse_mm_value(payload.layer_height, 0.20),
        nozzle_size=parse_mm_value(payload.nozzle_size, 0.4),
    )


def _validate_status(status: str | None, allowed: tuple[str, ...]) -> str:
    value = (status or "").strip() or "in_cart"
    if value not in allowed:
        raise HTTPException(status_code=400, detail=f"Niedozwolony status: {value}")
    return value


def fetch_owned_order(cur, order_id: str, user_id: str) -> dict | None:
    cur.execute(
        """
        SELECT * FROM orders
        WHERE id::text = %s AND user_id::text = %s
        LIMIT 1
        """,
        (str(order_id), str(user_id)),
    )
    row = cur.fetchone()
    return dict(row) if row else None


def update_production_file_url(order_id: str | None, url: str | None) -> bool:
    """Aktualizuje production_file_url w Railway Postgres. Bez zapisu do Supabase."""
    if not order_id or not url:
        return False
    conn = get_db_connection()
    if conn is None:
        return False
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE orders
                    SET production_file_url = %s, updated_at = NOW()
                    WHERE id::text = %s OR id::text LIKE %s
                    """,
                    (url, str(order_id), f"{order_id}%"),
                )
                return cur.rowcount > 0
    except Exception as db_err:
        print(f"[WARN] Nie udało się zaktualizować production_file_url: {db_err}")
        return False
    finally:
        conn.close()


def _insert_order(cur, payload: OrderCreate, user_id: str | None) -> dict:
    status = _validate_status(payload.status, CREATE_STATUSES)
    dims = _normalize_dimensions(payload.dimensions_mm)
    cur.execute(
        """
        INSERT INTO orders (
            user_id, file_name, material, technology, layer_height, infill,
            clean_supports, brass_inserts, quantity, total_price, dimensions_mm,
            status, production_file_url, nozzle_size, created_at, updated_at
        )
        VALUES (
            %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s,
            %s, %s, %s, NOW(), NOW()
        )
        RETURNING *
        """,
        (
            user_id,
            payload.file_name,
            payload.material,
            payload.technology,
            payload.layer_height,
            payload.infill,
            bool(payload.clean_supports),
            bool(payload.brass_inserts),
            int(payload.quantity or 1),
            payload.total_price,
            dims,
            status,
            payload.production_file_url,
            payload.nozzle_size,
        ),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=500, detail="Nie udało się utworzyć zlecenia.")
    return serialize_order(row)


@router.get("")
def list_orders(
    status: str | None = Query(default=None),
    user: AuthUser = Depends(get_current_user),
):
    if status and status not in ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail=f"Nieznany status: {status}")

    conn = require_db()
    try:
        with conn:
            with conn.cursor() as cur:
                if status:
                    cur.execute(
                        """
                        SELECT * FROM orders
                        WHERE user_id::text = %s AND status = %s
                        ORDER BY created_at DESC
                        """,
                        (user.id, status),
                    )
                else:
                    cur.execute(
                        """
                        SELECT * FROM orders
                        WHERE user_id::text = %s
                        ORDER BY created_at DESC
                        """,
                        (user.id,),
                    )
                rows = cur.fetchall() or []
        return {"success": True, "orders": [serialize_order(row) for row in rows]}
    except HTTPException:
        raise
    except Exception as err:
        print(f"[WARN] list_orders: {err}")
        raise HTTPException(status_code=500, detail="Nie udało się pobrać zleceń.")
    finally:
        conn.close()


@router.post("")
def create_order(payload: OrderCreate, user: AuthUser = Depends(get_current_user)):
    status = _validate_status(payload.status, CREATE_STATUSES)
    payload.status = status
    _ensure_printable_dimensions(payload)
    apply_server_print_price(payload)
    conn = require_db()
    try:
        with conn:
            with conn.cursor() as cur:
                order = _insert_order(cur, payload, user.id)
        return {"success": True, "order": order}
    except HTTPException:
        raise
    except Exception as err:
        print(f"[WARN] create_order: {err}")
        raise HTTPException(status_code=500, detail="Nie udało się zapisać zlecenia.")
    finally:
        conn.close()


@router.post("/rfq")
def create_rfq(payload: OrderCreate, user: AuthUser | None = Depends(get_optional_user)):
    payload.status = "rfq_pending"
    conn = require_db()
    try:
        with conn:
            with conn.cursor() as cur:
                order = _insert_order(cur, payload, user.id if user else None)
        return {"success": True, "order": order}
    except HTTPException:
        raise
    except Exception as err:
        print(f"[WARN] create_rfq: {err}")
        raise HTTPException(status_code=500, detail="Nie udało się zapisać zapytania RFQ.")
    finally:
        conn.close()


@router.post("/clear-cart")
def clear_cart(user: AuthUser = Depends(get_current_user)):
    conn = require_db()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE orders
                    SET status = 'cancelled', updated_at = NOW()
                    WHERE user_id::text = %s AND status = 'in_cart'
                    RETURNING id
                    """,
                    (user.id,),
                )
                rows = cur.fetchall() or []
        return {
            "success": True,
            "cancelled": [str(row["id"]) for row in rows],
        }
    except HTTPException:
        raise
    except Exception as err:
        print(f"[WARN] clear_cart: {err}")
        raise HTTPException(status_code=500, detail="Nie udało się wyczyścić koszyka.")
    finally:
        conn.close()


@router.get("/{order_id}")
def get_order(order_id: str, user: AuthUser = Depends(get_current_user)):
    conn = require_db()
    try:
        with conn:
            with conn.cursor() as cur:
                row = fetch_owned_order(cur, order_id, user.id)
        if not row:
            raise HTTPException(status_code=404, detail="Zlecenie nie istnieje.")
        return {"success": True, "order": serialize_order(row)}
    except HTTPException:
        raise
    except Exception as err:
        print(f"[WARN] get_order: {err}")
        raise HTTPException(status_code=500, detail="Nie udało się pobrać zlecenia.")
    finally:
        conn.close()


@router.patch("/{order_id}")
def update_order(order_id: str, payload: OrderUpdate, user: AuthUser = Depends(get_current_user)):
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Brak pól do aktualizacji.")
    if "status" in updates:
        updates["status"] = _validate_status(updates["status"], CLIENT_PATCH_STATUSES)
    if "dimensions_mm" in updates:
        updates["dimensions_mm"] = _normalize_dimensions(updates["dimensions_mm"])

    conn = require_db()
    try:
        with conn:
            with conn.cursor() as cur:
                existing = fetch_owned_order(cur, order_id, user.id)
                if not existing:
                    raise HTTPException(status_code=404, detail="Zlecenie nie istnieje.")
                if updates.get("status") == "cancelled" and existing.get("status") not in (
                    "in_cart",
                    "rfq_pending",
                    "pending_payment",
                    "cancelled",
                ):
                    raise HTTPException(
                        status_code=409,
                        detail="Tego zlecenia nie można już anulować z poziomu koszyka.",
                    )
                tech = (existing.get("technology") or "").strip()
                if "total_price" in updates and tech != "shop_sku":
                    # Client cannot restamp a print line (VAT-on-gross, double setup, etc.).
                    updates.pop("total_price")
                set_parts = []
                values = []
                for column in (
                    "file_name",
                    "material",
                    "technology",
                    "layer_height",
                    "infill",
                    "clean_supports",
                    "brass_inserts",
                    "quantity",
                    "total_price",
                    "dimensions_mm",
                    "status",
                    "nozzle_size",
                    "production_file_url",
                ):
                    if column in updates:
                        set_parts.append(f"{column} = %s")
                        values.append(updates[column])
                if not set_parts:
                    raise HTTPException(status_code=400, detail="Brak dozwolonych pól do aktualizacji.")
                set_parts.append("updated_at = NOW()")
                values.extend([order_id, user.id])
                cur.execute(
                    f"""
                    UPDATE orders
                    SET {", ".join(set_parts)}
                    WHERE id::text = %s AND user_id::text = %s
                    RETURNING *
                    """,
                    values,
                )
                row = cur.fetchone()
        return {"success": True, "order": serialize_order(row)}
    except HTTPException:
        raise
    except Exception as err:
        print(f"[WARN] update_order: {err}")
        raise HTTPException(status_code=500, detail="Nie udało się zaktualizować zlecenia.")
    finally:
        conn.close()


@router.delete("/{order_id}")
def cancel_order(order_id: str, user: AuthUser = Depends(get_current_user)):
    conn = require_db()
    try:
        with conn:
            with conn.cursor() as cur:
                existing = fetch_owned_order(cur, order_id, user.id)
                if not existing:
                    raise HTTPException(status_code=404, detail="Zlecenie nie istnieje.")
                cur.execute(
                    """
                    UPDATE orders
                    SET status = 'cancelled', updated_at = NOW()
                    WHERE id::text = %s AND user_id::text = %s
                    RETURNING *
                    """,
                    (order_id, user.id),
                )
                row = cur.fetchone()
        return {"success": True, "order": serialize_order(row)}
    except HTTPException:
        raise
    except Exception as err:
        print(f"[WARN] cancel_order: {err}")
        raise HTTPException(status_code=500, detail="Nie udało się usunąć pozycji.")
    finally:
        conn.close()
