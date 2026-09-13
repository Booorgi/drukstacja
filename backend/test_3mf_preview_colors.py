"""Kolorowy podglad 3MF (czesci AMS + malowanie pedzlem) i prog podpor Bambu."""
import json
import math
import os
import struct
import tempfile
import zipfile

import numpy as np
import trimesh

from analysis import (
    COLORED_PREVIEW_FACE_LIMIT,
    DEFAULT_AMS_PALETTE,
    decode_paint_slot,
    export_colored_preview_glb,
    load_3mf_bundle,
    should_build_colored_preview,
    should_decode_3mf_paint,
    should_parse_3mf_mesh,
)
from orientation import SUPPORT_THRESHOLD_ANGLE_DEG, _support_score, auto_orient_mesh

HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLE = os.path.join(HERE, "test_generated_bambu.3mf")
if not os.path.exists(SAMPLE):
    SAMPLE = os.path.abspath(os.path.join(HERE, "..", "test_generated_bambu.3mf"))


def _glb_json(path: str) -> dict:
    with open(path, "rb") as f:
        magic, ver, length = struct.unpack("<4sII", f.read(12))
        assert magic == b"glTF"
        chunk_len, chunk_type = struct.unpack("<I4s", f.read(8))
        assert chunk_type == b"JSON"
        return json.loads(f.read(chunk_len))


def _build_3mf(paint_codes, filament_colours, object_extruder=1) -> str:
    """Minimalny .3mf z jedna bryla; paint_codes to kod paint_color per trojkat."""
    box = trimesh.creation.box(extents=[10, 10, 10])
    verts = "".join(
        f'<vertex x="{v[0]}" y="{v[1]}" z="{v[2]}"/>' for v in box.vertices
    )
    tris = []
    for face, code in zip(box.faces, paint_codes):
        paint = f' paint_color="{code}"' if code else ""
        tris.append(f'<triangle v1="{face[0]}" v2="{face[1]}" v3="{face[2]}"{paint}/>')

    model_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">'
        '<resources><object id="1" type="model"><mesh>'
        f"<vertices>{verts}</vertices><triangles>{''.join(tris)}</triangles>"
        "</mesh></object></resources>"
        '<build><item objectid="1"/></build></model>'
    )
    settings_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f'<config><object id="1"><metadata key="extruder" value="{object_extruder}"/>'
        "</object></config>"
    )

    path = os.path.join(tempfile.mkdtemp(), "painted.3mf")
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr("3D/3dmodel.model", model_xml)
        zf.writestr("Metadata/model_settings.config", settings_xml)
        zf.writestr(
            "Metadata/project_settings.config",
            json.dumps({"filament_colour": filament_colours}),
        )
    return path


def _tilted_panel(slope_deg: float) -> trimesh.Trimesh:
    """Plaski panel nachylony do stolu o zadany kat, uniesiony nad stolem."""
    rise = 10.0 * math.tan(math.radians(slope_deg))
    verts = np.array(
        [[0, 0, 5.0], [10, 0, 5.0 + rise], [10, 10, 5.0 + rise], [0, 10, 5.0]]
    )
    faces = np.array([[0, 1, 2], [0, 2, 3]])
    panel = trimesh.Trimesh(vertices=verts, faces=faces, process=False)
    if panel.face_normals[0][2] > 0:
        panel = trimesh.Trimesh(vertices=verts, faces=faces[:, ::-1], process=False)
    return panel


def test_decode_paint_slot():
    assert decode_paint_slot("4") == 1
    assert decode_paint_slot("8") == 2
    assert decode_paint_slot("0C") == 3
    assert decode_paint_slot("1C") == 4
    assert decode_paint_slot("") == 0
    assert decode_paint_slot(None) == 0
    # Od slotu 3 kod to nibble (slot - 3) + "C", wiec 8C to slot 11.
    # Kody dwuznakowe musza byc zdejmowane przed jednoznakowym "8".
    assert decode_paint_slot("8C") == 11
    # Trojkat przeciety pedzlem: wygrywa kolor o najwiekszej liczbie wystapien.
    assert decode_paint_slot("8884") == 2


def test_3mf_exposes_file_profile():
    bundle = load_3mf_bundle(SAMPLE)
    profile = bundle.get("file_profile") or {}
    assert profile.get("filament_colours")
    assert len(profile["filament_colours"]) >= 2
    assert "filament_types" in profile


