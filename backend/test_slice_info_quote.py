"""Wycena z Metadata/slice_info.config (Photoset) vs estymator objętości i pusta płyta."""
import json
import os
import sys
import tempfile
import zipfile

import trimesh

backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from analysis import load_3mf_bundle, process_uploaded_file, skipped_preview_status_message
from slicer import estimate_filament_from_geometry, slice_result_from_geometry

PHOTOSET_SLICE_INFO = """<?xml version="1.0"?>
<config>
  <plate>
    <metadata key="index" value="1"/>
    <metadata key="prediction" value="18372"/>
    <metadata key="weight" value="146.74"/>
    <filament id="1" trayid="1" type="PLA" color="#E05028" used_m="49.20" used_g="146.74"/>
    <model instance_id="1" identify_id="2"/>
  </plate>
</config>
"""

MULTI_PLATE_SLICE_INFO = """<?xml version="1.0"?>
<config>
  <plate>
    <metadata key="index" value="1"/>
    <metadata key="prediction" value="3600"/>
    <metadata key="weight" value="40.0"/>
    <filament id="1" type="PLA" color="#FF0000" used_m="13.4" used_g="40.0"/>
  </plate>
  <plate>
    <metadata key="index" value="2"/>
    <metadata key="prediction" value="7200"/>
    <metadata key="weight" value="80.0"/>
    <filament id="1" type="PLA" color="#00FF00" used_m="26.8" used_g="50.0"/>
    <filament id="2" type="PLA" color="#0000FF" used_m="10.0" used_g="30.0"/>
  </plate>
</config>
"""


def test_multi_plate_slice_info_sums_all_plates():
    from analysis import _extract_3mf_slice_info

    path = os.path.join(tempfile.mkdtemp(), "multi.3mf")
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr("Metadata/slice_info.config", MULTI_PLATE_SLICE_INFO)
    with zipfile.ZipFile(path, "r") as zf:
        stats = _extract_3mf_slice_info(zf)
    assert stats["plate_count"] == 2
    assert abs(stats["filament_weight_g"] - 120.0) < 0.05  # max(40+80, 40+50+30)
    assert stats["print_time_seconds"] == 3600 + 7200
    assert abs(stats["filament_length_m"] - 50.2) < 0.05


def _box_3mf(extents, slice_info=None, infill="15%") -> str:
    box = trimesh.creation.box(extents=extents)
    verts = "".join(f'<vertex x="{v[0]}" y="{v[1]}" z="{v[2]}"/>' for v in box.vertices)
    tris = "".join(f'<triangle v1="{f[0]}" v2="{f[1]}" v3="{f[2]}"/>' for f in box.faces)
    model_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">'
        '<resources><object id="1" type="model"><mesh>'
        f"<vertices>{verts}</vertices><triangles>{tris}</triangles>"
        "</mesh></object></resources>"
        '<build><item objectid="1"/></build></model>'
    )
    path = os.path.join(tempfile.mkdtemp(), "plate.3mf")
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("3D/3dmodel.model", model_xml)
        zf.writestr(
            "Metadata/project_settings.config",
            json.dumps({
                "filament_colour": ["#E05028"],
                "filament_settings_id": ["Bambu PLA Basic @BBL A1"],
                "layer_height": 0.2,
                "nozzle_diameter": ["0.4"],
                "sparse_infill_density": infill,
            }),
        )
        if slice_info:
            zf.writestr("Metadata/slice_info.config", slice_info)
    return path


def test_extract_photoset_slice_info_numbers():
    path = _box_3mf([100, 100, 80], PHOTOSET_SLICE_INFO)
    bundle = load_3mf_bundle(path)
    stats = (bundle.get("file_profile") or {}).get("slice_stats") or {}
    assert abs(stats["filament_weight_g"] - 146.74) < 0.02
    assert abs(stats["filament_length_m"] - 49.20) < 0.02
    assert stats["print_time_seconds"] == 18372
    assert bundle["mesh"] is not None
    assert bundle["skipped_geometry"] is False


