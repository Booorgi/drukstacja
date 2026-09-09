"""
Zestaw testów automatycznych zgodności pakietów .3MF z architekturą MakerLab / Bambu Studio.
Zweryfikowany bezpośrednio w oparciu o referencyjny plik Keychain Draft.3mf.

Kluczowe asercje łańcucha zależności:
1. component objectid w 3D/3dmodel.model
      ↓
2. istnieje object o tym ID w 3D/Objects/object-XXXX.model
      ↓
3. istnieje part o tym samym ID w Metadata/model_settings.config
      ↓
4. part posiada atrybut subtype="normal_part" oraz metadata key="extruder" value="N"
      ↓
5. extruder N (1-based) wskazuje na poprawny indeks w filament_colour w Metadata/project_settings.config
      ↓
6. filament posiada poprawny kod HEX oraz profil Bambu PLA Basic @BBL A1
"""

import os
import sys
import json
import zipfile
import tempfile
import uuid
import xml.etree.ElementTree as ET
import trimesh

backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from packager_3mf import generate_production_3mf, validate_3mf_package


def create_cube_mesh(size=(20, 20, 2)):
    """Tworzy prosty prostopadłościan trimesh."""
    return trimesh.creation.box(extents=size)


def test_reference_scenario_keychain_draft():
    """
    Scenariusz z Punktu 24 promptu (odwzorowanie kolorów Keychain Draft.3mf):
    Baza       → #080504
    Rant       → #854A22
    Grafika    → #C4864F
    Tekst      → #DFDFDE
    4 filamenty, layer=0.20, infill=15%, nozzle=0.4, material=PLA, printer=Bambu Lab A1.
    Plik docelowy: test_generated_bambu.3mf
    """
    print("\n--- Running test_reference_scenario_keychain_draft ---")
    out_path = os.path.join(backend_dir, "test_generated_bambu.3mf")

    parts = [
        {"name": "Baza", "color_hex": "#080504", "mesh": create_cube_mesh((40, 40, 2)), "role": "base"},
        {"name": "Rant", "color_hex": "#854A22", "mesh": create_cube_mesh((42, 42, 1)), "role": "rim"},
        {"name": "Grafika", "color_hex": "#C4864F", "mesh": create_cube_mesh((20, 20, 1)), "role": "graphic"},
        {"name": "Tekst", "color_hex": "#DFDFDE", "mesh": create_cube_mesh((15, 10, 1)), "role": "text"},
    ]

    saved = generate_production_3mf(
        output_path=out_path,
        parts=parts,
        order_metadata={"order_id": "TEST_REF_01", "file_name": "Keychain_Generated.3mf"},
        print_settings={
            "material": "PLA",
            "nozzle_size": 0.4,
            "layer_height": 0.20,
            "infill": 15,
        },
    )

    assert os.path.exists(saved), f"Plik {saved} nie istnieje!"

    # 1. Walidacja pakietu
    validation = validate_3mf_package(saved)
    assert validation["valid"], f"Błąd walidacji pakietu test_generated_bambu.3mf: {validation['errors']}"

    # 2. Weryfikacja zawartości archiwum ZIP
    with zipfile.ZipFile(saved, "r") as zf:
        namelist = zf.namelist()
        
        # Weryfikacja struktury katalogów
        assert "3D/3dmodel.model" in namelist
        assert not any(n.startswith("3D/Objects/") for n in namelist)
        assert "Metadata/model_settings.config" in namelist
        assert "Metadata/project_settings.config" in namelist
        assert "Metadata/plate_1.png" in namelist
        assert "[Content_Types].xml" in namelist
        assert "_rels/.rels" in namelist

        # Weryfikacja assembly w 3D/3dmodel.model
        main_model_xml = zf.read("3D/3dmodel.model").decode("utf-8")
        assert '<object id="100"' in main_model_xml
        assert 'name="Keychain_Assembly"' in main_model_xml
        assert "<components>" in main_model_xml
        assert '<component objectid="2"/>' in main_model_xml
        assert '<component objectid="3"/>' in main_model_xml
        assert '<component objectid="4"/>' in main_model_xml
        assert '<component objectid="5"/>' in main_model_xml
        assert '<item objectid="100"' in main_model_xml
        assert 'BambuStudio:3mfVersion' in main_model_xml
        assert '<object id="2"' in main_model_xml
        assert '<object id="3"' in main_model_xml
        assert '<object id="4"' in main_model_xml
        assert '<object id="5"' in main_model_xml
        assert "<mesh>" in main_model_xml

        # Weryfikacja Metadata/model_settings.config
        ms_xml = zf.read("Metadata/model_settings.config").decode("utf-8")
        assert '<object id="100">' in ms_xml
        assert '<part id="2"' in ms_xml
        assert '<part id="3"' in ms_xml
        assert '<part id="4"' in ms_xml
        assert '<part id="5"' in ms_xml
        assert '<metadata key="extruder" value="1"/>' in ms_xml
        assert '<metadata key="extruder" value="2"/>' in ms_xml
        assert '<metadata key="extruder" value="3"/>' in ms_xml
        assert '<metadata key="extruder" value="4"/>' in ms_xml

        # Weryfikacja Metadata/project_settings.config
        ps = json.loads(zf.read("Metadata/project_settings.config").decode("utf-8"))
        assert ps["filament_colour"] == ["#080504", "#854A22", "#C4864F", "#DFDFDE"]
        assert ps["layer_height"] == "0.2" or ps["layer_height"] == "0.20"
        assert ps["sparse_infill_density"] == "15%"
        assert ps["printer_model"] == "Bambu Lab A1"
        assert ps["filament_settings_id"] == ["Bambu PLA Basic @BBL A1"] * 4
        assert ps["nozzle_diameter"] == ["0.4"]

    print("test_reference_scenario_keychain_draft: PASSED [OK]")


