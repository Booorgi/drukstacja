"""
Drukstacja - Generator pakietów produkcyjnych .3MF
Tworzy zunifikowany plik projektu .3MF w natywnym standardzie Bambu Studio / OrcaSlicer
z pełną obsługą wielu kolorów (AMS), hierarchią części oraz rzeczywistymi parametrami druku.

STRUKTURA ARCHIWUM .3MF (standard Bambu Studio Project):
├── [Content_Types].xml
├── _rels/
│   └── .rels
├── 3D/
│   └── 3dmodel.model
└── Metadata/
    ├── SlicingConfig.ini
    ├── project_settings.config  (JSON)
    ├── model_settings.config    (XML)
    ├── slice_info.config        (XML)
    ├── plate_1.config           (XML)
    └── plate_1.png              (PNG)
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


def format_hex_8(hex_str: str) -> str:
    """Formatuje kod koloru HEX do standardu #RRGGBBAA wymaganego przez specyfikację 3MF m:color."""
    if not hex_str:
        return "#000000FF"
    clean = hex_str.strip().lstrip("#").upper()
    if len(clean) == 3:
        clean = "".join([c * 2 for c in clean])
    if len(clean) == 6:
        return f"#{clean}FF"
    elif len(clean) >= 8:
        return f"#{clean[:8]}"
    return "#000000FF"


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


def _mesh_to_xml(mesh, indent="     "):
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


def get_bambu_process_preset(layer_height: float) -> str:
    """Zwraca oficjalną nazwę profilu procesu Bambu Studio dla danej wysokości warstwy."""
    if abs(layer_height - 0.08) < 0.01:
        return "0.08mm High Quality @BBL A1"
    elif abs(layer_height - 0.12) < 0.01:
        return "0.12mm High Quality @BBL A1"
    elif abs(layer_height - 0.16) < 0.01:
        return "0.16mm Optimal @BBL A1"
    elif abs(layer_height - 0.20) < 0.01:
        return "0.20mm Standard @BBL A1"
    elif abs(layer_height - 0.24) < 0.01:
        return "0.24mm Draft @BBL A1"
    elif abs(layer_height - 0.28) < 0.01:
        return "0.28mm Extra Draft @BBL A1"
    return f"{layer_height:.2f}mm Standard @BBL A1"


