"""
Stabilne kategorie sklepu (/sklep).

`products.category` trzyma slug, nie polską etykietę.
Odznaki BESTSELLER / NOWY / PROMO są osobnym polem `badge`.
Gotowe printy = na razie wyłącznie zabawki użytkowe
(bez litofanów, tabliczek i ozdób).
"""
from __future__ import annotations

from typing import Any

SHOP_CATEGORIES: list[dict[str, str]] = [
    {
        "slug": "materialy",
        "label": "Materiały",
        "hint": "filament, kleje (Magigoo), spraye, taśmy",
    },
    {
        "slug": "hardware",
        "label": "Hardware",
        "hint": "wkładki mosiężne, śruby, magnesy",
    },
    {
        "slug": "narzedzia",
        "label": "Narzędzia",
        "hint": "gratowniki, szczypce i obróbka",
    },
    {
        "slug": "gotowe-printy",
        "label": "Gotowe printy",
        "hint": "zabawki użytkowe",
    },
    {
        "slug": "akcesoria",
        "label": "Akcesoria",
        "hint": "stoły, dysze, organizery",
    },
]

SHOP_CATEGORY_SLUGS = {item["slug"] for item in SHOP_CATEGORIES}
SHOP_CATEGORY_BY_SLUG = {item["slug"]: item for item in SHOP_CATEGORIES}

# Seed z poprzedniego mocka /sklep — stałe mapowanie SKU → slug.
SKU_CATEGORY: dict[str, str] = {
    "sku_brass_inserts": "hardware",
    "sku_pla_jet_black": "materialy",
    "sku_magigoo_original": "materialy",
    "sku_deburring_tool": "narzedzia",
}

# Stare etykiety UI i warianty pisowni → slug.
CATEGORY_ALIASES: dict[str, str] = {
    "akcesoria dfm": "hardware",
    "filamenty": "materialy",
    "chemia warsztatowa": "materialy",
    "narzędzia": "narzedzia",
    "narzedzia": "narzedzia",
    "materiały": "materialy",
    "materialy": "materialy",
    "hardware": "hardware",
    "gotowe printy": "gotowe-printy",
    "gotowe-printy": "gotowe-printy",
    "akcesoria": "akcesoria",
    "zabawki użytkowe": "gotowe-printy",
    "zabawki uzytkowe": "gotowe-printy",
}


def normalize_category_slug(value: str | None, sku: str | None = None) -> str | None:
    """Zwraca kanoniczny slug albo None, gdy wartość nie należy do katalogu."""
    if sku and sku in SKU_CATEGORY:
        return SKU_CATEGORY[sku]
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    if raw in SHOP_CATEGORY_SLUGS:
        return raw
    return CATEGORY_ALIASES.get(raw.lower())


def parse_category_filter(value: str | None) -> str | None:
    """Pusty filtr → None. Nieznana kategoria → ValueError."""
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    slug = normalize_category_slug(raw)
    if slug not in SHOP_CATEGORY_SLUGS:
        raise ValueError(raw)
    return slug


def category_label(slug: str | None) -> str:
    if not slug:
        return "Sklep"
    meta = SHOP_CATEGORY_BY_SLUG.get(slug)
    return meta["label"] if meta else str(slug)


def category_hint(slug: str | None) -> str | None:
    meta = SHOP_CATEGORY_BY_SLUG.get(slug or "")
    return meta["hint"] if meta else None


def build_category_counts(products: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts = {item["slug"]: 0 for item in SHOP_CATEGORIES}
    for item in products:
        if not item.get("active"):
            continue
        slug = normalize_category_slug(item.get("category"), sku=item.get("sku"))
        if slug in counts:
            counts[slug] += 1
    return [
        {
            "slug": meta["slug"],
            "label": meta["label"],
            "hint": meta["hint"],
            "count": counts[meta["slug"]],
        }
        for meta in SHOP_CATEGORIES
    ]
