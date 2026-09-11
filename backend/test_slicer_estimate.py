"""Szacunek filamentu vs liczby z Bambu Studio dla Jaguara i malej obudowy."""
import os
import tempfile

import trimesh

from slicer import estimate_filament_from_geometry, run_slicer, slice_result_from_bambu_stats


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


def test_bambu_slice_info_matches_studio_totals():
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
    assert abs(stats["filament_weight_g"] - 518.1) < 0.2
    assert abs(stats["filament_length_m"] - 163.2) < 0.05
    assert stats["print_time_formatted"] == "1d 3h 40m"
    assert 27.5 <= stats["print_time_hours"] <= 27.8


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"{name}: OK")
    print("ok")
