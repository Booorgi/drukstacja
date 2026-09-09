"""
Test end-to-end endpointu /api/breloki/generate-direct-3mf.

Symuluje dokładnie to, co wysyła frontend (exportMultiPartKeychain):
lista plików "files" (part_1.stl ... part_N.stl) + JSON "metadata" z kolorem
i numerem ekstrudera dla każdej części. Weryfikuje, że zwrócony .3MF ma
strukturę Keychain Draft z N osobnymi częściami.

Uruchamiany osobno od test_bambu_3mf.py, bo import backend/main.py jest wolny.
"""

import io
import os
import sys
import json
import zipfile
import xml.etree.ElementTree as ET

import trimesh
from fastapi.testclient import TestClient

backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import main  # noqa: E402

NS = "{http://schemas.microsoft.com/3dmanufacturing/core/2015/02}"

PARTS = [
    ("Baza", "#080504", (40, 25, 3), "base_mesh", 1),
    ("Rant", "#854A22", (42, 27, 1), "border_mesh", 2),
    ("Graphic_1", "#C4864F", (15, 10, 1), "graphic_mesh", 3),
    ("Tekst", "#DFDFDE", (20, 5, 1), "text_mesh", 4),
]


def stl_bytes(extents):
    buf = io.BytesIO()
    trimesh.creation.box(extents=extents).export(buf, file_type="stl")
    return buf.getvalue()


def test_endpoint_returns_multipart_3mf():
    print("\n--- Running test_endpoint_returns_multipart_3mf ---")
    client = TestClient(main.app)

    files = []
    metadata = []
    for idx, (name, color, extents, role, extruder) in enumerate(PARTS, start=1):
        file_name = f"part_{idx}.stl"
        files.append(("files", (file_name, stl_bytes(extents), "model/stl")))
        metadata.append({
            "id": idx + 1,
            "name": name,
            "color": color,
            "fileName": file_name,
            "role": role,
            "extruder": extruder,
        })

    response = client.post(
        "/api/breloki/generate-direct-3mf",
        files=files,
        data={
            "metadata": json.dumps(metadata),
            "colors": json.dumps([m["color"] for m in metadata]),
            "file_name": "brelok_test.3mf",
            "material": "PLA",
            "color_hex": "#080504",
            "layer_height": "0.20",
            "nozzle_size": "0.4",
            "infill": "100",
        },
    )

    assert response.status_code == 200, f"HTTP {response.status_code}: {response.text[:500]}"

    with zipfile.ZipFile(io.BytesIO(response.content)) as zf:
        namelist = zf.namelist()
        assert "3D/Objects/object-7607.model" in namelist, namelist
        assert "3D/_rels/3dmodel.model.rels" in namelist, namelist

        main_xml = zf.read("3D/3dmodel.model").decode("utf-8")
        assert "<mesh>" not in main_xml, "3dmodel.model nie może zawierać geometrii"

        root = ET.fromstring(main_xml)
        resources = root.find(f"{NS}resources")
        if resources is None:
            resources = root.find("resources")

        components = []
        for obj in resources:
            comps = obj.find(f"{NS}components")
            if comps is None:
                comps = obj.find("components")
            if comps is not None:
                components = list(comps)
        assert len(components) == len(PARTS), f"Oczekiwano {len(PARTS)} części, jest {len(components)}"

        ms_root = ET.fromstring(zf.read("Metadata/model_settings.config").decode("utf-8"))
        config_obj = ms_root.find("object")
        extruders = []
        names = []
        for part in config_obj.findall("part"):
            for m in part.findall("metadata"):
                if m.attrib.get("key") == "extruder":
                    extruders.append(m.attrib.get("value"))
                if m.attrib.get("key") == "name":
                    names.append(m.attrib.get("value"))
        assert extruders == ["1", "2", "3", "4"], extruders
        assert names == [p[0] for p in PARTS], names

        ps = json.loads(zf.read("Metadata/project_settings.config").decode("utf-8"))
        assert ps["filament_colour"] == [p[1] for p in PARTS], ps["filament_colour"]

    print(f"Endpoint zwrócił {len(PARTS)} osobnych części, ekstrudery 1-4: PASSED [OK]")


if __name__ == "__main__":
    test_endpoint_returns_multipart_3mf()
    print("\n=======================================================")
    print("TEST ENDPOINTU WIELOCZĘŚCIOWEGO PRZESZEDŁ POMYŚLNIE! [OK]")
    print("=======================================================")