def test_3mf_reads_bambu_slice_info():
    """Wycena 3MF ma brać czas i wagę z cięcia Bambu, nie z przybliżonej geometrii."""
    path = _build_3mf(["4"] * 12, ["#111111", "#EEEEEE"])
    with zipfile.ZipFile(path, "a") as zf:
        zf.writestr(
            "Metadata/slice_info.config",
            """<?xml version="1.0"?>
<config>
  <plate>
    <metadata key="prediction" value="99600"/>
    <metadata key="weight" value="518.08"/>
    <filament id="1" type="PLA" color="#080504" used_m="94.99" used_g="301.59"/>
    <filament id="2" type="PLA" color="#854A22" used_m="65.12" used_g="206.74"/>
    <filament id="3" type="PLA" color="#C4864F" used_m="2.52" used_g="8.00"/>
    <filament id="4" type="PLA" color="#DFDFDE" used_m="0.57" used_g="1.74"/>
  </plate>
</config>
""",
        )
    bundle = load_3mf_bundle(path)
    stats = (bundle.get("file_profile") or {}).get("slice_stats") or {}
    assert abs(stats["filament_weight_g"] - 518.07) < 0.2
    assert abs(stats["filament_length_m"] - 163.2) < 0.2
    assert stats["print_time_seconds"] == 99600
    assert stats["color_count"] == 4


def test_standard_profile_keeps_file_infill():
    from analysis import _extract_3mf_print_profile

    profile = _extract_3mf_print_profile(
        {
            "sparse_infill_density": "5%",
            "print_settings_id": "0.20mm Standard @BBL A1",
            "filament_colour": ["#000000", "#FFFFFF"],
            "filament_settings_id": [
                "Bambu PLA Matte @BBL A1",
                "Bambu PLA Basic @BBL A1",
            ],
        }
    )
    assert profile["infill"] == 5
    assert profile["filament_types"] == ["PLA Matte", "PLA Basic"]


def test_load_3mf_bundle_paints_ams_parts():
    bundle = load_3mf_bundle(SAMPLE)
    assert bundle["part_count"] == 4
    assert bundle["has_file_colors"] is True
    assert bundle["filament_colours"] == ["#080504", "#854A22", "#C4864F", "#DFDFDE"]
    assert bundle["color_count"] == 4
    colored = bundle["colored_mesh"]
    assert colored is not None
    assert len(colored.faces) == len(bundle["mesh"].faces)
    unique = {tuple(c) for c in colored.visual.face_colors}
    assert len(unique) >= 2


def test_brush_painted_object_gets_colors():
    """Jedna bryla pomalowana pedzlem tez musi dostac kolory w podgladzie."""
    codes = ["8"] * 6 + [""] * 6  # polowa scianek na slot 2, reszta bazowa
    path = _build_3mf(codes, ["#FF0000", "#00FF00"], object_extruder=1)

    bundle = load_3mf_bundle(path)
    assert bundle["has_file_colors"] is True
    assert bundle["filament_colours"] == ["#FF0000", "#00FF00"]
    assert bundle["color_count"] == 2
    assert bundle["painted_ratio"] >= 0.4

    colors = bundle["colored_mesh"].visual.face_colors
    assert {tuple(c[:3]) for c in colors} == {(255, 0, 0), (0, 255, 0)}
    assert sum(1 for c in colors if tuple(c[:3]) == (0, 255, 0)) == 6


def test_paint_without_project_settings_falls_back_to_palette():
    path = _build_3mf(["4"] * 6 + ["8"] * 6, [])
    bundle = load_3mf_bundle(path)
    assert bundle["has_file_colors"] is True
    assert bundle["filament_colours"] == DEFAULT_AMS_PALETTE[:2]


def test_single_colour_file_leaves_palette_to_user():
    """Plik z jednym filamentem nie moze blokowac wyboru koloru przez klienta."""
    path = _build_3mf([""] * 12, ["#FFFFFF"])
    bundle = load_3mf_bundle(path)
    assert bundle["has_file_colors"] is False
    assert bundle["colored_mesh"] is None
    assert bundle["filament_colours"] == []
    assert len(bundle["mesh"].faces) == 12


