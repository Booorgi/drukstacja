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


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"{name}: OK")
    print("ok")
