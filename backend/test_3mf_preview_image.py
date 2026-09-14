"""Ekstrakcja miniatury 3MF (plate/thumbnail) albo brak — bez fałszywej wyceny."""
import json
import os
import struct
import tempfile
import zipfile
import zlib

from analysis import (
    MIN_3MF_PREVIEW_IMAGE_BYTES,
    extract_3mf_preview_image,
    load_3mf_bundle,
    process_uploaded_file,
    reliable_volume_cm3,
    skipped_preview_status_message,
)

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, ".."))
KEYCHAIN_DRAFT = os.path.join(REPO, "Keychain Draft.3mf")
GENERATED_BAMBU = os.path.join(REPO, "test_generated_bambu.3mf")
if not os.path.exists(GENERATED_BAMBU):
    GENERATED_BAMBU = os.path.join(HERE, "test_generated_bambu.3mf")


def _noisy_png(width=64, height=64) -> bytes:
    """PNG z szumem, żeby skompresowany rozmiar przekroczył próg dummy packagera."""
    png_sig = b"\x89PNG\r\n\x1a\n"
    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    ihdr_crc = struct.pack(">I", zlib.crc32(b"IHDR" + ihdr_data) & 0xFFFFFFFF)
    ihdr_chunk = struct.pack(">I", len(ihdr_data)) + b"IHDR" + ihdr_data + ihdr_crc
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        for x in range(width):
            raw.extend(((x * 17 + y * 3) % 256, (y * 29) % 256, (x * y + 9) % 256))
    compressed = zlib.compress(bytes(raw), level=1)
    idat_crc = struct.pack(">I", zlib.crc32(b"IDAT" + compressed) & 0xFFFFFFFF)
    idat_chunk = struct.pack(">I", len(compressed)) + b"IDAT" + compressed + idat_crc
    iend_crc = struct.pack(">I", zlib.crc32(b"IEND") & 0xFFFFFFFF)
    iend_chunk = struct.pack(">I", 0) + b"IEND" + iend_crc
    payload = png_sig + ihdr_chunk + idat_chunk + iend_chunk
    assert len(payload) >= MIN_3MF_PREVIEW_IMAGE_BYTES
    return payload


def _write_3mf(entries: dict) -> str:
    path = os.path.join(tempfile.mkdtemp(), "preview.3mf")
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name, content in entries.items():
            zf.writestr(name, content)
    return path


def _minimal_model_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">'
        "<resources></resources><build></build></model>"
    )


def test_extract_none_when_3mf_has_no_image():
    path = _write_3mf({
        "3D/3dmodel.model": _minimal_model_xml(),
        "Metadata/project_settings.config": json.dumps({"filament_colour": ["#080504"]}),
    })
    assert extract_3mf_preview_image(path) is None


def test_extract_none_for_dummy_packager_plate():
    """Nasz packager wstawia ~0.6 KB jednolity kwadrat — to nie jest zdjęcie modelu."""
    if not os.path.exists(GENERATED_BAMBU):
        print("POMINIETO: brak test_generated_bambu.3mf")
        return
    assert extract_3mf_preview_image(GENERATED_BAMBU) is None


def test_extract_plate_png_from_keychain_draft():
    """Keychain Draft.3mf (MakerLab/Bambu) ma Metadata/plate_1.png — Jaguar używa tej samej ścieżki."""
    if not os.path.exists(KEYCHAIN_DRAFT):
        print("POMINIETO: brak Keychain Draft.3mf")
        return
    img = extract_3mf_preview_image(KEYCHAIN_DRAFT)
    assert img is not None, "oczekiwano miniatury z Keychain Draft.3mf"
    assert img["source"] == "Metadata/plate_1.png"
    assert img["mime"] == "image/png"
    assert img["ext"] == ".png"
    assert img["bytes"].startswith(b"\x89PNG")
    assert len(img["bytes"]) > MIN_3MF_PREVIEW_IMAGE_BYTES


