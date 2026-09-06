"""
Drukstacja - Hybrydowa analiza plików (standard JLCPCB / PCBWay)
Obsługuje:
1. Natychmiastową analizę geometrii 3D (Instant 3D Calculation) dla siatek i brył CAD:
   .stl, .obj, .3mf, .ply, .glb, .gltf, .off, .3ds, .step, .stp, .iges, .igs, .brep
2. Automatyczną ekstrakcję modeli 3D z archiwów (.zip, .tar, itp.)
3. Kwalifikację dokumentacji technicznej, rysunków i PCB do wyceny inżynierskiej (RFQ):
   .dxf, .dwg, .pdf, .fcstd, .ifc, .3dm, .gbr, .ger, .kicad_pcb, .pcbdoc, .zip/rar
"""
import os
import io
import zipfile
import tarfile
from pathlib import Path
from typing import Dict, Any, Tuple, Optional
import xml.etree.ElementTree as ET

import trimesh
import numpy as np


# --------------------------------------------------------------------------
# KATEGORYZACJA ROZSZERZEŃ
# --------------------------------------------------------------------------

# Grupa A: Natychmiastowa analiza geometrii 3D (Mesh & CAD)
INSTANT_MESH_EXTENSIONS = {
    ".stl", ".obj", ".3mf", ".ply", ".glb", ".gltf", ".off", ".3ds"
}
INSTANT_CAD_EXTENSIONS = {
    ".step", ".stp", ".iges", ".igs", ".brep"
}
INSTANT_3D_EXTENSIONS = INSTANT_MESH_EXTENSIONS | INSTANT_CAD_EXTENSIONS

# Archiwa
ARCHIVE_EXTENSIONS = {
    ".zip", ".rar", ".7z", ".tar", ".gz", ".tar.gz", ".tgz", ".bz2"
}

# Grupa B: Pliki do wyceny manualnej / inżynierskiej (RFQ)
RFQ_DRAWINGS_EXTENSIONS = {
    ".dxf", ".dwg", ".pdf", ".png", ".jpg", ".jpeg"
}
RFQ_CAD_BIM_EXTENSIONS = {
    ".fcstd", ".ifc", ".acad", ".bim", ".3dm", ".model"
}
RFQ_PCB_EXTENSIONS = {
    ".gbr", ".ger", ".gtl", ".gbl", ".gts", ".gbs", ".drl",
    ".kicad_pcb", ".pcbdoc", ".brd"
}

ALL_RFQ_EXTENSIONS = (
    RFQ_DRAWINGS_EXTENSIONS | RFQ_CAD_BIM_EXTENSIONS | RFQ_PCB_EXTENSIONS | ARCHIVE_EXTENSIONS
)

ALL_SUPPORTED_EXTENSIONS = INSTANT_3D_EXTENSIONS | ALL_RFQ_EXTENSIONS


class UnsupportedFileType(Exception):
    pass


# --------------------------------------------------------------------------
# POMOCNICZE: ANALIZA SIATKI TRIMESH
# --------------------------------------------------------------------------

def parse_3mf_native_xml(file_path: str) -> trimesh.Trimesh:
    """
    Natywny fallback parsera formatu .3MF oparty na standardowych modułach Pythona
    (zipfile + xml.etree.ElementTree).
    Wyciąga wierzchołki i trójkąty ze wszystkich definicji siatek (<mesh>)
    w plikach .model wewnątrz archiwum .3MF bez zewnętrznych zależności.
    """
    all_vertices = []
    all_faces = []
    vertex_offset = 0

    with zipfile.ZipFile(file_path, "r") as z:
        model_names = [n for n in z.namelist() if n.lower().endswith(".model")]
        if not model_names:
            raise ValueError("Brak plików definicji modelu (.model) w archiwum .3MF.")

        for m_name in model_names:
            xml_data = z.read(m_name)
            root = ET.fromstring(xml_data)

            for mesh_elem in root.iter():
                if mesh_elem.tag.endswith("mesh"):
                    v_list = []
                    f_list = []
                    for child in mesh_elem:
                        if child.tag.endswith("vertices"):
                            for v in child:
                                v_list.append([
                                    float(v.attrib.get("x", 0.0)),
                                    float(v.attrib.get("y", 0.0)),
                                    float(v.attrib.get("z", 0.0)),
                                ])
                        elif child.tag.endswith("triangles"):
                            for t in child:
                                f_list.append([
                                    int(t.attrib.get("v1", 0)) + vertex_offset,
                                    int(t.attrib.get("v2", 0)) + vertex_offset,
                                    int(t.attrib.get("v3", 0)) + vertex_offset,
                                ])
                    if v_list and f_list:
                        all_vertices.extend(v_list)
                        all_faces.extend(f_list)
                        vertex_offset += len(v_list)

    if not all_vertices or not all_faces:
        raise ValueError("Plik .3MF nie zawiera poprawnej geometrii 3D (brak wierzchołków lub ścianek).")

    return trimesh.Trimesh(
        vertices=np.array(all_vertices, dtype=float),
        faces=np.array(all_faces, dtype=int),
    )


