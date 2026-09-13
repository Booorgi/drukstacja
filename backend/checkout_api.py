"""
Checkout OMS — zamrożenie koszyka + Stripe Checkout Session (PLN).

POST /api/checkout          JWT — adres + session URL
POST /api/checkout/cancel   JWT — przywróć pending do in_cart
GET  /api/checkout/{id}     JWT — własne zamówienie
POST /api/webhooks/stripe   podpis Stripe — paid / in_queue
"""
from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from auth import AuthUser, get_current_user
from oms import (
    PAYMENT_PAID,
    PAYMENT_PENDING,
    PRODUCTION_PENDING_PAYMENT,
    fetch_checkout,
    fetch_checkout_lines,
    mark_checkout_paid,
    min_order_pln,
    money,
    money_to_grosze,
    public_site_url,
    restore_abandoned_checkouts,
    restore_checkout_to_cart,
    serialize_checkout,
    shipping_amount_pln,
)
from orders_api import require_db

router = APIRouter(prefix="/api/checkout", tags=["checkout"])
webhook_router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


class AddressPayload(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    phone: str = Field(min_length=7, max_length=50)
    street: str = Field(min_length=2, max_length=500)
    city: str = Field(min_length=2, max_length=255)
    postal_code: str = Field(min_length=4, max_length=20)
    country: str = Field(default="PL", max_length=8)
    company: str | None = Field(default=None, max_length=255)
    nip: str | None = Field(default=None, max_length=20)


class CancelPayload(BaseModel):
    checkout_id: str | None = None


def _clean(value: str | None, *, upper: bool = False) -> str:
    text = (value or "").strip()
    return text.upper() if upper else text


def _optional(value: str | None) -> str | None:
    text = (value or "").strip()
    return text or None


def _validate_address(payload: AddressPayload) -> dict:
    name = _clean(payload.name)
    phone = _clean(payload.phone)
    street = _clean(payload.street)
    city = _clean(payload.city)
    postal = _clean(payload.postal_code)
    country = _clean(payload.country or "PL", upper=True) or "PL"
    if len(country) != 2:
        raise HTTPException(status_code=400, detail="Kraj musi być kodem ISO (np. PL).")
    nip = _optional(payload.nip)
    if nip:
        digits = "".join(ch for ch in nip if ch.isdigit())
        if len(digits) not in (10,) and country == "PL":
            raise HTTPException(status_code=400, detail="NIP powinien zawierać 10 cyfr.")
        nip = digits
    return {
        "shipping_name": name,
        "shipping_phone": phone,
        "shipping_street": street,
        "shipping_city": city,
        "shipping_postal_code": postal,
        "shipping_country": country,
        "company": _optional(payload.company),
        "nip": nip,
    }


def _line_label(order: dict) -> str:
    name = (order.get("file_name") or "").strip() or "Pozycja zamówienia"
    qty = int(order.get("quantity") or 1)
    if qty > 1:
        return f"{name} × {qty}"
    return name


def stripe_line_items(orders: list[dict], shipping: Any) -> list[dict]:
    items = []
    for order in orders:
        amount = money_to_grosze(order.get("total_price"))
        if amount <= 0:
            raise HTTPException(status_code=400, detail="Pozycja koszyka ma nieprawidłową cenę.")
        items.append(
            {
                "price_data": {
                    "currency": "pln",
                    "unit_amount": amount,
                    "product_data": {
                        "name": _line_label(order)[:120],
                        "description": (order.get("material") or order.get("technology") or "Drukstacja")[:200],
                    },
                },
                "quantity": 1,
            }
        )
    ship = money_to_grosze(shipping)
    if ship > 0:
        items.append(
            {
                "price_data": {
                    "currency": "pln",
                    "unit_amount": ship,
                    "product_data": {"name": "Wysyłka (placeholder)"},
                },
                "quantity": 1,
            }
        )
    return items


def create_stripe_session(
    *,
    checkout_id: str,
    user: AuthUser,
    line_items: list[dict],
    success_url: str,
    cancel_url: str,
):
    secret = os.getenv("STRIPE_SECRET_KEY")
    if not secret:
        raise HTTPException(status_code=503, detail="Brak konfiguracji Stripe (STRIPE_SECRET_KEY).")
    import stripe

    stripe.api_key = secret
    kwargs = {
        "mode": "payment",
        "currency": "pln",
        "locale": "pl",
        "line_items": line_items,
        "success_url": success_url,
        "cancel_url": cancel_url,
        "client_reference_id": str(checkout_id),
        "metadata": {"checkout_id": str(checkout_id), "user_id": user.id},
        "payment_intent_data": {
            "metadata": {"checkout_id": str(checkout_id), "user_id": user.id},
        },
    }
    if user.email:
        kwargs["customer_email"] = user.email
    return stripe.checkout.Session.create(**kwargs)


def _session_field(session: Any, name: str, default=None):
    if session is None:
        return default
    if isinstance(session, dict):
        return session.get(name, default)
    return getattr(session, name, default)


def construct_stripe_event(payload: bytes, signature: str | None):
    secret = os.getenv("STRIPE_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=503, detail="Brak konfiguracji Stripe (STRIPE_WEBHOOK_SECRET).")
    if not signature:
        raise HTTPException(status_code=400, detail="Brak nagłówka Stripe-Signature.")
    import stripe

    try:
        return stripe.Webhook.construct_event(payload, signature, secret)
    except stripe.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Nieprawidłowy podpis webhooka Stripe.")
    except Exception as err:
        raise HTTPException(status_code=400, detail=f"Nie udało się odczytać zdarzenia Stripe: {err}")


def apply_stripe_event(event: dict) -> dict:
    """Idempotentna obsługa checkout.session.completed / payment_intent.succeeded."""
    event_type = event.get("type") or ""
    obj = (event.get("data") or {}).get("object") or {}
    checkout_id = None
    payment_intent_id = None

    if event_type == "checkout.session.completed":
        checkout_id = (obj.get("metadata") or {}).get("checkout_id") or obj.get("client_reference_id")
        payment_intent_id = obj.get("payment_intent")
        if isinstance(payment_intent_id, dict):
            payment_intent_id = payment_intent_id.get("id")
        session_id = obj.get("id")
        conn = require_db()
        try:
            with conn:
                with conn.cursor() as cur:
                    checkout = None
                    if checkout_id:
                        checkout = fetch_checkout(cur, str(checkout_id))
                    if checkout is None and session_id:
                        cur.execute(
                            "SELECT * FROM checkouts WHERE stripe_session_id = %s LIMIT 1",
                            (session_id,),
                        )
                        row = cur.fetchone()
                        checkout = dict(row) if row else None
                    if checkout is None:
                        return {"handled": False, "reason": "checkout_not_found"}
                    updated = mark_checkout_paid(cur, checkout, payment_intent_id)
            return {
                "handled": True,
                "checkout_id": str(updated["id"]),
                "payment_status": updated.get("payment_status"),
                "production_status": updated.get("production_status"),
            }
        finally:
            conn.close()

    if event_type == "payment_intent.succeeded":
        payment_intent_id = obj.get("id")
        checkout_id = (obj.get("metadata") or {}).get("checkout_id")
        conn = require_db()
        try:
            with conn:
                with conn.cursor() as cur:
                    checkout = None
                    if checkout_id:
                        checkout = fetch_checkout(cur, str(checkout_id))
                    if checkout is None and payment_intent_id:
                        cur.execute(
                            "SELECT * FROM checkouts WHERE stripe_payment_intent_id = %s LIMIT 1",
                            (payment_intent_id,),
                        )
                        row = cur.fetchone()
                        checkout = dict(row) if row else None
                    if checkout is None:
                        return {"handled": False, "reason": "checkout_not_found"}
                    updated = mark_checkout_paid(cur, checkout, payment_intent_id)
            return {
                "handled": True,
                "checkout_id": str(updated["id"]),
                "payment_status": updated.get("payment_status"),
                "production_status": updated.get("production_status"),
            }
        finally:
            conn.close()

    return {"handled": False, "reason": "ignored", "type": event_type}


@router.post("")
def create_checkout(payload: AddressPayload, user: AuthUser = Depends(get_current_user)):
    address = _validate_address(payload)
    conn = require_db()
    checkout = None
    try:
        with conn:
            with conn.cursor() as cur:
                restore_abandoned_checkouts(cur, user.id)
                cur.execute(
                    """
                    SELECT * FROM orders
                    WHERE user_id::text = %s AND status = 'in_cart'
                    ORDER BY created_at ASC
                    FOR UPDATE
                    """,
                    (user.id,),
                )
                lines = [dict(row) for row in (cur.fetchall() or [])]
                if not lines:
                    raise HTTPException(status_code=400, detail="Koszyk jest pusty.")

                subtotal = money(0)
                for line in lines:
                    subtotal += money(line.get("total_price"))
                shipping = shipping_amount_pln()
                total = subtotal + shipping
                minimum = min_order_pln()
                if total < minimum:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Minimalna wartość zamówienia to {minimum:.2f} PLN.",
                    )

                cur.execute(
                    """
                    INSERT INTO checkouts (
                        user_id, shipping_name, shipping_phone, shipping_street,
                        shipping_city, shipping_postal_code, shipping_country,
                        company, nip, subtotal, shipping, total,
                        payment_status, production_status, created_at, updated_at
                    )
                    VALUES (
                        %s, %s, %s, %s,
                        %s, %s, %s,
                        %s, %s, %s, %s, %s,
                        %s, %s, NOW(), NOW()
                    )
                    RETURNING *
                    """,
                    (
                        user.id,
                        address["shipping_name"],
                        address["shipping_phone"],
                        address["shipping_street"],
                        address["shipping_city"],
                        address["shipping_postal_code"],
                        address["shipping_country"],
                        address["company"],
                        address["nip"],
                        subtotal,
                        shipping,
                        total,
                        PAYMENT_PENDING,
                        PRODUCTION_PENDING_PAYMENT,
                    ),
                )
                checkout = dict(cur.fetchone())
                cur.execute(
                    """
                    UPDATE orders
                    SET status = 'pending_payment',
                        checkout_id = %s,
                        updated_at = NOW()
                    WHERE user_id::text = %s AND status = 'in_cart'
                    RETURNING *
                    """,
                    (checkout["id"], user.id),
                )
                frozen = [dict(row) for row in (cur.fetchall() or [])]

        site = public_site_url()
        success_url = f"{site}/kasa/sukces?session_id={{CHECKOUT_SESSION_ID}}"
        cancel_url = f"{site}/kasa/anulowano?checkout_id={checkout['id']}"
        try:
            session = create_stripe_session(
                checkout_id=str(checkout["id"]),
                user=user,
                line_items=stripe_line_items(frozen, shipping),
                success_url=success_url,
                cancel_url=cancel_url,
            )
        except HTTPException:
            _rollback_checkout(str(checkout["id"]))
            raise
        except Exception as err:
            _rollback_checkout(str(checkout["id"]))
            print(f"[WARN] Stripe Checkout Session: {err}")
            raise HTTPException(status_code=502, detail="Nie udało się utworzyć sesji płatności Stripe.")

        session_id = _session_field(session, "id")
        session_url = _session_field(session, "url")
        payment_intent = _session_field(session, "payment_intent")
        if isinstance(payment_intent, dict):
            payment_intent = payment_intent.get("id")
        if not session_url:
            _rollback_checkout(str(checkout["id"]))
            raise HTTPException(status_code=502, detail="Stripe nie zwrócił adresu sesji.")

        conn2 = require_db()
        try:
            with conn2:
                with conn2.cursor() as cur:
                    cur.execute(
                        """
                        UPDATE checkouts
                        SET stripe_session_id = %s,
                            stripe_payment_intent_id = COALESCE(%s, stripe_payment_intent_id),
                            updated_at = NOW()
                        WHERE id = %s
                        RETURNING *
                        """,
                        (session_id, payment_intent, checkout["id"]),
                    )
                    checkout = dict(cur.fetchone())
                    lines = fetch_checkout_lines(cur, str(checkout["id"]))
        finally:
            conn2.close()

        return {
            "success": True,
            "url": session_url,
            "checkout": serialize_checkout(checkout, lines),
        }
    except HTTPException:
        raise
    except Exception as err:
        print(f"[WARN] create_checkout: {err}")
        raise HTTPException(status_code=500, detail="Nie udało się utworzyć zamówienia.")
    finally:
        conn.close()


def _rollback_checkout(checkout_id: str) -> None:
    conn = require_db()
    try:
        with conn:
            with conn.cursor() as cur:
                row = fetch_checkout(cur, checkout_id)
                if row:
                    restore_checkout_to_cart(cur, row)
    except Exception as err:
        print(f"[WARN] rollback checkout {checkout_id}: {err}")
    finally:
        conn.close()


@router.post("/cancel")
def cancel_checkout(payload: CancelPayload, user: AuthUser = Depends(get_current_user)):
    conn = require_db()
    try:
        with conn:
            with conn.cursor() as cur:
                checkout = None
                if payload.checkout_id:
                    checkout = fetch_checkout(cur, payload.checkout_id)
                    if not checkout or str(checkout.get("user_id")) != str(user.id):
                        raise HTTPException(status_code=404, detail="Zamówienie nie istnieje.")
                    result = restore_checkout_to_cart(cur, checkout)
                else:
                    restore_abandoned_checkouts(cur, user.id)
                    result = {"success": True, "restored": "abandoned"}
        result["success"] = True
        return result
    except HTTPException:
        raise
    except Exception as err:
        print(f"[WARN] cancel_checkout: {err}")
        raise HTTPException(status_code=500, detail="Nie udało się anulować płatności.")
    finally:
        conn.close()


@router.get("/{checkout_id}")
def get_checkout(checkout_id: str, user: AuthUser = Depends(get_current_user)):
    conn = require_db()
    try:
        with conn:
            with conn.cursor() as cur:
                checkout = fetch_checkout(cur, checkout_id)
                if not checkout or str(checkout.get("user_id")) != str(user.id):
                    raise HTTPException(status_code=404, detail="Zamówienie nie istnieje.")
                lines = fetch_checkout_lines(cur, checkout_id)
        return {"success": True, "checkout": serialize_checkout(checkout, lines)}
    except HTTPException:
        raise
    except Exception as err:
        print(f"[WARN] get_checkout: {err}")
        raise HTTPException(status_code=500, detail="Nie udało się pobrać zamówienia.")
    finally:
        conn.close()


@webhook_router.post("/stripe")
async def stripe_webhook(request: Request):
    payload = await request.body()
    signature = request.headers.get("stripe-signature") or request.headers.get("Stripe-Signature")
    event = construct_stripe_event(payload, signature)
    if hasattr(event, "to_dict"):
        event = event.to_dict()
    result = apply_stripe_event(event)
    # Placeholder: potwierdzenie e-mail (Resend) — poza zakresem tego MVP.
    return {"received": True, **result}