def test_analyze_photoset_like_3mf_quotes_bambu_not_cad_volume():
    """Bryła ~800 cm³ dałaby 600 g+ z geometrii; slice_info wygrywa → ~147 g / ~5 h."""
    from fastapi.testclient import TestClient
    import main

    path = _box_3mf([100, 100, 80], PHOTOSET_SLICE_INFO)
    geom_est = slice_result_from_geometry(
        volume_cm3=800.0,
        surface_area_cm2=520.0,
        dimensions_mm=[100.0, 100.0, 80.0],
        infill=15,
        layer_height=0.20,
        filament_type="PLA",
        nozzle_size=0.4,
        color_count=1,
        support_needed=True,
    )
    assert geom_est["filament_weight_g"] > float(146.74)

    client = TestClient(main.app)
    with open(path, "rb") as f:
        response = client.post(
            "/api/analyze-model",
            files={"file": ("Photoset_Iphone_support.3mf", f, "model/3mf")},
            data={
                "layer_height": "0.2",
                "nozzle_size": "0.4",
                "infill": "15",
                "filament_type": "PLA",
            },
        )
    assert response.status_code == 200, response.text[:800]
    data = response.json()
    assert data.get("instant_pricing") is True
    assert data.get("quote_ready") is True
    assert data.get("slicer_engine") == "bambu-slice-info"
    assert data.get("quote_source") == "bambu-slice-info"
    assert abs(float(data["filament_weight_g"]) - 146.74) < 0.05
    assert abs(float(data["filament_length_m"]) - 49.20) < 0.05
    assert data.get("print_time_formatted") == "5h 6m"
    assert 5.0 <= float(data["print_time_hours"]) <= 5.2
    assert float(data["filament_weight_g"]) < 200
    assert float(data["filament_weight_g"]) != 16
    price = float((data.get("price_breakdown") or {}).get("unit_price_pln") or 0)
    from pricing import commercial_unit_price
    hours = float(data["print_time_hours"])
    expected = commercial_unit_price(146.74, hours, 0.045)["unit_price_pln"]
    assert abs(price - expected) < 0.05
    assert price > round(146.74 * 0.045, 2)
    assert price < 80
    assert "ze slicera 3MF" in (data.get("message") or "")
    processed = process_uploaded_file(path, "Photoset_Iphone_support.3mf", tempfile.mkdtemp())
    assert processed.get("file_profile", {}).get("slice_stats", {}).get("filament_weight_g") == 146.74
    assert data.get("preview_stl_url")
    assert data.get("preview_skipped") in (False, None)
    assert data.get("type") != "rfq_document"


def test_unsliced_large_3mf_still_uses_geometry():
    """Bez slice_info zostaje estymator objętości (STL/STEP/goły 3MF)."""
    path = _box_3mf([100, 100, 80], slice_info=None)
    bundle = load_3mf_bundle(path)
    assert not (bundle.get("file_profile") or {}).get("slice_stats")
    processed = process_uploaded_file(path, "unsliced-solid.3mf", tempfile.mkdtemp())
    vol = float(processed.get("volume_cm3") or 0)
    assert vol > 500
    geom = slice_result_from_geometry(
        volume_cm3=vol,
        surface_area_cm2=float(processed.get("surface_area_cm2") or 0),
        dimensions_mm=processed.get("dimensions_mm"),
        infill=15,
        layer_height=0.20,
        filament_type="PLA",
        nozzle_size=0.4,
        color_count=1,
        support_needed=True,
    )
    assert geom["engine"] == "geometry-estimate"
    assert geom["filament_weight_g"] > 200


