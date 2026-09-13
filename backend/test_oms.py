"""
OMS MVP: checkout (mock Stripe), webhook paid→in_queue, admin authz.

Wymaga DATABASE_URL albo TEST_DATABASE_URL.
"""
import os
import time
from uuid import uuid4

import jwt
import pytest

TEST_SECRET = "test-jwt-secret-for-drukstacja"
os.environ.setdefault("SUPABASE_JWT_SECRET", TEST_SECRET)
os.environ.setdefault("SUPABASE_JWT_AUDIENCE", "authenticated")
os.environ.setdefault("STRIPE_SECRET_KEY", "sk_test_oms_dummy")
os.environ.setdefault("STRIPE_WEBHOOK_SECRET", "whsec_test_oms")
os.environ.setdefault("NEXT_PUBLIC_SITE_URL", "http://localhost:3000")
os.environ.setdefault("ADMIN_EMAILS", "admin@drukstacja.pl")
os.environ.setdefault("SHIPPING_AMOUNT_PLN", "0")
os.environ.setdefault("MIN_ORDER_PLN", "30")
if os.getenv("TEST_DATABASE_URL") and not os.getenv("DATABASE_URL"):
    os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]


def _has_database() -> bool:
    return bool(os.getenv("DATABASE_URL") or os.getenv("TEST_DATABASE_URL"))


pytestmark = pytest.mark.skipif(not _has_database(), reason="Brak DATABASE_URL / TEST_DATABASE_URL")


def make_token(user_id=None, email="tester@example.com"):
    return jwt.encode(
        {
            "sub": user_id or str(uuid4()),
            "aud": "authenticated",
            "role": "authenticated",
            "email": email,
            "exp": int(time.time()) + 3600,
        },
        TEST_SECRET,
        algorithm="HS256",
    )


class FakeStripeSession:
    def __init__(self, checkout_id):
        self.id = f"cs_test_{checkout_id[:8]}"
        self.url = f"https://checkout.stripe.com/c/pay/{self.id}"
        self.payment_intent = f"pi_test_{checkout_id[:8]}"


@pytest.fixture(scope="module")
def client():
    from db_setup import setup_database
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from admin_api import router as admin_router
    from checkout_api import router as checkout_router, webhook_router
    from orders_api import router as orders_router
    from products_api import router as products_router

    setup_database()
    app = FastAPI()
    app.include_router(orders_router)
    app.include_router(products_router)
    app.include_router(checkout_router)
    app.include_router(webhook_router)
    app.include_router(admin_router)
    return TestClient(app)


@pytest.fixture
def user_a():
    uid = str(uuid4())
    return uid, {"Authorization": f"Bearer {make_token(uid)}"}


@pytest.fixture
def admin_user():
    uid = str(uuid4())
    return uid, {"Authorization": f"Bearer {make_token(uid, email='admin@drukstacja.pl')}"}


def cart_payload(**overrides):
    body = {
        "file_name": "cube.stl",
        "material": "PLA (Czysta Biel)",
        "technology": "FDM Precision 0.4mm",
        "layer_height": "0.20 mm",
        "infill": 20,
        "clean_supports": True,
        "brass_inserts": False,
        "quantity": 2,
        "total_price": 42.5,
        "dimensions_mm": [40.5, 20, 10],
        "status": "in_cart",
        "nozzle_size": "0.4",
    }
    body.update(overrides)
    return body


def address_payload(**overrides):
    body = {
        "name": "Jan Kowalski",
        "phone": "500600700",
        "street": "Testowa 1",
        "city": "Warszawa",
        "postal_code": "00-001",
        "country": "PL",
        "company": "Booorgi Sp. z o.o.",
        "nip": "5252345678",
    }
    body.update(overrides)
    return body