def test_shared_color_reuses_extruder():
    """
    Testuje punkt 21 wytycznych:
    Jeśli dwie części mają ten sam kolor (np. Baza -> czarny, Rant -> czarny, Grafika -> czerwony),
    to Baza i Rant muszą otrzymać extruder=1, a Grafika extruder=2.
    Nie mogą powstać dwa osobne filamenty dla tego samego koloru!
    """
    print("\n--- Running test_shared_color_reuses_extruder ---")
    out_path = os.path.join(tempfile.gettempdir(), f"test_shared_col_{uuid.uuid4().hex[:6]}.3mf")
    parts = [
        {"name": "Baza", "color_hex": "#111111", "mesh": create_cube_mesh()},
        {"name": "Rant", "color_hex": "#111111", "mesh": create_cube_mesh()},
        {"name": "Grafika", "color_hex": "#FF0000", "mesh": create_cube_mesh()},
    ]

    saved = generate_production_3mf(output_path=out_path, parts=parts)
    assert os.path.exists(saved)

    with zipfile.ZipFile(saved, "r") as zf:
        ps = json.loads(zf.read("Metadata/project_settings.config").decode("utf-8"))
        assert ps["filament_colour"] == ["#111111", "#FF0000"], f"Oczekiwano 2 unikalnych kolorów, otrzymano: {ps['filament_colour']}"

        ms_xml = zf.read("Metadata/model_settings.config").decode("utf-8")
        ms_root = ET.fromstring(ms_xml)
        obj_node = ms_root.find("object")
        parts_nodes = obj_node.findall("part")
        assert len(parts_nodes) == 3

        # Baza (part 1) i Rant (part 2) mają ten sam extruder=1
        ext_1 = [m.attrib["value"] for m in parts_nodes[0].findall("metadata") if m.attrib.get("key") == "extruder"][0]
        ext_2 = [m.attrib["value"] for m in parts_nodes[1].findall("metadata") if m.attrib.get("key") == "extruder"][0]
        ext_3 = [m.attrib["value"] for m in parts_nodes[2].findall("metadata") if m.attrib.get("key") == "extruder"][0]

        assert ext_1 == "1", f"Baza powinna mieć extruder 1, ma {ext_1}"
        assert ext_2 == "1", f"Rant powinien współdzielić extruder 1, ma {ext_2}"
        assert ext_3 == "2", f"Grafika powinna mieć extruder 2, ma {ext_3}"

    if os.path.exists(saved):
        os.remove(saved)
    print("test_shared_color_reuses_extruder: PASSED [OK]")


def test_dependency_chain_validation():
    """
    Testuje pełny łańcuch zależności:
    component objectid -> object id z <mesh> w 3D/3dmodel.model -> part id in model_settings -> extruder -> filament_colour
    """
    print("\n--- Running test_dependency_chain_validation ---")
    out_path = os.path.join(tempfile.gettempdir(), f"test_chain_{uuid.uuid4().hex[:6]}.3mf")
    parts = [
        {"name": "P_A", "color_hex": "#AAAAAA", "mesh": create_cube_mesh()},
        {"name": "P_B", "color_hex": "#BBBBBB", "mesh": create_cube_mesh()},
        {"name": "P_C", "color_hex": "#CCCCCC", "mesh": create_cube_mesh()},
    ]

    saved = generate_production_3mf(output_path=out_path, parts=parts)
    val = validate_3mf_package(saved)
    assert val["valid"], f"Walidacja łańcucha nie powiodła się: {val['errors']}"

    assert len(val["details"]["component_objectids"]) == 3
    assert val["details"]["component_objectids"] == val["details"]["object_model_part_ids"]

    for cid in val["details"]["component_objectids"]:
        assert cid in val["details"]["part_extruders"]
        ext_idx = int(val["details"]["part_extruders"][cid]) - 1
        assert 0 <= ext_idx < len(val["details"]["filament_colours"])
        assert val["details"]["filament_colours"][ext_idx].startswith("#")

    if os.path.exists(saved):
        os.remove(saved)
    print("test_dependency_chain_validation: PASSED [OK]")