def test_extract_prefers_plate_over_aux_thumbnail():
    plate = _noisy_png(72, 72)
    tiny_other = _noisy_png(48, 48)
    assert len(plate) != len(tiny_other) or plate != tiny_other
    path = _write_3mf({
        "3D/3dmodel.model": _minimal_model_xml(),
        "Metadata/plate_1.png": plate,
        "Auxiliaries/.thumbnails/thumbnail_3mf.png": tiny_other,
        "_rels/.rels": (
            '<?xml version="1.0"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Target="/Auxiliaries/.thumbnails/thumbnail_3mf.png" Id="rel-2" '
            'Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail"/>'
            "</Relationships>"
        ),
        "Metadata/model_settings.config": (
            '<?xml version="1.0"?><config><plate>'
            '<metadata key="thumbnail_file" value="Metadata/plate_1.png"/>'
            "</plate></config>"
        ),
    })
    img = extract_3mf_preview_image(path)
    assert img is not None
    assert img["source"] == "Metadata/plate_1.png"
    assert img["bytes"] == plate


def test_extract_opc_thumbnail_when_no_plate():
    photo = _noisy_png(56, 56)
    path = _write_3mf({
        "3D/3dmodel.model": _minimal_model_xml(),
        "Auxiliaries/.thumbnails/thumbnail_3mf.png": photo,
        "_rels/.rels": (
            '<?xml version="1.0"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Target="/Auxiliaries/.thumbnails/thumbnail_3mf.png" Id="rel-2" '
            'Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail"/>'
            "</Relationships>"
        ),
    })
    img = extract_3mf_preview_image(path)
    assert img is not None
    assert img["source"] == "Auxiliaries/.thumbnails/thumbnail_3mf.png"
    assert img["bytes"] == photo


def test_load_bundle_keeps_thumbnail_without_inventing_quote():
    photo = _noisy_png()
    path = _write_3mf({
        "3D/3dmodel.model": _minimal_model_xml(),
        "Metadata/plate_1.png": photo,
        "Metadata/project_settings.config": json.dumps({
            "filament_colour": ["#080504", "#854A22"],
            "sparse_infill_density": "6%",
        }),
        "Metadata/slice_info.config": """<?xml version="1.0"?>
<config>
  <plate>
    <metadata key="prediction" value="99600"/>
    <metadata key="weight" value="16"/>
    <filament id="1" type="PLA" color="#080504" used_m="5" used_g="16"/>
  </plate>
</config>""",
    })
    bundle = load_3mf_bundle(path)
    assert bundle["preview_image"]["source"] == "Metadata/plate_1.png"
    assert bundle["quote_ready"] is False
    assert bundle["skipped_geometry"] is True
    processed = process_uploaded_file(path, "empty-with-thumb.3mf", tempfile.mkdtemp())
    assert processed["instant_pricing"] is False
    assert processed.get("filament_weight_g") not in (16, 16.0)
    assert reliable_volume_cm3(processed.get("volume_cm3")) is None
    assert processed["preview_image"]["bytes"] == photo
    assert "miniaturę" in (processed.get("message") or "")


def test_status_copy_softens_when_thumbnail_present():
    assert "miniaturę" in skipped_preview_status_message(True, True)
    assert "miniaturę" in skipped_preview_status_message(False, True)
    assert "Podgląd niemożliwy" in skipped_preview_status_message(True, False)
    assert "bez niej nie podajemy" in skipped_preview_status_message(False, False)
    assert "ze slicera 3MF" in skipped_preview_status_message(True, True, from_slice_info=True)
    assert "ze slicera 3MF" not in skipped_preview_status_message(True, True)


def test_keychain_draft_keeps_live_3d_and_exposes_thumbnail():
    """Mały wielokolorowy 3MF (#48): GLB ma pierwszeństwo; miniatura jest tylko zapasem."""
    if not os.path.exists(KEYCHAIN_DRAFT):
        print("POMINIETO: brak Keychain Draft.3mf")
        return
    bundle = load_3mf_bundle(KEYCHAIN_DRAFT)
    assert bundle["mesh"] is not None
    assert bundle["quote_ready"] is True
    assert bundle["preview_skipped"] is False
    assert bundle["colored_mesh"] is not None
    assert bundle["preview_image"]["source"] == "Metadata/plate_1.png"
    assert bundle["preview_image"]["bytes"].startswith(b"\x89PNG")


