"""
Drukstacja - silnik wyceny druku 3D.

PLN = filament_weight_g × (zł/kg / 1000). Stawki hurtowe z katalogu Sunlu
są tylko do kalkulatora — UI publiczne ich nie pokazuje.
Waga/czas z slice_info Bambu (#53) zostają; zmienia się wyłącznie stawka materiału.
"""
import math

from filament_catalog import get_material_rate_per_g, iter_subtypes
from slicer import estimate_filament_from_geometry

# Parametry globalne polityki zamówień
MINIMUM_ORDER_VALUE_PLN = 30.00  # Minimalna wartość zamówienia w koszyku (MOQ)
SMALL_ORDER_SURCHARGE_PLN = 0.0  # Opcjonalna dopłata, jeśli włączona w polityce sklepu

# Parametry materiałowe z katalogu (gęstość + stawka z zł/kg)
MATERIALS = {}
for _family, _subtype in iter_subtypes():
    MATERIALS[_subtype["slicerType"]] = {
        "price_per_kg": _subtype["pricePerKg"],
        "density_g_cm3": _subtype["density"],
        "rate_per_g": _subtype["ratePerG"],
    }
    MATERIALS[_subtype["id"]] = MATERIALS[_subtype["slicerType"]]


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
    Wycena z wagi filamentu:
    - PLN = gram × (zł/kg katalogu / 1000); PLA 45 zł/kg → 0.045 PLN/g
    - slice_info: waga = used_g z Bambu, stawka z wybranego filamentu
    - Dysza 0.2 mm: narzut czasu maszynowego 1.65x
    - MOQ 30.00 PLN
    """
    rate_per_g = get_material_rate_per_g(material)
    material_cost = filament_weight_g * rate_per_g

    if abs(nozzle_size - 0.2) < 0.05:
        layer_multiplier = 1.30 if abs(layer_height - 0.08) < 0.02 else (1.15 if abs(layer_height - 0.12) < 0.02 else 1.0)
        nozzle_multiplier = 1.65
    else:
        layer_multiplier = 1.25 if abs(layer_height - 0.12) < 0.02 else (0.90 if abs(layer_height - 0.28) < 0.02 else 1.0)
        nozzle_multiplier = 1.0

    base_unit_price = material_cost * layer_multiplier * nozzle_multiplier
    base_unit_price = max(0.80, base_unit_price)

    unit_price = round(base_unit_price, 2)
    total_price = round(unit_price * quantity, 2)

    below_minimum = total_price < MINIMUM_ORDER_VALUE_PLN
    difference_to_minimum = round(max(0.0, MINIMUM_ORDER_VALUE_PLN - total_price), 2)
    suggested_quantity = max(1, math.ceil(MINIMUM_ORDER_VALUE_PLN / max(0.1, unit_price)))

    return {
        "material": material,
        "quantity": quantity,
        "layer_height_mm": layer_height,
        "nozzle_size_mm": nozzle_size,
        "filament_weight_g": round(filament_weight_g, 1),
        "print_time_hours": round(print_time_hours, 2),
        "rate_per_g_pln": rate_per_g,
        "discount_percent": 0,
        "unit_price_pln": unit_price,
        "total_price_pln": total_price,
        "minimum_order_value_pln": MINIMUM_ORDER_VALUE_PLN,
        "below_minimum": below_minimum,
        "difference_to_minimum_pln": difference_to_minimum,
        "suggested_quantity_for_moq": suggested_quantity,
        "engine": "calibrated-market-pricing",
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