def load_3mf_mesh(file_path: str) -> trimesh.Trimesh:
    """
    Bezpieczne wczytanie i scalenie geometrii z pliku .3MF do pojedynczej bryły trimesh.Trimesh.
    Rozwiązuje problem obiektów trimesh.Scene zwracanych przez trimesh.load()
    oraz zabezpiecza przed brakującymi zależnościami parsera 3MF (np. lxml).
    """
    loaded = None
    try:
        loaded = trimesh.load(file_path, file_type="3mf")
    except Exception as e:
        print(f"[INFO] trimesh.load(file_type='3mf') zwrócił błąd: {e}. Próba wczytania alternatywnego...")
        try:
            loaded = trimesh.load(file_path)
        except Exception as e2:
            print(f"[INFO] Wczytanie trimesh nie powiodło się: {e2}. Uruchamiam natywny parser XML dla .3MF...")
            return parse_3mf_native_xml(file_path)

    if isinstance(loaded, trimesh.Scene):
        # Scal wszystkie geometrie wewnątrz sceny
        if len(loaded.geometry) == 0:
            try:
                return parse_3mf_native_xml(file_path)
            except Exception:
                raise ValueError("Plik .3MF nie zawiera poprawnej geometrii 3D.")

        try:
            # Metoda to_geometry() zachowująca transformacje węzłów sceny
            mesh = loaded.to_geometry()
            if isinstance(mesh, trimesh.Trimesh) and len(mesh.faces) > 0:
                return mesh
        except Exception:
            pass

        valid_geoms = [
            g for g in loaded.geometry.values()
            if hasattr(g, "faces") and len(g.faces) > 0
        ]
        if not valid_geoms:
            try:
                return parse_3mf_native_xml(file_path)
            except Exception:
                raise ValueError("Plik .3MF nie zawiera poprawnej geometrii 3D.")

        mesh = trimesh.util.concatenate(list(valid_geoms))
        return mesh

    elif isinstance(loaded, trimesh.Trimesh):
        return loaded
    else:
        try:
            return parse_3mf_native_xml(file_path)
        except Exception:
            raise ValueError("Plik .3MF nie zawiera poprawnej siatki 3D.")