def test_small_multicolor_3mf_still_prefers_live_preview_flags():
    """#48: mały kolorowy 3MF nie może dostać preview_skipped tylko dlatego, że ma PNG."""
    if not os.path.exists(GENERATED_BAMBU):
        print("POMINIETO: brak test_generated_bambu.3mf")
        return
    bundle = load_3mf_bundle(GENERATED_BAMBU)
    assert bundle["preview_skipped"] is False
    assert bundle["has_file_colors"] is True
    assert bundle["colored_mesh"] is not None
    assert not (bundle.get("preview_image") or {}).get("bytes")


def _box_model_xml():
    import trimesh
    boxes = [
        trimesh.creation.box(extents=[10, 10, 2]),
        trimesh.creation.box(extents=[6, 6, 2]),
    ]
    objects_xml = []
    for idx, box in enumerate(boxes, start=1):
        verts = "".join(f'<vertex x="{v[0]}" y="{v[1]}" z="{v[2]}"/>' for v in box.vertices)
        tris = "".join(f'<triangle v1="{f[0]}" v2="{f[1]}" v3="{f[2]}"/>' for f in box.faces)
        objects_xml.append(
            f'<object id="{idx}" type="model"><mesh>'
            f"<vertices>{verts}</vertices><triangles>{tris}</triangles>"
            "</mesh></object>"
        )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">'
        f"<resources>{''.join(objects_xml)}</resources>"
        '<build><item objectid="1"/><item objectid="2"/></build></model>'
    )


def test_analyze_endpoint_exposes_preview_image_url_and_keeps_glb():
    """Mały 3MF z plate PNG: URL miniatury + żywy GLB (miniatura nie zastępuje #48)."""
    import sys
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)
    from fastapi.testclient import TestClient
    import main

    photo = _noisy_png(64, 64)
    path = _write_3mf({
        "3D/3dmodel.model": _box_model_xml(),
        "Metadata/plate_1.png": photo,
        "Metadata/project_settings.config": json.dumps({
            "filament_colour": ["#080504", "#DFDFDE"],
        }),
        "Metadata/model_settings.config": (
            '<?xml version="1.0"?><config>'
            '<object id="1"><metadata key="extruder" value="1"/></object>'
            '<object id="2"><metadata key="extruder" value="2"/></object>'
            "</config>"
        ),
    })
    client = TestClient(main.app)
    with open(path, "rb") as f:
        response = client.post(
            "/api/analyze-model",
            files={"file": ("keychain-like.3mf", f, "model/3mf")},
            data={"layer_height": "0.2", "nozzle_size": "0.4", "infill": "15", "filament_type": "PLA"},
        )
    assert response.status_code == 200, response.text[:500]
    data = response.json()
    assert "preview_image" not in data
    assert data.get("preview_image_url")
    assert data["preview_image_url"].endswith("_preview.png")
    assert data.get("preview_image_source") == "Metadata/plate_1.png"
    assert data.get("preview_glb_url"), "mały 3MF musi dostać GLB, nie samą miniaturę"
    assert data.get("preview_skipped") is not True
    img = client.get(data["preview_image_url"])
    assert img.status_code == 200
    assert img.headers["content-type"].startswith("image/png")
    assert img.content.startswith(b"\x89PNG")
    assert img.content == photo


def test_analyze_empty_3mf_with_thumbnail_is_not_sixteen_grams():
    import sys
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)
    from fastapi.testclient import TestClient
    import main

    photo = _noisy_png(64, 64)
    path = _write_3mf({
        "3D/3dmodel.model": _minimal_model_xml(),
        "Metadata/plate_1.png": photo,
        "Metadata/project_settings.config": json.dumps({
            "filament_colour": ["#080504", "#854A22"],
            "sparse_infill_density": "6%",
        }),
        "Metadata/slice_info.config": """<?xml version="1.0"?>
<config>
  <plate>
    <metadata key="weight" value="16"/>
    <filament id="1" type="PLA" color="#080504" used_g="16"/>
  </plate>
</config>""",
    })
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
    assert data.get("preview_image_url", "").endswith("_preview.png")
    assert "miniaturę" in (data.get("message") or "")


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"{name}: OK")
    print("ok")
