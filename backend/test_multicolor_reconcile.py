import trimesh

from slicer import reconcile_multicolor_orca_stats


def test_reconcile_boosts_low_orca_weight_for_multicolor():
    mesh = trimesh.creation.box(extents=[40, 40, 80])
    path = __import__("tempfile").mkstemp(suffix=".stl")[1]
    mesh.export(path)
    low = {
        "engine": "orca-slicer-cli",
        "filament_weight_g": 38.8,
        "filament_length_m": 13.0,
        "print_time_hours": 5.0,
        "print_time_formatted": "5h 0m",
    }
    corrected = reconcile_multicolor_orca_stats(
        path,
        low,
        infill=15,
        layer_height=0.20,
        nozzle_size=0.4,
        filament_type="PLA",
        color_count=4,
        support_needed=True,
        painted_ratio=0.66,
    )
    assert corrected["filament_weight_g"] > 120
    assert corrected["print_time_hours"] > 5.0


def test_reconcile_skips_single_color():
    mesh = trimesh.creation.box(extents=[20, 20, 20])
    path = __import__("tempfile").mkstemp(suffix=".stl")[1]
    mesh.export(path)
    low = {
        "engine": "orca-slicer-cli",
        "filament_weight_g": 12.0,
        "print_time_hours": 1.0,
        "print_time_formatted": "1h 0m",
    }
    same = reconcile_multicolor_orca_stats(
        path,
        low,
        infill=15,
        layer_height=0.20,
        nozzle_size=0.4,
        filament_type="PLA",
        color_count=1,
        support_needed=False,
        painted_ratio=0.0,
    )
    assert same["filament_weight_g"] == 12.0


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"{name}: OK")
    print("ok")
