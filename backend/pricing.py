"""
Drukstacja - Skalibrowany silnik wyceny druku 3D (Standard rynkowy / JLCPCB / Craftcloud)
Model wyceny bazuje na zużyciu tworzywa ze zintegrowanymi kosztami operacyjnymi i energii,
progresywnych rabatach ilościowych oraz minimalnej wartości zamówienia (MOQ).
"""
import math

# Stawki rynkowe brutto za gram tworzywa (materiał + prąd + amortyzacja drukarki)
# Dla PLA: 0.27 PLN/g -> detal ~9.8g (np. Watch case 1.stl) wycenia się na dokładnie ~2.65 PLN brutto
PRICE_PER_GRAM = {
    "PLA": 0.27,
    "PLA Tough": 0.27,
    "PLA Standard": 0.27,
    "PLA Silk": 0.29,
    "PLA Matte": 0.28,
    "PETG": 0.30,
    "PCTG": 0.34,
    "ABS": 0.30,
    "ASA": 0.35,
    "TPU": 0.45,
    "FLEX": 0.45,
    "PP": 0.48,
    "PA-CF": 0.65,
    "PETG-CF": 0.55,
    "PLA-CF": 0.48,
}

# Parametry globalne polityki zamówień
MINIMUM_ORDER_VALUE_PLN = 30.00  # Minimalna wartość zamówienia w koszyku (MOQ)
SMALL_ORDER_SURCHARGE_PLN = 0.0  # Opcjonalna dopłata, jeśli włączona w polityce sklepu

# Domyślne parametry materiałowe (gęstość do przeliczania cm3 na gramy)
MATERIALS = {
    "PLA": {"price_per_kg": 90, "density_g_cm3": 1.24, "rate_per_g": 0.27},
    "PETG": {"price_per_kg": 110, "density_g_cm3": 1.27, "rate_per_g": 0.30},
    "ABS": {"price_per_kg": 95, "density_g_cm3": 1.04, "rate_per_g": 0.30},
    "ASA": {"price_per_kg": 120, "density_g_cm3": 1.07, "rate_per_g": 0.35},
    "TPU": {"price_per_kg": 150, "density_g_cm3": 1.21, "rate_per_g": 0.45},
    "PA-CF": {"price_per_kg": 260, "density_g_cm3": 1.25, "rate_per_g": 0.65},
    "Resin (SLA)": {"price_per_kg": 250, "density_g_cm3": 1.10, "rate_per_g": 0.55},
}


def get_material_rate_per_g(material_name: str) -> float:
    """Zwraca stawkę za gram dla wybranego typu filamentu."""
    name_upper = material_name.upper()
    for key, rate in PRICE_PER_GRAM.items():
        if key.upper() in name_upper:
            return rate
    return 0.27  # domyślny PLA


def calculate_discount_percent(quantity: int) -> int:
    """Progresywne rabaty ilościowe zachęcające do większych nakładów."""
    if quantity >= 50:
        return 20  # -20%
    if quantity >= 25:
        return 15  # -15%
    if quantity >= 10:
        return 10  # -10%
    if quantity >= 5:
        return 5   # -5%
    return 0


def estimate_print_time_hours(volume_cm3: float, infill_percent: int, bbox_mm: list[float], layer_height: float = 0.20) -> float:
    """Szacunek czasu druku na potrzeby szybkiej wyceny orientacyjnej."""
    effective_volume_mm3 = volume_cm3 * 1000 * (0.50 + 0.50 * (infill_percent / 100.0))
    height_mm = bbox_mm[2] if len(bbox_mm) == 3 else 30
    lh = layer_height if layer_height and layer_height > 0 else 0.20
    num_layers = max(1, int(height_mm / lh))
    
    extrusion_hours = effective_volume_mm3 / 12000.0
    layer_overhead_hours = num_layers * 0.001
    return round(extrusion_hours + layer_overhead_hours, 2)


def calculate_price_from_slicer(
    print_time_hours: float,
    filament_weight_g: float,
    material: str = "PLA",
    quantity: int = 1,
    layer_height: float = 0.20,
    price_per_cm3: float = None,
) -> dict:
    """
    Rynkowy model kalkulacji cenowej:
    - Oparty bezpośrednio na zużyciu tworzywa (gramy filamentu ze slicera)
    - Brak sztywnej opłaty startowej (setup fee) zawyżającej cenę pojedynczego detalu
    - 9.8g PLA -> dokładnie 2.65 PLN brutto
    - Obsługa MOQ (Minimalna wartość zamówienia = 30.00 PLN)
    - Progresywne rabaty ilościowe (5+, 10+, 25+, 50+ szt.)
    """
    rate_per_g = get_material_rate_per_g(material)

    # 1. Koszt bazowy materiału i energii
    material_cost = filament_weight_g * rate_per_g

    # 2. Mnożnik wysokości warstwy (0.12 mm wymaga większego czasu i kalibracji: 1.25x; 0.28 mm szybszy: 0.90x)
    layer_multiplier = 1.25 if abs(layer_height - 0.12) < 0.02 else (0.90 if abs(layer_height - 0.28) < 0.02 else 1.0)
    base_unit_price = material_cost * layer_multiplier

    # Zabezpieczenie minimalnego kosztu drobiazgu (np. śrubka 0.2g): min 0.80 PLN
    base_unit_price = max(0.80, base_unit_price)

    # 3. Rabat ilościowy
    discount_pct = calculate_discount_percent(quantity)
    discount_factor = (100 - discount_pct) / 100.0

    unit_price = round(base_unit_price * discount_factor, 2)
    total_price = round(unit_price * quantity, 2)

    # 4. Sprawdzenie progu MOQ (30.00 PLN)
    below_minimum = total_price < MINIMUM_ORDER_VALUE_PLN
    difference_to_minimum = round(max(0.0, MINIMUM_ORDER_VALUE_PLN - total_price), 2)
    suggested_quantity = max(1, math.ceil(MINIMUM_ORDER_VALUE_PLN / max(0.1, unit_price)))

    return {
        "material": material,
        "quantity": quantity,
        "layer_height_mm": layer_height,
        "filament_weight_g": round(filament_weight_g, 1),
        "print_time_hours": round(print_time_hours, 2),
        "rate_per_g_pln": rate_per_g,
        "discount_percent": discount_pct,
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
) -> dict:
    """Kalkulator fallback dla zapytań bez pełnego G-Code (np. /quote)."""
    mat = MATERIALS.get(material, MATERIALS["PLA"])
    density = mat["density_g_cm3"]

    # Obliczenie realistycznej wagi z uwzględnieniem obrysów perymetrów i retrakcji
    # Dla koperty zegarka (7.16 cm3 przy 20% infill) daje dokładnie 9.8g -> 2.65 PLN
    perimeter_ratio = 0.72
    infill_ratio = (infill_percent / 100.0) * (1.0 - perimeter_ratio)
    effective_vol_cm3 = volume_cm3 * (perimeter_ratio + infill_ratio)
    estimated_weight_g = round(effective_vol_cm3 * density * 1.42, 1)

    print_time_h = estimate_print_time_hours(volume_cm3, infill_percent, bbox_mm, layer_height=layer_height)

    return calculate_price_from_slicer(
        print_time_hours=print_time_h,
        filament_weight_g=estimated_weight_g,
        material=material,
        quantity=quantity,
        layer_height=layer_height,
    )
