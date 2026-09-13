"""
Katalog sklepu + dodanie SKU do koszyka (orders.in_cart, technology=shop_sku).
"""
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
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


@pytest.fixture
def catalog_client(monkeypatch):
    # Nie ruszamy DATABASE_URL — inne testy w sesji korzystają z tej samej env.
    monkeypatch.setattr("products_api.get_db_connection", lambda: None)

    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from products_api import router

    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


@pytest.fixture(scope="module")
def db_client():
    if not _has_database():
        pytest.skip("Brak DATABASE_URL / TEST_DATABASE_URL")
    from db_setup import setup_database
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from orders_api import router as orders_router
    from products_api import router as products_router

    setup_database()
    app = FastAPI()
    app.include_router(orders_router)
    app.include_router(products_router)
    return TestClient(app)


@pytest.fixture
def user_headers():
    uid = str(uuid4())
    return uid, {"Authorization": f"Bearer {make_token(uid)}"}


def test_public_catalog_uses_seed_without_db(catalog_client):
    res = catalog_client.get("/api/products")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["success"] is True
    assert body["source"] == "fallback"
    skus = {item["sku"] for item in body["products"]}
    assert "sku_brass_inserts" in skus
    assert "sku_pla_jet_black" in skus
    assert "sku_magigoo_original" in skus
    assert "sku_deburring_tool" in skus
    brass = next(item for item in body["products"] if item["sku"] == "sku_brass_inserts")
    assert brass["price"] == 49.0
    assert brass["currency"] == "PLN"
    assert brass["in_stock"] is True
    assert brass["category"] == "hardware"
    assert brass["category_label"] == "Hardware"
    assert brass["badge"] == "Bestseller"
    pla = next(item for item in body["products"] if item["sku"] == "sku_pla_jet_black")
    magigoo = next(item for item in body["products"] if item["sku"] == "sku_magigoo_original")
    tool = next(item for item in body["products"] if item["sku"] == "sku_deburring_tool")
    assert pla["category"] == "materialy"
    assert magigoo["category"] == "materialy"
    assert tool["category"] == "narzedzia"
    slugs = {item["slug"] for item in body["categories"]}
    assert slugs == {"materialy", "hardware", "narzedzia", "gotowe-printy", "akcesoria"}
    counts = {item["slug"]: item["count"] for item in body["categories"]}
    assert counts["hardware"] == 1
    assert counts["materialy"] == 2
    assert counts["narzedzia"] == 1
    assert counts["gotowe-printy"] == 0
    assert counts["akcesoria"] == 0
    gotowe = next(item for item in body["categories"] if item["slug"] == "gotowe-printy")
    assert gotowe["hint"] == "zabawki użytkowe"


def test_public_product_get_by_sku(catalog_client):
    res = catalog_client.get("/api/products/sku_magigoo_original")
    assert res.status_code == 200
    product = res.json()["product"]
    assert product["name"].startswith("Klej adhezyjny Magigoo")
    assert product["price"] == 65.0


def test_public_product_missing_is_404(catalog_client):
    assert catalog_client.get("/api/products/sku_does_not_exist").status_code == 404


def test_add_to_cart_requires_jwt(catalog_client):
    res = catalog_client.post("/api/products/sku_brass_inserts/cart", json={"quantity": 1})
    assert res.status_code == 401


def test_add_to_cart_creates_shop_sku_line(db_client, user_headers):
    uid, headers = user_headers
    res = db_client.post(
        "/api/products/sku_brass_inserts/cart",
        headers=headers,
        json={"quantity": 2},
    )
    assert res.status_code == 200, res.text
    order = res.json()["order"]
    assert order["user_id"] == uid
    assert order["status"] == "in_cart"
    assert order["technology"] == "shop_sku"
    assert order["file_name"].startswith("Zestaw Wkładek")
    assert order["material"] == "hardware"
    assert order["layer_height"] == "sku_brass_inserts"
    assert order["quantity"] == 2
    assert order["total_price"] == 98.0
    assert res.json()["merged"] is False

    listed = db_client.get("/api/orders?status=in_cart", headers=headers)
    assert listed.status_code == 200
    ids = [row["id"] for row in listed.json()["orders"]]
    assert order["id"] in ids