def test_empty_plate_with_slice_info_stays_rfq():
    """Pusta geometria + 16 g w slice_info: nadal RFQ, bez fałszywej ceny."""
    from fastapi.testclient import TestClient
    import main

    path = os.path.join(tempfile.mkdtemp(), "empty.3mf")
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr(
            "3D/3dmodel.model",
            '<?xml version="1.0"?><model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">'
            "<resources></resources><build></build></model>",
        )
        zf.writestr(
            "Metadata/project_settings.config",
            json.dumps({
                "filament_colour": ["#080504"],
                "sparse_infill_density": "6%",
            }),
        )
        zf.writestr(
            "Metadata/slice_info.config",
            """<?xml version="1.0"?><config><plate>
            <metadata key="prediction" value="1000"/>
            <metadata key="weight" value="16"/>
            <filament id="1" type="PLA" used_m="5" used_g="16"/>
            </plate></config>""",
        )
    client = TestClient(main.app)
    with open(path, "rb") as f:
        response = client.post(
            "/api/analyze-model",
            files={"file": ("empty-plate.3mf", f, "model/3mf")},
        )
    assert response.status_code == 200, response.text[:500]
    data = response.json()
    assert data.get("instant_pricing") is False
    assert data.get("filament_weight_g") not in (16, 16.0)
    fake_g = round(32.5 * 1.24 * (0.35 + (6 / 100.0) * 0.65))
    assert fake_g == 16
    assert data.get("filament_weight_g") != fake_g


def test_status_copy_appends_slice_info_note():
    msg = skipped_preview_status_message(True, True, from_slice_info=True)
    assert "miniaturę" in msg
    assert "ze slicera 3MF" in msg
    assert "ze slicera 3MF" not in skipped_preview_status_message(True, True)
    assert "ze slicera 3MF" not in skipped_preview_status_message(False, True, from_slice_info=True)


def test_heavy_sliced_3mf_quotes_without_parsing_mesh():
    """Jaguar-class: ~40 MB XML + slice_info → wycena Bambu, mesh=None, bez RFQ."""
    from analysis import HEAVY_3MF_MESH_PARSE_BYTES, should_skip_heavy_3mf_mesh_parse

    padding = "x" * (HEAVY_3MF_MESH_PARSE_BYTES + 50_000)
    model_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">'
        f"<!--{padding}-->"
        '<resources><object id="1" type="model"><mesh>'
        '<vertices><vertex x="0" y="0" z="0"/><vertex x="40" y="0" z="0"/><vertex x="0" y="40" z="0"/></vertices>'
        '<triangles><triangle v1="0" v2="1" v3="2"/></triangles>'
        "</mesh></object></resources>"
        '<build><item objectid="1"/></build></model>'
    )
    path = os.path.join(tempfile.mkdtemp(), "lampara-like.3mf")
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("3D/3dmodel.model", model_xml)
        zf.writestr(
            "Metadata/project_settings.config",
            json.dumps({
                "filament_colour": ["#E05028"],
                "filament_settings_id": ["SUNLU PLA+ @BBL A1"],
                "layer_height": 0.16,
                "nozzle_diameter": ["0.4"],
                "sparse_infill_density": "5%",
            }),
        )
        zf.writestr("Metadata/slice_info.config", PHOTOSET_SLICE_INFO)

    with zipfile.ZipFile(path) as zf:
        model_size = zf.getinfo("3D/3dmodel.model").file_size
    assert model_size >= HEAVY_3MF_MESH_PARSE_BYTES
    bundle = load_3mf_bundle(path)
    stats = (bundle.get("file_profile") or {}).get("slice_stats") or {}
    assert should_skip_heavy_3mf_mesh_parse(os.path.getsize(path), model_size, stats) is True
    assert bundle["mesh"] is None
    assert bundle["skipped_geometry"] is False
    assert bundle["skipped_heavy_mesh"] is True
    assert bundle["quote_ready"] is True
    assert abs(stats["filament_weight_g"] - 146.74) < 0.02

    processed = process_uploaded_file(path, "Lampara_Vintage(3).3mf", tempfile.mkdtemp())
    assert processed["instant_pricing"] is True
    assert processed["skipped_geometry"] is False
    assert processed["quote_ready"] is True
    assert processed.get("mesh_object") is None

    from fastapi.testclient import TestClient
    import main

    client = TestClient(main.app)
    with open(path, "rb") as f:
        response = client.post(
            "/api/analyze-model",
            files={"file": ("Lampara_Vintage(3).3mf", f, "model/3mf")},
            data={
                "layer_height": "0.16",
                "nozzle_size": "0.4",
                "infill": "5",
                "filament_type": "PLA",
            },
        )
    assert response.status_code == 200, response.text[:800]
    data = response.json()
    assert data.get("instant_pricing") is True
    assert data.get("quote_ready") is True
    assert data.get("slicer_engine") == "bambu-slice-info"
    assert abs(float(data["filament_weight_g"]) - 146.74) < 0.05
    assert data.get("print_time_formatted") == "5h 6m"
    assert data.get("type") != "rfq_document"
    assert "ze slicera 3MF" in (data.get("message") or "")
    assert data.get("preview_glb_url") in (None, "")
    assert data.get("preview_stl_url") in (None, "")


