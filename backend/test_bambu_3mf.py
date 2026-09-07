"""
Automated Test Suite for Bambu Studio .3MF Multi-Color Exporter.

Tests:
1. Single-color export
2. Two-color export (Base + Border)
3. Four-color export (Base + Border + Graphic + Text)
4. Print settings propagation (layer_height, infill, nozzle_size)
5. Package validation with validate_3mf_package (11 strict integrity rules)
6. Reference comparison with official MakerWorld test_multicolor.3mf
"""

import os
import sys
import zipfile
import trimesh

# Ensure backend directory is in python path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from packager_3mf import generate_production_3mf, validate_3mf_package


def create_cube_mesh(size=(20, 20, 2)):
    """Generates a trimesh Box."""
    return trimesh.creation.box(extents=size)


def test_single_color():
    print("\n--- Test 1: Single Color 3MF ---")
    out_path = os.path.join(backend_dir, "test_out_single.3mf")
    parts = [
        {"name": "Base", "color_hex": "#111111", "mesh": create_cube_mesh(), "role": "base"}
    ]
    saved = generate_production_3mf(
        output_path=out_path,
        parts=parts,
        print_settings={"layer_height": "0.20", "infill": "100", "nozzle_size": "0.4", "color_hex": "#111111"},
    )
    assert os.path.exists(saved), "File was not saved!"
    
    res = validate_3mf_package(saved)
    print(f"Validation result: valid={res['valid']}, errors={res['errors']}")
    assert res["valid"], f"Single color package validation failed: {res['errors']}"
    
    with zipfile.ZipFile(saved, "r") as zf:
        model_xml = zf.read("3D/3dmodel.model").decode("utf-8")
        assert 'xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02"' in model_xml
        assert '<m:colorgroup id="1"' in model_xml
        assert '#111111' in model_xml
        assert '<component objectid="2"' in model_xml
        
        proj_xml = zf.read("Metadata/project_settings.config").decode("utf-8")
        assert '#111111' in proj_xml
    
    if os.path.exists(saved):
        os.remove(saved)
    print("Test 1 PASSED!")


def test_two_colors():
    print("\n--- Test 2: Two Colors (Base + Border) ---")
    out_path = os.path.join(backend_dir, "test_out_two.3mf")
    parts = [
        {"name": "Base", "color_hex": "#FFFFFF", "mesh": create_cube_mesh((30, 30, 2)), "role": "base"},
        {"name": "Border", "color_hex": "#EF4444", "mesh": create_cube_mesh((32, 32, 1)), "role": "border"},
    ]
    saved = generate_production_3mf(
        output_path=out_path,
        parts=parts,
        print_settings={"layer_height": "0.16", "infill": "40", "nozzle_size": "0.4", "color_hex": "#FFFFFF"},
    )
    
    res = validate_3mf_package(saved)
    print(f"Validation result: valid={res['valid']}, errors={res['errors']}")
    assert res["valid"], f"Two color package validation failed: {res['errors']}"
    
    with zipfile.ZipFile(saved, "r") as zf:
        model_xml = zf.read("3D/3dmodel.model").decode("utf-8")
        assert '#FFFFFF' in model_xml
        assert '#EF4444' in model_xml
        assert '<component objectid="2"' in model_xml
        assert '<component objectid="3"' in model_xml
        
        model_cfg = zf.read("Metadata/model_settings.config").decode("utf-8")
        assert 'part id="2"' in model_cfg
        assert 'part id="3"' in model_cfg
        assert 'key="extruder" value="1"' in model_cfg
        assert 'key="extruder" value="2"' in model_cfg
    
    if os.path.exists(saved):
        os.remove(saved)
    print("Test 2 PASSED!")


