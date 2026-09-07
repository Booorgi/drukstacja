"""
Drukstacja - Generator pakietów produkcyjnych .3MF
Tworzy zunifikowany plik projektu .3MF w standardzie Bambu Studio / MakerWorld
(specyfikacja narzędzi Make My Sign / Keyring) z pełną obsługą AMS i wielokolorowości.

STRUKTURA ARCHIWUM .3MF (MakerWorld standard):
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
    ├── model_settings.config
    └── project_settings.config
"""
import os
import re
import json
import zipfile
import datetime
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


def _mesh_to_xml(mesh, indent="     "):
    """Konwertuje trimesh.Trimesh do ciągów XML vertices i triangles."""
    vert_lines = []
    for v in mesh.vertices:
        vert_lines.append(
            '%s<vertex x="%.4f" y="%.4f" z="%.4f"/>' % (indent, v[0], v[1], v[2])
        )
    tri_lines = []
    for f in mesh.faces:
        tri_lines.append(
            '%s<triangle v1="%d" v2="%d" v3="%d"/>' % (indent, f[0], f[1], f[2])
        )
    return "\n".join(vert_lines), "\n".join(tri_lines)


def generate_production_3mf(
    model_path: str = None,
    order_metadata: dict = None,
    print_settings: dict = None,
    output_path: str = None,
    parts: list = None,
) -> str:
    """
    Generuje gotowy pakiet projektowy .3MF zgodny z MakerWorld / Bambu Studio.
    
    Geometria poszczególnych warstw (baza, rant, grafika, tekst, uszko) jest
    umieszczana w 3D/Objects/object-1.model jako sub-obiekty scalone w złożenie (id=1).
    Mapowanie slotów AMS i kolorów zapisywane jest w Metadata/model_settings.config
    oraz Metadata/project_settings.config.
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
    clean_title = sanitize_filename(Path(file_name).stem) or "Keyring"

    # ──────────────────────────────────────────────────────────────
    # 1. Wczytanie i przygotowanie siatek części
    # ──────────────────────────────────────────────────────────────
    valid_parts = []
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
                try:
                    if hasattr(p_mesh, "process"):
                        p_mesh.process(validate=True)
                    if hasattr(p_mesh, "remove_unreferenced_vertices"):
                        p_mesh.remove_unreferenced_vertices()
                    trimesh.repair.fix_normals(p_mesh)
                    trimesh.repair.fix_winding(p_mesh)
                except Exception:
                    pass

                valid_parts.append({
                    "name": p_name,
                    "color_hex": p_color,
                    "mesh": p_mesh,
                    "role": p_role,
                })

    # Tryb pojedynczej bryły (jeśli brak listy parts)
    if not valid_parts:
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

        try:
            if hasattr(mesh, "process"):
                mesh.process(validate=True)
            if hasattr(mesh, "remove_unreferenced_vertices"):
                mesh.remove_unreferenced_vertices()
            trimesh.repair.fix_normals(mesh)
            trimesh.repair.fix_winding(mesh)
        except Exception:
            pass

        valid_parts.append({
            "name": clean_title,
            "color_hex": color_hex,
            "mesh": mesh,
            "role": "model",
        })

    # ──────────────────────────────────────────────────────────────
    # 2. Mapowanie kolorów i slotów AMS (ekstruderów)
    # ──────────────────────────────────────────────────────────────
    unique_colors = []      # Lista kolorów HEX (#RRGGBB)
    color_to_extruder = {}  # HEX -> 1-based extruder index

    for p in valid_parts:
        hex6 = format_hex_6(p["color_hex"])
        if hex6 not in color_to_extruder:
            unique_colors.append(hex6)
            color_to_extruder[hex6] = len(unique_colors)  # 1-based index (1, 2, 3...)

    # ──────────────────────────────────────────────────────────────
    # 3. Budowa 3D/Objects/object-1.model (geometria + sub-obiekty + assembly)
    # ──────────────────────────────────────────────────────────────
    # Wzorzec MakerWorld:
    # Sub-części mają id=2, id=3, id=4...
    # Nadrzędne złożenie ma id=1 i zagnieżdża <component objectid="2"/> itd.
    sub_objects_xml = []
    components_xml = []
    model_settings_parts_xml = []

    for idx, p in enumerate(valid_parts):
        part_id = idx + 2  # id zaczyna się od 2 (1 zarezerwowane dla assembly)
        safe_name = xml_escape(p["name"])
        hex6 = format_hex_6(p["color_hex"])
        extruder_num = color_to_extruder[hex6]

        v_xml, t_xml = _mesh_to_xml(p["mesh"])

        # Definicja siatki części
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

        # Wpis do model_settings.config dla AMS
        model_settings_parts_xml.append(
            f'    <part id="{part_id}" name="{safe_name}">\n'
            f'      <metadata key="extruder" value="{extruder_num}"/>\n'
            f'    </part>'
        )

    # Złożenie nadrzędne (id=1)
    assembly_name = xml_escape(f"{clean_title}_Assembly")
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
        '  <build>\n'
        '    <item objectid="1"/>\n'
        '  </build>\n'
        '</model>'
    )

    # ──────────────────────────────────────────────────────────────
    # 4. Budowa 3D/3dmodel.model i 3D/_rels/3dmodel.model.rels
    # ──────────────────────────────────────────────────────────────
    main_3dmodel_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n'
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
    # 5. Metadata/model_settings.config (mapowanie ekstruderów AMS)
    # ──────────────────────────────────────────────────────────────
    model_settings_parts_joined = "\n".join(model_settings_parts_xml)
    model_settings_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<config>\n'
        '  <object id="1">\n'
        f'{model_settings_parts_joined}\n'
        '  </object>\n'
        '</config>'
    )

    # ──────────────────────────────────────────────────────────────
    # 6. Metadata/project_settings.config (paleta filamentów JSON)
    # ──────────────────────────────────────────────────────────────
    filaments_json_list = []
    for c_hex in unique_colors:
        filaments_json_list.append({
            "color": c_hex,
            "type": clean_mat,
        })

    project_settings_data = {
        "version": "1.0",
        "project_type": "bambu_project",
        "filaments": filaments_json_list,
    }
    project_settings_json = json.dumps(project_settings_data, indent=2)

    # ──────────────────────────────────────────────────────────────
    # 7. Manifesty OPC ([Content_Types].xml, _rels/.rels)
    # ──────────────────────────────────────────────────────────────
    content_types_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n'
        '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n'
        '  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n'
        '  <Default Extension="config" ContentType="text/plain"/>\n'
        '</Types>'
    )

    rels_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
        '  <Relationship Id="rel-1" Target="/3D/3dmodel.model" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n'
        '</Relationships>'
    )

    # ──────────────────────────────────────────────────────────────
    # 8. Określenie docelowej ścieżki pliku wyjściowego
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
    # 9. Pakowanie archiwum ZIP z sygnaturą BambuLab
    # ──────────────────────────────────────────────────────────────
    # Zgodnie ze specyfikacją MakerWorld:
    # ├── [Content_Types].xml
    # ├── _rels/.rels
    # ├── 3D/3dmodel.model
    # ├── 3D/_rels/3dmodel.model.rels
    # ├── 3D/Objects/object-1.model
    # ├── Metadata/model_settings.config
    # └── Metadata/project_settings.config
    archive_files = {
        "[Content_Types].xml": content_types_xml,
        "_rels/.rels": rels_xml,
        "3D/3dmodel.model": main_3dmodel_xml,
        "3D/_rels/3dmodel.model.rels": model_rels_xml,
        "3D/Objects/object-1.model": object_1_model_xml,
        "Metadata/model_settings.config": model_settings_xml,
        "Metadata/project_settings.config": project_settings_json,
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

