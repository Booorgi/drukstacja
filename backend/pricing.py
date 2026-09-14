"""
Drukstacja — silnik wyceny druku 3D.

Warstwa komercyjna (detal) na koszcie hurtowym filamentu z katalogu Sunlu:

    material_cost = filament_weight_g × (zł/kg / 1000) × layer_mult × nozzle_mult
    unit_price    = max(MIN_UNIT_PRICE_PLN,
                        material_cost × MATERIAL_MARKUP
                        + print_time_hours × MACHINE_HOURLY_PLN
                        + SETUP_FEE_PLN)

Domyślne stałe (nadpisywane env):
    PRICING_MATERIAL_MARKUP    = 2.0     # sell-through vs hurtowa zł/kg
    PRICING_MACHINE_HOURLY_PLN = 1.00    # prąd + amortyzacja + obsługa
    PRICING_SETUP_FEE_PLN      = 2.00    # przygotowanie zadania

Kalibracja: whale_stl.stl ~57.2 g / 5.45 h / PLA 45 zł/kg → ~12.60 PLN
(konkurencja ~12.02 PLN brutto), nie surowy plastik 2.57 PLN.
Waga i czas z slice_info Bambu zostają bez zmian — marża jest tylko na cenie.

Stawki zł/kg są wyłącznie do kalkulatora; UI publiczne ich nie pokazuje.
MOQ koszyka = 30.00 PLN (nie doliczane do ceny sztuki).
"""
import math
import os

from filament_catalog import get_material_rate_per_g, iter_subtypes
from slicer import estimate_filament_from_geometry


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or str(raw).strip() == "":
        return default
    try:
        return float(raw)
    except ValueError:
        return default


# --- stałe polityki (źródło prawdy; frontend/lib/commercialPricing.js musi mieć te same defaulty)
DEFAULT_MATERIAL_MARKUP = 2.0
DEFAULT_MACHINE_HOURLY_PLN = 1.00
DEFAULT_SETUP_FEE_PLN = 2.00
MIN_UNIT_PRICE_PLN = 0.80
MINIMUM_ORDER_VALUE_PLN = 30.00  # Minimalna wartość zamówienia w koszyku (MOQ)
SMALL_ORDER_SURCHARGE_PLN = 0.0

MATERIAL_MARKUP = _env_float("PRICING_MATERIAL_MARKUP", DEFAULT_MATERIAL_MARKUP)
MACHINE_HOURLY_PLN = _env_float("PRICING_MACHINE_HOURLY_PLN", DEFAULT_MACHINE_HOURLY_PLN)
SETUP_FEE_PLN = _env_float("PRICING_SETUP_FEE_PLN", DEFAULT_SETUP_FEE_PLN)

# Parametry materiałowe z katalogu (gęstość + stawka z zł/kg)
MATERIALS = {}
for _family, _subtype in iter_subtypes():
    MATERIALS[_subtype["slicerType"]] = {
        "price_per_kg": _subtype["pricePerKg"],
        "density_g_cm3": _subtype["density"],
        "rate_per_g": _subtype["ratePerG"],
    }
    MATERIALS[_subtype["id"]] = MATERIALS[_subtype["slicerType"]]


def layer_nozzle_multipliers(layer_height: float, nozzle_size: float) -> tuple[float, float]:
    """Mnożniki jakości — tylko na koszcie materiału, nie na czasie (czas jest osobną pozycją)."""
    if abs(nozzle_size - 0.2) < 0.05:
        layer_multiplier = 1.30 if abs(layer_height - 0.08) < 0.02 else (
            1.15 if abs(layer_height - 0.12) < 0.02 else 1.0
        )
        nozzle_multiplier = 1.65
    else:
        layer_multiplier = 1.25 if abs(layer_height - 0.12) < 0.02 else (
            0.90 if abs(layer_height - 0.28) < 0.02 else 1.0
        )
        nozzle_multiplier = 1.0
    return layer_multiplier, nozzle_multiplier


def commercial_unit_price(
    filament_weight_g: float,
    print_time_hours: float,
    rate_per_g: float,
    layer_multiplier: float = 1.0,
    nozzle_multiplier: float = 1.0,
    markup: float | None = None,
    machine_hourly: float | None = None,
    setup_fee: float | None = None,
) -> dict:
    """
    Cena sztuki PLN (przed MOQ). Zwraca składowe do testów i breakdown API.

    material_cost = g × rate × layer × nozzle
    unit = max(min_unit, material_cost × markup + hours × hourly + setup)
    """
    markup = DEFAULT_MATERIAL_MARKUP if markup is None else markup
    machine_hourly = DEFAULT_MACHINE_HOURLY_PLN if machine_hourly is None else machine_hourly
    setup_fee = DEFAULT_SETUP_FEE_PLN if setup_fee is None else setup_fee

    weight = max(0.0, float(filament_weight_g or 0.0))
    hours = max(0.0, float(print_time_hours or 0.0))
    rate = float(rate_per_g or 0.0)
    material_cost = weight * rate * float(layer_multiplier) * float(nozzle_multiplier)
    machine_cost = hours * float(machine_hourly)
    raw = material_cost * float(markup) + machine_cost + float(setup_fee)
    unit = max(MIN_UNIT_PRICE_PLN, raw)
    return {
        "material_cost_pln": round(material_cost, 4),
        "machine_cost_pln": round(machine_cost, 4),
        "setup_fee_pln": round(float(setup_fee), 2),
        "material_markup": float(markup),
        "machine_hourly_pln": float(machine_hourly),
        "raw_unit_pln": round(raw, 4),
        "unit_price_pln": round(unit, 2),
    }


