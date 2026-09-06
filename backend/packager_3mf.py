"""
Drukstacja - Generator pakietów produkcyjnych .3MF
Tworzy zunifikowany plik projektu .3MF (OpenPackagingConvention)
w pełni kompatybilny z Bambu Studio, OrcaSlicer i PrusaSlicer.
Zawiera geometrię 3D, zdefiniowany kolor filamentu (ColorGroup),
oraz metadane parametrów druku (dysza, warstwa, infill, materiał, zlecenie).
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
        clean = f"#{clean}FF"
    elif len(clean) == 8:
        clean = f"#{clean}"
    else:
        clean = "#EF4444FF"
    return clean


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

    :param model_path: Ścieżka do wgranego pliku (STL, OBJ, 3MF, STEP itp.) w trybie jednoczęściowym
    :param order_metadata: dict z metadanymi zamówienia:
           {'order_id': str, 'file_name': str, 'created_at': str, 'customer': str}
    :param print_settings: dict z ustawieniami technologicznymi:
           {'layer_height': float, 'nozzle_size': float, 'infill': int, 'material': str, 'color_hex': str}
    :param output_path: Opcjonalna ścieżka wyjściowa. Jeśli brak, tworzy w odpowiednim katalogu.
    :param parts: Opcjonalna lista części dla druku wielomateriałowego AMS:
           [{"name": str, "color_hex": str, "mesh": trimesh.Trimesh, "path": str, "role": str}, ...]
    :return: Ścieżka do utworzonego pliku .3MF
    """
    order_metadata = order_metadata or {}
    print_settings = print_settings or {}

    order_id = str(order_metadata.get("order_id") or "DIRECT")
    file_name = str(order_metadata.get("file_name") or (os.path.basename(model_path) if model_path else "keychain.3mf"))
    created_at = str(order_metadata.get("created_at") or datetime.datetime.utcnow().isoformat())

    layer_height = float(print_settings.get("layer_height") or 0.20)
    nozzle_size = float(print_settings.get("nozzle_size") or 0.4)
    infill = int(print_settings.get("infill") or 100 if "brelok" in file_name.lower() else (print_settings.get("infill") or 20))
    material = str(print_settings.get("material") or "PLA")
    color_hex = str(print_settings.get("color_hex") or "#EF4444")
    clean_title = sanitize_filename(Path(file_name).stem)

    # 1. Wczytanie i przygotowanie geometrii części
    valid_parts = []
    if parts and isinstance(parts, list) and len(parts) > 0:
        for idx, p in enumerate(parts):
            p_mesh = p.get("mesh")
            p_path = p.get("path")
            p_name = str(p.get("name") or f"Part_{idx+1}")
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

    is_multi_part = len(valid_parts) > 0

    # 2. Budowa XML modelu 3D (3D/3dmodel.model)
    if is_multi_part:
        # Utwórz unikalną paletę kolorów
        unique_colors = []
        color_to_pindex = {}
        for p in valid_parts:
            c_3mf = format_hex_color(p["color_hex"])
            if c_3mf not in color_to_pindex:
                color_to_pindex[c_3mf] = len(unique_colors)
                unique_colors.append(c_3mf)

        colorgroup_xml = "\n".join([f'   <m:color color="{c}"/>' for c in unique_colors])

        objects_xml_list = []
        component_tags = []
        part_settings_xml_list = []

        for idx, p in enumerate(valid_parts):
            part_id = 2 + idx
            c_3mf = format_hex_color(p["color_hex"])
            pindex = color_to_pindex[c_3mf]
            extruder_id = pindex + 1
            safe_part_name = sanitize_filename(p["name"])

            m = p["mesh"]
            v_xml = "\n".join([f'     <vertex x="{v[0]:.4f}" y="{v[1]:.4f}" z="{v[2]:.4f}"/>' for v in m.vertices])
            t_xml = "\n".join([f'     <triangle v1="{f[0]}" v2="{f[1]}" v3="{f[2]}" pid="1" p1="{pindex}"/>' for f in m.faces])

            part_obj_xml = f"""  <object id="{part_id}" type="model" name="{safe_part_name}" pid="1" pindex="{pindex}">
   <mesh>
    <vertices>
{v_xml}
    </vertices>
    <triangles>
{t_xml}
    </triangles>
   </mesh>
  </object>"""
            objects_xml_list.append(part_obj_xml)
            component_tags.append(f'    <component objectid="{part_id}"/>')
            part_settings_xml_list.append(
                f'    <part id="{part_id}" name="{safe_part_name}">\n      <metadata key="extruder" value="{extruder_id}"/>\n    </part>'
            )

        root_id = 2 + len(valid_parts)
        components_xml = "\n".join(component_tags)
        assembly_obj_xml = f"""  <object id="{root_id}" type="model" name="{clean_title}">
   <components>
{components_xml}
   </components>
  </object>"""
        objects_xml_list.append(assembly_obj_xml)

        all_objects_xml = "\n".join(objects_xml_list)
        build_item_id = root_id
        model_settings_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="{root_id}">
    <metadata key="name" value="{clean_title}"/>
{"\n".join(part_settings_xml_list)}
  </object>
