"""
Drukstacja - Generator pakietów produkcyjnych .3MF
Implementacja 1:1 silnika MakerLab (Make My Sign / Image to Keychain)
z grupowaniem siatek według kolorów, natywną strukturą 3D/Objects/object-1.model,
przypisaniem slotów AMS w Metadata/ oraz sygnaturą BambuLab.

STRUKTURA ARCHIWUM .3MF:
├── [Content_Types].xml
├── _rels/
│   └── .rels
├── 3D/
│   ├── 3dmodel.model
│   ├── _rels/
│   │   └── 3dmodel.model.rels
│   └── Objects/
│       └── object-1.model
└── Metadata/
    ├── slice_info.config
    ├── model_settings.config
    ├── project_settings.config
    └── plate_1.png
"""
import os
import re
import json
import zipfile
import datetime
import struct
import zlib
from pathlib import Path
import trimesh
import numpy as np

try:
    from slicer import convert_step_to_stl
except ImportError:
    convert_step_to_stl = None


def sanitize_filename(name: str) -> str:
    """Oczyszcza nazwę pliku z niedozwolonych znaków."""
    clean = re.sub(r"[^\w\-.]", "_", name)
    clean = re.sub(r"_+", "_", clean)
    return clean.strip("_")


def xml_escape(val: str) -> str:
    """Escapuje znaki specjalne dla atrybutów i wartości XML."""
    return (
        str(val)
        .replace("&", "&amp;")
        .replace('"', "&quot;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def format_hex_6(hex_str: str) -> str:
    """Formatuje kod koloru HEX do standardu #RRGGBB."""
    if not hex_str:
        return "#000000"
    clean = hex_str.strip().lstrip("#").upper()
    if len(clean) == 3:
        clean = "".join([c * 2 for c in clean])
    if len(clean) >= 6:
        return f"#{clean[:6]}"
    return "#000000"


def create_dummy_png(width: int = 200, height: int = 200, color: tuple = (38, 42, 51)) -> bytes:
    """Tworzy poprawny binarnie plik PNG miniatury stołu bez zewnętrznych bibliotek."""
    png_sig = b"\x89PNG\r\n\x1a\n"
    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    ihdr_crc = struct.pack(">I", zlib.crc32(b"IHDR" + ihdr_data) & 0xffffffff)
    ihdr_chunk = struct.pack(">I", len(ihdr_data)) + b"IHDR" + ihdr_data + ihdr_crc

    raw_row = b"\x00" + bytes(color) * width
    raw_data = raw_row * height
    compressed_data = zlib.compress(raw_data)
    idat_crc = struct.pack(">I", zlib.crc32(b"IDAT" + compressed_data) & 0xffffffff)
    idat_chunk = struct.pack(">I", len(compressed_data)) + b"IDAT" + compressed_data + idat_crc

    iend_crc = struct.pack(">I", zlib.crc32(b"IEND") & 0xffffffff)
    iend_chunk = struct.pack(">I", 0) + b"IEND" + iend_crc

    return png_sig + ihdr_chunk + idat_chunk + iend_chunk


def _mesh_to_xml(mesh, indent="        "):
    """Konwertuje trimesh.Trimesh do ciągów XML vertices i triangles."""
    if mesh is None or not hasattr(mesh, "vertices") or len(mesh.vertices) == 0:
        return "", ""
    vert_lines = [
        '%s<vertex x="%.4f" y="%.4f" z="%.4f"/>' % (indent, float(v[0]), float(v[1]), float(v[2]))
        for v in mesh.vertices
    ]
    tri_lines = [
        '%s<triangle v1="%d" v2="%d" v3="%d"/>' % (indent, int(f[0]), int(f[1]), int(f[2]))
        for f in mesh.faces
    ]
    return "\n".join(vert_lines), "\n".join(tri_lines)


def generate_production_3mf(
    model_path: str = None,
    order_metadata: dict = None,
    print_settings: dict = None,
    output_path: str = None,
    parts: list = None,
) -> str:
    """
    Generuje gotowy pakiet projektowy .3MF zgodny 1:1 z MakerLab / Bambu Studio.
    
    1. Grupuje geometrię wejściową według unikalnych kolorów HEX (max 4 grupy AMS).
    2. Scalanie (rebuildMergedPathViewGroup) siatek danego koloru w pojedynczy Trimesh.
    3. Zapisuje geometrię do 3D/Objects/object-1.model.
    4. Tworzy manifest 3D/3dmodel.model oraz relację 3D/_rels/3dmodel.model.rels.
    5. Zapisuje slice_info.config, model_settings.config, project_settings.config i plate_1.png.
    6. Podpisuje każdy element archiwum: 'created by BambuLab'.
    """
    order_metadata = order_metadata or {}
    print_settings = print_settings or {}

    order_id = str(order_metadata.get("order_id") or "DIRECT")
    file_name = str(
        order_metadata.get("file_name")
        or (os.path.basename(model_path) if model_path else "keychain.3mf")
    )
    material = str(print_settings.get("material") or "PLA")
    clean_mat = material.split()[0].upper() if material else "PLA"
    color_hex = str(print_settings.get("color_hex") or "#000000")
    clean_title = sanitize_filename(Path(file_name).stem) or "Keychain"

    # ──────────────────────────────────────────────────────────────
    # 1. Wczytanie i przygotowanie siatek składowych
    # ──────────────────────────────────────────────────────────────
    raw_parts = []
    if parts and isinstance(parts, list) and len(parts) > 0:
        for idx, p in enumerate(parts):
            p_mesh = p.get("mesh")
            p_path = p.get("path")
            p_name = str(p.get("name") or ("Part_%d" % (idx + 1)))
            p_color = str(p.get("color_hex") or p.get("color") or color_hex)
            p_role = str(p.get("role") or "")

            if p_mesh is None and p_path and os.path.exists(p_path):
                try:
                    p_mesh = trimesh.load(p_path, force="mesh")
                except Exception as load_err:
                    print(f"[WARN] Nie udało się wczytać siatki części {p_name} z {p_path}: {load_err}")

            if p_mesh is not None and hasattr(p_mesh, "vertices") and len(p_mesh.vertices) > 0:
                raw_parts.append({
                    "name": p_name,
                    "color_hex": p_color,
                    "mesh": p_mesh,
                    "role": p_role,
                })

    # Tryb pojedynczej bryły (jeśli brak listy parts)
    if not raw_parts:
        mesh = None
        if model_path and os.path.exists(model_path):
            ext = Path(model_path).suffix.lower()
            if ext in [".step", ".stp", ".iges", ".igs"] and convert_step_to_stl is not None:
                temp_stl = f"{model_path}_tmp_converted.stl"
                try:
                    convert_step_to_stl(model_path, temp_stl)
                    mesh = trimesh.load(temp_stl, force="mesh")
                except Exception as e:
                    print(f"[WARN] Konwersja STEP do STL nie powiodła się: {e}")
                finally:
                    if os.path.exists(temp_stl):
                        try:
                            os.remove(temp_stl)
                        except Exception:
                            pass

            if mesh is None:
                try:
                    mesh = trimesh.load(model_path, force="mesh")
                except Exception as load_err:
                    raise RuntimeError(f"Błąd odczytu pliku 3D ({model_path}): {load_err}")

        if mesh is None:
            raise ValueError("Brak geometrii 3D do spakowania do pakietu .3MF.")

        raw_parts.append({
            "name": clean_title,
            "color_hex": color_hex,
            "mesh": mesh,
            "role": "model",
        })

    # ──────────────────────────────────────────────────────────────
    # 2. Grupowanie siatek według kolorów (wzorzec MakerLab)
    # ──────────────────────────────────────────────────────────────
    # Niezależnie od liczby detali czy liter, grupujemy geometrię do max 4 unikalnych grup
    color_groups = {}  # {hex6: {"name": str, "meshes": list}}

    for p in raw_parts:
        hex6 = format_hex_6(p["color_hex"])
        if hex6 not in color_groups:
            if len(color_groups) >= 4:
                # Jeśli przekroczono 4 grupy, dołączamy do ostatniej
                last_color = list(color_groups.keys())[-1]
                color_groups[last_color]["meshes"].append(p["mesh"])
            else:
                color_groups[hex6] = {
                    "name": p["name"] or f"Part_Color_{len(color_groups) + 1}",
                    "color": hex6,
                    "meshes": [p["mesh"]],
                }
        else:
            color_groups[hex6]["meshes"].append(p["mesh"])

    grouped_parts = []
    for idx, (c_hex, g_info) in enumerate(color_groups.items()):
        meshes = g_info["meshes"]
        if len(meshes) == 1:
            merged = meshes[0]
        else:
            try:
                merged = trimesh.util.concatenate(meshes)
            except Exception as concat_err:
                print(f"[WARN] Błąd łączenia siatek koloru {c_hex}: {concat_err}")
                merged = meshes[0]

        # Naprawa normalnych i zwrotu wierzchołków
        try:
            if hasattr(merged, "process"):
                merged.process(validate=True)
            if hasattr(merged, "remove_unreferenced_vertices"):
                merged.remove_unreferenced_vertices()
            trimesh.repair.fix_normals(merged)
            trimesh.repair.fix_winding(merged)
        except Exception:
            pass

        slot_num = idx + 1
        part_name = f"Part_Color_{slot_num}"
        grouped_parts.append({
            "slot": slot_num,
            "name": part_name,
            "color": c_hex,
            "mesh": merged,
        })

    # ──────────────────────────────────────────────────────────────
    # 3. Zapis pliku 3D/Objects/object-1.model (geometria + złożenie)
    # ──────────────────────────────────────────────────────────────
    # Każda grupa kolorystyczna jako osobny obiekt id=2, id=3...
    # Zespół scalający id=1 zawiera <components><component objectid="2"/>...</components>
    sub_objects_xml = []
    components_xml = []
    model_settings_parts_xml = []

    for p in grouped_parts:
        part_id = p["slot"] + 1  # 2, 3, 4, 5
        safe_name = xml_escape(p["name"])
        extruder_num = p["slot"]

        v_xml, t_xml = _mesh_to_xml(p["mesh"])

        part_obj_str = (
            f'    <object id="{part_id}" type="model" name="{safe_name}">\n'
            f'      <mesh>\n'
            f'        <vertices>\n'
            f'{v_xml}\n'
            f'        </vertices>\n'
            f'        <triangles>\n'
            f'{t_xml}\n'
            f'        </triangles>\n'
            f'      </mesh>\n'
            f'    </object>'
        )
        sub_objects_xml.append(part_obj_str)
        components_xml.append(f'        <component objectid="{part_id}"/>')

        # Wpis do model_settings.config
        model_settings_parts_xml.append(
            f'    <part id="{part_id}" name="{safe_name}">\n'
            f'      <metadata key="name" value="{safe_name}"/>\n'
            f'      <metadata key="extruder" value="{extruder_num}"/>\n'
            f'    </part>'
        )

    # Zespół scalający (id=1)
    assembly_name = xml_escape(clean_title)
    components_joined = "\n".join(components_xml)
    assembly_obj_str = (
        f'    <object id="1" type="model" name="{assembly_name}">\n'
        f'      <components>\n'
        f'{components_joined}\n'
        f'      </components>\n'
        f'    </object>'
    )
    sub_objects_xml.append(assembly_obj_str)

    sub_objects_joined = "\n".join(sub_objects_xml)

    object_1_model_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n'
        '  <resources>\n'
        f'{sub_objects_joined}\n'
        '  </resources>\n'
        '</model>'
    )

    # ──────────────────────────────────────────────────────────────
    # 4. Główny manifest 3D/3dmodel.model i relacja 3D/_rels/3dmodel.model.rels
    # ──────────────────────────────────────────────────────────────
    main_3dmodel_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021">\n'
        '  <resources/>\n'
        '  <build>\n'
        '    <item objectid="1"/>\n'
        '  </build>\n'
        '</model>'
    )

    model_rels_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
        '  <Relationship Id="rel-1" Target="/3D/Objects/object-1.model" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/object"/>\n'
        '</Relationships>'
    )

    # ──────────────────────────────────────────────────────────────
    # 5. Metadata/ (slice_info.config, model_settings.config, project_settings.config, plate_1.png)
    # ──────────────────────────────────────────────────────────────
    slice_info_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<config>\n'
        '  <header>\n'
        '    <tool name="BambuStudio" version="01.09.00.00"/>\n'
        '  </header>\n'
        '</config>'
    )

    model_settings_parts_joined = "\n".join(model_settings_parts_xml)
    model_settings_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<config>\n'
        '  <object id="1">\n'
        f'{model_settings_parts_joined}\n'
        '  </object>\n'
        '</config>'
    )

    project_settings_json = json.dumps({
        "version": "1.0",
        "project_type": "bambu_project",
    }, indent=2)

    plate_png_bytes = create_dummy_png(200, 200, color=(38, 42, 51))

    # ──────────────────────────────────────────────────────────────
    # 6. Manifesty OPC ([Content_Types].xml, _rels/.rels)
    # ──────────────────────────────────────────────────────────────
    content_types_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n'
        '  <Default ContentType="application/vnd.openxmlformats-package.relationships+xml" Extension="rels"/>\n'
        '  <Default ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" Extension="model"/>\n'
        '  <Default ContentType="text/xml" Extension="config"/>\n'
        '  <Default ContentType="image/png" Extension="png"/>\n'
        '</Types>'
    )

    rels_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
        '  <Relationship Id="rel-1" Target="/3D/3dmodel.model" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n'
        '</Relationships>'
    )

    # ──────────────────────────────────────────────────────────────
    # 7. Określenie docelowej ścieżki pliku wyjściowego
    # ──────────────────────────────────────────────────────────────
    if not output_path:
        if model_path:
            out_dir = Path(model_path).parent
        else:
            out_dir = Path("backend/projects_3mf")
        safe_model_name = sanitize_filename(Path(file_name).stem)
        safe_mat = sanitize_filename(clean_mat)
        filename = f"ORDER_{order_id[:8]}_{safe_model_name}_{safe_mat}.3mf"
        output_path = str(out_dir / filename)

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    # ──────────────────────────────────────────────────────────────
    # 8. Pakowanie archiwum ZIP z sygnaturą BambuLab
    # ──────────────────────────────────────────────────────────────
    # Struktura MakerLab:
    # ├── [Content_Types].xml
    # ├── _rels/.rels
    # ├── 3D/3dmodel.model
    # ├── 3D/_rels/3dmodel.model.rels
    # ├── 3D/Objects/object-1.model
    # └── Metadata/
    #     ├── slice_info.config
    #     ├── model_settings.config
    #     ├── project_settings.config
    #     └── plate_1.png
    archive_files = {
        "[Content_Types].xml": content_types_xml,
        "_rels/.rels": rels_xml,
        "3D/3dmodel.model": main_3dmodel_xml,
        "3D/_rels/3dmodel.model.rels": model_rels_xml,
        "3D/Objects/object-1.model": object_1_model_xml,
        "Metadata/slice_info.config": slice_info_xml,
        "Metadata/model_settings.config": model_settings_xml,
        "Metadata/project_settings.config": project_settings_json,
        "Metadata/plate_1.png": plate_png_bytes,
    }

    bambu_comment = b"created by BambuLab"
    dt_now = datetime.datetime.now().timetuple()[:6]

    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.comment = bambu_comment
        for arcname, content in archive_files.items():
            zinfo = zipfile.ZipInfo(filename=arcname, date_time=dt_now)
            zinfo.comment = bambu_comment
            zinfo.compress_type = zipfile.ZIP_DEFLATED
            encoded_content = content.encode("utf-8") if isinstance(content, str) else content
            zf.writestr(zinfo, encoded_content)

    return output_path