def test_webhook_http_accepts_mocked_signature(client, monkeypatch):
    monkeypatch.setattr(
        "checkout_api.construct_stripe_event",
        lambda payload, sig: {"type": "ping", "data": {"object": {}}},
    )
    res = client.post(
        "/api/webhooks/stripe",
        content=b"{}",
        headers={"stripe-signature": "t=1,v1=test"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["received"] is True
    assert body["handled"] is False


def test_checkout_requires_jwt(client):
    res = client.post("/api/checkout", json=address_payload())
    assert res.status_code == 401


def test_create_checkout_freezes_cart_and_returns_stripe_url(client, user_a, monkeypatch):
    uid, headers = user_a
    print_line = client.post("/api/orders", headers=headers, json=cart_payload()).json()["order"]
    shop = client.post(
        "/api/products/sku_brass_inserts/cart",
        headers=headers,
        json={"quantity": 1},
    )
    assert shop.status_code == 200, shop.text
    shop_line = shop.json()["order"]
    assert shop_line["technology"] == "shop_sku"

    captured = {}

    def fake_session(**kwargs):
        captured.update(kwargs)
        return FakeStripeSession(kwargs["checkout_id"])

    monkeypatch.setattr("checkout_api.create_stripe_session", fake_session)

    res = client.post("/api/checkout", headers=headers, json=address_payload())
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["success"] is True
    assert body["url"].startswith("https://checkout.stripe.com/")
    checkout = body["checkout"]
    assert checkout["user_id"] == uid
    assert checkout["payment_status"] == "pending"
    assert checkout["production_status"] == "pending_payment"
    assert checkout["shipping_city"] == "Warszawa"
    assert checkout["shipping_country"] == "PL"
    assert checkout["nip"] == "5252345678"
    assert checkout["shipping"] == 0
    assert checkout["total"] >= 30
    line_ids = {row["id"] for row in checkout["lines"]}
    assert print_line["id"] in line_ids
    assert shop_line["id"] in line_ids
    assert all(row["status"] == "pending_payment" for row in checkout["lines"])
    assert captured["line_items"]
    currencies = {item["price_data"]["currency"] for item in captured["line_items"]}
    assert currencies == {"pln"}

    cart = client.get("/api/orders?status=in_cart", headers=headers).json()["orders"]
    assert cart == []
    pending = client.get("/api/orders?status=pending_payment", headers=headers).json()["orders"]
    assert {row["id"] for row in pending} == line_ids


def test_checkout_rejects_empty_cart(client, user_a, monkeypatch):
    _, headers = user_a
    monkeypatch.setattr("checkout_api.create_stripe_session", lambda **kwargs: FakeStripeSession("x"))
    res = client.post("/api/checkout", headers=headers, json=address_payload())
    assert res.status_code == 400
    assert "pusty" in res.json()["detail"].lower()


def test_webhook_marks_paid_and_is_idempotent(client, user_a, monkeypatch):
    _, headers = user_a
    client.post("/api/orders", headers=headers, json=cart_payload()).json()
    monkeypatch.setattr("checkout_api.create_stripe_session", lambda **kwargs: FakeStripeSession(kwargs["checkout_id"]))
    created = client.post("/api/checkout", headers=headers, json=address_payload()).json()["checkout"]
    checkout_id = created["id"]
    session_id = created["stripe_session_id"]

    from checkout_api import apply_stripe_event

    event = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": session_id,
                "client_reference_id": checkout_id,
                "metadata": {"checkout_id": checkout_id},
                "payment_intent": "pi_test_webhook",
            }
        },
    }
    first = apply_stripe_event(event)
    assert first["handled"] is True
    assert first["payment_status"] == "paid"
    assert first["production_status"] == "in_queue"

    second = apply_stripe_event(event)
    assert second["handled"] is True
    assert second["payment_status"] == "paid"
    assert second["production_status"] == "in_queue"

    detail = client.get(f"/api/checkout/{checkout_id}", headers=headers).json()["checkout"]
    assert detail["payment_status"] == "paid"
    assert detail["production_status"] == "in_queue"
    assert detail["stripe_payment_intent_id"] == "pi_test_webhook"
    assert all(line["status"] == "in_queue" for line in detail["lines"])


