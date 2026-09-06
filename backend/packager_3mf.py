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
    model_path: str,
    order_metadata: dict,
    print_settings: dict,
    output_path: str = None,
) -> str:
    """
    Generuje gotowy plik produkcyjny .3MF z modelem 3D i parametrami technologicznymi.

    :param model_path: Ścieżka do wgranego pliku (STL, OBJ, 3MF, STEP itp.)
    :param order_metadata: dict z metadanymi zamówienia:
           {'order_id': str, 'file_name': str, 'created_at': str, 'customer': str}
    :param print_settings: dict z ustawieniami technologicznymi:
           {'layer_height': float, 'nozzle_size': float, 'infill': int, 'material': str, 'color_hex': str}
    :param output_path: Opcjonalna ścieżka wyjściowa. Jeśli brak, tworzy w tym samym katalogu.
    :return: Ścieżka do utworzonego pliku .3MF
    """
    order_id = str(order_metadata.get("order_id") or "DIRECT")
    file_name = str(order_metadata.get("file_name") or os.path.basename(model_path))
    created_at = str(order_metadata.get("created_at") or datetime.datetime.utcnow().isoformat())

    layer_height = float(print_settings.get("layer_height") or 0.20)
    nozzle_size = float(print_settings.get("nozzle_size") or 0.4)
    infill = int(print_settings.get("infill") or 20)
    material = str(print_settings.get("material") or "PLA")
    color_hex = str(print_settings.get("color_hex") or "#EF4444")
    color_3mf = format_hex_color(color_hex)
    color_6hex = color_3mf[:7]  # #RRGGBB dla slicerów

    # 1. Wczytanie geometrii siatki
    mesh = None
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

    # Naprawa topologii
    try:
        mesh.remove_duplicate_faces()
        mesh.remove_degenerate_faces()
        mesh.remove_unreferenced_vertices()
        trimesh.repair.fix_normals(mesh)
        trimesh.repair.fix_winding(mesh)
    except Exception:
        pass

    # 2. Budowa XML modelu 3D (3D/3dmodel.model)
    vertices_xml = "\n".join(
        [f'     <vertex x="{v[0]:.4f}" y="{v[1]:.4f}" z="{v[2]:.4f}"/>' for v in mesh.vertices]
    )
    triangles_xml = "\n".join(
        [f'     <triangle v1="{f[0]}" v2="{f[1]}" v3="{f[2]}"/>' for f in mesh.faces]
    )

    clean_title = sanitize_filename(Path(file_name).stem)

    model_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">
 <metadata name="Title">ORDER_{order_id}_{clean_title}</metadata>
 <metadata name="Designer">Drukstacja 3D Labs</metadata>
 <metadata name="Application">Drukstacja Production Engine</metadata>
 <metadata name="CreationDate">{created_at}</metadata>
 <metadata name="Description">Order: {order_id} | Material: {material} | Nozzle: {nozzle_size}mm | Layer: {layer_height}mm | Infill: {infill}%</metadata>
 <resources>
  <m:colorgroup id="1">
   <m:color color="{color_3mf}"/>
  </m:colorgroup>
  <object id="2" type="model" pid="1" pindex="0">
   <mesh>
    <vertices>
{vertices_xml}
    </vertices>
    <triangles>
{triangles_xml}
    </triangles>
   </mesh>
  </object>
 </resources>
 <build>
  <item objectid="2" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>
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

    slicing_ini = f"""; Drukstacja Slicing Configuration
; Kompatybilne z Bambu Studio, OrcaSlicer, PrusaSlicer, SuperSlicer
layer_height = {layer_height}
first_layer_height = {first_layer_h}
fill_density = {infill}%
fill_pattern = gyroid
nozzle_diameter = {nozzle_size}
filament_type = {material}
filament_colour = {color_6hex}
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
    bambu_project_config = {
        "version": "1.0.0",
        "plate_name": f"Zlecenie #{order_id[:8]}",
        "filament_settings": [
            {
                "id": 1,
                "type": material,
                "color": color_6hex,
                "nozzle_diameter": nozzle_size,
                "layer_height": layer_height,
                "infill_density": infill,
            }
        ],
        "generator": "Drukstacja 3D Automation",
        "order": {
            "id": order_id,
            "filename": file_name,
            "date": created_at,
        }
    }

    # 6. Określenie docelowej ścieżki pliku wyjściowego
    if not output_path:
        out_dir = Path(model_path).parent
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

    return output_path