def analyze_trimesh_geometry(loaded_obj) -> dict:
    """Wyciąga parametry geometryczne z obiektu Trimesh lub Scene z automatyczną naprawą bryły."""
    if isinstance(loaded_obj, trimesh.Scene):
        if len(loaded_obj.geometry) == 0:
            raise ValueError("Plik 3D nie zawiera żadnych trójkątów ani geometrii.")
        valid_geoms = [
            g for g in loaded_obj.geometry.values()
            if hasattr(g, "faces") and len(g.faces) > 0
        ]
        if not valid_geoms:
            raise ValueError("Plik 3D nie zawiera poprawnej geometrii trójkątów.")
        try:
            mesh = loaded_obj.to_geometry()
            if not isinstance(mesh, trimesh.Trimesh):
                mesh = trimesh.util.concatenate(list(valid_geoms))
        except Exception:
            mesh = trimesh.util.concatenate(list(valid_geoms))
    else:
        mesh = loaded_obj

    if not isinstance(mesh, trimesh.Trimesh):
        # Konwersja na siatkę jeśli to możliwe
        mesh = trimesh.Trimesh(vertices=mesh.vertices, faces=mesh.faces)

    # 1. Głęboka naprawa topologii siatki (zwroty normalnych, nawinięcie, duplikaty)
    # Zapobiega fałszywym odczytom objętości przy nieszczelnych lub odwróconych trójkątach
    try:
        if hasattr(mesh, "process"):
            mesh.process(validate=True)
        if hasattr(mesh, "remove_unreferenced_vertices"):
            mesh.remove_unreferenced_vertices()
        trimesh.repair.fix_normals(mesh)
        trimesh.repair.fix_winding(mesh)
        trimesh.repair.fix_inversion(mesh)
    except Exception as repair_err:
        print(f"[WARN] Błąd naprawy siatki trimesh: {repair_err}")

    # 2. Próba załatania drobnych mikroszczelin
    watertight = bool(mesh.is_watertight)
    if not watertight:
        try:
            trimesh.repair.fill_holes(mesh)
            watertight = bool(mesh.is_watertight)
        except Exception:
            pass

    # 3. Precyzyjne wyliczenie rzeczywistej objętości bryły
    # Obliczamy objętość metodą całki powierzchniowej Gaussa (signed volume)
    # Zamiast nadmiarowego convex_hull (który zamyka otwory i drastycznie zawyża kubaturę!),
    # bierzemy faktyczną objętość wewnętrzną bryły z uwzględnieniem otworów przelotowych.
    volume_mm3 = 0.0
    bbox = mesh.bounding_box.extents  # [x, y, z] w mm
    bbox_volume = float(np.prod(bbox)) if len(bbox) == 3 else 1e9

    try:
        raw_vol = mesh.volume
        if raw_vol is not None and not np.isnan(raw_vol) and abs(raw_vol) > 0:
            # Sprawdzamy czy objętość nie przekracza bounding boxa
            if abs(raw_vol) <= bbox_volume * 1.05:
                volume_mm3 = abs(float(raw_vol))
    except Exception as vol_err:
        print(f"[WARN] Błąd odczytu mesh.volume: {vol_err}")

    # Jeśli signed volume zawiodło, spróbuj voxelized volume lub orientację wypukłą z redukcją
    if volume_mm3 <= 0.0:
        try:
            voxel_pitch = max(mesh.extents) / 64.0
            vox = mesh.voxelized(pitch=voxel_pitch).fill()
            volume_mm3 = float(vox.volume)
        except Exception:
            hull_vol = abs(float(mesh.convex_hull.volume)) if hasattr(mesh, "convex_hull") else 1000.0
            volume_mm3 = hull_vol * 0.35  # realistyczny udział ścianek w pustych obudowach

    surface_area_mm2 = float(mesh.area) if hasattr(mesh, "area") else 0.0

    return {
        "volume_cm3": round(volume_mm3 / 1000.0, 3),
        "dimensions_mm": [round(float(v), 2) for v in bbox],
        "surface_area_cm2": round(surface_area_mm2 / 100.0, 2),
        "watertight": watertight,
        "triangle_count": int(len(mesh.faces)),
        "mesh_object": mesh,
    }


def analyze_mesh_file(path: str, ext: str) -> dict:
    """Wczytuje siatkę 3D (.stl, .obj, .3mf, .ply, .glb, .gltf, .off) przez trimesh lub wyspecjalizowany parser."""
    file_type = ext.lstrip(".").lower()
    if file_type == "3mf":
        loaded = load_3mf_mesh(path)
    else:
        loaded = trimesh.load(path)

    return analyze_trimesh_geometry(loaded)