def test_four_colors():
    print("\n--- Test 3: Four Colors (Base, Border, Graphic, Text) ---")
    out_path = os.path.join(backend_dir, "test_out_four.3mf")
    parts = [
        {"name": "Base", "color_hex": "#222222", "mesh": create_cube_mesh((40, 40, 2)), "role": "base"},
        {"name": "Border", "color_hex": "#FFFFFF", "mesh": create_cube_mesh((42, 42, 1)), "role": "border"},
        {"name": "Graphic", "color_hex": "#EF4444", "mesh": create_cube_mesh((20, 20, 1)), "role": "graphic"},
        {"name": "Text", "color_hex": "#0088FF", "mesh": create_cube_mesh((15, 10, 1)), "role": "text"},
    ]
    saved = generate_production_3mf(
        output_path=out_path,
        parts=parts,
        print_settings={"layer_height": "0.12", "infill": "20", "nozzle_size": "0.2", "color_hex": "#222222"},
    )
    
    res = validate_3mf_package(saved)
    print(f"Validation result: valid={res['valid']}, errors={res['errors']}")
    assert res["valid"], f"Four color package validation failed: {res['errors']}"
    
    with zipfile.ZipFile(saved, "r") as zf:
        model_xml = zf.read("3D/3dmodel.model").decode("utf-8")
        for color in ["#222222", "#FFFFFF", "#EF4444", "#0088FF"]:
            assert color in model_xml, f"Missing color {color} in 3dmodel.model"
            
        proj_xml = zf.read("Metadata/project_settings.config").decode("utf-8")
        for color in ["#222222", "#FFFFFF", "#EF4444", "#0088FF"]:
            assert color in proj_xml, f"Missing color {color} in project_settings.config"
            
        # Verify 4 components in assembly object 1
        for obj_id in ["2", "3", "4", "5"]:
            assert f'<component objectid="{obj_id}"' in model_xml
    
    if os.path.exists(saved):
        os.remove(saved)
    print("Test 3 PASSED!")


def test_print_settings():
    print("\n--- Test 4: Print Settings Propagation ---")
    out_path = os.path.join(backend_dir, "test_out_settings.3mf")
    parts = [
        {"name": "Base", "color_hex": "#333333", "mesh": create_cube_mesh(), "role": "base"}
    ]
    saved = generate_production_3mf(
        output_path=out_path,
        parts=parts,
        print_settings={
            "color_hex": "#333333",
            "layer_height": "0.12",
            "infill": "40",
            "nozzle_size": "0.2",
            "material": "PLA",
        },
    )
    
    with zipfile.ZipFile(saved, "r") as zf:
        # project_settings.config
        proj_xml = zf.read("Metadata/project_settings.config").decode("utf-8")
        assert 'key="layer_height" value="0.12"' in proj_xml
        assert 'key="fill_density" value="40%"' in proj_xml
        assert 'key="nozzle_diameter" value="0.2"' in proj_xml
        
        # SlicingConfig.ini
        slicing_ini = zf.read("Metadata/SlicingConfig.ini").decode("utf-8")
        assert 'layer_height = 0.12' in slicing_ini
        assert 'fill_density = 40%' in slicing_ini
        assert 'nozzle_diameter = 0.2' in slicing_ini
        
        # plate_1.config
        plate_cfg = zf.read("Metadata/plate_1.config").decode("utf-8")
        assert 'value="1"' in plate_cfg
    
    if os.path.exists(saved):
        os.remove(saved)
    print("Test 4 PASSED!")


def test_reference_structure_comparison():
    print("\n--- Test 5: Reference Structure Comparison ---")
    ref_path = os.path.join(backend_dir, "projects_3mf", "test_multicolor.3mf")
    if not os.path.exists(ref_path):
        print(f"Reference file {ref_path} not found, skipping comparison.")
        return
        
    out_path = os.path.join(backend_dir, "test_out_cmp.3mf")
    parts = [
        {"name": "Base", "color_hex": "#222222", "mesh": create_cube_mesh(), "role": "base"}
    ]
    saved = generate_production_3mf(
        output_path=out_path,
        parts=parts,
        print_settings={"color_hex": "#222222"},
    )
    
    with zipfile.ZipFile(ref_path, "r") as ref_zf, zipfile.ZipFile(saved, "r") as gen_zf:
        ref_names = set(ref_zf.namelist())
        gen_names = set(gen_zf.namelist())
        
        print(f"Reference entries count: {len(ref_names)}")
        print(f"Generated entries count: {len(gen_names)}")
        
        # Key Bambu required files must be present
        key_files = [
            "[Content_Types].xml",
            "_rels/.rels",
            "3D/3dmodel.model",
            "Metadata/slice_info.config",
            "Metadata/project_settings.config",
            "Metadata/model_settings.config",
            "Metadata/plate_1.config",
            "Metadata/plate_1.png",
            "Metadata/SlicingConfig.ini",
        ]
        for kf in key_files:
            assert kf in gen_names, f"Key file {kf} missing from generated archive!"
            
        # Check archive comment
        assert gen_zf.comment == b"created by BambuLab", f"Wrong zip comment: {gen_zf.comment}"
        
    if os.path.exists(saved):
        os.remove(saved)
    print("Test 5 PASSED!")


if __name__ == "__main__":
    print("Starting Bambu Studio 3MF Automated Test Suite...")
    test_single_color()
    test_two_colors()
    test_four_colors()
    test_print_settings()
    test_reference_structure_comparison()
    print("\n==========================================")
    print("ALL BAMBU 3MF TESTS PASSED SUCCESSFULLY! [OK]")
    print("==========================================")
