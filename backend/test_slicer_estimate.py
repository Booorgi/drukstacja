"""Szacunek filamentu vs liczby z Bambu Studio dla Jaguara i malej obudowy."""
import os
import tempfile

import trimesh

from slicer import (
    estimate_filament_from_geometry,
    run_slicer,
    slice_result_from_bambu_stats,
    slice_result_from_geometry,
    validated_bambu_slice_stats,
)


def test_jaguar_matches_bambu_ballpark():
    """
    Jaguar+v2+Bambu.3mf w Bambu Studio (5% infill, AMS):
    model+podpory 348 g, flush+wieza 170 g, razem 518 g / 163 m / 1d 3h 41m.
    """
    est = estimate_filament_from_geometry(
        volume_cm3=842.10,
        surface_area_cm2=838.1,
        dimensions_mm=[187.49, 203.71, 77.46],
        infill=5,
        layer_height=0.20,
        nozzle_size=0.4,
        filament_type="PLA",
        support_needed=True,
        color_count=4,
        painted_ratio=0.66,
    )
    # Bambu 518 g / 1d 3h 40m - dopuszczamy +/- 10%
    assert 470 <= est["filament_weight_g"] <= 570, est
    assert 150 <= est["filament_length_m"] <= 190, est
    hours = est["print_time_hours"]
    assert 25 <= hours <= 31, est
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


def test_painted_file_adds_ams_even_if_color_count_missing():
    """Gdy frontend/backend zgubi color_count, gestosc malowania i tak dolicza AMS."""
    est = estimate_filament_from_geometry(
        volume_cm3=842.10,
        surface_area_cm2=838.1,
        dimensions_mm=[187.49, 203.71, 77.46],
        infill=5,
        layer_height=0.20,
        nozzle_size=0.4,
        filament_type="PLA",
        support_needed=True,
        color_count=1,
        painted_ratio=0.66,
    )
    assert est["flush_cm3"] > 50, est
    assert est["filament_weight_g"] > 400, est


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
        infill=5,
        layer_height=0.20,
        nozzle_size=0.4,
        filament_type="PLA",
        support_needed=True,
        color_count=4,
        painted_ratio=0.66,
    )
    old_effective = 842.10 * (0.72 + 0.20 * 0.28)
    old_weight = round(old_effective * 1.24 * 1.42, 1)
    assert abs(old_weight - 1150.6) < 1.0
    assert est["filament_weight_g"] < old_weight * 0.65


def test_dense_mesh_skips_prusa_cli():
    """Gęsty 3MF nie może czekać 90 s na PrusaSlicer — wycena z geometrii."""
    box = trimesh.creation.box(extents=[10, 10, 10])
    path = os.path.join(tempfile.mkdtemp(), "tiny.stl")
    box.export(path)
    data = run_slicer(
        path,
        triangle_count=200000,
        volume_cm3=1.0,
        surface_area_cm2=6.0,
        dimensions_mm=[10.0, 10.0, 10.0],
        infill=20,
        layer_height=0.20,
        nozzle_size=0.4,
        filament_type="PLA",
        color_count=4,
        painted_ratio=0.5,
        support_needed=True,
    )
    assert data["engine"] == "geometry-estimate"
    assert data["filament_weight_g"] > 0


def test_jaguar_skip_preview_still_quotes_from_geometry():
    """Ta sama ścieżka co /api/analyze-model przy skip GLB/STL: ~842 cm³ → ~518 g, nie 16 g."""
    data = slice_result_from_geometry(
        volume_cm3=842.10,
        surface_area_cm2=838.1,
        dimensions_mm=[187.49, 203.71, 77.46],
        infill=5,
        layer_height=0.20,
        filament_type="PLA",
        nozzle_size=0.4,
        color_count=4,
        support_needed=True,
        painted_ratio=0.66,
    )
    assert data["engine"] == "geometry-estimate"
    assert 470 <= data["filament_weight_g"] <= 570, data
    assert data["filament_weight_g"] != 16
    missing_stl = run_slicer(
        os.path.join(tempfile.mkdtemp(), "never-exported.stl"),
        triangle_count=400_000,
        volume_cm3=842.10,
        surface_area_cm2=838.1,
        dimensions_mm=[187.49, 203.71, 77.46],
        infill=5,
        layer_height=0.20,
        nozzle_size=0.4,
        filament_type="PLA",
        color_count=4,
        painted_ratio=0.66,
        support_needed=True,
    )
    assert missing_stl["engine"] == "geometry-estimate"
    assert 470 <= missing_stl["filament_weight_g"] <= 570, missing_stl


