"""GLB/glTF: metry (spec) vs mm (wyceniarka / slicer)."""
import numpy as np
import trimesh

from analysis import normalize_imported_mesh, scale_factor_to_mm


def test_gltf_meters_scale_to_mm():
    # Toaleta / mebel ze Sketchfaba: ~0.7 m
    assert scale_factor_to_mm(0.70, ".glb") == 1000.0
    assert scale_factor_to_mm(0.30, "gltf") == 1000.0


def test_gltf_already_millimeters_stays():
    # Figurka wyeksportowana z CAD w mm (niespec, ale częste)
    assert scale_factor_to_mm(80.0, ".glb") == 1.0
    assert scale_factor_to_mm(15.0, ".gltf") == 1.0


def test_stl_never_auto_scaled():
    assert scale_factor_to_mm(0.8, ".stl") == 1.0
    assert scale_factor_to_mm(120.0, ".stl") == 1.0


def test_normalize_toilet_sized_glb():
    mesh = trimesh.creation.box(extents=[0.40, 0.75, 0.68])
    normalize_imported_mesh(mesh, ".glb")
    extents = np.sort(mesh.extents)
    expected = np.sort([400.0, 750.0, 680.0])
    assert np.allclose(extents, expected, atol=1e-4)


def test_normalize_y_up_becomes_print_z_up():
    # Słupek wzdłuż Y (glTF): po konwersji wysokość ma iść w Z
    mesh = trimesh.creation.box(extents=[0.02, 0.10, 0.02])
    normalize_imported_mesh(mesh, ".glb")
    assert abs(float(mesh.extents[2]) - 100.0) < 1e-3
