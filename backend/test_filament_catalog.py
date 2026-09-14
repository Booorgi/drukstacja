"""Katalog Sunlu: rodziny, stawki zł/kg (tylko kalkulator), seed idempotentny."""
from filament_catalog import (
    FAMILIES,
    get_material_rate_per_g,
    public_filament_row,
    seed_filaments,
    studio_materials,
)


def test_pla_is_family_not_wood_rainbow_top_level():
    family_ids = [f["id"] for f in FAMILIES]
    assert family_ids[0] == "PLA"
    assert "PLA_WOOD" not in family_ids
    assert "Wood" not in family_ids
    assert "Rainbow" not in family_ids
    assert "Galaxy" not in family_ids
    pla = next(f for f in FAMILIES if f["id"] == "PLA")
    assert pla["pickerTitle"] == "Wybierz rodzaj PLA"
    subtype_ids = [s["id"] for s in pla["subtypes"]]
    assert subtype_ids == [
        "PLA_STANDARD",
        "PLA_WOOD",
        "PLA_SILK_DUAL",
        "PLA_TRI",
        "PLA_GALAXY",
        "PLA_RAINBOW",
    ]


def test_sunlu_pla_has_32_colors_and_45_pln_kg():
    pla = next(f for f in FAMILIES if f["id"] == "PLA")
    standard = next(s for s in pla["subtypes"] if s["id"] == "PLA_STANDARD")
    assert standard["pricePerKg"] == 45
    assert standard["ratePerG"] == 0.045
    assert len(standard["colors"]) == 32
    names = {c["name"].lower() for c in standard["colors"]}
    assert "beige" in names
    assert "midnight" in names
    assert "transparent purple" in names


def test_kg_rates_drive_quote_calculator():
    assert get_material_rate_per_g("PLA") == 0.045
    assert get_material_rate_per_g("PLA_STANDARD") == 0.045
    assert get_material_rate_per_g("PLA Tough") == 0.045
    assert get_material_rate_per_g("PLA Wood") == 0.065
    assert get_material_rate_per_g("PLA_GALAXY") == 0.075
    assert get_material_rate_per_g("PLA_RAINBOW") == 0.075
    assert get_material_rate_per_g("PETG") == 0.06
    assert get_material_rate_per_g("PETG_FR") == 0.234
    assert get_material_rate_per_g("PA12_CF") == 0.359
    assert get_material_rate_per_g("PA6_CF") == 0.225
    assert get_material_rate_per_g("ABS_GF") == 0.09
    assert get_material_rate_per_g("PC") == 0.158


def test_public_filament_row_hides_wholesale_prices():
    row = seed_filaments()[0]
    assert "price_per_kg" in row
    public = public_filament_row(row)
    assert "price_per_kg" not in public
    assert "price_per_cm3" not in public
    assert "rate_per_g" not in public
    assert public["family"] == "PLA"
    assert public["name"]


def test_seed_filaments_is_idempotent_unique_ids():
    first = seed_filaments()
    second = seed_filaments()
    assert first == second
    ids = [row["id"] for row in first]
    assert len(ids) == len(set(ids))
    assert len(first) >= 100
    assert all(row["in_stock"] is True for row in first)


def test_public_filaments_api_omits_prices():
    from fastapi.testclient import TestClient
    import main

    client = TestClient(main.app)
    response = client.get("/api/filaments")
    assert response.status_code == 200
    payload = response.json()
    assert payload.get("success") is True
    filaments = payload.get("filaments") or []
    assert len(filaments) >= 100
    for item in filaments[:20]:
        assert "price_per_kg" not in item
        assert "price_per_cm3" not in item
    types = {item.get("type") or item.get("family") for item in filaments}
    assert "PLA" in types
    assert "PLA Wood" not in types


def test_studio_materials_are_subtypes_not_families():
    ids = [m["id"] for m in studio_materials()]
    assert "PLA_STANDARD" in ids
    assert "PLA_WOOD" in ids
    assert ids.count("PLA") == 0
    pla_std = next(m for m in studio_materials() if m["id"] == "PLA_STANDARD")
    assert pla_std["familyId"] == "PLA"
    assert pla_std["ratePerG"] == 0.045