def estimate_print_time_hours(
    volume_cm3: float,
    infill_percent: int,
    bbox_mm: list[float],
    layer_height: float = 0.20,
    nozzle_size: float = 0.4,
) -> float:
    """Szacunek czasu druku na potrzeby szybkiej wyceny orientacyjnej."""
    effective_volume_mm3 = volume_cm3 * 1000 * (0.50 + 0.50 * (infill_percent / 100.0))
    height_mm = bbox_mm[2] if len(bbox_mm) == 3 else 30
    lh = layer_height if layer_height and layer_height > 0 else 0.20
    num_layers = max(1, int(height_mm / lh))

    # Dysza 0.2 mm nakłada o połowę węższą ścieżkę (0.22 vs 0.45 mm) przy niższej prędkości ekstruzji
    speed_factor = 2.4 if abs(nozzle_size - 0.2) < 0.05 else 1.0
    extrusion_hours = (effective_volume_mm3 / 12000.0) * speed_factor
    layer_overhead_hours = num_layers * (0.0015 if abs(nozzle_size - 0.2) < 0.05 else 0.001)
    return round(extrusion_hours + layer_overhead_hours, 2)


def calculate_discount_percent(quantity: int) -> int:
    """Wycena liniowa bez rabatów ilościowych."""
    return 0


def calculate_price_from_slicer(
    print_time_hours: float,
    filament_weight_g: float,
    material: str = "PLA",
    quantity: int = 1,
    layer_height: float = 0.20,
    nozzle_size: float = 0.4,
    price_per_cm3: float = None,
) -> dict:
    """
    Wycena detaliczna z wagi i czasu (slice_info albo estymator):
    - koszt materiału = gram × (zł/kg katalogu / 1000); PLA 45 zł/kg → 0.045 PLN/g
    - cena = materiał × markup + godziny × stawka maszyny + setup
    - waga/czas z Bambu used_g / prediction bez zmian
    - MOQ 30.00 PLN na koszyk, nie na sztukę
    """
    rate_per_g = get_material_rate_per_g(material)
    layer_multiplier, nozzle_multiplier = layer_nozzle_multipliers(layer_height, nozzle_size)
    quote = commercial_unit_price(
        filament_weight_g=filament_weight_g,
        print_time_hours=print_time_hours,
        rate_per_g=rate_per_g,
        layer_multiplier=layer_multiplier,
        nozzle_multiplier=nozzle_multiplier,
        markup=MATERIAL_MARKUP,
        machine_hourly=MACHINE_HOURLY_PLN,
        setup_fee=SETUP_FEE_PLN,
    )

    unit_price = quote["unit_price_pln"]
    total_price = round(unit_price * quantity, 2)

    below_minimum = total_price < MINIMUM_ORDER_VALUE_PLN
    difference_to_minimum = round(max(0.0, MINIMUM_ORDER_VALUE_PLN - total_price), 2)
    suggested_quantity = max(1, math.ceil(MINIMUM_ORDER_VALUE_PLN / max(0.1, unit_price)))

    return {
        "material": material,
        "quantity": quantity,
        "layer_height_mm": layer_height,
        "nozzle_size_mm": nozzle_size,
        "filament_weight_g": round(float(filament_weight_g or 0.0), 1),
        "print_time_hours": round(float(print_time_hours or 0.0), 2),
        "discount_percent": 0,
        "unit_price_pln": unit_price,
        "total_price_pln": total_price,
        "minimum_order_value_pln": MINIMUM_ORDER_VALUE_PLN,
        "below_minimum": below_minimum,
        "difference_to_minimum_pln": difference_to_minimum,
        "suggested_quantity_for_moq": suggested_quantity,
        "material_cost_pln": quote["material_cost_pln"],
        "machine_cost_pln": quote["machine_cost_pln"],
        "setup_fee_pln": quote["setup_fee_pln"],
        "material_markup": quote["material_markup"],
        "machine_hourly_pln": quote["machine_hourly_pln"],
        "formula": "unit = material_cost × markup + hours × hourly + setup",
        "engine": "commercial-margin-v1",
    }


def calculate_price(
    volume_cm3: float,
    bbox_mm: list[float],
    material: str,
    quantity: int,
    infill_percent: int,
    layer_height: float = 0.20,
    nozzle_size: float = 0.4,
) -> dict:
    """Kalkulator fallback dla zapytań bez pełnego G-Code (np. /quote)."""
    est = estimate_filament_from_geometry(
        volume_cm3=volume_cm3,
        surface_area_cm2=0.0,
        dimensions_mm=bbox_mm,
        infill=infill_percent,
        layer_height=layer_height,
        nozzle_size=nozzle_size,
        filament_type=material,
        support_needed=True,
        color_count=1,
    )
    estimated_weight_g = est["filament_weight_g"]
    print_time_h = est["print_time_hours"]

    return calculate_price_from_slicer(
        print_time_hours=print_time_h,
        filament_weight_g=estimated_weight_g,
        material=material,
        quantity=quantity,
        layer_height=layer_height,
        nozzle_size=nozzle_size,
    )
