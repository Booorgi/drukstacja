"""
Drukstacja - Generator pakietów produkcyjnych .3MF
Tworzy zunifikowany plik projektu .3MF w standardzie Bambu Studio / OrcaSlicer
z pełną obsługą wielu kolorów (AMS), hierarchią części oraz rzeczywistymi parametrami druku.

STRUKTURA ARCHIWUM .3MF (standard Bambu Studio Project):
├── [Content_Types].xml
├── _rels/
│   └── .rels
├── 3D/
│   └── 3dmodel.model
└── Metadata/
    ├── SlicingConfig.ini
    ├── project_settings.config
    ├── model_settings.config
    ├── slice_info.config
    ├── plate_1.config
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


def generate_production_3mf(
    model_path: str = None,
    order_metadata: dict = None,
    print_settings: dict = None,
    output_path: str = None,
    parts: list = None,
) -> str:
    """
    Generuje gotowy pakiet produkcyjny .3MF zgodny z Bambu Studio (test_multicolor.3mf).
    
    1. Każda część (Baza, Rant, Grafika, Tekst, Uszko) staje się osobnym obiektem <object id="X">.
    2. Wszystkie unikalne kolory są rejestrowane w <m:colorgroup id="1">.
    3. Każdy obiekt posiada jawne powiązanie pid="1" pindex="{color_idx}".
    4. Zespół montażowy id="1" zawiera <components><component objectid="X"/>...</components>.
    5. Konfiguracja Bambu (project_settings.config, model_settings.config, slice_info.config)
       zawiera pełne przypisanie slotów AMS, kolorów i rzeczywistych ustawień druku.
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
    infill_val = _parse_float(print_settings.get("infill"), 100.0)
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

    # ──────────────────────────────────────────────────────────────
    # 3. Budowa 3D/3dmodel.model
    # ──────────────────────────────────────────────────────────────
    # Zgodnie z test_multicolor.3mf:
    # Obiekt montażu ma id=1 i zagnieżdża komponenty id=2, id=3, id=4...
    # Każdy podobiekt ma pid="1" pindex="{c_idx}"
    sub_objects_xml = []
    components_xml = []
    model_settings_parts_xml = []
    standalone_objects_xml = []

    for idx, p in enumerate(valid_parts):
        obj_id = idx + 2
        safe_name = xml_escape(p["name"])
        c_idx = part_color_indices[idx]
        extruder_num = part_extruders[idx]

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

        # Wpis wewnątrz <object id="1"> w model_settings.config
        model_settings_parts_xml.append(
            f'    <part id="{obj_id}" name="{safe_name}">\n'
            f'      <metadata key="extruder" value="{extruder_num}"/>\n'
            f'    </part>'
        )

        # Wpis płaski <object id="X"> w model_settings.config
        standalone_objects_xml.append(
            f'  <object id="{obj_id}">\n'
            f'    <metadata key="name" value="{safe_name}"/>\n'
            f'    <metadata key="extruder" value="{extruder_num}"/>\n'
            f'  </object>'
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
        f' <metadata name="Title">ORDER_{order_id[:8]}_{assembly_name}</metadata>\n'
        ' <metadata name="Designer">Drukstacja 3D Labs</metadata>\n'
        ' <metadata name="Application">Drukstacja Production Engine</metadata>\n'
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
    # 4. Metadata/project_settings.config (konfiguracja stołu i palety Bambu)
    # ──────────────────────────────────────────────────────────────
    # Zgodnie z test_multicolor.3mf to jest plik XML z metadanymi filamentów i parametrów
    filament_colours_str = ";".join(unique_colors_6)
    filament_types_str = ";".join([clean_mat for _ in unique_colors_6])
    filament_settings_ids = ";".join([f"Generic {clean_mat} @BBL X1C" for _ in unique_colors_6])
    filament_vendors_str = ";".join(["Generic" for _ in unique_colors_6])

    project_settings_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<config>\n'
        '  <plate>\n'
        f'    <metadata key="filament_colour" value="{filament_colours_str}"/>\n'
        f'    <metadata key="filament_type" value="{filament_types_str}"/>\n'
        f'    <metadata key="filament_settings_id" value="{filament_settings_ids}"/>\n'
        f'    <metadata key="filament_vendor" value="{filament_vendors_str}"/>\n'
        f'    <metadata key="nozzle_diameter" value="{nozzle_size}"/>\n'
        f'    <metadata key="layer_height" value="{layer_height}"/>\n'
        f'    <metadata key="fill_density" value="{infill}%"/>\n'
        '  </plate>\n'
        '</config>'
    )

    # ──────────────────────────────────────────────────────────────
    # 5. Metadata/model_settings.config (mapowanie ekstruderów dla Bambu Studio)
    # ──────────────────────────────────────────────────────────────
    model_settings_parts_joined = "\n".join(model_settings_parts_xml)
    standalone_objects_joined = "\n".join(standalone_objects_xml)

    model_settings_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<config>\n'
        '  <object id="1">\n'
        f'    <metadata key="name" value="{assembly_name}"/>\n'
        f'{model_settings_parts_joined}\n'
        '  </object>\n'
        f'{standalone_objects_joined}\n'
        '</config>'
    )

    # ──────────────────────────────────────────────────────────────
    # 6. Metadata/slice_info.config (nagłówek Bambu Studio i lista filamentów)
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
        '    <header_item key="X-BBL-Client-Version" value="01.10.00.89"/>\n'
        '  </header>\n'
        '  <plate>\n'
        '    <metadata key="index" value="1"/>\n'
        '    <metadata key="printer_model_id" value=""/>\n'
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
        '    <instance object_id="1" instance_id="0" identify_id="0"/>\n'
        '  </plate>\n'
        '</config>'
    )

    # ──────────────────────────────────────────────────────────────
    # 8. Metadata/SlicingConfig.ini (konfiguracja slicera)
    # ──────────────────────────────────────────────────────────────
    first_layer_h = 0.20 if nozzle_size >= 0.4 else 0.12
    bed_temp = 60 if "PLA" in clean_mat or "PET" in clean_mat else 90
    nozzle_temp = 215 if "PLA" in clean_mat else (240 if "PET" in clean_mat else 250)

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
    # 9. Miniatura stołu Metadata/plate_1.png
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
        "Metadata/project_settings.config": project_settings_xml,
        "Metadata/model_settings.config": model_settings_xml,
        "Metadata/slice_info.config": slice_info_xml,
        "Metadata/plate_1.config": plate_config_xml,
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

    # Walidacja wygenerowanego pakietu
    validation = validate_3mf_package(output_path)
    if not validation["valid"]:
        raise ValueError(f"Błąd walidacji wygenerowanego pakietu 3MF: {validation['errors']}")

    return output_path


