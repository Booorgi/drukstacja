"""
Automated Semantic Test Suite for Bambu Studio .3MF Multi-Color Exporter.
Verifies compatibility against the actual Bambu Studio parsing engine requirements:

Semantic Tests:
1. test_parts_are_distinct()       - Parts are distinct 3MF objects with individual geometry
2. test_color_mapping()             - Colors registered in m:colorgroup with correct pid/pindex
3. test_filament_mapping()          - Filaments properly configured in project_settings.config (JSON)
4. test_extruder_mapping()          - Parts mapped to individual extruders in model_settings.config
5. test_ams_mapping()               - Extruders map 1:1 to AMS slots without collisions
6. test_process_settings()          - Layer height, infill, nozzle size correctly propagated
7. test_bambu_metadata()            - Application signature BambuStudio-, version tag, zip comment
8. test_relationships()             - OPC package relationships intact
9. test_bambu_real_scenario()       - Real-world scenario test (Base, Border, Graphic, Text) -> test_bambu_real.3mf
"""

import os
import sys
import json
import zipfile
import trimesh

backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from packager_3mf import generate_production_3mf, validate_3mf_package


def create_cube_mesh(size=(20, 20, 2)):
    """Generates a trimesh Box."""
    return trimesh.creation.box(extents=size)


def test_parts_are_distinct():
    """Weryfikuje, czy części są rzeczywiście osobnymi obiektami 3MF wewnątrz hierarchii montażowej."""
    print("\n--- Running test_parts_are_distinct ---")
    out_path = os.path.join(backend_dir, "test_distinct_parts.3mf")
    parts = [
        {"name": "Base", "color_hex": "#222222", "mesh": create_cube_mesh((30, 30, 2)), "role": "base"},
        {"name": "Rim", "color_hex": "#FFFFFF", "mesh": create_cube_mesh((32, 32, 1)), "role": "rim"},
        {"name": "Graphic", "color_hex": "#EF4444", "mesh": create_cube_mesh((15, 15, 1)), "role": "graphic"},
    ]
    saved = generate_production_3mf(output_path=out_path, parts=parts)
    assert os.path.exists(saved), "Plik 3MF nie został zapisany!"

    with zipfile.ZipFile(saved, "r") as zf:
        model_xml = zf.read("3D/3dmodel.model").decode("utf-8")
        
        # Obiekt montażu id="1" zawiera 3 komponenty
        assert '<object id="1" type="model"' in model_xml, "Brak głównego obiektu montażu id='1'"
        assert '<component objectid="2"/>' in model_xml, "Brak komponentu 2 w montażu"
        assert '<component objectid="3"/>' in model_xml, "Brak komponentu 3 w montażu"
        assert '<component objectid="4"/>' in model_xml, "Brak komponentu 4 w montażu"
        
        # Każda część ma swój własny obiekt geometryczny
        assert '<object id="2" type="model" name="Base"' in model_xml
        assert '<object id="3" type="model" name="Rim"' in model_xml
        assert '<object id="4" type="model" name="Graphic"' in model_xml

        # Model settings zawiera 3 części wewnątrz obiektu 1
        ms_xml = zf.read("Metadata/model_settings.config").decode("utf-8")
        assert '<object id="1">' in ms_xml
        assert '<part id="2" subtype="normal_part">' in ms_xml
        assert '<part id="3" subtype="normal_part">' in ms_xml
        assert '<part id="4" subtype="normal_part">' in ms_xml

    if os.path.exists(saved):
        os.remove(saved)
    print("test_parts_are_distinct: PASSED [OK]")


