"""
Drukstacja - Generator pakietów produkcyjnych .3MF
Tworzy zunifikowany plik projektu .3MF (OpenPackagingConvention)
w pełni kompatybilny z Bambu Studio, OrcaSlicer i PrusaSlicer.

ARCHITEKTURA WIELOKOLOROWA (AMS):
- Każdy kolor/element to osobny <object> z własnym mesh w 3D/3dmodel.model
- Assembly <object> z <components> wiąże wszystkie części
- Metadata/model_settings.config mapuje object → extruder (slot AMS)
- Metadata/project_settings.config definiuje paletę filamentów
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


def format_hex_color(hex_str: str) -> str:
    """Formatuje kod koloru HEX do standardu #RRGGBBAA wymaganego przez 3MF."""
    if not hex_str:
        return "#EF4444FF"
    clean = hex_str.strip().lstrip("#").upper()
    if len(clean) == 3:
        clean = "".join([c * 2 for c in clean])
    if len(clean) == 6:
        clean = "#%sFF" % clean
    elif len(clean) == 8:
        clean = "#%s" % clean
    else:
        clean = "#EF4444FF"
    return clean


def _color_name_from_hex(hex_str: str) -> str:
    """Próbuje zwrócić czytelną nazwę koloru na podstawie HEX."""
    mapping = {
        "#000000": "Czarny", "#FFFFFF": "Bialy", "#222222": "Czarny",
        "#FF0000": "Czerwony", "#00FF00": "Zielony", "#0000FF": "Niebieski",
        "#FFFF00": "Zolty", "#FF00FF": "Magenta", "#00FFFF": "Cyan",
        "#EF4444": "Czerwony", "#0284C7": "Niebieski", "#10B981": "Zielony",
        "#F59E0B": "Pomaranczowy", "#8B5CF6": "Fioletowy", "#EC4899": "Rozowy",
    }
    clean = hex_str.strip().lstrip("#").upper()[:6]
    return mapping.get("#" + clean, "Kolor_" + clean[:6])


