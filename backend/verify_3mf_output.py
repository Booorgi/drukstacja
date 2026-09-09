"""
Ręczna weryfikacja wygenerowanego pakietu .3MF: listing archiwum, kontrola braku
geometrii w 3D/3dmodel.model oraz mapowanie części na ekstrudery.

Użycie:
    python backend/verify_3mf_output.py [sciezka.3mf]

Bez argumentu generuje przykładowy 4-kolorowy brelok i sprawdza właśnie jego.
"""

import os
import sys
import json
import zipfile
import tempfile
import xml.etree.ElementTree as ET

backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from packager_3mf import generate_production_3mf, validate_3mf_package

NS = "{http://schemas.microsoft.com/3dmanufacturing/core/2015/02}"


def build_sample():
    import trimesh

    out_path = os.path.join(tempfile.gettempdir(), "drukstacja_verify.3mf")
    parts = [
        {"name": "Baza", "color_hex": "#080504", "mesh": trimesh.creation.box(extents=(40, 25, 3)), "role": "base_mesh"},
        {"name": "Uszko", "color_hex": "#080504", "mesh": trimesh.creation.box(extents=(6, 6, 3)), "role": "ring_mesh"},
        {"name": "Rant", "color_hex": "#854A22", "mesh": trimesh.creation.box(extents=(42, 27, 1)), "role": "border_mesh"},
        {"name": "Graphic_1", "color_hex": "#C4864F", "mesh": trimesh.creation.box(extents=(15, 10, 1)), "role": "graphic_mesh"},
        {"name": "Tekst", "color_hex": "#DFDFDE", "mesh": trimesh.creation.box(extents=(20, 5, 1)), "role": "text_mesh"},
    ]
    return generate_production_3mf(output_path=out_path, parts=parts)


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else build_sample()
    print(f"Plik: {path}\n")

    with zipfile.ZipFile(path) as zf:
        print("--- Zawartość archiwum ---")
        for info in zf.infolist():
            comment = (info.comment or b"").decode("utf-8", errors="replace")
            print(f"{info.file_size:>10}  {info.filename:<45} comment={comment!r}")

        main_xml = zf.read("3D/3dmodel.model").decode("utf-8", errors="replace")
        print("\n--- 3D/3dmodel.model ---")
        print(f"zawiera <mesh>: {'<mesh>' in main_xml}  (musi być False)")

        root = ET.fromstring(main_xml)
        resources = root.find(f"{NS}resources")
        if resources is None:
            resources = root.find("resources")
        for obj in resources:
            comps = obj.find(f"{NS}components")
            if comps is None:
                comps = obj.find("components")
            if comps is None:
                continue
            print(f"assembly object id={obj.attrib.get('id')}, komponentów: {len(list(comps))}")
            for c in list(comps):
                print(f"   component {dict(c.attrib)}")

        ms = zf.read("Metadata/model_settings.config").decode("utf-8", errors="replace")
        ms_root = ET.fromstring(ms)
        print("\n--- Metadata/model_settings.config ---")
        for obj in ms_root.findall("object"):
            print(f"object id={obj.attrib.get('id')}")
            for part in obj.findall("part"):
                name = ""
                extruder = ""
                for m in part.findall("metadata"):
                    if m.attrib.get("key") == "name":
                        name = m.attrib.get("value")
                    if m.attrib.get("key") == "extruder":
                        extruder = m.attrib.get("value")
                print(f"   part id={part.attrib.get('id')} subtype={part.attrib.get('subtype')} name={name} extruder={extruder}")

        ps = json.loads(zf.read("Metadata/project_settings.config").decode("utf-8", errors="replace"))
        print("\n--- Metadata/project_settings.config ---")
        print(f"printer_model      : {ps.get('printer_model')}")
        print(f"layer_height       : {ps.get('layer_height')}")
        print(f"sparse_infill_density: {ps.get('sparse_infill_density')}")
        print(f"filament_colour    : {ps.get('filament_colour')}")

    result = validate_3mf_package(path)
    print(f"\n--- Walidacja ---\nvalid: {result['valid']}")
    for err in result.get("errors", []):
        print(f"  BŁĄD: {err}")

    return 0 if result["valid"] else 1


if __name__ == "__main__":
    sys.exit(main())
