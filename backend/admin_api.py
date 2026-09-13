"""
Panel staff OMS — lista opłaconych zamówień i przesuwanie statusu produkcji.

GET   /api/admin/checkouts       lista paid / pipeline (+ filtry / szukanie)
GET   /api/admin/checkouts/{id}  detal + linie
PATCH /api/admin/checkouts/{id}  in_queue → in_production → post_processing → shipped
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from auth import AuthUser, get_admin_user
from oms import (
    ADMIN_NEXT_STATUS,
    ADMIN_VISIBLE_PRODUCTION,
    PAYMENT_PAID,
    PAYMENT_PENDING,
    PRODUCTION_PENDING_PAYMENT,
    fetch_checkout,
    fetch_checkout_lines,
    serialize_checkout,
)
from orders_api import require_db

router = APIRouter(prefix="/api/admin", tags=["admin"])

ADMIN_FILTER_STATUSES = set(ADMIN_VISIBLE_PRODUCTION) | {
    PAYMENT_PAID,
    PRODUCTION_PENDING_PAYMENT,
}
PAYMENT_FILTERS = {PAYMENT_PAID, PAYMENT_PENDING, "all"}

PRODUCTION_SORT_RANK = {
    "in_queue": 0,
    "in_production": 1,
    "post_processing": 2,
    "pending_payment": 3,
    "shipped": 4,
}


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


def empty_admin_counts() -> dict[str, int]:
    return {
        "all": 0,
        "in_queue": 0,
        "in_production": 0,
        "post_processing": 0,
        "shipped": 0,
        "pending_payment": 0,
        "paid": 0,
        "pending": 0,
    }


def checkout_matches_query(checkout: dict, query: str | None) -> bool:
    needle = (query or "").strip().lower()
    if not needle:
        return True
    haystacks = [
        str(checkout.get("id") or ""),
        str(checkout.get("customer_email") or ""),
        str(checkout.get("shipping_name") or ""),
        str(checkout.get("shipping_phone") or ""),
        str(checkout.get("company") or ""),
        str(checkout.get("nip") or ""),
    ]
    for line in checkout.get("lines") or []:
        haystacks.extend(
            [
                str(line.get("id") or ""),
                str(line.get("file_name") or ""),
                str(line.get("material") or ""),
                str(line.get("layer_height") or ""),
            ]
        )
    return any(needle in value.lower() for value in haystacks)


def count_admin_checkouts(checkouts: list[dict]) -> dict[str, int]:
    counts = empty_admin_counts()
    for row in checkouts:
        production = row.get("production_status")
        payment = row.get("payment_status")
        if production in ADMIN_VISIBLE_PRODUCTION:
            counts["all"] += 1
            if production in counts:
                counts[production] += 1
        if production == PRODUCTION_PENDING_PAYMENT or payment == PAYMENT_PENDING:
            counts["pending_payment"] += 1
        if payment == PAYMENT_PAID:
            counts["paid"] += 1
        if payment == PAYMENT_PENDING:
            counts["pending"] += 1
    return counts


def _created_ts(row: dict) -> float:
    value = row.get("created_at")
    if isinstance(value, datetime):
        return value.timestamp()
    if isinstance(value, str) and value:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
        except ValueError:
            return 0.0
    return 0.0


def sort_admin_checkouts(checkouts: list[dict]) -> list[dict]:
    return sorted(
        checkouts,
        key=lambda row: (
            PRODUCTION_SORT_RANK.get(row.get("production_status"), 9),
            -_created_ts(row),
        ),
    )


def filter_admin_checkouts(
    checkouts: list[dict],
    *,
    status: str | None = None,
    payment: str | None = None,
    query: str | None = None,
) -> list[dict]:
    matched = [row for row in checkouts if checkout_matches_query(row, query)]
    if payment and payment != "all":
        matched = [row for row in matched if row.get("payment_status") == payment]
    if status == PAYMENT_PAID:
        matched = [row for row in matched if row.get("payment_status") == PAYMENT_PAID]
    elif status == PRODUCTION_PENDING_PAYMENT:
        matched = [
            row
            for row in matched
            if row.get("production_status") == PRODUCTION_PENDING_PAYMENT
            or row.get("payment_status") == PAYMENT_PENDING
        ]
    elif status in ADMIN_VISIBLE_PRODUCTION:
        matched = [row for row in matched if row.get("production_status") == status]
    elif not status and payment != "all" and payment != PAYMENT_PENDING:
        matched = [
            row for row in matched if row.get("production_status") in ADMIN_VISIBLE_PRODUCTION
        ]
    return sort_admin_checkouts(matched)


@router.get("/checkouts")
def list_admin_checkouts(
    status: str | None = Query(default=None),
    payment: str | None = Query(default=None),
    q: str | None = Query(default=None),
    user: AuthUser = Depends(get_admin_user),
):
    if status and status not in ADMIN_FILTER_STATUSES:
        raise HTTPException(status_code=400, detail=f"Nieznany filtr statusu: {status}")
    if payment and payment not in PAYMENT_FILTERS:
        raise HTTPException(status_code=400, detail=f"Nieznany filtr płatności: {payment}")

    conn = require_db()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT * FROM checkouts
                    WHERE payment_status = %s
                       OR production_status = ANY(%s)
                       OR (
                            payment_status = %s
                            AND production_status = %s
                       )
                    ORDER BY created_at DESC
                    """,
                    (
                        PAYMENT_PAID,
                        list(ADMIN_VISIBLE_PRODUCTION),
                        PAYMENT_PENDING,
                        PRODUCTION_PENDING_PAYMENT,
                    ),
                )
                rows = [dict(row) for row in (cur.fetchall() or [])]
                catalog = _attach_lines(cur, rows)
        searched = [row for row in catalog if checkout_matches_query(row, q)]
        counts = count_admin_checkouts(searched)
        checkouts = filter_admin_checkouts(
            catalog, status=status, payment=payment, query=q
        )
        return {
            "success": True,
            "checkouts": checkouts,
            "counts": counts,
            "admin": user.email,
        }
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
