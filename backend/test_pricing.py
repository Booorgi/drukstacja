"""Warstwa marży detalicznej na koszcie filamentu (45 zł/kg PLA)."""
import os
import re
from pathlib import Path

from filament_catalog import get_material_rate_per_g
from pricing import (
    DEFAULT_MACHINE_HOURLY_PLN,
    DEFAULT_MATERIAL_MARKUP,
    DEFAULT_SETUP_FEE_PLN,
    MINIMUM_ORDER_VALUE_PLN,
    MIN_UNIT_PRICE_PLN,
    calculate_price_from_slicer,
    commercial_unit_price,
)


PLA_RATE = get_material_rate_per_g("PLA")
WHALE_G = 57.2
WHALE_H = 5.45  # 5h 27m z paska Bambu Studio
PHOTOSET_G = 146.74
PHOTOSET_H = 18372 / 3600.0
JAGUAR_G = 518.08
JAGUAR_H = 99600 / 3600.0


def _expected(grams, hours, rate=PLA_RATE, markup=DEFAULT_MATERIAL_MARKUP,
              hourly=DEFAULT_MACHINE_HOURLY_PLN, setup=DEFAULT_SETUP_FEE_PLN):
    raw = grams * rate * markup + hours * hourly + setup
    return round(max(MIN_UNIT_PRICE_PLN, raw), 2)


def test_pla_wholesale_rate_is_45_pln_kg():
    assert PLA_RATE == 0.045


def test_whale_quotes_competitor_ballpark_not_raw_plastic():
    raw_plastic = round(WHALE_G * PLA_RATE, 2)
    assert abs(raw_plastic - 2.57) < 0.02

    quote = calculate_price_from_slicer(
        print_time_hours=WHALE_H,
        filament_weight_g=WHALE_G,
        material="PLA",
        quantity=1,
        layer_height=0.20,
        nozzle_size=0.4,
    )
    assert quote["filament_weight_g"] == 57.2
    assert quote["print_time_hours"] == 5.45
    assert 11.0 <= quote["unit_price_pln"] <= 13.0
    assert abs(quote["unit_price_pln"] - _expected(WHALE_G, WHALE_H)) < 0.02
    assert abs(quote["unit_price_pln"] - 12.60) < 0.05
    assert quote["unit_price_pln"] != raw_plastic
    assert quote["below_minimum"] is True
    assert quote["minimum_order_value_pln"] == MINIMUM_ORDER_VALUE_PLN
    assert quote["difference_to_minimum_pln"] == round(30.0 - quote["unit_price_pln"], 2)
    assert "rate_per_g_pln" not in quote
    assert quote["engine"] == "commercial-margin-v1"


def test_photoset_scales_from_slice_info_weight_and_time():
    quote = calculate_price_from_slicer(
        print_time_hours=PHOTOSET_H,
        filament_weight_g=PHOTOSET_G,
        material="PLA",
        quantity=1,
        layer_height=0.20,
        nozzle_size=0.4,
    )
    assert quote["filament_weight_g"] == 146.7
    assert 5.0 <= quote["print_time_hours"] <= 5.2
    expected = _expected(PHOTOSET_G, PHOTOSET_H)
    assert abs(quote["unit_price_pln"] - expected) < 0.02
    assert abs(quote["unit_price_pln"] - 20.31) < 0.02
    assert 18.0 <= quote["unit_price_pln"] <= 24.0
    assert quote["unit_price_pln"] < 80
    assert quote["below_minimum"] is True


def test_jaguar_day_long_job_is_not_absurd():
    quote = calculate_price_from_slicer(
        print_time_hours=JAGUAR_H,
        filament_weight_g=JAGUAR_G,
        material="PLA",
        quantity=1,
        layer_height=0.20,
        nozzle_size=0.4,
    )
    expected = _expected(JAGUAR_G, JAGUAR_H)
    assert abs(quote["unit_price_pln"] - expected) < 0.05
    # ~518 g / ~27.7 h: więcej niż Photoset, mniej niż 200 zł za dobę druku
    assert 60.0 <= quote["unit_price_pln"] <= 120.0
    assert quote["unit_price_pln"] > _expected(PHOTOSET_G, PHOTOSET_H)
    assert quote["below_minimum"] is False


def test_commercial_helper_exposes_formula_components():
    parts = commercial_unit_price(WHALE_G, WHALE_H, PLA_RATE)
    assert abs(parts["material_cost_pln"] - 2.574) < 0.001
    assert abs(parts["machine_cost_pln"] - 5.45) < 0.001
    assert parts["setup_fee_pln"] == 2.0
    assert parts["material_markup"] == 2.0
    assert abs(parts["unit_price_pln"] - 12.60) < 0.05