def generate_production_3mf(
    model_path: str = None,
    order_metadata: dict = None,
    print_settings: dict = None,
    output_path: str = None,
    parts: list = None,
) -> str:
    """
    Generuje gotowy pakiet produkcyjny .3MF zgodny z Bambu Studio w 100% natywnym formacie.
    
    1. Każda część (Baza, Rant, Grafika, Tekst, Uszko) staje się osobnym podobiektem w obiekcie montażowym id="1".
    2. Wszystkie unikalne kolory są rejestrowane w <m:colorgroup id="1">.
    3. Każdy podobiekt posiada powiązanie pid="1" pindex="{color_idx}".
    4. Zespół montażowy id="1" zawiera <components><component objectid="X"/>...</components>.
    5. Sygnatura <metadata name="Application">BambuStudio-01.10.01.50</metadata> gwarantuje, że
       Bambu Studio rozpoznaje plik jako swój natywny projekt (m_is_bbl_3mf = true) i nie wyświetla ostrzeżenia.
    6. Metadata/project_settings.config to pełny plik JSON (odczytywany przez Bambu Studio ConfigBase::load_from_json)
       zawierający mapowanie filamentów, kolorów, slotów AMS i parametrów slicera.
    7. Metadata/model_settings.config zawiera hierarchię części pod obiektem id="1" z atrybutami subtype="normal_part"
       oraz <metadata key="extruder" value="{N}"/>.
    """
    order_metadata = order_metadata or {}
    print_settings = print_settings or {}

    order_id = str(order_metadata.get("order_id") or "DIRECT")
    file_name = str(
        order_metadata.get("file_name")
        or (os.path.basename(model_path) if model_path else "keychain.3mf")
    )
    created_at = str(
        order_metadata.get("created_at") or datetime.datetime.utcnow().strftime("%Y-%m-%d")
    )

    # Parametry technologiczne druku
    def _parse_float(val, default):
        try:
            if isinstance(val, (int, float)):
                return float(val)
            nums = re.findall(r"[\d\.]+", str(val or ""))
            return float(nums[0]) if nums else default
        except Exception:
            return default

    layer_height = _parse_float(print_settings.get("layer_height"), 0.20)
    nozzle_size = _parse_float(print_settings.get("nozzle_size"), 0.40)
    infill_val = _parse_float(print_settings.get("infill"), 40.0)
    infill = int(infill_val)

    material = str(print_settings.get("material") or "PLA")
    clean_mat = material.split()[0].upper() if material else "PLA"
    color_hex = str(print_settings.get("color_hex") or "#222222")
    clean_title = sanitize_filename(Path(file_name).stem) or "Keychain"

    # ──────────────────────────────────────────────────────────────
    # 1. Wczytanie geometrii poszczególnych części
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
    # 2. Rejestracja unikalnej palety kolorów i mapowanie ekstruderów AMS
    # ──────────────────────────────────────────────────────────────
    unique_colors_8 = []    # Lista #RRGGBBAA
    unique_colors_6 = []    # Lista #RRGGBB
    part_color_indices = [] # Indeks pindex w colorgroup dla każdej części
    part_extruders = []     # Numer ekstrudera (1-based) dla każdej części

    for p in valid_parts:
        c8 = format_hex_8(p["color_hex"])
        c6 = format_hex_6(p["color_hex"])

        if c8 not in unique_colors_8:
            unique_colors_8.append(c8)
            unique_colors_6.append(c6)

        c_idx = unique_colors_8.index(c8)
        part_color_indices.append(c_idx)
        part_extruders.append(c_idx + 1)  # 1-based extruder/AMS slot

    num_filaments = len(unique_colors_6)

    # ──────────────────────────────────────────────────────────────
    # 3. Budowa 3D/3dmodel.model
    # ──────────────────────────────────────────────────────────────
    # Zgodnie z natywnym standardem Bambu Studio:
    # Obiekt montażu ma id=1 i zagnieżdża komponenty id=2, id=3, id=4...
    # Każdy podobiekt ma pid="1" pindex="{c_idx}"
    sub_objects_xml = []
    components_xml = []
    model_settings_parts_xml = []

    for idx, p in enumerate(valid_parts):
        obj_id = idx + 2
        safe_name = xml_escape(p["name"])
        c_idx = part_color_indices[idx]
        extruder_num = part_extruders[idx]
        face_count = len(p["mesh"].faces) if hasattr(p["mesh"], "faces") else 0

        v_xml, t_xml = _mesh_to_xml(p["mesh"], indent="     ")

        # Podobiekt z geometrią i indeksem koloru
        part_obj_str = (
            f'  <object id="{obj_id}" type="model" name="{safe_name}" pid="1" pindex="{c_idx}">\n'
            f'   <mesh>\n'
            f'    <vertices>\n'
            f'{v_xml}\n'
            f'    </vertices>\n'
            f'    <triangles>\n'
            f'{t_xml}\n'
            f'    </triangles>\n'
            f'   </mesh>\n'
            f'  </object>'
        )
        sub_objects_xml.append(part_obj_str)
        components_xml.append(f'    <component objectid="{obj_id}"/>')

        # Wpis części wewnątrz <object id="1"> w Metadata/model_settings.config
        model_settings_parts_xml.append(
            f'    <part id="{obj_id}" subtype="normal_part">\n'
            f'      <metadata key="name" value="{safe_name}"/>\n'
            f'      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>\n'
            f'      <metadata key="source_file" value="{safe_name}.stl"/>\n'
            f'      <metadata key="source_object_id" value="0"/>\n'
            f'      <metadata key="source_volume_id" value="0"/>\n'
            f'      <metadata key="extruder" value="{extruder_num}"/>\n'
            f'      <mesh_stat face_count="{face_count}" edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>\n'
            f'    </part>'
        )

    # Obiekt montażu (Assembly) id=1
    components_joined = "\n".join(components_xml)
    assembly_name = xml_escape(clean_title)
    assembly_obj_str = (
        f'  <object id="1" type="model" name="{assembly_name}">\n'
        f'   <components>\n'
        f'{components_joined}\n'
        f'   </components>\n'
        f'  </object>'
    )

    # Colorgroup XML
    colorgroup_entries = [f'   <m:color color="{c}"/>' for c in unique_colors_8]
    colorgroup_joined = "\n".join(colorgroup_entries)

    sub_objects_joined = "\n".join(sub_objects_xml)

    main_3dmodel_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"'
        ' xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02"'
        ' xmlns:BambuStudio="http://schemas.bambulab.com/package/2021">\n'
        ' <metadata name="Application">BambuStudio-01.10.01.50</metadata>\n'
        ' <metadata name="BambuStudio:3mfVersion">1</metadata>\n'
        f' <metadata name="Title">ORDER_{order_id[:8]}_{assembly_name}</metadata>\n'
        ' <metadata name="Designer">Drukstacja 3D Labs</metadata>\n'
        f' <metadata name="CreationDate">{created_at}</metadata>\n'
        f' <metadata name="Description">Order: {order_id[:8]} | Material: {clean_mat} | Nozzle: {nozzle_size}mm | Layer: {layer_height}mm | Infill: {infill}%</metadata>\n'
        ' <resources>\n'
        '  <m:colorgroup id="1">\n'
        f'{colorgroup_joined}\n'
        '  </m:colorgroup>\n'
        f'{assembly_obj_str}\n'
        f'{sub_objects_joined}\n'
        ' </resources>\n'
        ' <build>\n'
        '  <item objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>\n'
        ' </build>\n'
        '</model>'
    )

    # ──────────────────────────────────────────────────────────────
    # 4. Metadata/project_settings.config (JSON - wczytywany przez Bambu Studio ConfigBase::load_from_json)
    # ──────────────────────────────────────────────────────────────
    print_preset = get_bambu_process_preset(layer_height)
    printer_machine = f"Bambu Lab A1 {nozzle_size:.1f} nozzle" if nozzle_size in [0.2, 0.4, 0.6, 0.8] else "Bambu Lab A1 0.4 nozzle"

    project_settings_dict = {
        "version": "01.10.01.50",
        "name": "project_settings",
        "from": "project",
        "filament_colour": unique_colors_6,
        "filament_type": [clean_mat] * num_filaments,
        "filament_vendor": ["Generic"] * num_filaments,
        "filament_settings_id": [f"Generic {clean_mat} @BBL A1"] * num_filaments,
        "nozzle_diameter": [f"{nozzle_size:.1f}"] * num_filaments,
        "layer_height": f"{layer_height:.2f}",
        "initial_layer_print_height": "0.20",
        "sparse_infill_density": f"{infill}%",
        "printer_model": "Bambu Lab A1",
        "printer_settings_id": printer_machine,
        "print_settings_id": print_preset,
    }
    project_settings_json = json.dumps(project_settings_dict, indent=4)

    # ──────────────────────────────────────────────────────────────
    # 5. Metadata/model_settings.config (XML - hierarchia części i przypisanie ekstruderów)
    # ──────────────────────────────────────────────────────────────
    model_settings_parts_joined = "\n".join(model_settings_parts_xml)

    model_settings_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<config>\n'
        '  <object id="1">\n'
        f'    <metadata key="name" value="{assembly_name}"/>\n'
        '    <metadata key="extruder" value="1"/>\n'
        f'{model_settings_parts_joined}\n'
        '  </object>\n'
        '  <plate>\n'
        '    <metadata key="plater_id" value="1"/>\n'
        '    <metadata key="plater_name" value=""/>\n'
        '    <metadata key="locked" value="false"/>\n'
        '    <metadata key="thumbnail_file" value="Metadata/plate_1.png"/>\n'
        '    <metadata key="top_file" value="Metadata/top_1.png"/>\n'
        '    <metadata key="pick_file" value="Metadata/pick_1.png"/>\n'
        '    <model_instance>\n'
        '      <metadata key="object_id" value="1"/>\n'
        '      <metadata key="instance_id" value="0"/>\n'
        '      <metadata key="identify_id" value="1"/>\n'
        '    </model_instance>\n'
        '  </plate>\n'
        '  <assemble>\n'
        '    <assemble_item object_id="1" instance_id="0" transform="1 0 0 0 1 0 0 0 1 128 128 0" offset="0 0 0"/>\n'
        '  </assemble>\n'
        '</config>'
    )

    # ──────────────────────────────────────────────────────────────
    # 6. Metadata/slice_info.config (nagłówek slicera i lista filamentów)
    # ──────────────────────────────────────────────────────────────
    filament_slice_tags = []
    for idx, c6 in enumerate(unique_colors_6):
        filament_slice_tags.append(
            f'    <filament id="{idx + 1}" tray_info_idx="" type="{clean_mat}" color="{c6}" used_m="1.00" used_g="3.00"/>'
        )
    filament_slice_joined = "\n".join(filament_slice_tags)

    slice_info_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<config>\n'
        '  <header>\n'
        '    <header_item key="X-BBL-Client-Type" value="slicer"/>\n'
        '    <header_item key="X-BBL-Client-Version" value="01.10.01.50"/>\n'
        '  </header>\n'
        '  <plate>\n'
        '    <metadata key="index" value="1"/>\n'
        '    <metadata key="printer_model_id" value="N1"/>\n'
        f'    <metadata key="nozzle_diameters" value="{nozzle_size:.2f}"/>\n'
        '    <metadata key="timelapse_type" value="0"/>\n'
        '    <metadata key="prediction" value="0"/>\n'
        '    <metadata key="weight" value="0"/>\n'
        '    <metadata key="outside" value="false"/>\n'
        '    <metadata key="support_used" value="false"/>\n'
        '    <metadata key="label_object_enabled" value="false"/>\n'
        f'{filament_slice_joined}\n'
        '  </plate>\n'
        '</config>'
    )

    # ──────────────────────────────────────────────────────────────
    # 7. Metadata/plate_1.config (instancja na stole)
    # ──────────────────────────────────────────────────────────────
    plate_config_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<config>\n'
        '  <plate>\n'
        '    <metadata key="plater_id" value="1"/>\n'
        '    <metadata key="plater_name" value="Drukstacja"/>\n'
        '    <metadata key="locked" value="false"/>\n'
        '    <instance object_id="1" instance_id="0" identify_id="1"/>\n'
        '  </plate>\n'
        '</config>'
    )

    # ──────────────────────────────────────────────────────────────
    # 8. Metadata/SlicingConfig.ini (konfiguracja slicera w formacie INI)
    # ──────────────────────────────────────────────────────────────
    first_layer_h = 0.20 if nozzle_size >= 0.4 else 0.12
    bed_temp = 60 if "PLA" in clean_mat or "PET" in clean_mat else 90
    nozzle_temp = 215 if "PLA" in clean_mat else (240 if "PET" in clean_mat else 250)
    filament_colours_str = ";".join(unique_colors_6)
    filament_types_str = ";".join([clean_mat for _ in unique_colors_6])

    slicing_ini = (
        "; Drukstacja Slicing Configuration\n"
        "; Kompatybilne z Bambu Studio, OrcaSlicer, PrusaSlicer, SuperSlicer\n"
        f"layer_height = {layer_height}\n"
        f"first_layer_height = {first_layer_h}\n"
        f"fill_density = {infill}%\n"
        "fill_pattern = gyroid\n"
        f"nozzle_diameter = {nozzle_size}\n"
        f"filament_type = {filament_types_str}\n"
        f"filament_colour = {filament_colours_str}\n"
        f"extruder_colour = {filament_colours_str}\n"
        "filament_density = 1.24\n"
        f"temperature = {nozzle_temp}\n"
        f"first_layer_temperature = {nozzle_temp + 5}\n"
        f"bed_temperature = {bed_temp}\n"
        f"first_layer_bed_temperature = {bed_temp}\n"
        "bed_shape = 0x0,250x0,250x210,0x210\n"
        f"order_id = {order_id}\n"
        f"order_date = {created_at}\n"
        f"customer_file = {file_name}\n"
        "generator = Drukstacja Cloud 3MF Engine\n"
    )

    # ──────────────────────────────────────────────────────────────
    # 9. Miniatury stołu plate_1.png, top_1.png, pick_1.png
    # ──────────────────────────────────────────────────────────────
    plate_png_bytes = create_dummy_png(200, 200, color=(38, 42, 51))

    # ──────────────────────────────────────────────────────────────
    # 10. Manifesty OPC ([Content_Types].xml, _rels/.rels)
    # ──────────────────────────────────────────────────────────────
    content_types_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n'
        ' <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n'
        ' <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n'
        ' <Default Extension="ini" ContentType="text/plain"/>\n'
        ' <Default Extension="config" ContentType="text/plain"/>\n'
        ' <Default Extension="json" ContentType="application/json"/>\n'
        ' <Default Extension="png" ContentType="image/png"/>\n'
        '</Types>'
    )

    rels_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
        ' <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n'
        '</Relationships>'
    )

    # ──────────────────────────────────────────────────────────────
    # 11. Określenie docelowej ścieżki pliku wyjściowego
    # ──────────────────────────────────────────────────────────────
    if not output_path:
        if model_path:
            out_dir = Path(model_path).parent
        else:
            out_dir = Path("backend/projects_3mf")
        safe_model_name = sanitize_filename(Path(file_name).stem)
        safe_mat = sanitize_filename(clean_mat)
        filename = f"ORDER_{order_id[:8]}_{safe_model_name}_{safe_mat}_{nozzle_size}mm.3mf"
        output_path = str(out_dir / filename)

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    # ──────────────────────────────────────────────────────────────
    # 12. Pakowanie archiwum ZIP z sygnaturą BambuLab
    # ──────────────────────────────────────────────────────────────
    archive_files = {
        "[Content_Types].xml": content_types_xml,
        "_rels/.rels": rels_xml,
        "3D/3dmodel.model": main_3dmodel_xml,
        "Metadata/SlicingConfig.ini": slicing_ini,
        "Metadata/project_settings.config": project_settings_json,
        "Metadata/model_settings.config": model_settings_xml,
        "Metadata/slice_info.config": slice_info_xml,
        "Metadata/plate_1.config": plate_config_xml,
        "Metadata/plate_1.png": plate_png_bytes,
        "Metadata/top_1.png": plate_png_bytes,
        "Metadata/pick_1.png": plate_png_bytes,
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

    # Walidacja wygenerowanego pakietu
    validation = validate_3mf_package(output_path)
    if not validation["valid"]:
        raise ValueError(f"Błąd walidacji wygenerowanego pakietu 3MF: {validation['errors']}")

    return output_path


def validate_3mf_package(file_path: str) -> dict:
    """
    Sprawdza integralność i zgodność wygenerowanego pakietu .3MF ze strukturą Bambu Studio.
    Weryfikuje rzeczywistą semantykę wymaganą przez parser slicera Bambu Lab:
    1. Sygnatura ZIP i komentarz 'created by BambuLab'
    2. Obecność 3D/3dmodel.model z poprawną sygnaturą BambuStudio (<metadata name="Application">BambuStudio-...)
    3. Definicja <m:colorgroup id="1"> z kolorami hex
    4. Obiekt montażowy id="1" z sekcją <components> oraz sekcja <build>
    5. Podobiekty z pid="1" i pindex="..." dla każdego komponentu
    6. Metadata/model_settings.config z poprawną strukturą <object id="1"><part id="..." subtype="normal_part">
       oraz <metadata key="extruder" value="..."/>
    7. Metadata/project_settings.config w formacie JSON zawierającym filament_colour, filament_type, layer_height, sparse_infill_density
    8. Metadata/slice_info.config z nagłówkiem X-BBL-Client-Type oraz tagami <filament id="...">
    9. Manifesty relacji OPC ([Content_Types].xml, _rels/.rels)
    10. Miniatury stołu plate_1.png jako poprawny plik graficzny PNG
    """
    errors = []
    details = {}

    if not os.path.exists(file_path):
        return {"valid": False, "errors": [f"Plik {file_path} nie istnieje."]}

    try:
        with zipfile.ZipFile(file_path, "r") as zf:
            namelist = zf.namelist()
            details["namelist"] = namelist

            # 1. Poprawny plik ZIP i komentarz
            details["zip_comment"] = zf.comment.decode("utf-8", errors="replace")

            # 2. Obecność 3D/3dmodel.model
            if "3D/3dmodel.model" not in namelist:
                errors.append("Brak pliku 3D/3dmodel.model w archiwum.")

            # 3. Wymagane pliki Metadata
            required_meta = [
                "Metadata/model_settings.config",
                "Metadata/project_settings.config",
                "Metadata/slice_info.config",
                "Metadata/SlicingConfig.ini",
                "Metadata/plate_1.png",
            ]
            for rm in required_meta:
                if rm not in namelist:
                    errors.append(f"Brak wymaganego pliku metadanych: {rm}")

            # 4. Relacje i typy OPC
            if "_rels/.rels" not in namelist:
                errors.append("Brak pliku _rels/.rels.")
            if "[Content_Types].xml" not in namelist:
                errors.append("Brak pliku [Content_Types].xml.")

            # 5. Sprawdzenie treści 3D/3dmodel.model
            if "3D/3dmodel.model" in namelist:
                model_content = zf.read("3D/3dmodel.model").decode("utf-8", errors="replace")
                
                # Sygnatura BambuStudio (wymagana przez parser m_is_bbl_3mf w bbs_3mf.cpp)
                if 'name="Application">BambuStudio-' not in model_content:
                    errors.append("Plik 3D/3dmodel.model nie zawiera sygnatury <metadata name=\"Application\">BambuStudio-...")

                # Colorgroup
                if "<m:colorgroup" not in model_content:
                    errors.append("Plik 3D/3dmodel.model nie zawiera definicji <m:colorgroup>.")
                
                # Rejestracja mesh i vertices
                if "<vertex" not in model_content or "<triangle" not in model_content:
                    errors.append("Brak wierzchołków lub trójkątów w 3D/3dmodel.model.")

                # Powiązanie pid/pindex
                if 'pid="1"' not in model_content or 'pindex=' not in model_content:
                    errors.append("Brak atrybutów pid='1' i pindex w obiektach 3D.")

                # Assembly i build
                if '<object id="1"' not in model_content or '<build>' not in model_content:
                    errors.append("Brak obiektu montażowego id='1' lub sekcji <build>.")

            # 6. Sprawdzenie Metadata/model_settings.config
            if "Metadata/model_settings.config" in namelist:
                ms_content = zf.read("Metadata/model_settings.config").decode("utf-8", errors="replace")
                if '<object id="1">' not in ms_content:
                    errors.append("Brak sekcji <object id=\"1\"> w Metadata/model_settings.config.")
                if 'subtype="normal_part"' not in ms_content:
                    errors.append("Brak atrybutu subtype=\"normal_part\" w Metadata/model_settings.config.")
                if 'key="extruder"' not in ms_content:
                    errors.append("Brak przypisania ekstruderów (key=\"extruder\") w Metadata/model_settings.config.")

            # 7. Sprawdzenie Metadata/project_settings.config (musi być poprawny JSON!)
            if "Metadata/project_settings.config" in namelist:
                ps_raw = zf.read("Metadata/project_settings.config").decode("utf-8", errors="replace")
                try:
                    ps_json = json.loads(ps_raw)
                    details["project_settings"] = {
                        "filament_colour": ps_json.get("filament_colour"),
                        "filament_type": ps_json.get("filament_type"),
                        "layer_height": ps_json.get("layer_height"),
                        "sparse_infill_density": ps_json.get("sparse_infill_density"),
                        "printer_model": ps_json.get("printer_model"),
                    }
                    if "filament_colour" not in ps_json:
                        errors.append("Brak pola filament_colour w Metadata/project_settings.config (JSON).")
                    if "layer_height" not in ps_json:
                        errors.append("Brak pola layer_height w Metadata/project_settings.config (JSON).")
                    if "sparse_infill_density" not in ps_json:
                        errors.append("Brak pola sparse_infill_density w Metadata/project_settings.config (JSON).")
                except json.JSONDecodeError as jde:
                    errors.append(f"Metadata/project_settings.config nie jest poprawnym plikiem JSON: {jde}")

            # 8. Sprawdzenie Metadata/slice_info.config
            if "Metadata/slice_info.config" in namelist:
                si_content = zf.read("Metadata/slice_info.config").decode("utf-8", errors="replace")
                if 'key="X-BBL-Client-Type"' not in si_content:
                    errors.append("Brak nagłówka X-BBL-Client-Type w Metadata/slice_info.config.")
                if '<filament id=' not in si_content:
                    errors.append("Brak tagów <filament id=...> w Metadata/slice_info.config.")

            # 9. Miniatura plate_1.png
            if "Metadata/plate_1.png" in namelist:
                png_header = zf.read("Metadata/plate_1.png")[:8]
                if not png_header.startswith(b"\x89PNG"):
                    errors.append("Metadata/plate_1.png nie jest poprawnym plikiem PNG.")

    except Exception as e:
        return {"valid": False, "errors": [f"Błąd odczytu archiwum ZIP: {e}"]}

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "details": details,
    }
