"""
Katalog sklepu i dodawanie SKU do koszyka (ta sama tabela orders).

GET  /api/products              publiczna lista aktywnych produktów
GET  /api/products/{id}         publiczny detal (id albo sku)
POST /api/products/{id}/cart    JWT — linia in_cart typu shop_sku
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import AuthUser, get_current_user
from db import get_db_connection
from orders_api import require_db, serialize_order

router = APIRouter(prefix="/api/products", tags=["products"])

SHOP_SKU_TECHNOLOGY = "shop_sku"


class AddToCartBody(BaseModel):
    quantity: int = Field(default=1, ge=1, le=99)


def serialize_product(row: Any) -> dict:
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
    if item.get("price") is not None:
        item["price"] = float(item["price"])
    item.setdefault("currency", "PLN")
    item.setdefault("active", True)
    item.setdefault("in_stock", True)
    if item.get("stock") is None:
        item["stock"] = 0
    item["stock"] = int(item["stock"])
    return item


def _seed_products() -> list[dict]:
    from db_setup import SEED_PRODUCTS

    return [serialize_product(item) for item in SEED_PRODUCTS]


def fetch_product(cur, product_id: str) -> dict | None:
    cur.execute(
        """
        SELECT * FROM products
        WHERE id = %s OR sku = %s
        LIMIT 1
        """,
        (product_id, product_id),
    )
    row = cur.fetchone()
    return serialize_product(row) if row else None


def _lookup_seed_product(product_id: str) -> dict | None:
    for item in _seed_products():
        if item.get("id") == product_id or item.get("sku") == product_id:
            return item
    return None


@router.get("")
def list_products():
    """Aktywne produkty sklepu. Bez JWT. Fallback do seedu gdy brak DATABASE_URL."""
    conn = get_db_connection()
    if conn:
        try:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT *
                        FROM products
                        WHERE active = true
                        ORDER BY name ASC
                        """
                    )
                    rows = cur.fetchall() or []
            return {
                "success": True,
                "source": "database",
                "products": [serialize_product(row) for row in rows],
            }
        except Exception as err:
            print(f"[WARN] list_products: {err}")
        finally:
            conn.close()

    return {
        "success": True,
        "source": "fallback",
        "products": [item for item in _seed_products() if item.get("active")],
    }


@router.get("/{product_id}")
def get_product(product_id: str):
    conn = get_db_connection()
    if conn:
        try:
            with conn:
                with conn.cursor() as cur:
                    product = fetch_product(cur, product_id)
            if product and product.get("active"):
                return {"success": True, "source": "database", "product": product}
            if product and not product.get("active"):
                raise HTTPException(status_code=404, detail="Produkt nie jest dostępny.")
        except HTTPException:
            raise
        except Exception as err:
            print(f"[WARN] get_product: {err}")
        finally:
            conn.close()

    product = _lookup_seed_product(product_id)
    if product and product.get("active"):
        return {"success": True, "source": "fallback", "product": product}
    raise HTTPException(status_code=404, detail="Produkt nie istnieje.")


@router.post("/{product_id}/cart")
def add_product_to_cart(
    product_id: str,
    payload: AddToCartBody,
    user: AuthUser = Depends(get_current_user),
):
    """
    Tworzy (albo zwiększa) linię orders in_cart.

    Metadane sklepu bez nowej kolumny:
      technology   = shop_sku
      file_name    = nazwa produktu
      material     = kategoria
      layer_height = sku
    Cena zawsze z tabeli products (klient nie ustawia total_price).
    """
    quantity = int(payload.quantity)
    conn = require_db()
    try:
        with conn:
            with conn.cursor() as cur:
                product = fetch_product(cur, product_id)
                if not product:
                    raise HTTPException(status_code=404, detail="Produkt nie istnieje.")
                if not product.get("active"):
                    raise HTTPException(status_code=409, detail="Produkt nie jest już w sprzedaży.")
                if not product.get("in_stock") or int(product.get("stock") or 0) <= 0:
                    raise HTTPException(status_code=409, detail="Produkt jest obecnie niedostępny.")

                sku = product["sku"]
                unit_price = float(product["price"])
                stock = int(product["stock"])

                cur.execute(
                    """
                    SELECT * FROM orders
                    WHERE user_id::text = %s
                      AND status = 'in_cart'
                      AND technology = %s
                      AND layer_height = %s
                    LIMIT 1
                    FOR UPDATE
                    """,
                    (user.id, SHOP_SKU_TECHNOLOGY, sku),
                )
                existing = cur.fetchone()
                if existing:
                    new_qty = int(existing["quantity"] or 0) + quantity
                    if new_qty > stock:
                        raise HTTPException(
                            status_code=409,
                            detail=f"Niewystarczający stan magazynowy (dostępne: {stock} szt.).",
                        )
                    cur.execute(
                        """
                        UPDATE orders
                        SET quantity = %s,
                            total_price = %s,
                            file_name = %s,
                            material = %s,
                            updated_at = NOW()
                        WHERE id = %s
                        RETURNING *
                        """,
                        (
                            new_qty,
                            round(unit_price * new_qty, 2),
                            product["name"],
                            product.get("category") or "Sklep",
                            existing["id"],
                        ),
                    )
                    row = cur.fetchone()
                    return {"success": True, "order": serialize_order(row), "merged": True}

                if quantity > stock:
                    raise HTTPException(
                        status_code=409,
                        detail=f"Niewystarczający stan magazynowy (dostępne: {stock} szt.).",
                    )

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
                        user.id,
                        product["name"],
                        product.get("category") or "Sklep",
                        SHOP_SKU_TECHNOLOGY,
                        sku,
                        0,
                        False,
                        False,
                        quantity,
                        round(unit_price * quantity, 2),
                        None,
                        "in_cart",
                        None,
                        None,
                    ),
                )
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=500, detail="Nie udało się dodać produktu do koszyka.")
                return {"success": True, "order": serialize_order(row), "merged": False}
    except HTTPException:
        raise
    except Exception as err:
        print(f"[WARN] add_product_to_cart: {err}")
        raise HTTPException(status_code=500, detail="Nie udało się dodać produktu do koszyka.")
    finally:
        conn.close()