def test_support_threshold_matches_bambu():
    assert SUPPORT_THRESHOLD_ANGLE_DEG == 30.0
    # 40 stopni nachylenia bylo podpierane przy starym progu 45, Bambu juz nie podpiera.
    assert _support_score(_tilted_panel(40.0)) == 0.0
    assert _support_score(_tilted_panel(20.0)) > 0.0


def test_auto_orient_keeps_model_square_on_bed():
    """Plytka ma lezec plasko, bez obrotu na sciane z hull."""
    mesh = trimesh.creation.box(extents=[20.0, 10.0, 2.0])
    oriented, info = auto_orient_mesh(mesh)
    height = float(oriented.extents[2])
    assert abs(height - 2.0) < 1e-4
    R = np.array(info["matrix"], dtype=float)[:3, :3]
    assert np.allclose(np.abs(R).sum(axis=0), 1.0, atol=1e-5)
    assert np.allclose(np.abs(R).sum(axis=1), 1.0, atol=1e-5)
    assert oriented.bounds[0][2] >= -1e-6


def test_auto_orient_lays_y_up_plate_flat():
    """Plik z gruboscia w Y (Blender / Y-up) tez ma trafic plasko na stol."""
    mesh = trimesh.creation.box(extents=[20.0, 2.0, 10.0])
    oriented, info = auto_orient_mesh(mesh)
    assert abs(float(oriented.extents[2]) - 2.0) < 1e-4
    assert oriented.bounds[0][2] >= -1e-6
    assert info["mode"] == "aabb_flat"


def _preview_has_ams_colors(gltf: dict) -> bool:
    """GLB musi nieść barwy AMS: COLOR_0 albo materiały PBR z różnymi baseColor."""
    has_vertex_color = False
    for mesh in gltf.get("meshes") or []:
        for prim in mesh.get("primitives") or []:
            if "COLOR_0" in (prim.get("attributes") or {}):
                has_vertex_color = True
    materials = gltf.get("materials") or []
    factors = []
    for mat in materials:
        pbr = mat.get("pbrMetallicRoughness") or {}
        factor = pbr.get("baseColorFactor")
        if factor:
            factors.append(tuple(round(c, 3) for c in factor[:3]))
    return has_vertex_color or len(set(factors)) >= 2


def test_oriented_glb_keeps_vertex_colors():
    bundle = load_3mf_bundle(SAMPLE)
    oriented, info = auto_orient_mesh(bundle["mesh"])
    assert "matrix" in info
    preview = bundle["colored_mesh"].copy()
    preview.apply_transform(info["matrix"])
    out = os.path.join(tempfile.gettempdir(), "drukstacja_preview_test.glb")
    export_colored_preview_glb(preview, out)
    gltf = _glb_json(out)
    attrs = gltf["meshes"][0]["primitives"][0]["attributes"]
    assert "NORMAL" in attrs
    assert _preview_has_ams_colors(gltf)
    assert os.path.getsize(out) > 100
    assert oriented.bounds[0][2] >= -1e-6


def _build_multipart_3mf() -> str:
    """Dwa obiekty bez paint_color — kolory tylko z ekstrudera części (jak MakerLab)."""
    boxes = [
        trimesh.creation.box(extents=[10, 10, 2]),
        trimesh.creation.box(extents=[6, 6, 2]),
    ]
    objects_xml = []
    for idx, box in enumerate(boxes, start=1):
        verts = "".join(
            f'<vertex x="{v[0]}" y="{v[1]}" z="{v[2]}"/>' for v in box.vertices
        )
        tris = "".join(
            f'<triangle v1="{f[0]}" v2="{f[1]}" v3="{f[2]}"/>' for f in box.faces
        )
        objects_xml.append(
            f'<object id="{idx}" type="model"><mesh>'
            f"<vertices>{verts}</vertices><triangles>{tris}</triangles>"
            "</mesh></object>"
        )
    model_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">'
        f"<resources>{''.join(objects_xml)}</resources>"
        '<build><item objectid="1"/><item objectid="2"/></build></model>'
    )
    settings_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        "<config>"
        '<object id="1"><metadata key="extruder" value="1"/></object>'
        '<object id="2"><metadata key="extruder" value="2"/></object>'
        "</config>"
    )
    path = os.path.join(tempfile.mkdtemp(), "multipart.3mf")
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr("3D/3dmodel.model", model_xml)
        zf.writestr("Metadata/model_settings.config", settings_xml)
        zf.writestr(
            "Metadata/project_settings.config",
            json.dumps({"filament_colour": ["#080504", "#DFDFDE"]}),
        )
    return path