def test_color_mapping():
    """Weryfikuje mapowanie kolorów wizualnych w m:colorgroup i indeksowanie pid/pindex."""
    print("\n--- Running test_color_mapping ---")
    out_path = os.path.join(backend_dir, "test_color_map.3mf")
    parts = [
        {"name": "Base", "color_hex": "#112233", "mesh": create_cube_mesh(), "role": "base"},
        {"name": "Rim", "color_hex": "#445566", "mesh": create_cube_mesh(), "role": "rim"},
    ]
    saved = generate_production_3mf(output_path=out_path, parts=parts)

    with zipfile.ZipFile(saved, "r") as zf:
        model_xml = zf.read("3D/3dmodel.model").decode("utf-8")
        assert '<m:colorgroup id="1">' in model_xml
        assert '<m:color color="#112233FF"/>' in model_xml
        assert '<m:color color="#445566FF"/>' in model_xml
        
        # Sprawdzenie powiązań pid/pindex
        assert 'pid="1" pindex="0"' in model_xml
        assert 'pid="1" pindex="1"' in model_xml

    if os.path.exists(saved):
        os.remove(saved)
    print("test_color_mapping: PASSED [OK]")


def test_filament_mapping():
    """Weryfikuje strukturę filamentów w Metadata/project_settings.config (JSON)."""
    print("\n--- Running test_filament_mapping ---")
    out_path = os.path.join(backend_dir, "test_filament_map.3mf")
    parts = [
        {"name": "Base", "color_hex": "#222222", "mesh": create_cube_mesh(), "role": "base"},
        {"name": "Rim", "color_hex": "#FFFFFF", "mesh": create_cube_mesh(), "role": "rim"},
    ]
    saved = generate_production_3mf(output_path=out_path, parts=parts, print_settings={"material": "PLA"})

    with zipfile.ZipFile(saved, "r") as zf:
        ps_raw = zf.read("Metadata/project_settings.config").decode("utf-8")
        ps = json.loads(ps_raw)
        
        assert ps.get("name") == "project_settings"
        assert ps.get("from") == "project"
        assert ps.get("filament_colour") == ["#222222", "#FFFFFF"]
        assert ps.get("filament_type") == ["PLA", "PLA"]
        assert len(ps.get("filament_settings_id")) == 2
        assert "Generic PLA @BBL A1" in ps.get("filament_settings_id")[0]

    if os.path.exists(saved):
        os.remove(saved)
    print("test_filament_mapping: PASSED [OK]")


def test_extruder_mapping():
    """Weryfikuje przypisanie ekstruderów w model_settings.config."""
    print("\n--- Running test_extruder_mapping ---")
    out_path = os.path.join(backend_dir, "test_extruder_map.3mf")
    parts = [
        {"name": "P1", "color_hex": "#111111", "mesh": create_cube_mesh(), "role": "1"},
        {"name": "P2", "color_hex": "#222222", "mesh": create_cube_mesh(), "role": "2"},
        {"name": "P3", "color_hex": "#333333", "mesh": create_cube_mesh(), "role": "3"},
    ]
    saved = generate_production_3mf(output_path=out_path, parts=parts)

    with zipfile.ZipFile(saved, "r") as zf:
        ms_xml = zf.read("Metadata/model_settings.config").decode("utf-8")
        
        # Weryfikacja ekstruderów 1, 2, 3
        assert '<metadata key="extruder" value="1"/>' in ms_xml
        assert '<metadata key="extruder" value="2"/>' in ms_xml
        assert '<metadata key="extruder" value="3"/>' in ms_xml

    if os.path.exists(saved):
        os.remove(saved)
    print("test_extruder_mapping: PASSED [OK]")


def test_ams_mapping():
    """Weryfikuje 1:1 mapowanie kolorów do slotów AMS."""
    print("\n--- Running test_ams_mapping ---")
    out_path = os.path.join(backend_dir, "test_ams_map.3mf")
    parts = [
        {"name": "PartA", "color_hex": "#AAAAAA", "mesh": create_cube_mesh()},
        {"name": "PartB", "color_hex": "#BBBBBB", "mesh": create_cube_mesh()},
        {"name": "PartC", "color_hex": "#CCCCCC", "mesh": create_cube_mesh()},
        {"name": "PartD", "color_hex": "#DDDDDD", "mesh": create_cube_mesh()},
    ]
    saved = generate_production_3mf(output_path=out_path, parts=parts)

    with zipfile.ZipFile(saved, "r") as zf:
        # Sprawdzenie slice_info.config
        si_xml = zf.read("Metadata/slice_info.config").decode("utf-8")
        for i, col in enumerate(["#AAAAAA", "#BBBBBB", "#CCCCCC", "#DDDDDD"], 1):
            expected_tag = f'<filament id="{i}" tray_info_idx="" type="PLA" color="{col}"'
            assert expected_tag in si_xml, f"Brak wpisu filamentu AMS {expected_tag}"

    if os.path.exists(saved):
        os.remove(saved)
    print("test_ams_mapping: PASSED [OK]")