def analyze_cad_file(path: str, ext: str) -> dict:
    """
    Bezpieczna próba analizy bryły parametrycznej CAD (.step / .stp / .iges).
    Wykorzystuje CadQuery jeśli dostępne, bądź trimesh cascade.
    """
    # 1. Próba przez CadQuery
    try:
        import cadquery as cq
        result = cq.importers.importStep(path)
        solid = result.val()

        volume_mm3 = float(solid.Volume())
        bbox = solid.BoundingBox()
        area_mm2 = float(solid.Area())

        return {
            "volume_cm3": round(volume_mm3 / 1000.0, 3),
            "dimensions_mm": [
                round(float(bbox.xlen), 2),
                round(float(bbox.ylen), 2),
                round(float(bbox.zlen), 2),
            ],
            "surface_area_cm2": round(area_mm2 / 100.0, 2),
            "watertight": True,
            "triangle_count": None,
            "mesh_object": None,
        }
    except Exception as cq_err:
        # 2. Próba przez trimesh
        try:
            loaded = trimesh.load(path)
            return analyze_trimesh_geometry(loaded)
        except Exception:
            # Fallback - przekazanie do manualnego RFQ zamiast błędu 500
            raise UnsupportedFileType(
                f"Złożona bryła CAD ({ext}) wymaga manualnej weryfikacji inżynierskiej."
            )


# --------------------------------------------------------------------------
# INSPEKCJA I ROZPAKOWYWANIE ARCHIWÓW
# --------------------------------------------------------------------------

def inspect_and_extract_archive(archive_path: str, temp_dir: str) -> Tuple[Optional[str], dict]:
    """
    Skanuje archiwum (.zip, .tar.*).
    - Jeśli znajdzie plik 3D (.stl, .step, .obj, .3mf), wypakowuje go do temp_dir i zwraca ścieżkę.
    - Jeśli nie, klasyfikuje zawartość (np. pakiety PCB/Gerber lub rysunki) do RFQ.
    """
    inner_files = []
    found_3d_file = None

    # Obsługa ZIP
    if zipfile.is_zipfile(archive_path):
        with zipfile.ZipFile(archive_path, "r") as zf:
            for info in zf.infolist():
                if info.is_dir() or info.filename.startswith("__MACOSX/") or info.filename.startswith("."):
                    continue
                inner_files.append(info.filename)
                ext = Path(info.filename).suffix.lower()
                if ext in INSTANT_3D_EXTENSIONS and not found_3d_file:
                    found_3d_file = info.filename
                    zf.extract(info, temp_dir)

    # Obsługa TAR / TAR.GZ
    elif tarfile.is_tarfile(archive_path):
        with tarfile.open(archive_path, "r:*") as tf:
            for member in tf.getmembers():
                if member.isdir() or member.name.startswith("__MACOSX/") or member.name.startswith("."):
                    continue
                inner_files.append(member.name)
                ext = Path(member.name).suffix.lower()
                if ext in INSTANT_3D_EXTENSIONS and not found_3d_file:
                    found_3d_file = member.name
                    tf.extract(member, temp_dir)

    extracted_path = os.path.join(temp_dir, found_3d_file) if found_3d_file else None

    # Sprawdź czy archiwum zawiera pliki PCB / Gerber
    has_pcb = any(Path(f).suffix.lower() in RFQ_PCB_EXTENSIONS for f in inner_files)

    archive_meta = {
        "file_count": len(inner_files),
        "files_sample": inner_files[:10],
        "has_pcb": has_pcb,
        "extracted_3d_file": found_3d_file,
    }

    return extracted_path, archive_meta


# --------------------------------------------------------------------------
# GŁÓWNA FUNKCJA HYBRYDOWEJ ANALIZY PLIKU
# --------------------------------------------------------------------------