def test_preview_glb_has_normals_and_part_colors():
    """Części AMS bez pędzla też muszą dać oświetlony, wielokolorowy GLB."""
    path = _build_multipart_3mf()
    bundle = load_3mf_bundle(path)
    assert bundle["has_file_colors"] is True
    assert bundle["part_count"] == 2
    out = os.path.join(tempfile.gettempdir(), "drukstacja_multipart_preview.glb")
    export_colored_preview_glb(bundle["colored_mesh"], out)
    gltf = _glb_json(out)
    for mesh in gltf["meshes"]:
        for prim in mesh["primitives"]:
            assert "NORMAL" in prim["attributes"]
    assert _preview_has_ams_colors(gltf)
    assert len(gltf["meshes"]) >= 1


def test_size_gates_keep_keychain_preview_and_skip_jaguar():
    """Keychain (~5 MB zip / 34 MB XML / 156k ścianek) zostaje w podglądzie."""
    assert should_decode_3mf_paint(5_500_000, 34_000_000) is False
    assert should_parse_3mf_mesh(5_500_000, 34_000_000) is True
    assert should_build_colored_preview(5_500_000, 34_000_000, 156_000) is True
    # Jaguar: ogromny XML i/lub setki tysięcy ścianek — bez pędzla i bez GLB.
    assert should_decode_3mf_paint(11_000_000, 90_000_000) is False
    assert should_parse_3mf_mesh(11_000_000, 90_000_000) is False
    assert should_build_colored_preview(11_000_000, 90_000_000, 400_000) is False
    assert should_build_colored_preview(5_000_000, 10_000_000, COLORED_PREVIEW_FACE_LIMIT) is False


def test_huge_3mf_skips_geometry_but_keeps_ams_and_slice_stats():
    """Przy >80 MB uncompressed .model nie parsujemy XML — zostaje profil i slice_info."""
    padding = " " * 80_000_001
    path = os.path.join(tempfile.mkdtemp(), "jaguar_class.3mf")
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "3D/3dmodel.model",
            '<?xml version="1.0"?><model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">'
            "<resources></resources><build></build></model>",
        )
        zf.writestr("3D/Objects/object-7607.model", padding)
        zf.writestr(
            "Metadata/project_settings.config",
            json.dumps({
                "filament_colour": ["#080504", "#854A22", "#C4864F", "#DFDFDE"],
                "layer_height": 0.2,
                "nozzle_diameter": ["0.4"],
                "sparse_infill_density": "20%",
            }),
        )
        zf.writestr(
            "Metadata/slice_info.config",
            """<?xml version="1.0"?>
<config>
  <plate>
    <metadata key="prediction" value="99600"/>
    <metadata key="weight" value="518.08"/>
    <filament id="1" type="PLA" color="#080504" used_m="94.99" used_g="301.59"/>
    <filament id="2" type="PLA" color="#854A22" used_m="65.12" used_g="206.74"/>
  </plate>
</config>""",
        )
    bundle = load_3mf_bundle(path)
    assert bundle["skipped_geometry"] is True
    assert bundle["mesh"] is None
    assert bundle["colored_mesh"] is None
    assert bundle["has_file_colors"] is False
    assert bundle["file_profile"]["filament_colours"] == ["#080504", "#854A22", "#C4864F", "#DFDFDE"]
    assert bundle["file_profile"]["slice_stats"]["filament_weight_g"] > 500
    assert bundle["color_count"] >= 2
    assert bundle["filament_colours"] == ["#080504", "#854A22", "#C4864F", "#DFDFDE"]


def test_export_colored_glb_refuses_jaguar_face_count():
    mesh = trimesh.Trimesh(
        vertices=[[0, 0, 0], [1, 0, 0], [0, 1, 0]],
        faces=[[0, 1, 2]] * (COLORED_PREVIEW_FACE_LIMIT + 1),
        process=False,
    )
    out = os.path.join(tempfile.mkdtemp(), "too_dense.glb")
    try:
        export_colored_preview_glb(mesh, out)
        raise AssertionError("oczekiwano ValueError dla gęstej siatki")
    except ValueError as err:
        assert "Pomijam kolorowy GLB" in str(err)


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"{name}: OK")
    print("ok")