def test_unparseable_sliced_3mf_quotes_from_slice_info():
    """XML siatki padł, ale slice_info i ładunek .model są — auto-wycena, nie RFQ."""
    from analysis import analyze_outcome_reason

    garbage = "not-xml " + ("x" * 20_000)
    path = os.path.join(tempfile.mkdtemp(), "broken-mesh.3mf")
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("3D/3dmodel.model", garbage)
        zf.writestr(
            "Metadata/project_settings.config",
            json.dumps({
                "filament_colour": ["#E05028"],
                "filament_settings_id": ["SUNLU PLA+ @BBL A1"],
                "layer_height": 0.16,
                "nozzle_diameter": ["0.4"],
                "sparse_infill_density": "5%",
            }),
        )
        zf.writestr("Metadata/slice_info.config", PHOTOSET_SLICE_INFO)

    bundle = load_3mf_bundle(path)
    assert bundle["mesh"] is None
    assert bundle["skipped_geometry"] is False
    assert bundle["quote_ready"] is True
    stats = (bundle.get("file_profile") or {}).get("slice_stats") or {}
    assert abs(stats["filament_weight_g"] - 146.74) < 0.02

    from fastapi.testclient import TestClient
    import main

    client = TestClient(main.app)
    with open(path, "rb") as f:
        response = client.post(
            "/api/analyze-model",
            files={"file": ("Lampara_Vintage(3).3mf", f, "model/3mf")},
            data={
                "layer_height": "0.16",
                "nozzle_size": "0.4",
                "infill": "5",
                "filament_type": "PLA",
            },
        )
    assert response.status_code == 200, response.text[:800]
    data = response.json()
    assert data.get("instant_pricing") is True
    assert data.get("quote_ready") is True
    assert data.get("slicer_engine") == "bambu-slice-info"
    assert abs(float(data["filament_weight_g"]) - 146.74) < 0.05
    assert data.get("type") != "rfq_document"
    assert analyze_outcome_reason(data) == "quoted_no_preview"


def test_analyze_outcome_reason_labels():
    from analysis import analyze_outcome_reason

    assert analyze_outcome_reason({
        "instant_pricing": True,
        "quote_ready": True,
        "preview_stl_url": "/api/cached-model/a.stl",
    }) == "quoted"
    assert analyze_outcome_reason({
        "instant_pricing": True,
        "quote_ready": True,
    }) == "quoted_no_preview"
    assert analyze_outcome_reason({
        "instant_pricing": False,
        "type": "rfq_document",
    }) == "rfq"


def test_geometry_estimator_on_photoset_volume_would_overshoot():
    est = estimate_filament_from_geometry(
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
    assert est["filament_weight_g"] > 200


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"{name}: OK")
    print("ok")