def test_add_to_cart_merges_same_sku(db_client, user_headers):
    _, headers = user_headers
    first = db_client.post(
        "/api/products/sku_deburring_tool/cart",
        headers=headers,
        json={"quantity": 1},
    )
    assert first.status_code == 200, first.text
    second = db_client.post(
        "/api/products/sku_deburring_tool/cart",
        headers=headers,
        json={"quantity": 1},
    )
    assert second.status_code == 200, second.text
    assert second.json()["merged"] is True
    order = second.json()["order"]
    assert order["id"] == first.json()["order"]["id"]
    assert order["quantity"] == 2
    assert order["total_price"] == 70.0
    assert order["technology"] == "shop_sku"


def test_add_to_cart_rejects_client_price(db_client, user_headers):
    _, headers = user_headers
    res = db_client.post(
        "/api/products/sku_pla_jet_black/cart",
        headers=headers,
        json={"quantity": 1, "total_price": 1.0, "price": 1.0},
    )
    assert res.status_code == 200, res.text
    assert res.json()["order"]["total_price"] == 79.0


def test_add_to_cart_unknown_sku_is_404(db_client, user_headers):
    _, headers = user_headers
    res = db_client.post(
        "/api/products/sku_does_not_exist/cart",
        headers=headers,
        json={"quantity": 1},
    )
    assert res.status_code == 404


def test_shop_line_does_not_break_print_line_list(db_client, user_headers):
    _, headers = user_headers
    print_line = db_client.post(
        "/api/orders",
        headers=headers,
        json={
            "file_name": "cube.stl",
            "material": "PLA",
            "technology": "FDM Precision 0.4mm",
            "layer_height": "0.20 mm",
            "quantity": 1,
            "total_price": 42.5,
            "status": "in_cart",
        },
    )
    assert print_line.status_code == 200, print_line.text
    shop = db_client.post(
        "/api/products/sku_magigoo_original/cart",
        headers=headers,
        json={"quantity": 1},
    )
    assert shop.status_code == 200, shop.text

    cart = db_client.get("/api/orders?status=in_cart", headers=headers).json()["orders"]
    kinds = {row["technology"] for row in cart}
    assert "shop_sku" in kinds
    assert "FDM Precision 0.4mm" in kinds


def test_filter_by_category_hardware(catalog_client):
    res = catalog_client.get("/api/products?category=hardware")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["category"] == "hardware"
    assert {item["sku"] for item in body["products"]} == {"sku_brass_inserts"}
    assert body["products"][0]["badge"] == "Bestseller"
    counts = {item["slug"]: item["count"] for item in body["categories"]}
    assert counts["hardware"] == 1
    assert counts["materialy"] == 2


def test_filter_by_legacy_label_narzedzia(catalog_client):
    res = catalog_client.get("/api/products?category=Narzędzia")
    assert res.status_code == 200
    body = res.json()
    assert body["category"] == "narzedzia"
    assert {item["sku"] for item in body["products"]} == {"sku_deburring_tool"}


def test_filter_gotowe_printy_is_empty(catalog_client):
    res = catalog_client.get("/api/products?category=gotowe-printy")
    assert res.status_code == 200
    body = res.json()
    assert body["category"] == "gotowe-printy"
    assert body["products"] == []
    gotowe = next(item for item in body["categories"] if item["slug"] == "gotowe-printy")
    assert gotowe["count"] == 0
    assert gotowe["label"] == "Gotowe printy"
    assert gotowe["hint"] == "zabawki użytkowe"


def test_unknown_category_is_400(catalog_client):
    res = catalog_client.get("/api/products?category=litofany")
    assert res.status_code == 400
    assert "kategor" in res.json()["detail"].lower()


