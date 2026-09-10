"""Szacunek filamentu vs liczby z Bambu Studio dla Jaguara i malej obudowy."""
from slicer import estimate_filament_from_geometry


def test_jaguar_matches_bambu_ballpark():
    """
    Jaguar+v2+Bambu.3mf w Bambu Studio:
    model+podpory 348 g, flush+wieza 170 g, razem 518 g / 163 m / 1d 3h 41m.
    Strona ze starym wzorem dawala 1150.6 g / 271.68 m / 54h 55m.
    """
    est = estimate_filament_from_geometry(
        volume_cm3=842.10,
        surface_area_cm2=838.1,
        dimensions_mm=[187.49, 203.71, 77.46],
        infill=20,
        layer_height=0.20,
        nozzle_size=0.4,
        filament_type="PLA",
        support_needed=True,
        color_count=4,
    )
    # Bambu 518 g - dopuszczamy +/- 15%
    assert 440 <= est["filament_weight_g"] <= 600, est
    assert 140 <= est["filament_length_m"] <= 190, est
    hours = est["print_time_hours"]
    assert 22 <= hours <= 34, est
    # Zdecydowanie mniej niz stary wzor 1150 g / 55 h
    assert est["filament_weight_g"] < 800
    assert hours < 40


def test_jaguar_single_color_is_model_plus_supports():
    est = estimate_filament_from_geometry(
        volume_cm3=842.10,
        surface_area_cm2=838.1,
        dimensions_mm=[187.49, 203.71, 77.46],
        infill=20,
        layer_height=0.20,
        nozzle_size=0.4,
        filament_type="PLA",
        support_needed=True,
        color_count=1,
    )
    # Bambu model+podpory = 348 g (bez AMS)
    assert 300 <= est["filament_weight_g"] <= 400, est
    assert est["flush_cm3"] == 0


def test_small_watch_case_stays_in_single_digits():
    est = estimate_filament_from_geometry(
        volume_cm3=7.16,
        surface_area_cm2=48.0,
        dimensions_mm=[42.0, 38.0, 11.0],
        infill=20,
        layer_height=0.20,
        nozzle_size=0.4,
        filament_type="PLA",
        support_needed=False,
        color_count=1,
    )
    # Dawniej cel 9.8 g; nie chcemy zejsc do 3 g ani wystrzelic do 20 g
    assert 7.0 <= est["filament_weight_g"] <= 13.0, est


def test_old_formula_no_longer_used_for_large_solids():
    est = estimate_filament_from_geometry(
        volume_cm3=842.10,
        surface_area_cm2=838.1,
        dimensions_mm=[187.49, 203.71, 77.46],
        infill=20,
        layer_height=0.20,
        nozzle_size=0.4,
        filament_type="PLA",
        support_needed=True,
        color_count=4,
    )
    old_effective = 842.10 * (0.72 + 0.20 * 0.28)
    old_weight = round(old_effective * 1.24 * 1.42, 1)
    assert abs(old_weight - 1150.6) < 1.0
    assert est["filament_weight_g"] < old_weight * 0.65


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"{name}: OK")
    print("ok")
