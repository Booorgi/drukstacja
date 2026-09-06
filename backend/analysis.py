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

def parse_model_xml_content(xml_bytes: bytes) -> Optional[trimesh.Trimesh]:
    """
    Błyskawiczny parser XML dla pojedynczego pliku .model (np. 3D/Objects/object_*.model).
    Wyciąga bezpośrednio wierzchołki i trójkąty bez narzutu biblioteki trimesh i resolverów sceny.
    """
    try:
        root = ET.fromstring(xml_bytes)
    except Exception:
        return None

    all_v = []
    all_f = []
    v_offset = 0

    for mesh_elem in root.iter():
        if mesh_elem.tag.endswith("mesh"):
            for child in mesh_elem:
                if child.tag.endswith("vertices"):
                    for v in child:
                        try:
                            all_v.append([
                                float(v.attrib.get("x", 0.0)),
                                float(v.attrib.get("y", 0.0)),
                                float(v.attrib.get("z", 0.0)),
                            ])
                        except Exception:
                            pass
                elif child.tag.endswith("triangles"):
                    for t in child:
                        try:
                            all_f.append([
                                int(t.attrib.get("v1", 0)) + v_offset,
                                int(t.attrib.get("v2", 0)) + v_offset,
                                int(t.attrib.get("v3", 0)) + v_offset,
                            ])
                        except Exception:
                            pass
            v_offset = len(all_v)

    if all_v and all_f:
        return trimesh.Trimesh(
            vertices=np.array(all_v, dtype=float),
            faces=np.array(all_f, dtype=int),
            process=False,
        )
    return None


def parse_3mf_safely(file_input) -> trimesh.Trimesh:
    """
    Stabilna funkcja do wczytywania plików .3MF (w tym plików z klastrami obiektów
    Bambu Studio / OrcaSlicer w 3D/Objects/*.model).
    Chroni serwer przed timeoutami, pętlami resolvera 'world' oraz nadmiernym zużyciem RAM.
    """
    if isinstance(file_input, (str, Path)):
        with open(file_input, "rb") as f:
            file_bytes = f.read()
    elif isinstance(file_input, io.BytesIO):
        file_bytes = file_input.getvalue()
    elif isinstance(file_input, bytes):
        file_bytes = file_input
    else:
        file_bytes = bytes(file_input)

    # 1. Sprawdzamy archiwum ZIP i szukamy plików .model (w tym 3D/Objects/*.model)
    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes), "r") as z:
            names = z.namelist()
            object_models = [f for f in names if "3d/objects/" in f.lower() and f.lower().endswith(".model")]
            all_models = [f for f in names if f.lower().endswith(".model")]

            # Jeśli w archiwum są klastry 3D/Objects/ (specyfika Bambu Studio),
            # parsujemy je bezpośrednio bez dotykania wadliwego resolvera sceny!
            target_models = object_models if object_models else all_models

            if target_models:
                meshes = []
                for mf in target_models:
                    try:
                        content = z.read(mf)
                        m = parse_model_xml_content(content)
                        if m and len(m.faces) > 0:
                            meshes.append(m)
                    except Exception as parse_err:
                        print(f"[WARN] Błąd parsowania XML {mf}: {parse_err}")

                if meshes:
                    if len(meshes) == 1:
                        return meshes[0]
                    return trimesh.util.concatenate(meshes)
    except Exception as zip_err:
        print(f"[WARN] Błąd inspekcji kontenera ZIP .3MF: {zip_err}")

    # 2. Próba wczytania standardowego przez trimesh
    try:
        loaded = trimesh.load(io.BytesIO(file_bytes), file_type="3mf")
        if isinstance(loaded, trimesh.Scene):
            if len(loaded.geometry) == 0:
                raise ValueError("Brak geometrii w pliku 3MF")
            valid_geoms = [g for g in loaded.geometry.values() if isinstance(g, trimesh.Trimesh) and len(g.faces) > 0]
            if valid_geoms:
                return trimesh.util.concatenate(valid_geoms) if len(valid_geoms) > 1 else valid_geoms[0]
            raise ValueError("Brak poprawnych trójkątów w scenie 3MF")
        elif isinstance(loaded, trimesh.Trimesh):
            return loaded
    except Exception as std_err:
        print(f"[WARN] Standardowy loader trimesh 3MF nie powiódł się ({std_err}), próba ratunkowa...")

    # 3. Fallback: bezpośrednia dekompresja i wczytanie przez mini-zipy
    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes), "r") as z:
            model_files = [f for f in z.namelist() if f.lower().endswith(".model")]
            meshes = []
            for mf in model_files:
                try:
                    mini_zip = io.BytesIO()
                    with zipfile.ZipFile(mini_zip, "w") as mz:
                        mz.writestr("3D/3dmodel.model", z.read(mf))
                        mz.writestr("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
                    mini_zip.seek(0)
                    m = trimesh.load(mini_zip, file_type="3mf")
                    if isinstance(m, trimesh.Trimesh) and len(m.faces) > 0:
                        meshes.append(m)
                    elif isinstance(m, trimesh.Scene):
                        meshes.extend([g for g in m.geometry.values() if isinstance(g, trimesh.Trimesh) and len(g.faces) > 0])
                except Exception:
                    continue
            if meshes:
                return trimesh.util.concatenate(meshes) if len(meshes) > 1 else meshes[0]
    except Exception:
        pass

    raise ValueError("Nie udało się odczytać geometrii 3D z pliku .3MF.")


def load_3mf_mesh(file_path: str) -> trimesh.Trimesh:
    """Wczytuje model z pliku .3MF bezpiecznie i wydajnie."""
    return parse_3mf_safely(file_path)


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
    # Dla bardzo gęstych siatek (>150k ścianek) omijamy kosztowne operacje macierzowe
    try:
        if len(mesh.faces) < 150000:
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
    if not watertight and len(mesh.faces) < 100000:
        try:
            trimesh.repair.fill_holes(mesh)
            watertight = bool(mesh.is_watertight)
        except Exception:
            pass

    # 3. Precyzyjne wyliczenie rzeczywistej objętości bryły
    # Obliczamy objętość metodą całki powierzchniowej Gaussa (signed volume)
    volume_mm3 = 0.0
    bbox = mesh.bounding_box.extents  # [x, y, z] w mm
    bbox_volume = float(np.prod(bbox)) if len(bbox) == 3 else 1e9

    try:
        raw_vol = mesh.volume
        if raw_vol is not None and not np.isnan(raw_vol) and abs(raw_vol) > 0:
            if abs(raw_vol) <= bbox_volume * 1.05:
                volume_mm3 = abs(float(raw_vol))
    except Exception as vol_err:
        print(f"[WARN] Błąd odczytu mesh.volume: {vol_err}")

    # Jeśli signed volume zawiodło, spróbuj voxelized volume lub orientację wypukłą z redukcją
    if volume_mm3 <= 0.0:
        if len(mesh.faces) < 80000:
            try:
                voxel_pitch = max(mesh.extents) / 64.0
                vox = mesh.voxelized(pitch=voxel_pitch).fill()
                volume_mm3 = float(vox.volume)
            except Exception:
                pass
        if volume_mm3 <= 0.0:
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