def _mesh_to_xml(mesh, indent="     "):
    """Konwertuje trimesh.Trimesh do stringów XML vertices i triangles."""
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
    Generuje gotowy plik produkcyjny .3MF z modelem 3D i parametrami technologicznymi.
    Obsługuje pojedyncze modele oraz wieloczęściowe złożenia (Multi-part Object / Sub-meshes)
    z przypisanymi kolorami i mapowaniem slotów AMS dla Bambu Studio, OrcaSlicer i PrusaSlicer.

    ARCHITEKTURA XML DLA BAMBU STUDIO:
    - <object id="2"> ... mesh bazy ...       → extruder 1
    - <object id="3"> ... mesh rantu ...      → extruder 2
    - <object id="4"> ... mesh grafiki_1 ...  → extruder 3
    - <object id="1" type="model"> <components> ... </components> → assembly
    - <build> <item objectid="1"/> </build>

    :param model_path: Ścieżka do wgranego pliku (STL, OBJ, 3MF, STEP itp.) w trybie jednoczęściowym
    :param order_metadata: dict z metadanymi zamówienia
    :param print_settings: dict z ustawieniami technologicznymi
    :param output_path: Opcjonalna ścieżka wyjściowa
    :param parts: Opcjonalna lista części dla druku wielomateriałowego AMS
    :return: Ścieżka do utworzonego pliku .3MF
    """
    order_metadata = order_metadata or {}
    print_settings = print_settings or {}

    order_id = str(order_metadata.get("order_id") or "DIRECT")
    file_name = str(
        order_metadata.get("file_name")
        or (os.path.basename(model_path) if model_path else "keychain.3mf")
    )
    created_at = str(
        order_metadata.get("created_at") or datetime.datetime.utcnow().isoformat()
    )

    layer_height = float(print_settings.get("layer_height") or 0.20)
    nozzle_size = float(print_settings.get("nozzle_size") or 0.4)
    # Operator precedence fix for infill
    raw_infill = print_settings.get("infill")
    if raw_infill is not None:
        infill = int(raw_infill)
    elif "brelok" in file_name.lower():
        infill = 100
    else:
        infill = 20
    material = str(print_settings.get("material") or "PLA")
    color_hex = str(print_settings.get("color_hex") or "#EF4444")
    clean_title = sanitize_filename(Path(file_name).stem)

    # ──────────────────────────────────────────────────────────────
    # 1. Wczytanie i przygotowanie geometrii części
    # ──────────────────────────────────────────────────────────────
    valid_parts = []
    if parts and isinstance(parts, list) and len(parts) > 0:
        for idx, p in enumerate(parts):
            p_mesh = p.get("mesh")
            p_path = p.get("path")
            p_name = str(p.get("name") or "Part_%d" % (idx + 1))
            p_color = str(p.get("color_hex") or p.get("color") or color_hex)
            p_role = str(p.get("role") or "")

            if p_mesh is None and p_path and os.path.exists(p_path):
                try:
                    p_mesh = trimesh.load(p_path, force="mesh")
                except Exception as load_err:
                    print("[WARN] Nie udało się wczytać siatki części %s z %s: %s" % (p_name, p_path, load_err))

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

    is_multi_part = len(valid_parts) > 0

    # ──────────────────────────────────────────────────────────────
    # 2. Budowa XML modelu 3D (3D/3dmodel.model)
    # ──────────────────────────────────────────────────────────────
    if is_multi_part:
        # ---- Unikalna paleta kolorów i mapowanie AMS ----
        unique_colors = []         # lista kolorów #RRGGBBAA
        color_to_slot = {}         # kolor -> numer slotu AMS (1-based)

        for p in valid_parts:
            c_3mf = format_hex_color(p["color_hex"])
            if c_3mf not in color_to_slot:
                color_to_slot[c_3mf] = len(unique_colors) + 1  # 1-based extruder
                unique_colors.append(c_3mf)

        # ---- Osobne <object> dla każdej części (id zaczyna od 2) ----
        objects_xml_list = []
        component_tags = []
        model_settings_parts = []   # <part> entries for model_settings.config
        palette_entries = []        # dla project_settings palette

        for idx, p in enumerate(valid_parts):
            part_id = 2 + idx
            c_3mf = format_hex_color(p["color_hex"])
            extruder_id = color_to_slot[c_3mf]
            color_pindex = extruder_id - 1
            safe_part_name = sanitize_filename(p["name"])

            m = p["mesh"]
            v_xml, t_xml = _mesh_to_xml(m)

            part_obj_xml = (
                '  <object id="%d" type="model" name="%s" pid="1" pindex="%d">\n'
                '   <mesh>\n'
                '    <vertices>\n'
                '%s\n'
                '    </vertices>\n'
                '    <triangles>\n'
                '%s\n'
                '    </triangles>\n'
                '   </mesh>\n'
                '  </object>'
            ) % (part_id, safe_part_name, color_pindex, v_xml, t_xml)

            objects_xml_list.append(part_obj_xml)
            component_tags.append('    <component objectid="%d"/>' % part_id)
            model_settings_parts.append(
                '    <part id="%d" name="%s">\n'
                '      <metadata key="extruder" value="%d"/>\n'
                '    </part>' % (part_id, safe_part_name, extruder_id)
            )

        # ---- Assembly object (id=1) z <components> ----
        assembly_id = 1
        components_joined = "\n".join(component_tags)
        assembly_obj_xml = (
            '  <object id="%d" type="model" name="%s">\n'
            '   <components>\n'
            '%s\n'
            '   </components>\n'
            '  </object>'
        ) % (assembly_id, clean_title, components_joined)

        # Assembly jako pierwszy w kolejności, potem części
        all_objects_xml = assembly_obj_xml + "\n" + "\n".join(objects_xml_list)
        build_item_id = assembly_id

        # ---- model_settings.config (Bambu Studio) ----
        parts_settings_joined = "\n".join(model_settings_parts)
        model_settings_xml = (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<config>\n'
            '  <object id="%d">\n'
            '    <metadata key="name" value="%s"/>\n'
            '%s\n'
            '  </object>\n'
            '</config>'
        ) % (assembly_id, clean_title, parts_settings_joined)

        # ---- Paleta filamentów dla project_settings ----
        for c_3mf in unique_colors:
            c_short = c_3mf[:7]  # #RRGGBB
            palette_entries.append({
                "color": c_short,
                "type": material,
                "name": _color_name_from_hex(c_short),
            })

        # ---- Colorgroup XML (standard 3MF spec, opcjonalny backup) ----
        color_entries = ['   <m:color color="%s"/>' % c for c in unique_colors]
        colorgroup_xml = "\n".join(color_entries)

    else:
        # ---- Tryb pojedynczej bryły ----
        mesh = None
        if model_path and os.path.exists(model_path):
            ext = Path(model_path).suffix.lower()
            if ext in [".step", ".stp", ".iges", ".igs"] and convert_step_to_stl is not None:
                temp_stl = "%s_tmp_converted.stl" % model_path
                try:
                    convert_step_to_stl(model_path, temp_stl)
                    mesh = trimesh.load(temp_stl, force="mesh")
                except Exception as e:
                    print("[WARN] Konwersja STEP do STL nie powiodła się: %s" % e)
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
                    raise RuntimeError("Błąd odczytu pliku 3D (%s): %s" % (model_path, load_err))

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

        color_3mf = format_hex_color(color_hex)
        unique_colors = [color_3mf]
        colorgroup_xml = '   <m:color color="%s"/>' % color_3mf

        v_xml, t_xml = _mesh_to_xml(mesh)

        all_objects_xml = (
            '  <object id="2" type="model" name="%s" pid="1" pindex="0">\n'
            '   <mesh>\n'
            '    <vertices>\n'
            '%s\n'
            '    </vertices>\n'
            '    <triangles>\n'
            '%s\n'
            '    </triangles>\n'
            '   </mesh>\n'
            '  </object>'
        ) % (clean_title, v_xml, t_xml)
        build_item_id = 2

        model_settings_xml = (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<config>\n'
            '  <object id="2">\n'
            '    <metadata key="name" value="%s"/>\n'
            '    <part id="2" name="%s">\n'
            '      <metadata key="extruder" value="1"/>\n'
            '    </part>\n'
            '  </object>\n'
            '</config>'
        ) % (clean_title, clean_title)

        palette_entries = [{
            "color": color_3mf[:7],
            "type": material,
            "name": _color_name_from_hex(color_3mf[:7]),
        }]

    # ──────────────────────────────────────────────────────────────
    # 3. Główny plik modelu 3D/3dmodel.model
    # ──────────────────────────────────────────────────────────────
    model_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<model unit="millimeter" xml:lang="en-US"'
        ' xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"'
        ' xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02"'
        ' xmlns:BambuStudio="http://schemas.bambulab.com/package/2021">\n'
        ' <metadata name="Title">ORDER_%s_%s</metadata>\n'
        ' <metadata name="Designer">Drukstacja 3D Labs</metadata>\n'
        ' <metadata name="Application">Drukstacja Production Engine</metadata>\n'
        ' <metadata name="CreationDate">%s</metadata>\n'
        ' <metadata name="Description">Order: %s | Material: %s | Nozzle: %smm | Layer: %smm | Infill: %s%%</metadata>\n'
        ' <resources>\n'
        '  <m:colorgroup id="1">\n'
        '%s\n'
        '  </m:colorgroup>\n'
        '%s\n'
        ' </resources>\n'
        ' <build>\n'
        '  <item objectid="%d" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>\n'
        ' </build>\n'
        '</model>'
    ) % (
        order_id, clean_title,
        created_at,
        order_id, material, nozzle_size, layer_height, infill,
        colorgroup_xml,
        all_objects_xml,
        build_item_id,
    )

    # ──────────────────────────────────────────────────────────────
    # 4. Pliki manifestu OPC
    # ──────────────────────────────────────────────────────────────
    content_types_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n'
        ' <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n'
        ' <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n'
        ' <Default Extension="ini" ContentType="text/plain"/>\n'
        ' <Default Extension="config" ContentType="text/plain"/>\n'
        ' <Default Extension="json" ContentType="application/json"/>\n'
        '</Types>'
    )

    rels_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
        ' <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n'
        '</Relationships>'
    )

    # ──────────────────────────────────────────────────────────────
    # 5. Konfiguracja slicera (Metadata/SlicingConfig.ini)
    # ──────────────────────────────────────────────────────────────
    first_layer_h = 0.20 if nozzle_size >= 0.4 else 0.12
    bed_temp = 60 if "PLA" in material.upper() or "PET" in material.upper() else 90
    nozzle_temp = 215 if "PLA" in material.upper() else (240 if "PET" in material.upper() else 250)

    sc_list = [c[:7] for c in unique_colors]
    slicing_colours = ";".join(sc_list)
    sm_list = [material for _ in unique_colors]
    slicing_materials = ";".join(sm_list)

    slicing_ini = (
        "; Drukstacja Slicing Configuration\n"
        "; Kompatybilne z Bambu Studio, OrcaSlicer, PrusaSlicer, SuperSlicer\n"
        "layer_height = %s\n"
        "first_layer_height = %s\n"
        "fill_density = %s%%\n"
        "fill_pattern = gyroid\n"
        "nozzle_diameter = %s\n"
        "filament_type = %s\n"
        "filament_colour = %s\n"
        "extruder_colour = %s\n"
        "filament_density = 1.24\n"
        "temperature = %d\n"
        "first_layer_temperature = %d\n"
        "bed_temperature = %d\n"
        "first_layer_bed_temperature = %d\n"
        "bed_shape = 0x0,250x0,250x210,0x210\n"
        "order_id = %s\n"
        "order_date = %s\n"
        "customer_file = %s\n"
        "generator = Drukstacja Cloud 3MF Engine\n"
    ) % (
        layer_height, first_layer_h, infill,
        nozzle_size, slicing_materials, slicing_colours, slicing_colours,
        nozzle_temp, nozzle_temp + 5, bed_temp, bed_temp,
        order_id, created_at, file_name,
    )

    # ──────────────────────────────────────────────────────────────
    # 6. Konfiguracja Bambu Studio / OrcaSlicer (Metadata/project_settings.config)
    #    Format kompatybilny z parserem Bambu Studio / OrcaSlicer (filament_colour array)
    # ──────────────────────────────────────────────────────────────
    filament_settings = []
    for idx, c in enumerate(unique_colors):
        filament_settings.append({
            "id": idx + 1,
            "type": material,
            "color": c[:7],
            "nozzle_diameter": nozzle_size,
            "layer_height": layer_height,
            "infill_density": infill,
        })

    bambu_project_config = {
        "version": "1.0.0",
        "plate_name": "Zlecenie #%s" % order_id[:8],
        "filament_colour": [c[:7] for c in unique_colors],
        "filament_type": [material for _ in unique_colors],
        "filament_vendor": ["Generic" for _ in unique_colors],
        "filament_density": ["1.24" for _ in unique_colors],
        "filament_cost": ["80" for _ in unique_colors],
        "filament_settings_id": ["Generic %s @BBL X1C" % material for _ in unique_colors],
        "nozzle_diameter": [nozzle_size for _ in unique_colors],
        "first_layer_print_sequence": [idx + 1 for idx in range(len(unique_colors))],
        "palette": palette_entries,
        "filament_settings": filament_settings,
        "generator": "Drukstacja 3D Automation",
        "order": {
            "id": order_id,
            "filename": file_name,
            "date": created_at,
        },
    }

    # ──────────────────────────────────────────────────────────────
    # 7. Slicer manifest (Metadata/slice_info.config) — kluczowy dla AMS
    # ──────────────────────────────────────────────────────────────
    filaments_slice_xml = []
    for idx, c in enumerate(unique_colors):
        filaments_slice_xml.append(
            '    <filament id="%d" tray_info_idx="" type="%s" color="%s" used_m="1.00" used_g="3.00"/>'
            % (idx + 1, material, c[:7])
        )

    slice_info_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<config>\n'
        '  <header>\n'
        '    <header_item key="X-BBL-Client-Type" value="slicer"/>\n'
        '    <header_item key="X-BBL-Client-Version" value="01.10.00.89"/>\n'
        '  </header>\n'
        '  <plate>\n'
        '    <metadata key="index" value="1"/>\n'
        '    <metadata key="printer_model_id" value=""/>\n'
        '    <metadata key="nozzle_diameters" value="%.2f"/>\n'
        '    <metadata key="timelapse_type" value="0"/>\n'
        '    <metadata key="prediction" value="0"/>\n'
        '    <metadata key="weight" value="0"/>\n'
        '    <metadata key="outside" value="false"/>\n'
        '    <metadata key="support_used" value="false"/>\n'
        '    <metadata key="label_object_enabled" value="false"/>\n'
        '%s\n'
        '  </plate>\n'
        '</config>'
    ) % (nozzle_size, "\n".join(filaments_slice_xml))

    # ──────────────────────────────────────────────────────────────
    # 8. Plate settings (Metadata/plate_1.config) — Bambu Studio plate definition
    # ──────────────────────────────────────────────────────────────
    plate_config_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<config>\n'
        '  <plate>\n'
        '    <metadata key="plater_id" value="1"/>\n'
        '    <metadata key="plater_name" value="Drukstacja"/>\n'
        '    <metadata key="locked" value="false"/>\n'
        '    <instance object_id="%d" instance_id="0" identify_id="0"/>\n'
        '  </plate>\n'
        '</config>'
    ) % build_item_id

    # ──────────────────────────────────────────────────────────────
    # 9. Określenie docelowej ścieżki pliku wyjściowego
    # ──────────────────────────────────────────────────────────────
    if not output_path:
        if model_path:
            out_dir = Path(model_path).parent
        else:
            out_dir = Path("backend/projects_3mf")
        safe_model_name = sanitize_filename(Path(file_name).stem)
        safe_mat = sanitize_filename(material.split()[0])
        filename = "ORDER_%s_%s_%s_%smm.3mf" % (order_id[:8], safe_model_name, safe_mat, nozzle_size)
        output_path = str(out_dir / filename)

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    # ──────────────────────────────────────────────────────────────
    # 10. Spakowanie do archiwum ZIP ze standardem .3MF
    # ──────────────────────────────────────────────────────────────
    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types_xml)
        zf.writestr("_rels/.rels", rels_xml)
        zf.writestr("3D/3dmodel.model", model_xml)
        zf.writestr("Metadata/SlicingConfig.ini", slicing_ini)
        zf.writestr("Metadata/project_settings.config", json.dumps(bambu_project_config, indent=2))
        zf.writestr("Metadata/model_settings.config", model_settings_xml)
        zf.writestr("Metadata/slice_info.config", slice_info_xml)
        zf.writestr("Metadata/plate_1.config", plate_config_xml)

    return output_path