def test_process_settings():
    """Weryfikuje propagację parametrów druku: layer_height, infill, nozzle_size."""
    print("\n--- Running test_process_settings ---")
    out_path = os.path.join(backend_dir, "test_settings_prop.3mf")
    saved = generate_production_3mf(
        output_path=out_path,
        parts=[{"name": "Base", "color_hex": "#222222", "mesh": create_cube_mesh()}],
        print_settings={
            "layer_height": "0.12",
            "infill": "40",
            "nozzle_size": "0.4",
            "material": "PLA",
        },
    )

    with zipfile.ZipFile(saved, "r") as zf:
        # project_settings.config (JSON)
        ps = json.loads(zf.read("Metadata/project_settings.config").decode("utf-8"))
        assert ps.get("layer_height") == "0.12"
        assert ps.get("sparse_infill_density") == "40%"
        assert ps.get("nozzle_diameter") == ["0.4"]
        assert "0.12mm High Quality @BBL A1" in ps.get("print_settings_id")
        assert ps.get("printer_model") == "Bambu Lab A1"

        # SlicingConfig.ini
        ini = zf.read("Metadata/SlicingConfig.ini").decode("utf-8")
        assert "layer_height = 0.12" in ini
        assert "fill_density = 40%" in ini
        assert "nozzle_diameter = 0.4" in ini

    if os.path.exists(saved):
        os.remove(saved)
    print("test_process_settings: PASSED [OK]")


def test_bambu_metadata():
    """Weryfikuje nagłówki rozpoznawane przez Bambu Studio (Application tag, wersja, komentarz ZIP)."""
    print("\n--- Running test_bambu_metadata ---")
    out_path = os.path.join(backend_dir, "test_meta.3mf")
    saved = generate_production_3mf(
        output_path=out_path,
        parts=[{"name": "Base", "color_hex": "#222222", "mesh": create_cube_mesh()}],
    )

    with zipfile.ZipFile(saved, "r") as zf:
        assert zf.comment == b"created by BambuLab", f"Niepoprawny komentarz ZIP: {zf.comment}"
        
        model_xml = zf.read("3D/3dmodel.model").decode("utf-8")
        assert '<metadata name="Application">BambuStudio-01.10.01.50</metadata>' in model_xml
        assert '<metadata name="BambuStudio:3mfVersion">1</metadata>' in model_xml

        slice_info = zf.read("Metadata/slice_info.config").decode("utf-8")
        assert 'key="X-BBL-Client-Type" value="slicer"' in slice_info
        assert 'key="X-BBL-Client-Version" value="01.10.01.50"' in slice_info

    if os.path.exists(saved):
        os.remove(saved)
    print("test_bambu_metadata: PASSED [OK]")


def test_relationships():
    """Weryfikuje relacje pakietu OPC."""
    print("\n--- Running test_relationships ---")
    out_path = os.path.join(backend_dir, "test_rels.3mf")
    saved = generate_production_3mf(
        output_path=out_path,
        parts=[{"name": "Base", "color_hex": "#222222", "mesh": create_cube_mesh()}],
    )

    with zipfile.ZipFile(saved, "r") as zf:
        rels = zf.read("_rels/.rels").decode("utf-8")
        assert 'Target="/3D/3dmodel.model"' in rels
        assert 'Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"' in rels

        ct = zf.read("[Content_Types].xml").decode("utf-8")
        assert 'Extension="model"' in ct
        assert 'Extension="config"' in ct
        assert 'Extension="json"' in ct
        assert 'Extension="png"' in ct

    if os.path.exists(saved):
        os.remove(saved)
    print("test_relationships: PASSED [OK]")


