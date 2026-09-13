"""
Wspólna logika OMS: statusy, serializacja nagłówka, oznaczenie płatności.

Railway Postgres jest SoT. Stripe Checkout Session tworzy płatność;
webhook ustawia payment_status=paid i production_status/orders.status=in_queue.
"""
from __future__ import annotations

import os
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any
from uuid import UUID

from fastapi import HTTPException

from orders_api import serialize_order

PAYMENT_PENDING = "pending"
PAYMENT_PAID = "paid"
PAYMENT_CANCELLED = "cancelled"
PAYMENT_FAILED = "failed"

PRODUCTION_PENDING_PAYMENT = "pending_payment"
PRODUCTION_IN_QUEUE = "in_queue"
PRODUCTION_IN_PRODUCTION = "in_production"
PRODUCTION_POST_PROCESSING = "post_processing"
PRODUCTION_SHIPPED = "shipped"

ADMIN_NEXT_STATUS = {
    PRODUCTION_IN_QUEUE: PRODUCTION_IN_PRODUCTION,
    PRODUCTION_IN_PRODUCTION: PRODUCTION_POST_PROCESSING,
    PRODUCTION_POST_PROCESSING: PRODUCTION_SHIPPED,
}

ADMIN_VISIBLE_PRODUCTION = (
    PRODUCTION_IN_QUEUE,
    PRODUCTION_IN_PRODUCTION,
    PRODUCTION_POST_PROCESSING,
    PRODUCTION_SHIPPED,
)

DEFAULT_MIN_ORDER_PLN = Decimal("30.00")
DEFAULT_SHIPPING_PLN = Decimal("0.00")


def money(value) -> Decimal:
    try:
        return Decimal(str(value if value is not None else 0)).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
    except Exception:
        return Decimal("0.00")


def money_to_grosze(value) -> int:
    return int((money(value) * 100).to_integral_value(rounding=ROUND_HALF_UP))


def min_order_pln() -> Decimal:
    return money(os.getenv("MIN_ORDER_PLN", str(DEFAULT_MIN_ORDER_PLN)))


def shipping_amount_pln() -> Decimal:
    return money(os.getenv("SHIPPING_AMOUNT_PLN", str(DEFAULT_SHIPPING_PLN)))


def public_site_url() -> str:
    return (
        os.getenv("NEXT_PUBLIC_SITE_URL")
        or os.getenv("SITE_URL")
        or "http://localhost:3000"
    ).rstrip("/")


def serialize_value(value: Any) -> Any:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, list):
        return [serialize_value(v) for v in value]
    return value


def serialize_checkout(row: Any, lines: list | None = None) -> dict:
    if row is None:
        return {}
    item = {key: serialize_value(value) for key, value in dict(row).items()}
    if lines is not None:
        item["lines"] = [serialize_order(line) for line in lines]
    return item


def fetch_checkout(cur, checkout_id: str) -> dict | None:
    cur.execute(
        """
        SELECT * FROM checkouts
        WHERE id::text = %s
        LIMIT 1
        """,
        (str(checkout_id),),
    )
    row = cur.fetchone()
    return dict(row) if row else None


def fetch_checkout_lines(cur, checkout_id: str) -> list[dict]:
    cur.execute(
        """
        SELECT * FROM orders
        WHERE checkout_id::text = %s
        ORDER BY created_at ASC
        """,
        (str(checkout_id),),
    )
    return [dict(row) for row in (cur.fetchall() or [])]


def mark_checkout_paid(cur, checkout: dict, payment_intent_id: str | None = None) -> dict:
    """
    Idempotentnie: paid + in_queue na nagłówku i liniach.
    Ponowne wywołanie nie cofa statusu produkcji (np. już in_production).
    """
    checkout_id = checkout["id"]
    already_paid = (checkout.get("payment_status") or "") == PAYMENT_PAID
    production = checkout.get("production_status") or PRODUCTION_PENDING_PAYMENT

    if already_paid:
        next_production = production
        if next_production == PRODUCTION_PENDING_PAYMENT:
            next_production = PRODUCTION_IN_QUEUE
    else:
        next_production = PRODUCTION_IN_QUEUE

    pi = payment_intent_id or checkout.get("stripe_payment_intent_id")
    cur.execute(
        """
        UPDATE checkouts
        SET payment_status = %s,
            production_status = %s,
            stripe_payment_intent_id = COALESCE(%s, stripe_payment_intent_id),
            updated_at = NOW()
        WHERE id = %s
        RETURNING *
        """,
        (PAYMENT_PAID, next_production, pi, checkout_id),
    )
    updated = cur.fetchone()
    if not updated:
        raise HTTPException(status_code=500, detail="Nie udało się oznaczyć płatności.")

    if not already_paid or production == PRODUCTION_PENDING_PAYMENT:
        cur.execute(
            """
            UPDATE orders
            SET status = %s, updated_at = NOW()
            WHERE checkout_id = %s
              AND status IN ('pending_payment', 'in_cart', 'in_queue')
            """,
            (PRODUCTION_IN_QUEUE, checkout_id),
        )
    return dict(updated)


def restore_abandoned_checkouts(cur, user_id: str) -> None:
    """Nieopłacone pending z poprzedniej sesji Stripe wracają do koszyka."""
    cur.execute(
        """
        UPDATE orders
        SET status = 'in_cart', updated_at = NOW()
        WHERE user_id::text = %s
          AND status = 'pending_payment'
          AND checkout_id IN (
              SELECT id FROM checkouts
              WHERE user_id::text = %s AND payment_status = %s
          )
        """,
        (user_id, user_id, PAYMENT_PENDING),
    )
    cur.execute(
        """
        UPDATE checkouts
        SET payment_status = %s, updated_at = NOW()
        WHERE user_id::text = %s AND payment_status = %s
        """,
        (PAYMENT_CANCELLED, user_id, PAYMENT_PENDING),
    )


def restore_checkout_to_cart(cur, checkout: dict) -> dict:
    if (checkout.get("payment_status") or "") == PAYMENT_PAID:
        raise HTTPException(status_code=409, detail="Opłaconego zamówienia nie można przywrócić do koszyka.")
    cur.execute(
        """
        UPDATE orders
        SET status = 'in_cart', updated_at = NOW()
        WHERE checkout_id = %s AND status = 'pending_payment'
        RETURNING id
        """,
        (checkout["id"],),
    )
    restored = cur.fetchall() or []
    cur.execute(
        """
        UPDATE checkouts
        SET payment_status = %s, updated_at = NOW()
        WHERE id = %s
        RETURNING *
        """,
        (PAYMENT_CANCELLED, checkout["id"]),
    )
    row = cur.fetchone()
    return {"checkout": serialize_checkout(row), "restored": [str(r["id"]) for r in restored]}