def test_bambu_slice_info_matches_studio_totals():
    """Dodatnia slice_info → te same waga/czas co Bambu Studio (Jaguar 518 g / 1d 3h 40m)."""
    stats = slice_result_from_bambu_stats(
        {
            "filament_weight_g": 518.08,
            "filament_length_m": 163.20,
            "print_time_seconds": 99600,
            "color_count": 4,
        },
        infill=15,
        layer_height=0.20,
        filament_type="PLA Matte",
        nozzle_size=0.4,
    )
    assert stats["engine"] == "bambu-slice-info"
    assert abs(stats["filament_weight_g"] - 518.08) < 0.05
    assert abs(stats["filament_length_m"] - 163.2) < 0.05
    assert stats["print_time_formatted"] == "1d 3h 40m"
    assert 27.5 <= stats["print_time_hours"] <= 27.8


def test_photoset_slice_info_matches_bambu_not_geometry():
    """Photoset_Iphone_support.3mf: slice_info 146.74 g / 18372 s, nie 600 g+ z bryły CAD."""
    stats = validated_bambu_slice_stats({
        "filament_weight_g": 146.74,
        "filament_length_m": 49.20,
        "print_time_seconds": 18372,
        "color_count": 1,
    })
    assert stats is not None
    quote = slice_result_from_bambu_stats(
        stats,
        infill=15,
        layer_height=0.20,
        filament_type="PLA",
        nozzle_size=0.4,
    )
    assert quote["engine"] == "bambu-slice-info"
    assert abs(quote["filament_weight_g"] - 146.74) < 0.05
    assert abs(quote["filament_length_m"] - 49.20) < 0.05
    assert quote["print_time_formatted"] == "5h 6m"
    assert 5.0 <= quote["print_time_hours"] <= 5.2
    assert quote["filament_weight_g"] < 200

    from pricing import calculate_price_from_slicer
    price = calculate_price_from_slicer(
        print_time_hours=quote["print_time_hours"],
        filament_weight_g=quote["filament_weight_g"],
        material="PLA",
        quantity=1,
        layer_height=0.20,
        nozzle_size=0.4,
    )
    # Cena śledzi wagę+czas ze slice_info, nie objętość bryły (~800 cm³).
    from pricing import commercial_unit_price, DEFAULT_MATERIAL_MARKUP, DEFAULT_MACHINE_HOURLY_PLN, DEFAULT_SETUP_FEE_PLN
    expected = commercial_unit_price(
        quote["filament_weight_g"],
        quote["print_time_hours"],
        0.045,
        markup=DEFAULT_MATERIAL_MARKUP,
        machine_hourly=DEFAULT_MACHINE_HOURLY_PLN,
        setup_fee=DEFAULT_SETUP_FEE_PLN,
    )["unit_price_pln"]
    assert abs(price["unit_price_pln"] - expected) < 0.02
    assert price["unit_price_pln"] > round(146.74 * 0.045, 2)
    assert price["unit_price_pln"] < 80
    geom = estimate_filament_from_geometry(
        volume_cm3=800.0,
        surface_area_cm2=520.0,
        dimensions_mm=[100.0, 100.0, 80.0],
        infill=15,
        layer_height=0.20,
        nozzle_size=0.4,
        filament_type="PLA",
        support_needed=True,
        color_count=1,
    )
    assert geom["filament_weight_g"] > quote["filament_weight_g"]
    assert quote["filament_weight_g"] < 200
    overshoot = estimate_filament_from_geometry(
        volume_cm3=842.10,
        surface_area_cm2=838.1,
        dimensions_mm=[187.49, 203.71, 77.46],
        infill=15,
        layer_height=0.20,
        nozzle_size=0.4,
        filament_type="PLA",
        support_needed=True,
        color_count=4,
        painted_ratio=0.66,
    )
    assert overshoot["filament_weight_g"] > 500
    assert quote["filament_weight_g"] < overshoot["filament_weight_g"] * 0.4


def test_validated_slice_info_rejects_empty_and_zero():
    assert validated_bambu_slice_stats(None) is None
    assert validated_bambu_slice_stats({}) is None
    assert validated_bambu_slice_stats({"filament_weight_g": 0, "print_time_seconds": 0}) is None
    assert validated_bambu_slice_stats({"filament_weight_g": 0, "print_time_seconds": 100, "filament_length_m": 0}) is None
    assert validated_bambu_slice_stats({"filament_weight_g": 16.0, "print_time_seconds": 0}) is not None


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"{name}: OK")
    print("ok")