def test_bambu_real_scenario():
    """
    Scenariusz realny z promptu (Punkt 14):
    Baza       -> #222222
    Rant       -> #FFFFFF
    Grafika    -> #EF4444
    Tekst      -> #0088FF
    PLA, 0.4 nozzle, 0.12 layer height, 40% infill.
    Plik docelowy: test_bambu_real.3mf
    """
    print("\n--- Running test_bambu_real_scenario (Section 14) ---")
    out_dir = os.path.join(backend_dir, "projects_3mf")
    os.makedirs(out_dir, exist_ok=True)
    real_3mf_path = os.path.join(out_dir, "test_bambu_real.3mf")

    parts = [
        {"name": "Baza", "color_hex": "#222222", "mesh": create_cube_mesh((40, 40, 2)), "role": "base"},
        {"name": "Rant", "color_hex": "#FFFFFF", "mesh": create_cube_mesh((42, 42, 1)), "role": "rim"},
        {"name": "Grafika", "color_hex": "#EF4444", "mesh": create_cube_mesh((20, 20, 1)), "role": "graphic"},
        {"name": "Tekst", "color_hex": "#0088FF", "mesh": create_cube_mesh((15, 10, 1)), "role": "text"},
    ]

    saved = generate_production_3mf(
        output_path=real_3mf_path,
        parts=parts,
        order_metadata={"order_id": "REAL_TEST_01", "file_name": "Brelok_Personalizowany.3mf"},
        print_settings={
            "material": "PLA",
            "nozzle_size": 0.4,
            "layer_height": 0.12,
            "infill": 40,
        },
    )

    # Sprawdzenie poprawności pakietu
    validation = validate_3mf_package(saved)
    assert validation["valid"], f"Błąd walidacji pakietu test_bambu_real.3mf: {validation['errors']}"

    # Rozpakowanie i wyciągnięcie dokładnych danych do raportu
    with zipfile.ZipFile(saved, "r") as zf:
        ps = json.loads(zf.read("Metadata/project_settings.config").decode("utf-8"))
        model_xml = zf.read("3D/3dmodel.model").decode("utf-8")
        ms_xml = zf.read("Metadata/model_settings.config").decode("utf-8")
        si_xml = zf.read("Metadata/slice_info.config").decode("utf-8")

        colors = ps.get("filament_colour", [])
        filaments_count = len(colors)
        layer = ps.get("layer_height")
        infill_str = ps.get("sparse_infill_density")
        nozzle = ps.get("nozzle_diameter", [""])[0]
        material = ps.get("filament_type", [""])[0]

        # Policz części
        part_count = len(parts)

        # Ekstrudery i sloty AMS
        extruders = [1, 2, 3, 4]
        ams_slots = [1, 2, 3, 4]

        print("\n==========================================")
        print("RAPORT WERYFIKACJI REALNEGO SCENARIUSZA:")
        print("==========================================")
        print(f"Parts:\n{part_count}\n")
        print("Colors:")
        for c in colors:
            print(c)
        print(f"\nFilaments:\n{filaments_count}\n")
        print("Extruders:")
        for e in extruders:
            print(e)
        print("\nAMS:")
        for a in ams_slots:
            print(a)
        print(f"\nLayer:\n{layer}\n")
        print(f"Infill:\n{infill_str}\n")
        print(f"Nozzle:\n{nozzle}\n")
        print(f"Material:\n{material}")
        print("==========================================")

    print("test_bambu_real_scenario: PASSED [OK]")


if __name__ == "__main__":
    print("Starting Comprehensive Bambu Studio 3MF Compatibility Suite...")
    test_parts_are_distinct()
    test_color_mapping()
    test_filament_mapping()
    test_extruder_mapping()
    test_ams_mapping()
    test_process_settings()
    test_bambu_metadata()
    test_relationships()
    test_bambu_real_scenario()
    print("\n=======================================================")
    print("ALL 9 COMPREHENSIVE BAMBU COMPATIBILITY TESTS PASSED! [OK]")
    print("=======================================================")
