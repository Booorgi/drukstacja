"""Kolorowy podgląd 3MF: części AMS -> face colors -> GLB z COLOR_0."""
import json
import os
import struct
import tempfile

from analysis import load_3mf_bundle
from orientation import auto_orient_mesh

HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLE = os.path.join(HERE, "test_generated_bambu.3mf")


def _glb_json(path: str) -> dict:
    with open(path, "rb") as f:
        magic, ver, length = struct.unpack("<4sII", f.read(12))
        assert magic == b"glTF"
        chunk_len, chunk_type = struct.unpack("<I4s", f.read(8))
        assert chunk_type == b"JSON"
        return json.loads(f.read(chunk_len))


def test_load_3mf_bundle_paints_ams_parts():
    bundle = load_3mf_bundle(SAMPLE)
    assert bundle["part_count"] == 4
    assert bundle["has_file_colors"] is True
    assert bundle["filament_colours"] == ["#080504", "#854A22", "#C4864F", "#DFDFDE"]
    colored = bundle["colored_mesh"]
    assert colored is not None
    assert len(colored.faces) == len(bundle["mesh"].faces)
    unique = {tuple(c) for c in colored.visual.face_colors}
    assert len(unique) >= 2


def test_oriented_glb_keeps_vertex_colors():
    bundle = load_3mf_bundle(SAMPLE)
    oriented, info = auto_orient_mesh(bundle["mesh"])
    assert "matrix" in info
    preview = bundle["colored_mesh"].copy()
    preview.apply_transform(info["matrix"])
    out = os.path.join(tempfile.gettempdir(), "drukstacja_preview_test.glb")
    preview.export(out, file_type="glb")
    gltf = _glb_json(out)
    attrs = gltf["meshes"][0]["primitives"][0]["attributes"]
    assert "COLOR_0" in attrs
    assert os.path.getsize(out) > 100
    assert oriented.bounds[0][2] >= -1e-6


if __name__ == "__main__":
    test_load_3mf_bundle_paints_ams_parts()
    test_oriented_glb_keeps_vertex_colors()
    print("ok")