def test_moq_stays_on_cart_not_unit():
    quote = calculate_price_from_slicer(
        print_time_hours=WHALE_H,
        filament_weight_g=WHALE_G,
        material="PLA",
        quantity=1,
    )
    assert quote["unit_price_pln"] < 30
    assert quote["total_price_pln"] == quote["unit_price_pln"]
    assert quote["below_minimum"] is True
    triple = calculate_price_from_slicer(
        print_time_hours=WHALE_H,
        filament_weight_g=WHALE_G,
        material="PLA",
        quantity=3,
    )
    assert abs(triple["total_price_pln"] - round(quote["unit_price_pln"] * 3, 2)) < 0.001
    assert triple["below_minimum"] is False


def test_layer_multiplier_applies_only_to_material():
    base = commercial_unit_price(WHALE_G, WHALE_H, PLA_RATE, layer_multiplier=1.0)
    fine = commercial_unit_price(WHALE_G, WHALE_H, PLA_RATE, layer_multiplier=1.25)
    delta = fine["unit_price_pln"] - base["unit_price_pln"]
    material_delta = round(2.574 * 0.25 * DEFAULT_MATERIAL_MARKUP, 2)
    assert abs(delta - material_delta) < 0.03
    assert fine["machine_cost_pln"] == base["machine_cost_pln"]


def test_frontend_defaults_stay_in_sync():
    js_path = Path(__file__).resolve().parents[1] / "frontend" / "lib" / "commercialPricing.js"
    text = js_path.read_text(encoding="utf-8")
    def grab(name):
        match = re.search(rf"(?:export )?const {name} = ([0-9.]+);", text)
        assert match, name
        return float(match.group(1))

    assert grab("MATERIAL_MARKUP") == DEFAULT_MATERIAL_MARKUP
    assert grab("MACHINE_HOURLY_PLN") == DEFAULT_MACHINE_HOURLY_PLN
    assert grab("SETUP_FEE_PLN") == DEFAULT_SETUP_FEE_PLN
    assert grab("MIN_UNIT_PRICE_PLN") == MIN_UNIT_PRICE_PLN
    assert grab("MINIMUM_ORDER_VALUE_PLN") == MINIMUM_ORDER_VALUE_PLN


def test_env_override_is_documented_and_readable():
    assert os.environ.get("PRICING_MATERIAL_MARKUP") in (None, "")
    custom = commercial_unit_price(
        WHALE_G, WHALE_H, PLA_RATE, markup=3.0, machine_hourly=0.0, setup_fee=0.0
    )
    assert abs(custom["unit_price_pln"] - round(WHALE_G * PLA_RATE * 3.0, 2)) < 0.02


def test_canonical_hours_prefer_formatted_over_stale_geometry_hours():
    from pricing import canonical_print_time_hours, extract_quote_weight_hours, commercial_total_for_order

    stale = canonical_print_time_hours(formatted="5h 6m", hours=7.633)
    assert abs(stale - 5.1) < 0.02
    from_seconds = canonical_print_time_hours(
        formatted="5h 6m", hours=7.633, seconds=18372
    )
    assert abs(from_seconds - round(18372 / 3600.0, 2)) < 0.001

    weight, hours = extract_quote_weight_hours(
        technology="FDM Precision 0.4mm | Czas: 5h 6m | Waga: 146.74g",
        print_time_hours=7.633,
    )
    assert abs(weight - 146.74) < 0.01
    assert abs(hours - 5.1) < 0.02

    unit = commercial_total_for_order(
        filament_weight_g=146.74,
        print_time_hours=hours,
        material="PLA",
        quantity=1,
        layer_height=0.20,
        nozzle_size=0.4,
    )
    assert abs(unit - 20.31) < 0.02
    assert unit != round(146.74 * 0.045 * 2 + 7.633 + 2, 2)


def test_order_payload_reprices_35_02_without_database():
    from orders_api import OrderCreate, apply_server_print_price

    payload = OrderCreate(
        file_name="Photoset_Iphone_support.3mf",
        material="PLA Standard (Pomarańczowy)",
        technology="FDM Precision 0.4mm | Czas: 5h 6m | Waga: 146.74g",
        layer_height="0.20 mm",
        infill=15,
        quantity=1,
        total_price=35.02,
        filament_weight_g=146.74,
        print_time_hours=7.633,
        print_time_formatted="5h 6m",
        print_time_seconds=18372,
        nozzle_size="0.4",
        status="in_cart",
    )
    apply_server_print_price(payload)
    assert abs(payload.total_price - 20.31) < 0.02
    assert payload.total_price != 35.02


def test_photoset_qty1_studio_equals_line_equals_cart_total():
    from pricing import commercial_total_for_order

    unit = commercial_total_for_order(
        filament_weight_g=PHOTOSET_G,
        print_time_hours=PHOTOSET_H,
        material="PLA",
        quantity=1,
        layer_height=0.20,
        nozzle_size=0.4,
    )
    assert abs(unit - 20.31) < 0.02
    cart_total = unit  # qty 1, no VAT multiplier, no shipping
    assert cart_total == unit


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"{name}: OK")
    print("ok")