def test_payment_intent_succeeded_marks_paid(client, user_a, monkeypatch):
    _, headers = user_a
    client.post("/api/orders", headers=headers, json=cart_payload()).json()
    monkeypatch.setattr("checkout_api.create_stripe_session", lambda **kwargs: FakeStripeSession(kwargs["checkout_id"]))
    created = client.post("/api/checkout", headers=headers, json=address_payload()).json()["checkout"]

    from checkout_api import apply_stripe_event

    result = apply_stripe_event(
        {
            "type": "payment_intent.succeeded",
            "data": {
                "object": {
                    "id": "pi_from_intent",
                    "metadata": {"checkout_id": created["id"]},
                }
            },
        }
    )
    assert result["handled"] is True
    assert result["production_status"] == "in_queue"


def test_admin_authz_and_status_transition(client, user_a, admin_user, monkeypatch):
    _, user_headers = user_a
    _, admin_headers = admin_user

    assert client.get("/api/admin/checkouts").status_code == 401
    assert client.get("/api/admin/checkouts", headers=user_headers).status_code == 403

    client.post("/api/orders", headers=user_headers, json=cart_payload(file_name="farm.stl")).json()
    monkeypatch.setattr("checkout_api.create_stripe_session", lambda **kwargs: FakeStripeSession(kwargs["checkout_id"]))
    created = client.post("/api/checkout", headers=user_headers, json=address_payload()).json()["checkout"]

    listed_before_pay = client.get("/api/admin/checkouts", headers=admin_headers)
    assert listed_before_pay.status_code == 200
    pending_ids = {row["id"] for row in listed_before_pay.json()["checkouts"]}
    assert created["id"] not in pending_ids

    from checkout_api import apply_stripe_event

    apply_stripe_event(
        {
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": created["stripe_session_id"],
                    "metadata": {"checkout_id": created["id"]},
                    "payment_intent": "pi_admin",
                }
            },
        }
    )

    listed = client.get("/api/admin/checkouts", headers=admin_headers)
    assert listed.status_code == 200
    found = next(row for row in listed.json()["checkouts"] if row["id"] == created["id"])
    assert found["production_status"] == "in_queue"
    assert found["lines"]

    skip = client.patch(
        f"/api/admin/checkouts/{created['id']}",
        headers=admin_headers,
        json={"production_status": "shipped"},
    )
    assert skip.status_code == 409

    forbidden = client.patch(
        f"/api/admin/checkouts/{created['id']}",
        headers=user_headers,
        json={"production_status": "in_production"},
    )
    assert forbidden.status_code == 403

    advanced = client.patch(
        f"/api/admin/checkouts/{created['id']}",
        headers=admin_headers,
        json={"production_status": "in_production"},
    )
    assert advanced.status_code == 200, advanced.text
    assert advanced.json()["checkout"]["production_status"] == "in_production"
    assert all(line["status"] == "in_production" for line in advanced.json()["checkout"]["lines"])

    again = client.patch(
        f"/api/admin/checkouts/{created['id']}",
        headers=admin_headers,
        json={"production_status": "post_processing"},
    )
    assert again.status_code == 200
    shipped = client.patch(
        f"/api/admin/checkouts/{created['id']}",
        headers=admin_headers,
        json={"production_status": "shipped"},
    )
    assert shipped.status_code == 200
    assert shipped.json()["checkout"]["production_status"] == "shipped"


def test_cancel_restores_cart(client, user_a, monkeypatch):
    _, headers = user_a
    order = client.post("/api/orders", headers=headers, json=cart_payload()).json()["order"]
    monkeypatch.setattr("checkout_api.create_stripe_session", lambda **kwargs: FakeStripeSession(kwargs["checkout_id"]))
    created = client.post("/api/checkout", headers=headers, json=address_payload()).json()["checkout"]

    cancelled = client.post(
        "/api/checkout/cancel",
        headers=headers,
        json={"checkout_id": created["id"]},
    )
    assert cancelled.status_code == 200
    cart = client.get("/api/orders?status=in_cart", headers=headers).json()["orders"]
    assert order["id"] in [row["id"] for row in cart]
