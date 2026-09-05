"""
Silnik wyceny druku 3D.
Prosty model kosztowy - dostosuj wspolczynniki do swoich realnych kosztow
(cena filamentu, koszt pracy maszyny za godzine, marza).
"""

# Cena materialu w zl/kg + gestosc w g/cm3 (do przeliczenia objetosci na wage)
MATERIALS = {
    "PLA": {"price_per_kg": 90, "density_g_cm3": 1.24},
    "PETG": {"price_per_kg": 110, "density_g_cm3": 1.27},
    "ABS": {"price_per_kg": 95, "density_g_cm3": 1.04},
    "TPU": {"price_per_kg": 150, "density_g_cm3": 1.21},
    "Resin (SLA)": {"price_per_kg": 250, "density_g_cm3": 1.10},
}

MACHINE_RATE_PLN_PER_HOUR = 25  # koszt pracy drukarki (amortyzacja, prad, obsluga)
BASE_FEE_PLN = 10  # oplata bazowa za zlecenie (przygotowanie, obsluga)
MARGIN_MULTIPLIER = 1.3  # marza narzucona na koszt materialu + maszyny

# Bardzo uproszczony szacunek predkosci druku - mm3 na godzine
# To warto skalibrowac na podstawie realnych wydrukow z Twojej drukarki
PRINT_SPEED_MM3_PER_HOUR = 15000


def estimate_print_time_hours(volume_cm3: float, infill_percent: int, bbox_mm: list[float]) -> float:
    """
    Bardzo uproszczony szacunek czasu druku.
    UWAGA: to jest przyblizenie na start. Do dokladnej wyceny docelowo
    warto uzyc realnego slicera (np. PrusaSlicer CLI) w trybie headless,
    ktory policzy czas na podstawie rzeczywistej sciezki glowicy.
    """
    effective_volume_mm3 = volume_cm3 * 1000 * (infill_percent / 100)
    # Wysokosc modelu wplywa na liczbe warstw - wyzszy model = wiecej czasu na sam ruch w Z
    height_mm = bbox_mm[2] if len(bbox_mm) == 3 else 50
    layer_overhead_hours = (height_mm / 0.2) * 0.0008  # przyblizenie czasu na warstwe

    volume_hours = effective_volume_mm3 / PRINT_SPEED_MM3_PER_HOUR
    return round(volume_hours + layer_overhead_hours, 2)


def calculate_price(volume_cm3: float, bbox_mm: list[float], material: str,
                     quantity: int, infill_percent: int) -> dict:
    mat = MATERIALS[material]

    weight_g = volume_cm3 * mat["density_g_cm3"] * (infill_percent / 100)
    material_cost = (weight_g / 1000) * mat["price_per_kg"]

    print_time_h = estimate_print_time_hours(volume_cm3, infill_percent, bbox_mm)
    machine_cost = print_time_h * MACHINE_RATE_PLN_PER_HOUR

    unit_cost = (material_cost + machine_cost) * MARGIN_MULTIPLIER + BASE_FEE_PLN
    total_cost = unit_cost * quantity

    return {
        "material": material,
        "quantity": quantity,
        "weight_g_per_unit": round(weight_g, 1),
        "estimated_print_time_hours_per_unit": print_time_h,
        "unit_price_pln": round(unit_cost, 2),
        "total_price_pln": round(total_cost, 2),
        "note": "Wycena szacunkowa. Ostateczna cena moze sie roznic po weryfikacji przez operatora.",
    }