def process_uploaded_file(path: str, filename: str, temp_dir: str) -> dict:
    """
    Hybrydowy procesor plików produkcyjnych:
    Zwraca ustrukturyzowane metadane z flagą instant_pricing.
    """
    ext = Path(filename).suffix.lower()
    file_size_bytes = os.path.getsize(path)
    size_mb = round(file_size_bytes / (1024 * 1024), 2)

    # 1. ARCHIWA (.zip, .tar, .rar itp.)
    if ext in ARCHIVE_EXTENSIONS:
        try:
            extracted_path, archive_meta = inspect_and_extract_archive(path, temp_dir)
            if extracted_path and os.path.isfile(extracted_path):
                inner_ext = Path(extracted_path).suffix.lower()
                # Udało się wyciągnąć model 3D z archiwum!
                if inner_ext in INSTANT_MESH_EXTENSIONS:
                    geom = analyze_mesh_file(extracted_path, inner_ext)
                else:
                    geom = analyze_cad_file(extracted_path, inner_ext)

                geom.update({
                    "type": "3d_model",
                    "instant_pricing": True,
                    "category": "Model 3D (Wypakowany z ZIP)",
                    "message": f"Wypakowano i przeanalizowano model 3D: '{archive_meta['extracted_3d_file']}' z archiwum.",
                    "mesh_source_path": extracted_path,
                    "original_filename": filename,
                    "file_size_mb": size_mb,
                    "archive_meta": archive_meta,
                })
                return geom

            elif archive_meta.get("has_pcb"):
                return {
                    "type": "rfq_document",
                    "instant_pricing": False,
                    "category": "Płytka PCB & Gerber (Archiwum ZIP)",
                    "message": f"Wykryto pakiet produkcyjny PCB/Gerber ({archive_meta['file_count']} plików). Przekazano do wyceny inżynierskiej (24h).",
                    "volume_cm3": 0.0,
                    "dimensions_mm": [0.0, 0.0, 0.0],
                    "surface_area_cm2": 0.0,
                    "watertight": True,
                    "triangle_count": None,
                    "original_filename": filename,
                    "file_size_mb": size_mb,
                    "rfq_details": archive_meta,
                }
            else:
                return {
                    "type": "rfq_document",
                    "instant_pricing": False,
                    "category": "Archiwum projektowe (RFQ)",
                    "message": f"Archiwum projektowe ({archive_meta['file_count']} plików) przyjęte do manualnej analizy inżynierskiej (24h).",
                    "volume_cm3": 0.0,
                    "dimensions_mm": [0.0, 0.0, 0.0],
                    "surface_area_cm2": 0.0,
                    "watertight": True,
                    "triangle_count": None,
                    "original_filename": filename,
                    "file_size_mb": size_mb,
                    "rfq_details": archive_meta,
                }

        except Exception as arch_err:
            # W razie uszkodzonego lub niewspieranego typu archiwum (np. .rar bez biblioteki C)
            return {
                "type": "rfq_document",
                "instant_pricing": False,
                "category": "Archiwum skompresowane",
                "message": "Archiwum produkcyjne zostało przyjęte do bezpośredniej weryfikacji inżynierskiej.",
                "volume_cm3": 0.0,
                "dimensions_mm": [0.0, 0.0, 0.0],
                "surface_area_cm2": 0.0,
                "watertight": True,
                "triangle_count": None,
                "original_filename": filename,
                "file_size_mb": size_mb,
                "rfq_details": {"error": str(arch_err)},
            }

    # 2. PLIKI SIATEK 3D (Instant Mesh)
    if ext in INSTANT_MESH_EXTENSIONS:
        try:
            geom = analyze_mesh_file(path, ext)
            geom.update({
                "type": "3d_model",
                "instant_pricing": True,
                "category": f"Siatka 3D ({ext.upper().lstrip('.')})",
                "message": "Geometria 3D poprawnie przeanalizowana.",
                "mesh_source_path": path,
                "original_filename": filename,
                "file_size_mb": size_mb,
            })
            return geom
        except Exception as mesh_err:
            print(f"[WARN] Błąd analizy siatki ({ext}): {mesh_err}")
            # Bezpieczny fallback do RFQ w przypadku uszkodzonej siatki
            return {
                "type": "rfq_document",
                "instant_pricing": False,
                "category": "Model 3D (Nietypowy/Uszkodzony)",
                "message": f"Plik {ext} zawiera nietypową strukturę wierzchołków. Przekazano do naprawy i wyceny manualnej.",
                "volume_cm3": 0.0,
                "dimensions_mm": [0.0, 0.0, 0.0],
                "surface_area_cm2": 0.0,
                "watertight": False,
                "triangle_count": None,
                "original_filename": filename,
                "file_size_mb": size_mb,
                "rfq_details": {"error": str(mesh_err)},
            }

    # 3. PLIKI BRYŁ CAD / B-REP (STEP / IGES)
    if ext in INSTANT_CAD_EXTENSIONS:
        try:
            geom = analyze_cad_file(path, ext)
            geom.update({
                "type": "3d_model",
                "instant_pricing": True,
                "category": f"Bryła CAD ({ext.upper().lstrip('.')})",
                "message": "Parametryczna bryła CAD pomyślnie zinterpretowana.",
                "mesh_source_path": path,
                "original_filename": filename,
                "file_size_mb": size_mb,
            })
            return geom
        except Exception as cad_err:
            # Łagodny fallback do RFQ bez wywalania błędu 500
            return {
                "type": "rfq_document",
                "instant_pricing": False,
                "category": "Bryła CAD (B-Rep)",
                "message": f"Plik CAD ({ext.upper()}) wymaga manualnej konwersji i doboru parametrów przez inżyniera. Oferta w 24h.",
                "volume_cm3": 0.0,
                "dimensions_mm": [0.0, 0.0, 0.0],
                "surface_area_cm2": 0.0,
                "watertight": True,
                "triangle_count": None,
                "original_filename": filename,
                "file_size_mb": size_mb,
                "rfq_details": {"note": "B-Rep tessellation requires manual review", "info": str(cad_err)},
            }

    # 4. RYSUNKI TECHNICZNE I WEKTORY (DXF / DWG / PDF)
    if ext in RFQ_DRAWINGS_EXTENSIONS:
        cat_name = "Rysunek techniczny 2D / Wektor" if ext in (".dxf", ".dwg") else ("Dokumentacja PDF" if ext == ".pdf" else "Grafika / Rzut poglądowy")
        return {
            "type": "rfq_document",
            "instant_pricing": False,
            "category": cat_name,
            "message": f"Dokumentacja ({ext.upper()}) przyjęta do wyceny manualnej i weryfikacji wykonalności.",
            "volume_cm3": 0.0,
            "dimensions_mm": [0.0, 0.0, 0.0],
            "surface_area_cm2": 0.0,
            "watertight": True,
            "triangle_count": None,
            "original_filename": filename,
            "file_size_mb": size_mb,
            "rfq_details": {"format": ext},
        }

    # 5. PŁYTKI PCB & ELEKTRONIKA (Gerber, KiCad, Altium)
    if ext in RFQ_PCB_EXTENSIONS:
        return {
            "type": "rfq_document",
            "instant_pricing": False,
            "category": "Płytka PCB / Gerber",
            "message": f"Projekt PCB ({ext.upper()}) przyjęty do kalkulacji panelizacji i montażu elementów.",
            "volume_cm3": 0.0,
            "dimensions_mm": [0.0, 0.0, 0.0],
            "surface_area_cm2": 0.0,
            "watertight": True,
            "triangle_count": None,
            "original_filename": filename,
            "file_size_mb": size_mb,
            "rfq_details": {"format": ext},
        }

    # 6. PROJEKTY CAD / BIM (FreeCAD, IFC, Rhino 3DM)
    if ext in RFQ_CAD_BIM_EXTENSIONS:
        return {
            "type": "rfq_document",
            "instant_pricing": False,
            "category": "Projekt CAD / BIM",
            "message": f"Plik projektowy {ext.upper()} przyjęty do dekompozycji i przygotowania gniazd produkcyjnych.",
            "volume_cm3": 0.0,
            "dimensions_mm": [0.0, 0.0, 0.0],
            "surface_area_cm2": 0.0,
            "watertight": True,
            "triangle_count": None,
            "original_filename": filename,
            "file_size_mb": size_mb,
            "rfq_details": {"format": ext},
        }

    # 7. INNE / NIEZNANE FORMATY - Bezpieczny catch-all RFQ (NIGDY NIE WYWALA APLIKACJI)
    return {
        "type": "rfq_document",
        "instant_pricing": False,
        "category": f"Dokumentacja {ext.upper() if ext else 'Inna'}",
        "message": "Plik został pomyślnie przyjęty do indywidualnej wyceny inżynierskiej.",
        "volume_cm3": 0.0,
        "dimensions_mm": [0.0, 0.0, 0.0],
        "surface_area_cm2": 0.0,
        "watertight": True,
        "triangle_count": None,
        "original_filename": filename,
        "file_size_mb": size_mb,
        "rfq_details": {"format": ext},
    }


# Kompatybilność wsteczna z poprzednim analyze_file
def analyze_file(path: str, ext: str) -> dict:
    filename = os.path.basename(path)
    temp_dir = os.path.dirname(path)
    return process_uploaded_file(path, filename, temp_dir)
