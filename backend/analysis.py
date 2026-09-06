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

def analyze_trimesh_geometry(loaded_obj) -> dict:
    """Wyciąga parametry geometryczne z obiektu Trimesh lub Scene."""
    if isinstance(loaded_obj, trimesh.Scene):
        if len(loaded_obj.geometry) == 0:
            raise ValueError("Plik 3D nie zawiera żadnych trójkątów ani geometrii.")
        mesh = trimesh.util.concatenate(tuple(loaded_obj.geometry.values()))
    else:
        mesh = loaded_obj

    if not isinstance(mesh, trimesh.Trimesh):
        # Konwersja na siatkę jeśli to możliwe
        mesh = trimesh.Trimesh(vertices=mesh.vertices, faces=mesh.faces)

    watertight = bool(mesh.is_watertight)

    # Objętość w cm3
    try:
        if watertight and mesh.volume > 0:
            volume_mm3 = abs(float(mesh.volume))
        else:
            # Model nieszczelny - oszacowanie przez convex hull lub orientację ścian
            volume_mm3 = abs(float(mesh.convex_hull.volume)) * 0.75
    except Exception:
        volume_mm3 = abs(float(mesh.convex_hull.volume)) * 0.75 if hasattr(mesh, "convex_hull") else 1000.0

    bbox = mesh.bounding_box.extents  # [x, y, z] w mm
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
    """Wczytuje siatkę 3D (.stl, .obj, .3mf, .ply, .glb, .gltf, .off) przez trimesh."""
    file_type = ext.lstrip(".").lower()
    if file_type == "3mf":
        # Wczytanie 3MF
        loaded = trimesh.load(path, file_type="3mf")
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
