"""
Panel staff OMS — lista opłaconych zamówień i przesuwanie statusu produkcji.

GET   /api/admin/checkouts       lista paid / pipeline
GET   /api/admin/checkouts/{id}  detal + linie
PATCH /api/admin/checkouts/{id}  in_queue → in_production → post_processing → shipped
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from auth import AuthUser, get_admin_user
from oms import (
    ADMIN_NEXT_STATUS,
    ADMIN_VISIBLE_PRODUCTION,
    PAYMENT_PAID,
    fetch_checkout,
    fetch_checkout_lines,
    serialize_checkout,
)
from orders_api import require_db

router = APIRouter(prefix="/api/admin", tags=["admin"])


class AdminStatusUpdate(BaseModel):
    production_status: str


def _attach_lines(cur, checkouts: list[dict]) -> list[dict]:
    if not checkouts:
        return []
    ids = [str(row["id"]) for row in checkouts]
    cur.execute(
        """
        SELECT * FROM orders
        WHERE checkout_id::text = ANY(%s)
        ORDER BY created_at ASC
        """,
        (ids,),
    )
    grouped: dict[str, list] = {cid: [] for cid in ids}
    for row in cur.fetchall() or []:
        item = dict(row)
        grouped.setdefault(str(item.get("checkout_id")), []).append(item)
    return [serialize_checkout(row, grouped.get(str(row["id"]), [])) for row in checkouts]


@router.get("/checkouts")
def list_admin_checkouts(
    status: str | None = Query(default=None),
    user: AuthUser = Depends(get_admin_user),
):
    if status and status not in ADMIN_VISIBLE_PRODUCTION and status != PAYMENT_PAID:
        raise HTTPException(status_code=400, detail=f"Nieznany filtr statusu: {status}")

    conn = require_db()
    try:
        with conn:
            with conn.cursor() as cur:
                if status and status in ADMIN_VISIBLE_PRODUCTION:
                    cur.execute(
                        """
                        SELECT * FROM checkouts
                        WHERE payment_status = %s AND production_status = %s
                        ORDER BY created_at DESC
                        """,
                        (PAYMENT_PAID, status),
                    )
                else:
                    cur.execute(
                        """
                        SELECT * FROM checkouts
                        WHERE payment_status = %s
                           OR production_status = ANY(%s)
                        ORDER BY created_at DESC
                        """,
                        (PAYMENT_PAID, list(ADMIN_VISIBLE_PRODUCTION)),
                    )
                rows = [dict(row) for row in (cur.fetchall() or [])]
                checkouts = _attach_lines(cur, rows)
        return {"success": True, "checkouts": checkouts, "admin": user.email}
    except HTTPException:
        raise
    except Exception as err:
        print(f"[WARN] list_admin_checkouts: {err}")
        raise HTTPException(status_code=500, detail="Nie udało się pobrać zamówień.")
    finally:
        conn.close()


@router.get("/checkouts/{checkout_id}")
def get_admin_checkout(checkout_id: str, user: AuthUser = Depends(get_admin_user)):
    conn = require_db()
    try:
        with conn:
            with conn.cursor() as cur:
                checkout = fetch_checkout(cur, checkout_id)
                if not checkout:
                    raise HTTPException(status_code=404, detail="Zamówienie nie istnieje.")
                lines = fetch_checkout_lines(cur, checkout_id)
        return {"success": True, "checkout": serialize_checkout(checkout, lines)}
    except HTTPException:
        raise
    except Exception as err:
        print(f"[WARN] get_admin_checkout: {err}")
        raise HTTPException(status_code=500, detail="Nie udało się pobrać zamówienia.")
    finally:
        conn.close()


@router.patch("/checkouts/{checkout_id}")
def update_admin_checkout(
    checkout_id: str,
    payload: AdminStatusUpdate,
    user: AuthUser = Depends(get_admin_user),
):
    wanted = (payload.production_status or "").strip()
    if wanted not in ADMIN_NEXT_STATUS.values():
        raise HTTPException(status_code=400, detail=f"Niedozwolony status produkcji: {wanted}")

    conn = require_db()
    try:
        with conn:
            with conn.cursor() as cur:
                checkout = fetch_checkout(cur, checkout_id)
                if not checkout:
                    raise HTTPException(status_code=404, detail="Zamówienie nie istnieje.")
                if checkout.get("payment_status") != PAYMENT_PAID:
                    raise HTTPException(status_code=409, detail="Zamówienie nie jest opłacone.")
                current = checkout.get("production_status")
                expected = ADMIN_NEXT_STATUS.get(current)
                if wanted != expected:
                    raise HTTPException(
                        status_code=409,
                        detail=f"Dozwolone przejście: {current} → {expected}."
                        if expected
                        else "To zamówienie jest już w statusie końcowym (shipped).",
                    )
                cur.execute(
                    """
                    UPDATE checkouts
                    SET production_status = %s, updated_at = NOW()
                    WHERE id = %s
                    RETURNING *
                    """,
                    (wanted, checkout["id"]),
                )
                updated = dict(cur.fetchone())
                cur.execute(
                    """
                    UPDATE orders
                    SET status = %s, updated_at = NOW()
                    WHERE checkout_id = %s
                    """,
                    (wanted, checkout["id"]),
                )
                lines = fetch_checkout_lines(cur, checkout_id)
        return {"success": True, "checkout": serialize_checkout(updated, lines)}
    except HTTPException:
        raise
    except Exception as err:
        print(f"[WARN] update_admin_checkout: {err}")
        raise HTTPException(status_code=500, detail="Nie udało się zaktualizować statusu.")
    finally:
        conn.close()