def validate_3mf_package(file_path: str) -> dict:
    """
    Sprawdza integralność i zgodność wygenerowanego pakietu .3MF z wymogami Bambu Studio.
    Weryfikuje 11 kluczowych reguł.
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

            # 3. Obecność plików Metadata
            required_meta = [
                "Metadata/model_settings.config",
                "Metadata/project_settings.config",
                "Metadata/slice_info.config",
                "Metadata/plate_1.config",
                "Metadata/SlicingConfig.ini",
            ]
            for rm in required_meta:
                if rm not in namelist:
                    errors.append(f"Brak wymaganego pliku metadanych: {rm}")

            # 4. Relacje i typy
            if "_rels/.rels" not in namelist:
                errors.append("Brak pliku _rels/.rels.")
            if "[Content_Types].xml" not in namelist:
                errors.append("Brak pliku [Content_Types].xml.")

            # Sprawdzenie treści 3D/3dmodel.model
            if "3D/3dmodel.model" in namelist:
                model_content = zf.read("3D/3dmodel.model").decode("utf-8", errors="replace")
                
                # 5. Colorgroup
                if "<m:colorgroup" not in model_content:
                    errors.append("Plik 3D/3dmodel.model nie zawiera definicji <m:colorgroup>.")
                
                # 6. Rejestracja mesh i vertices
                if "<vertex" not in model_content or "<triangle" not in model_content:
                    errors.append("Brak wierzchołków lub trójkątów w 3D/3dmodel.model.")

                # 7. Powiązanie pid/pindex
                if 'pid="1"' not in model_content or 'pindex=' not in model_content:
                    errors.append("Brak atrybutów pid='1' i pindex w obiektach 3D.")

                # 8. Assembly i build
                if '<object id="1"' not in model_content or '<build>' not in model_content:
                    errors.append("Brak obiektu montażowego id='1' lub sekcji <build>.")

            # Sprawdzenie Metadata/model_settings.config
            if "Metadata/model_settings.config" in namelist:
                ms_content = zf.read("Metadata/model_settings.config").decode("utf-8", errors="replace")
                # 9. Przypisanie ekstruderów
                if 'key="extruder"' not in ms_content:
                    errors.append("Brak atrybutu extruder w Metadata/model_settings.config.")

            # Sprawdzenie Metadata/project_settings.config
            if "Metadata/project_settings.config" in namelist:
                ps_content = zf.read("Metadata/project_settings.config").decode("utf-8", errors="replace")
                # 10. Ustawienia druku
                if 'key="filament_colour"' not in ps_content or 'key="layer_height"' not in ps_content:
                    errors.append("Brak parametrów druku w Metadata/project_settings.config.")

            # 11. Miniatura plate_1.png
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