</config>"""

    else:
        # Tryb pojedynczej bryły
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

        color_3mf = format_hex_color(color_hex)
        unique_colors = [color_3mf]
        colorgroup_xml = f'   <m:color color="{color_3mf}"/>'

        v_xml = "\n".join([f'     <vertex x="{v[0]:.4f}" y="{v[1]:.4f}" z="{v[2]:.4f}"/>' for v in mesh.vertices])
        t_xml = "\n".join([f'     <triangle v1="{f[0]}" v2="{f[1]}" v3="{f[2]}" pid="1" p1="0"/>' for f in mesh.faces])

        all_objects_xml = f"""  <object id="2" type="model" name="{clean_title}" pid="1" pindex="0">
   <mesh>
    <vertices>
{v_xml}
    </vertices>
    <triangles>
{t_xml}
    </triangles>
   </mesh>
  </object>"""
        build_item_id = 2
        model_settings_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="2">
    <metadata key="name" value="{clean_title}"/>
    <part id="2" name="{clean_title}">
      <metadata key="extruder" value="1"/>
    </part>
  </object>
</config>"""

    model_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021">
 <metadata name="Title">ORDER_{order_id}_{clean_title}</metadata>
 <metadata name="Designer">Drukstacja 3D Labs</metadata>
 <metadata name="Application">Drukstacja Production Engine</metadata>
 <metadata name="CreationDate">{created_at}</metadata>
 <metadata name="Description">Order: {order_id} | Material: {material} | Nozzle: {nozzle_size}mm | Layer: {layer_height}mm | Infill: {infill}%</metadata>
 <resources>
  <m:colorgroup id="1">
{colorgroup_xml}
  </m:colorgroup>
{all_objects_xml}
 </resources>
 <build>
  <item objectid="{build_item_id}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>
 </build>
</model>"""

    # 3. Pliki manifestu OPC
    content_types_xml = """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
 <Default Extension="ini" ContentType="text/plain"/>
 <Default Extension="config" ContentType="text/plain"/>
 <Default Extension="json" ContentType="application/json"/>
</Types>"""

    rels_xml = """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>"""

    # 4. Konfiguracja slicera (Metadata/SlicingConfig.ini)
    first_layer_h = 0.20 if nozzle_size >= 0.4 else 0.12
    bed_temp = 60 if "PLA" in material.upper() or "PET" in material.upper() else 90
    nozzle_temp = 215 if "PLA" in material.upper() else (240 if "PET" in material.upper() else 250)

    slicing_colours = ";".join([c[:7] for c in unique_colors])
    slicing_materials = ";".join([material for _ in unique_colors])

    slicing_ini = f"""; Drukstacja Slicing Configuration
; Kompatybilne z Bambu Studio, OrcaSlicer, PrusaSlicer, SuperSlicer
layer_height = {layer_height}
first_layer_height = {first_layer_h}
fill_density = {infill}%
fill_pattern = gyroid
nozzle_diameter = {nozzle_size}
filament_type = {slicing_materials}
filament_colour = {slicing_colours}
extruder_colour = {slicing_colours}
filament_density = 1.24
temperature = {nozzle_temp}
first_layer_temperature = {nozzle_temp + 5}
bed_temperature = {bed_temp}
first_layer_bed_temperature = {bed_temp}
bed_shape = 0x0,250x0,250x210,0x210
order_id = {order_id}
order_date = {created_at}
customer_file = {file_name}
generator = Drukstacja Cloud 3MF Engine
"""

    # 5. Konfiguracja Bambu Studio / OrcaSlicer (Metadata/project_settings.config)
    filament_settings = [
        {
            "id": idx + 1,
            "type": material,
            "color": c[:7],
            "nozzle_diameter": nozzle_size,
            "layer_height": layer_height,
            "infill_density": infill,
        }
        for idx, c in enumerate(unique_colors)
    ]

    bambu_project_config = {
        "version": "1.0.0",
        "plate_name": f"Zlecenie #{order_id[:8]}",
        "filament_settings": filament_settings,
        "generator": "Drukstacja 3D Automation",
        "order": {
            "id": order_id,
            "filename": file_name,
            "date": created_at,
        }
    }

    # 6. Określenie docelowej ścieżki pliku wyjściowego
    if not output_path:
        if model_path:
            out_dir = Path(model_path).parent
        else:
            out_dir = Path("backend/projects_3mf")
        safe_model_name = sanitize_filename(Path(file_name).stem)
        safe_mat = sanitize_filename(material.split()[0])
        filename = f"ORDER_{order_id[:8]}_{safe_model_name}_{safe_mat}_{nozzle_size}mm.3mf"
        output_path = str(out_dir / filename)

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    # 7. Spakowanie do archiwum ZIP ze standardem .3MF
    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types_xml)
        zf.writestr("_rels/.rels", rels_xml)
        zf.writestr("3D/3dmodel.model", model_xml)
        zf.writestr("Metadata/SlicingConfig.ini", slicing_ini)
        zf.writestr("Metadata/project_settings.config", json.dumps(bambu_project_config, indent=2))
        zf.writestr("Metadata/model_settings.config", model_settings_xml)

    return output_path