def test_ensure_products_on_startup_without_db(monkeypatch):
    monkeypatch.setattr("db.get_db_connection", lambda *args, **kwargs: None)
    from db_setup import ensure_products_on_startup

    assert ensure_products_on_startup() is False


def test_ensure_products_on_startup_survives_errors(monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("postgres refused connection")

    monkeypatch.setattr("db.get_db_connection", boom)
    from db_setup import ensure_products_on_startup

    assert ensure_products_on_startup() is False


def test_lifespan_keeps_api_up_when_db_unavailable(monkeypatch):
    monkeypatch.setattr("db.get_db_connection", lambda *args, **kwargs: None)
    from db_setup import ensure_products_on_startup
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from products_api import router

    @asynccontextmanager
    async def lifespan(_app):
        assert ensure_products_on_startup() is False
        yield

    app = FastAPI(lifespan=lifespan)
    app.include_router(router)
    with TestClient(app) as client:
        res = client.get("/api/products")
        assert res.status_code == 200
        body = res.json()
        assert body["source"] == "fallback"
        assert {item["sku"] for item in body["products"]} == {
            "sku_brass_inserts",
            "sku_pla_jet_black",
            "sku_magigoo_original",
            "sku_deburring_tool",
        }


def test_dockerfile_runs_db_setup_before_uvicorn_and_keeps_port():
    dockerfile = Path(__file__).with_name("Dockerfile").read_text()
    assert "python db_setup.py && uvicorn main:app" in dockerfile
    assert "${PORT:-8080}" in dockerfile
    assert "EXPOSE 8080" in dockerfile


@pytest.mark.skipif(not _has_database(), reason="Brak DATABASE_URL / TEST_DATABASE_URL")
def test_ensure_products_then_catalog_source_is_database():
    from db_setup import ensure_products_on_startup
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from products_api import router

    assert ensure_products_on_startup() is True

    @asynccontextmanager
    async def lifespan(_app):
        assert ensure_products_on_startup() is True
        yield

    app = FastAPI(lifespan=lifespan)
    app.include_router(router)
    with TestClient(app) as client:
        res = client.get("/api/products")
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["source"] == "database"
        skus = {item["sku"] for item in body["products"]}
        assert skus >= {
            "sku_brass_inserts",
            "sku_pla_jet_black",
            "sku_magigoo_original",
            "sku_deburring_tool",
        }
        categories = {item["sku"]: item["category"] for item in body["products"]}
        assert categories["sku_brass_inserts"] == "hardware"
        assert categories["sku_pla_jet_black"] == "materialy"
        assert categories["sku_magigoo_original"] == "materialy"
        assert categories["sku_deburring_tool"] == "narzedzia"
        slugs = {item["slug"] for item in body["categories"]}
        assert slugs == {"materialy", "hardware", "narzedzia", "gotowe-printy", "akcesoria"}

        filtered = client.get("/api/products?category=hardware")
        assert filtered.status_code == 200
        assert {item["sku"] for item in filtered.json()["products"]} == {"sku_brass_inserts"}
        assert filtered.json()["source"] == "database"


@pytest.mark.skipif(not _has_database(), reason="Brak DATABASE_URL / TEST_DATABASE_URL")
def test_ensure_products_is_idempotent_and_remaps_legacy_labels():
    from db import get_db_connection
    from db_setup import ensure_products_on_startup, ensure_products_schema

    assert ensure_products_on_startup() is True
    conn = get_db_connection()
    assert conn is not None
    try:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE products
                SET category = 'Akcesoria DFM', updated_at = NOW()
                WHERE sku = 'sku_brass_inserts'
                """
            )
            first = ensure_products_schema(cur)
            second = ensure_products_schema(cur)
            cur.execute(
                "SELECT category FROM products WHERE sku = %s",
                ("sku_brass_inserts",),
            )
            row = cur.fetchone()
            category = row["category"] if isinstance(row, dict) else row[0]
    finally:
        conn.close()

    assert first["count"] >= 4
    assert second["count"] == first["count"]
    assert second["available"] == first["available"]
    assert category == "hardware"
