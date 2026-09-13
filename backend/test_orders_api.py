"""
CRUD koszyka / zleceń na Railway Postgres + JWT Supabase.

Wymaga DATABASE_URL (albo TEST_DATABASE_URL) wskazującego na Postgres.
"""
import os
import time
from uuid import uuid4

import jwt
import pytest

TEST_SECRET = "test-jwt-secret-for-drukstacja"
os.environ.setdefault("SUPABASE_JWT_SECRET", TEST_SECRET)
os.environ.setdefault("SUPABASE_JWT_AUDIENCE", "authenticated")
if os.getenv("TEST_DATABASE_URL") and not os.getenv("DATABASE_URL"):
    os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]


def _has_database() -> bool:
    return bool(os.getenv("DATABASE_URL") or os.getenv("TEST_DATABASE_URL"))


pytestmark = pytest.mark.skipif(not _has_database(), reason="Brak DATABASE_URL / TEST_DATABASE_URL")


def make_token(user_id=None):
    return jwt.encode(
        {
            "sub": user_id or str(uuid4()),
            "aud": "authenticated",
            "role": "authenticated",
            "email": "tester@example.com",
            "exp": int(time.time()) + 3600,
        },
        TEST_SECRET,
        algorithm="HS256",
    )


@pytest.fixture(scope="module")
def client():
    from db_setup import setup_database
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from orders_api import router

    setup_database()
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


@pytest.fixture
def user_a():
    uid = str(uuid4())
    return uid, {"Authorization": f"Bearer {make_token(uid)}"}


@pytest.fixture
def user_b():
    uid = str(uuid4())
    return uid, {"Authorization": f"Bearer {make_token(uid)}"}


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


def test_unauthenticated_list_is_401(client):
    res = client.get("/api/orders")
    assert res.status_code == 401


def test_create_list_and_ignore_client_user_id(client, user_a):
    uid, headers = user_a
    res = client.post(
        "/api/orders",
        headers=headers,
        json={**cart_payload(), "user_id": str(uuid4())},
    )
    assert res.status_code == 200, res.text
    order = res.json()["order"]
    assert order["user_id"] == uid
    assert order["status"] == "in_cart"
    assert order["nozzle_size"] == "0.4"
    assert order["dimensions_mm"][0] == 40.5

    listed = client.get("/api/orders?status=in_cart", headers=headers)
    assert listed.status_code == 200
    ids = [row["id"] for row in listed.json()["orders"]]
    assert order["id"] in ids


def test_user_cannot_read_or_cancel_foreign_order(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b
    created = client.post("/api/orders", headers=headers_a, json=cart_payload()).json()["order"]

    assert client.get(f"/api/orders/{created['id']}", headers=headers_b).status_code == 404
    assert client.delete(f"/api/orders/{created['id']}", headers=headers_b).status_code == 404

    cancelled = client.delete(f"/api/orders/{created['id']}", headers=headers_a)
    assert cancelled.status_code == 200
    assert cancelled.json()["order"]["status"] == "cancelled"

    cart = client.get("/api/orders?status=in_cart", headers=headers_a).json()["orders"]
    assert created["id"] not in [row["id"] for row in cart]


def test_clear_cart_cancels_only_own_in_cart(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b
    first = client.post("/api/orders", headers=headers_a, json=cart_payload(file_name="a.stl")).json()["order"]
    second = client.post("/api/orders", headers=headers_a, json=cart_payload(file_name="b.stl")).json()["order"]
    other = client.post("/api/orders", headers=headers_b, json=cart_payload(file_name="c.stl")).json()["order"]

    cleared = client.post("/api/orders/clear-cart", headers=headers_a)
    assert cleared.status_code == 200
    cancelled_ids = set(cleared.json()["cancelled"])
    assert first["id"] in cancelled_ids
    assert second["id"] in cancelled_ids
    assert other["id"] not in cancelled_ids

    still = client.get("/api/orders?status=in_cart", headers=headers_b).json()["orders"]
    assert other["id"] in [row["id"] for row in still]


def test_rfq_allows_anonymous_and_does_not_trust_user_id(client, user_a):
    uid, headers = user_a
    anon = client.post(
        "/api/orders/rfq",
        json={
            "file_name": "[RFQ] pcb.pdf (RFQ)",
            "material": "Wycena Inżynierska: RFQ",
            "technology": "Wycena 24h: Jan (jan@example.com)",
            "layer_height": "Wg specyfikacji",
            "infill": 0,
            "quantity": 3,
            "total_price": 0,
            "dimensions_mm": [0, 0, 0],
            "user_id": str(uuid4()),
        },
    )
    assert anon.status_code == 200, anon.text
    assert anon.json()["order"]["status"] == "rfq_pending"
    assert anon.json()["order"]["user_id"] is None

    authed = client.post(
        "/api/orders/rfq",
        headers=headers,
        json={"file_name": "[RFQ] logged.pdf (RFQ)", "quantity": 1, "total_price": 0},
    )
    assert authed.status_code == 200
    assert authed.json()["order"]["user_id"] == uid


def test_client_cannot_set_shipped_status(client, user_a):
    _, headers = user_a
    created = client.post(
        "/api/orders",
        headers=headers,
        json=cart_payload(status="shipped"),
    )
    assert created.status_code == 400

    order = client.post("/api/orders", headers=headers, json=cart_payload()).json()["order"]
    patched = client.patch(
        f"/api/orders/{order['id']}",
        headers=headers,
        json={"status": "shipped"},
    )
    assert patched.status_code == 400