def test_process_settings_propagation():
    """Weryfikuje poprawną propagację parametrów druku (warstwa, infill, dysza, materiał)."""
    print("\n--- Running test_process_settings_propagation ---")
    out_path = os.path.join(tempfile.gettempdir(), f"test_settings_{uuid.uuid4().hex[:6]}.3mf")
    parts = [{"name": "Sample", "color_hex": "#333333", "mesh": create_cube_mesh()}]

    saved = generate_production_3mf(
        output_path=out_path,
        parts=parts,
        print_settings={
            "layer_height": 0.12,
            "infill": 100,  # Powinno zostać ograniczone do bezpiecznych 99%
            "nozzle_size": 0.4,
            "material": "PLA",
        },
    )

    with zipfile.ZipFile(saved, "r") as zf:
        ps = json.loads(zf.read("Metadata/project_settings.config").decode("utf-8"))
        assert ps["layer_height"] == "0.12"
        assert ps["sparse_infill_density"] == "100%"
        assert "0.12mm High Quality @BBL A1" in ps["print_settings_id"]
        assert ps["printer_settings_id"] == "Bambu Lab A1 0.4 nozzle"

    if os.path.exists(saved):
        os.remove(saved)
    print("test_process_settings_propagation: PASSED [OK]")


def test_multicolor_graphic_layers():
    """
    Weryfikuje wielokolorową grafikę:
    - Baza + Uszko -> extruder="1"
    - Rant -> extruder="2"
    - Grafika Kolor 1 -> extruder="3"
    - Grafika Kolor 2 -> extruder="4"
    - Grafika Kolor 3 -> extruder="5"
    - Grafika Kolor 4 -> extruder="6"
    """
    print("\n--- Running test_multicolor_graphic_layers ---")
    out_path = os.path.join(tempfile.gettempdir(), f"test_multi_graphic_{uuid.uuid4().hex[:6]}.3mf")
    parts = [
        {"name": "Baza", "color_hex": "#111215", "mesh": create_cube_mesh((50, 50, 2)), "role": "base_mesh", "extruder": 1},
        {"name": "Uszko", "color_hex": "#111215", "mesh": create_cube_mesh((8, 8, 2)), "role": "ring_mesh", "extruder": 1},
        {"name": "Rant", "color_hex": "#FFFFFF", "mesh": create_cube_mesh((52, 52, 1)), "role": "border_mesh", "extruder": 2},
        {"name": "Graphic_Color_1", "color_hex": "#00BCDB", "mesh": create_cube_mesh((20, 20, 1)), "role": "graphic_mesh", "extruder": 3},
        {"name": "Graphic_Color_2", "color_hex": "#002FA7", "mesh": create_cube_mesh((15, 15, 1)), "role": "graphic_mesh", "extruder": 4},
        {"name": "Graphic_Color_3", "color_hex": "#6E3725", "mesh": create_cube_mesh((10, 10, 1)), "role": "graphic_mesh", "extruder": 5},
        {"name": "Graphic_Color_4", "color_hex": "#E8D8C8", "mesh": create_cube_mesh((5, 5, 1)), "role": "graphic_mesh", "extruder": 6},
    ]

    saved = generate_production_3mf(output_path=out_path, parts=parts)
    val = validate_3mf_package(saved)
    assert val["valid"], f"Walidacja wielokolorowej grafiki nie powiodła się: {val['errors']}"

    assert len(val["details"]["component_objectids"]) == 7
    assert len(val["details"]["filament_colours"]) == 6
    assert val["details"]["filament_colours"] == ["#111215", "#FFFFFF", "#00BCDB", "#002FA7", "#6E3725", "#E8D8C8"]

    # Baza i Uszko współdzielą ekstruder 1
    exts = list(val["details"]["part_extruders"].values())
    assert exts[0] == "1"
    assert exts[1] == "1"
    assert exts[2] == "2"
    assert exts[3] == "3"
    assert exts[4] == "4"
    assert exts[5] == "5"
    assert exts[6] == "6"

    if os.path.exists(saved):
        os.remove(saved)
    print("test_multicolor_graphic_layers: PASSED [OK]")


if __name__ == "__main__":
    print("Uruchamianie testów architektury MakerLab / Bambu Studio 3MF...")
    test_reference_scenario_keychain_draft()
    test_shared_color_reuses_extruder()
    test_dependency_chain_validation()
    test_process_settings_propagation()
    test_multicolor_graphic_layers()
    print("\n=======================================================")
    print("WSZYSTKIE TESTY ZGODNOŚCI Z KEYCHAIN DRAFT PRZESZŁY POMYŚLNIE! [OK]")
    print("=======================================================")
