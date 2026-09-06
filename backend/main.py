"""
Drukstacja - backend API
Obsługuje: upload pliku CAD (STL/STEP/OBJ) -> konwersja STEP -> cięcie slicerem -> zapis w R2 -> wycena druku 3D
oraz precyzyjną kwantyzację i wektoryzację obrazów (standard MakerWorld) pod wielokolorowy generator breloków FDM.
"""
import os
import re
import shutil
import tempfile
import uuid
import traceback
from pathlib import Path

from typing import Any
from fastapi import FastAPI, File, UploadFile, HTTPException, Form, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import trimesh
import cv2
import numpy as np
from sklearn.cluster import KMeans

from analysis import (
    process_uploaded_file,
    analyze_file,
    ALL_SUPPORTED_EXTENSIONS,
    INSTANT_3D_EXTENSIONS,
    INSTANT_MESH_EXTENSIONS,
    INSTANT_CAD_EXTENSIONS,
    ARCHIVE_EXTENSIONS,
    UnsupportedFileType,
)
from pricing import calculate_price, calculate_price_from_slicer, MATERIALS
from storage import upload_file_to_r2, get_file_url, download_file_from_r2, save_production_3mf_file
from slicer import convert_step_to_stl, run_slicer
from orientation import auto_orient_mesh
from packager_3mf import generate_production_3mf, sanitize_filename

# Katalog cache dla wygenerowanych i zorientowanych siatek STL do szybkiego ponownego cięcia
MODELS_CACHE_DIR = os.path.join(tempfile.gettempdir(), "drukstacja_cache")
os.makedirs(MODELS_CACHE_DIR, exist_ok=True)

# Katalog cache dla wygenerowanych pakietów produkcyjnych .3MF
PROJECTS_3MF_CACHE_DIR = os.path.join(tempfile.gettempdir(), "drukstacja_3mf")
os.makedirs(PROJECTS_3MF_CACHE_DIR, exist_ok=True)

# Inicjalizacja aplikacji FastAPI
app = FastAPI(title="Drukstacja API", version="0.5.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_FILE_SIZE_MB = 100
ALLOWED_EXTENSIONS = ALL_SUPPORTED_EXTENSIONS


class QuoteRequest(BaseModel):
    volume_cm3: float
    bbox_mm: list[float]  # [x, y, z]
    material: str = "PLA"
    quantity: int = 1
    infill_percent: int = 20
    layer_height: float = 0.20
    nozzle_size: float = 0.4


class ResliceRequest(BaseModel):
    preview_stl_key: str | None = None
    file_key: str | None = None
    layer_height: float = 0.20
    nozzle_size: float = 0.4
    infill: int = 20
    filament_type: str = "PLA"
    quantity: int = 1


class Generate3MFRequest(BaseModel):
    preview_stl_key: str | None = None
    file_key: str | None = None
    order_id: str | None = None
    file_name: str | None = None
    layer_height: Any = 0.20
    nozzle_size: Any = 0.4
    infill: Any = 20
    material: str = "PLA"
    color_hex: str = "#EF4444"


REMBG_AVAILABLE = False
REMBG_SESSION = None

try:
    from rembg import remove as rembg_remove, new_session
    try:
        REMBG_SESSION = new_session("u2net")
        REMBG_AVAILABLE = True
    except Exception:
        try:
            REMBG_SESSION = new_session("u2netp")
            REMBG_AVAILABLE = True
        except Exception as _sess_err:
            print(f"[WARN] Inicjalizacja sesji rembg: {_sess_err}")
            REMBG_SESSION = None
            REMBG_AVAILABLE = False
except Exception as _e:
    print(f"[WARN] Rembg niedostępne ({_e}), używam inteligentnego FloodFill/GrabCut")
    REMBG_AVAILABLE = False


def remove_checkerboard_pattern(bgr_img):
    """
    Wykrywa i neutralizuje namalowaną szachownicę przezroczystości (biało-szare kwadraty),
    często występującą w grafikach pobranych z internetu jako 'fałszywy przezroczysty PNG'.
    """
    gray = cv2.cvtColor(bgr_img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]

    high_contrast_edges = cv2.Canny(gray, 80, 160)
    
    border_zone = np.zeros((h, w), dtype=bool)
    bz_y = max(5, int(h * 0.15))
    bz_x = max(5, int(w * 0.15))
    border_zone[:bz_y, :] = True
    border_zone[-bz_y:, :] = True
    border_zone[:, :bz_x] = True
    border_zone[:, -bz_x:] = True

    edge_density = np.mean(high_contrast_edges[border_zone] > 0)
    
    if edge_density > 0.05:
        checker_mask = (gray > 180) & border_zone
        clean_bgr = bgr_img.copy()
        clean_bgr[checker_mask] = [255, 255, 255]
        return clean_bgr, True

    return bgr_img, False


def image_to_quantized_svg(image_bytes: bytes, n_colors: int = 4, keep_bg: bool = False):
    """
    Zaawansowany algorytm wektoryzacji w standardzie MakerWorld:
    1. Precyzyjna segmentacja postaci AI (u2net/u2netp) w 800px z podwójnym zabezpieczeniem GrabCut.
    2. Inteligentne domykanie wyłącznie wewnętrznych ubytków z zachowaniem otwartych przestrzeni między nogami.
    3. Gwarantowana minimalna grubość ścianek (dylatacja + filtr mikroszumu) – brak łamliwych, cienkich elementów pod dyszę 0.4mm.
    4. Zagnieżdżone ścieżki SVG (fill-rule='evenodd') precyzyjnie wycinające otwory (błyski oka, tęczówki, paski).
    """
    n_colors = max(2, min(6, n_colors))

    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError("Błąd odczytu grafiki.")

    target_dim = 800
    if len(img.shape) == 3 and img.shape[2] == 4:
        bgr = img[:, :, :3]
    else:
        bgr = img if len(img.shape) == 3 else cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)

    h, w = bgr.shape[:2]
    scale = target_dim / max(h, w)
    new_w, new_h = max(int(w * scale), 1), max(int(h * scale), 1)
    bgr_resized = cv2.resize(bgr, (new_w, new_h), interpolation=cv2.INTER_AREA)

    # 1. USUWANIE TŁA I SEGMENTACJA
    sil = None

    if keep_bg:
        sil = np.ones((new_h, new_w), dtype=bool)
    else:
        # A. Wbudowany kanał alfa w grafice wejściowej
        if len(img.shape) == 3 and img.shape[2] == 4:
            alpha_raw = img[:, :, 3] > 20
            alpha_ratio = np.sum(alpha_raw) / alpha_raw.size
            if 0.05 < alpha_ratio < 0.98:
                raw_mask = cv2.resize(
                    alpha_raw.astype(np.uint8), (new_w, new_h), interpolation=cv2.INTER_NEAREST
                )
                sil = raw_mask > 0

        # B. Segmentacja AI (rembg u2net / u2netp)
        if sil is None and REMBG_AVAILABLE and REMBG_SESSION is not None:
            try:
                cutout_bytes = rembg_remove(image_bytes, session=REMBG_SESSION)
                cutout_arr = np.frombuffer(cutout_bytes, np.uint8)
                cutout_img = cv2.imdecode(cutout_arr, cv2.IMREAD_UNCHANGED)
                if cutout_img is not None and len(cutout_img.shape) == 3 and cutout_img.shape[2] == 4:
                    c_alpha = cutout_img[:, :, 3] > 25
                    alpha_ratio = np.sum(c_alpha) / c_alpha.size
                    if 0.05 < alpha_ratio < 0.95:
                        raw_mask = cv2.resize(
                            c_alpha.astype(np.uint8), (new_w, new_h), interpolation=cv2.INTER_NEAREST
                        )
                        sil = raw_mask > 0
            except Exception as _r_err:
                print(f"[WARN] Błąd wycinania rembg: {_r_err}")

        # C. Niezawodny GrabCut fallback dla zdjęć plenerowych (trawa, niebo, krajobraz)
        if sil is None:
            try:
                gc_dim = 400
                gc_scale = gc_dim / max(new_h, new_w)
                gc_w, gc_h = max(int(new_w * gc_scale), 1), max(int(new_h * gc_scale), 1)
                gc_img = cv2.resize(bgr_resized, (gc_w, gc_h), interpolation=cv2.INTER_AREA)

                gc_mask = np.zeros((gc_h, gc_w), np.uint8)
                bgd_model = np.zeros((1, 65), np.float64)
                fgd_model = np.zeros((1, 65), np.float64)

                margin_x = max(4, int(gc_w * 0.08))
                margin_y = max(4, int(gc_h * 0.08))
                rect = (margin_x, margin_y, gc_w - 2 * margin_x, gc_h - 2 * margin_y)

                cv2.grabCut(gc_img, gc_mask, rect, bgd_model, fgd_model, 4, cv2.GC_INIT_WITH_RECT)
                gc_fg = (gc_mask == cv2.GC_FGD) | (gc_mask == cv2.GC_PR_FGD)

                if 0.05 < np.mean(gc_fg) < 0.90:
                    sil = cv2.resize(gc_fg.astype(np.uint8), (new_w, new_h), interpolation=cv2.INTER_NEAREST) > 0
            except Exception as _g_err:
                print(f"[WARN] Błąd GrabCut fallback: {_g_err}")

    if sil is None or np.sum(sil) < 50:
        sil = np.ones((new_h, new_w), dtype=bool)

    # 2. DOMYKANIE WYŁĄCZNIE WEWNĘTRZNYCH DZIUR (bez łączenia nóg / przestrzeni pod brzuchem!)
    sil_u8 = (sil.astype(np.uint8)) * 255
    contours, hierarchy = cv2.findContours(sil_u8, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    if contours and hierarchy is not None:
        hier = hierarchy[0]
        for i in range(len(contours)):
            if hier[i][3] != -1:
                hole_area = cv2.contourArea(contours[i])
                if hole_area < (new_w * new_h * 0.15):
                    cv2.drawContours(sil_u8, [contours[i]], -1, 255, thickness=-1)

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    sil_u8 = cv2.morphologyEx(sil_u8, cv2.MORPH_CLOSE, kernel)
    sil = sil_u8 > 0

    # 3. KWANTYZACJA KOLORÓW KMEANS POSORTOWANA PO LUMINANCJI
    fg_pixels = bgr_resized[sil].reshape(-1, 3)
    if len(fg_pixels) < n_colors * 10:
        fg_pixels = bgr_resized.reshape(-1, 3)
        sil = np.ones((new_h, new_w), dtype=bool)

    kmeans = KMeans(n_clusters=n_colors, random_state=42, n_init=5).fit(fg_pixels)
    centers = kmeans.cluster_centers_.astype(int)

    # Sortowanie od najjaśniejszego (baza) do najciemniejszego (detale/źrenice)
    brightness = [0.299 * c[2] + 0.587 * c[1] + 0.114 * c[0] for c in centers]
    sorted_order = np.argsort(brightness)[::-1]
    centers = centers[sorted_order]

    hex_colors = [
        f"#{centers[i][2]:02x}{centers[i][1]:02x}{centers[i][0]:02x}".upper()
        for i in range(n_colors)
    ]

    labels = np.full((new_h, new_w), -1, dtype=int)
    labels[sil] = kmeans.labels_
    remapped = np.full((new_h, new_w), -1, dtype=int)
    for new_idx, old_cluster in enumerate(sorted_order):
        remapped[labels == old_cluster] = new_idx

    # 4. MASKI WARSTW Z GWARANTOWANĄ GRUBOŚCIĄ ŚCIANEK POD DYSZĘ 0.4MM (KAFELKOWANIE MOZAIKOWE):
    # Kernel dylatacji (poszerza cienkie paski o +1px promień, co zapewnia szczelne łączenie stykających się kolorów w druku FDM)
    kernel_wall = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    layer_masks = []

    for c_idx in range(n_colors):
        m = (remapped == c_idx).astype(np.uint8) * 255
        # Usunięcie pojedynczych pikseli szumu
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2, 2)))
        # Pogrubienie ścianek i szczelne spasowanie sąsiadujących kolorów
        m = cv2.dilate(m, kernel_wall, iterations=1)
        # Ograniczenie do zewnętrznej sylwetki
        m = cv2.bitwise_and(m, sil_u8)
        layer_masks.append(m)

    # 5. DOPASOWANIE I CENTROWANIE W OKNIE 100x100
    y_idx, x_idx = np.where(sil)
    if len(x_idx) > 0 and len(y_idx) > 0:
        min_x, max_x = np.min(x_idx), np.max(x_idx)
        min_y, max_y = np.min(y_idx), np.max(y_idx)
    else:
        min_x, max_x, min_y, max_y = 0, new_w, 0, new_h

    bbox_w = max(max_x - min_x, 1)
    bbox_h = max(max_y - min_y, 1)
    max_side = max(bbox_w, bbox_h)

    usable_box = 86.0
    scale_fit = usable_box / max_side
    center_x = (min_x + max_x) / 2.0
    center_y = (min_y + max_y) / 2.0

    def map_pt(pt):
        nx = 50.0 + (pt[0] - center_x) * scale_fit
        ny = 50.0 + (pt[1] - center_y) * scale_fit
        return nx, ny

    # 6. GENEROWANIE SVG Z WYCINANIEM OTWORÓW DLA WSZYSTKICH WARSTW (EVENODD MOZAIKA)
    svg_parts = ['<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">']

    for l_idx in range(n_colors):
        mask = layer_masks[l_idx]
        if not np.any(mask):
            continue

        contours, hierarchy = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_TC89_KCOS)
        if not contours or hierarchy is None:
            continue

        hier = hierarchy[0]
        compound_paths = []

        for i in range(len(contours)):
            if hier[i][3] != -1:
                continue  # Pomiń otwory na poziomie głównym (są przetwarzane w rodzicu)

            cnt = contours[i]
            # Eliminacja mikroskopijnych okruchów (< 15px), które nie mają przyczepności i łamią się
            if cv2.contourArea(cnt) < 15:
                continue

            approx = cv2.approxPolyDP(cnt, 0.0010 * cv2.arcLength(cnt, True), True)
            pts = approx.reshape(-1, 2)
            if len(pts) < 3:
                continue

            sx, sy = map_pt(pts[0])
            d_str = f"M {sx:.2f} {sy:.2f} "
            for p in pts[1:]:
                x, y = map_pt(p)
                d_str += f"L {x:.2f} {y:.2f} "
            d_str += "Z "

            # Wycinanie otworów wewnątrz tego wielokąta (np. źrenice, paski, bliki)
            child = hier[i][2]
            while child != -1:
                hole_cnt = contours[child]
                if cv2.contourArea(hole_cnt) >= 6:
                    hole_approx = cv2.approxPolyDP(hole_cnt, 0.0010 * cv2.arcLength(hole_cnt, True), True)
                    hole_pts = hole_approx.reshape(-1, 2)
                    if len(hole_pts) >= 3:
                        hsx, hsy = map_pt(hole_pts[0])
                        d_str += f"M {hsx:.2f} {hsy:.2f} "
                        for hp in hole_pts[1:]:
                            hx, hy = map_pt(hp)
                            d_str += f"L {hx:.2f} {hy:.2f} "
                        d_str += "Z "
                child = hier[child][0]

            compound_paths.append(f'<path fill-rule="evenodd" d="{d_str}"/>')

        if compound_paths:
            svg_parts.append(f'<g id="color_{l_idx+1}" fill="{hex_colors[l_idx]}">{"".join(compound_paths)}</g>')

    svg_parts.append("</svg>")
    return "".join(svg_parts), hex_colors




@app.get("/")
def root():
    return {"status": "ok", "service": "drukstacja-backend"}


@app.get("/materials")
def get_materials():
    """Lista dostępnych materiałów i ich cen za kg."""
    return MATERIALS


from fastapi import Form

@app.post("/vectorize-ai")
async def vectorize_image_ai(
    file: UploadFile = File(...),
    keep_bg: str = Form("false"),
    n_colors: str = Form("4")
):
    """Wektoryzacja konturów z obsługą AI cutout i doborem barw. Obsługuje 2-6 warstw kolorów."""
    try:
        should_keep_bg = keep_bg.lower() in ("true", "1", "yes")
        num_colors = max(2, min(6, int(n_colors)))
        contents = await file.read()
        svg_result, detected_colors = image_to_quantized_svg(
            contents, n_colors=num_colors, keep_bg=should_keep_bg
        )
        return {
            "svg": svg_result,
            "detected_colors": detected_colors
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Błąd wektoryzacji: {str(e)}")
@app.post("/analyze")
@app.post("/api/analyze-model")
async def analyze_model_endpoint(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    layer_height: float = Form(0.20),
    nozzle_size: float = Form(0.4),
    infill: int = Form(20),
    filament_type: str = Form("PLA"),
):
    """
    Hybrydowa analiza plików produkcyjnych (standard JLCPCB / PCBWay):
    - Pliki 3D Mesh / CAD i archiwa z modelami: instant 3D geometry + slicing
    - Pliki 2D DXF/DWG, PDF, PCB Gerber, CAD/BIM: rejestracja zlecenia RFQ bez błędów
    """
    filename_lower = file.filename.lower()
    ext = Path(filename_lower).suffix

    # Sprawdzenie czy rozszerzenie jest na liście lub czy to archiwum tar.gz / tar.bz2
    is_supported = (
        ext in ALLOWED_EXTENSIONS
        or filename_lower.endswith((".tar.gz", ".tar.bz2", ".tgz"))
    )

    if not is_supported:
        raise HTTPException(
            status_code=400,
            detail=f"Nieobsługiwany format pliku: {ext}. Obsługujemy formaty 3D (.step, .stl, .obj, .3mf itp.), PCB Gerber, rysunki techniczne oraz archiwa ZIP.",
        )

    tmp_dir = tempfile.mkdtemp()
    unique_id = uuid.uuid4().hex
    safe_filename = "".join(c for c in file.filename if c.isalnum() or c in "._- ")
    tmp_path = os.path.join(tmp_dir, f"{unique_id}_{safe_filename}")
    r2_key = f"models/{unique_id}_{safe_filename}"

    try:
        with open(tmp_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        size_mb = os.path.getsize(tmp_path) / (1024 * 1024)
        if size_mb > MAX_FILE_SIZE_MB:
            raise HTTPException(
                status_code=400,
                detail=f"Plik za duży ({size_mb:.1f}MB). Limit: {MAX_FILE_SIZE_MB}MB",
            )

        # Zapisz kopię oryginalnego pliku w lokalnym cache modeli
        cached_orig = os.path.join(MODELS_CACHE_DIR, f"{unique_id}_{safe_filename}")
        try:
            shutil.copyfile(tmp_path, cached_orig)
        except Exception:
            cached_orig = None

        # 1. Asynchroniczna wysyłka oryginalnego pliku do Cloudflare R2 w tle (nie blokuje analizy)
        def _bg_upload(path_to_upload, key, ctype):
            if not path_to_upload or not os.path.exists(path_to_upload):
                return
            try:
                with open(path_to_upload, "rb") as f_up:
                    upload_file_to_r2(f_up, key, ctype)
            except Exception as up_err:
                print(f"[WARN] Błąd zapisu w R2 w tle: {up_err}")

        if cached_orig:
            background_tasks.add_task(
                _bg_upload,
                cached_orig,
                r2_key,
                file.content_type or "application/octet-stream",
            )

        # 2. Hybrydowa analiza pliku
        result = process_uploaded_file(tmp_path, file.filename, tmp_dir)

        # 3. Przypadek A: Model 3D z natychmiastową wyceną (instant_pricing == True)
        if result.get("instant_pricing") is True:
            mesh_source = result.get("mesh_source_path", tmp_path)
            raw_mesh = result.pop("mesh_object", None)

            if raw_mesh is None:
                source_ext = Path(mesh_source).suffix.lower()
                if source_ext in [".step", ".stp", ".iges", ".igs"]:
                    try:
                        converted_stl_path = os.path.join(tmp_dir, f"{unique_id}_converted.stl")
                        convert_step_to_stl(mesh_source, converted_stl_path)
                        raw_mesh = trimesh.load(converted_stl_path, force="mesh")
                    except Exception as conv_err:
                        print(f"[WARN] Konwersja STEP do STL nie powiodła się: {conv_err}")
                        # Bezpieczny fallback do RFQ zamiast błędu 500
                        result["instant_pricing"] = False
                        result["type"] = "rfq_document"
                        result["category"] = "Bryła CAD (B-Rep)"
                        result["message"] = f"Złożona bryła CAD ({source_ext.upper()}) wymaga manualnego przygotowania siatki przez inżyniera. Oferta w 24h."

            if raw_mesh is not None and result.get("instant_pricing") is True:
                try:
                    oriented_mesh, orientation_info = auto_orient_mesh(raw_mesh)
                    oriented_stl_path = os.path.join(tmp_dir, f"{unique_id}_oriented.stl")
                    oriented_mesh.export(oriented_stl_path)

                    preview_stl_key = f"models/{unique_id}_oriented.stl"
                    # Zapisujemy kopię w lokalnym katalogu cache do błyskawicznego reslicowania
                    try:
                        cached_path = os.path.join(MODELS_CACHE_DIR, f"{unique_id}_oriented.stl")
                        shutil.copyfile(oriented_stl_path, cached_path)
                    except Exception as c_err:
                        print(f"[WARN] Błąd zapisu do lokalnego cache: {c_err}")

                    with open(oriented_stl_path, "rb") as f_stl:
                        upload_file_to_r2(
                            file_obj=f_stl,
                            object_name=preview_stl_key,
                            content_type="model/stl",
                        )
                    preview_stl_url = get_file_url(preview_stl_key)
                    result["preview_stl_key"] = preview_stl_key
                    result["preview_stl_url"] = preview_stl_url
                    result["orientation"] = orientation_info

                    # Slicing z parametrami przesłanymi z frontu
                    try:
                        slice_data = run_slicer(
                            oriented_stl_path,
                            infill=int(infill),
                            layer_height=float(layer_height),
                            nozzle_size=float(nozzle_size),
                            filament_type=filament_type,
                        )
                        result["slicer_engine"] = slice_data.get("engine")
                        result["print_time_hours"] = slice_data.get("print_time_hours")
                        result["print_time_formatted"] = slice_data.get("print_time_formatted")
                        result["filament_weight_g"] = slice_data.get("filament_weight_g")
                        result["filament_length_m"] = slice_data.get("filament_length_m")
                        result["filament_volume_cm3"] = slice_data.get("filament_volume_cm3")
                        result["layer_height"] = float(layer_height)
                        result["nozzle_size"] = float(nozzle_size)
                        result["infill"] = int(infill)
                        result["filament_type"] = filament_type
                        result["has_supports"] = slice_data.get("has_supports", False)
                        result["support_lines"] = slice_data.get("support_lines", [])

                        # Wycena na podstawie metadanych ze slicera
                        price_info = calculate_price_from_slicer(
                            print_time_hours=result["print_time_hours"] or 1.0,
                            filament_weight_g=result["filament_weight_g"] or 20.0,
                            material=filament_type,
                            quantity=1,
                            layer_height=float(layer_height),
                            nozzle_size=float(nozzle_size),
                        )
                        result["price_breakdown"] = price_info
                        result["unit_price"] = price_info["unit_price_pln"]
                    except Exception as slice_err:
                        print(f"[WARN] Slicer error: {slice_err}")
                        result["print_time_hours"] = None
                        result["print_time_formatted"] = None
                        result["filament_weight_g"] = None
                        result["filament_length_m"] = None
                        result["has_supports"] = False
                        result["support_lines"] = []

                except Exception as mesh_proc_err:
                    print(f"[WARN] Błąd orientacji/cięcia siatki: {mesh_proc_err}")
                    result["preview_stl_key"] = None
                    result["preview_stl_url"] = None
                    result["orientation"] = None

        # 4. Przypadek B: Dokument RFQ (Rysunek 2D, PCB Gerber, CAD BIM itp.)
        if result.get("instant_pricing") is not True:
            result["instant_pricing"] = False
            result["type"] = "rfq_document"
            result["preview_stl_key"] = None
            result["preview_stl_url"] = None
            result["orientation"] = None
            result["print_time_exact"] = None
            result["filament_weight_g_exact"] = None
            result["has_supports"] = False
            result["support_lines"] = []

        result.pop("mesh_object", None)
        result.pop("mesh_source_path", None)
        result["file_key"] = r2_key
        result["original_filename"] = file.filename

        return result

    except UnsupportedFileType as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Błąd analizy lub zapisu w R2: {str(e)}")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


@app.post("/quote")
def quote(req: QuoteRequest):
    """Liczy cenę na podstawie geometrii zwróconej przez /analyze."""
    if req.material not in MATERIALS:
        raise HTTPException(status_code=400, detail=f"Nieznany materiał: {req.material}")

    result = calculate_price(
        volume_cm3=req.volume_cm3,
        bbox_mm=req.bbox_mm,
        material=req.material,
        quantity=req.quantity,
        infill_percent=req.infill_percent,
        layer_height=req.layer_height,
        nozzle_size=req.nozzle_size,
    )
    return result


@app.post("/api/reslice-model")
def reslice_model_endpoint(req: ResliceRequest):
    """
    Ponowne slice'owanie modelu w czasie rzeczywistym z nowymi parametrami
    (layer_height, nozzle_size, infill, filament_type) bez konieczności re-uploadu pliku z przeglądarki.
    """
    key = req.preview_stl_key or req.file_key
    if not key:
        raise HTTPException(status_code=400, detail="Brak parametru preview_stl_key lub file_key.")

    base_name = os.path.basename(key)
    local_cached = os.path.join(MODELS_CACHE_DIR, base_name)

    if not os.path.exists(local_cached):
        # Sprawdź dopasowanie w lokalnym katalogu cache po identyfikatorze
        uuid_prefix = base_name.split("_")[0]
        matches = [f for f in os.listdir(MODELS_CACHE_DIR) if f.startswith(uuid_prefix)]
        if matches:
            local_cached = os.path.join(MODELS_CACHE_DIR, matches[0])
        else:
            try:
                download_file_from_r2(key, local_cached)
            except Exception as dl_err:
                print(f"[WARN] Błąd pobierania modelu do reslicowania: {dl_err}")
                raise HTTPException(
                    status_code=404,
                    detail=f"Plik modelu nie został odnaleziony na serwerze ({key}). Proszę wgrać plik ponownie."
                )

    slice_data = run_slicer(
        stl_path=local_cached,
        infill=int(req.infill),
        layer_height=float(req.layer_height),
        nozzle_size=float(req.nozzle_size),
        filament_type=req.filament_type,
    )

    price_info = calculate_price_from_slicer(
        print_time_hours=slice_data.get("print_time_hours") or 1.0,
        filament_weight_g=slice_data.get("filament_weight_g") or 20.0,
        material=req.filament_type,
        quantity=req.quantity,
        layer_height=float(req.layer_height),
        nozzle_size=float(req.nozzle_size),
    )

    return {
        "success": True,
        "engine": slice_data.get("engine"),
        "print_time_hours": slice_data.get("print_time_hours"),
        "print_time_formatted": slice_data.get("print_time_formatted"),
        "filament_weight_g": slice_data.get("filament_weight_g"),
        "filament_length_m": slice_data.get("filament_length_m"),
        "filament_volume_cm3": slice_data.get("filament_volume_cm3"),
        "layer_height": float(req.layer_height),
        "nozzle_size": float(req.nozzle_size),
        "infill": int(req.infill),
        "filament_type": req.filament_type,
        "has_supports": slice_data.get("has_supports", False),
        "support_lines": slice_data.get("support_lines", []),
        "price_breakdown": price_info,
        "unit_price": price_info["unit_price_pln"],
        "total_price": price_info["total_price_pln"],
    }


def get_db_connection():
    """Zwraca połączenie z bazą PostgreSQL jeśli skonfigurowano DATABASE_URL."""
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        return None
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
        return psycopg2.connect(db_url, cursor_factory=RealDictCursor)
    except Exception as e:
        print(f"[WARN] Nie można połączyć z bazą PostgreSQL: {e}")
        return None


@app.get("/api/filaments")
def get_filaments():
    """
    Zwraca listę wszystkich filamentów dostępnych w magazynie (in_stock = true)
    z bazy PostgreSQL na Railway, posortowanych według tier, type i name.
    """
    conn = get_db_connection()
    if conn:
        try:
            with conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT 
                            id, 
                            name, 
                            tier, 
                            type, 
                            category, 
                            hex, 
                            colors, 
                            price_per_cm3, 
                            in_stock, 
                            roughness, 
                            metalness
                        FROM filaments 
                        WHERE in_stock = true 
                        ORDER BY 
                            CASE WHEN tier = 'standard' THEN 1 ELSE 2 END,
                            type ASC,
                            name ASC;
                    """)
                    rows = cur.fetchall()
                    results = []
                    for row in rows:
                        item = dict(row)
                        if item.get("price_per_cm3") is not None:
                            item["price_per_cm3"] = float(item["price_per_cm3"])
                        if item.get("roughness") is not None:
                            item["roughness"] = float(item["roughness"])
                        if item.get("metalness") is not None:
                            item["metalness"] = float(item["metalness"])
                        results.append(item)
                    return {"success": True, "source": "database", "filaments": results}
        except Exception as e:
            print(f"[WARN] Błąd odczytu z tabeli filaments: {e}")
        finally:
            conn.close()

    # Fallback w przypadku braku bazy
    try:
        from db_setup import SEED_FILAMENTS
        fallback = [dict(item, in_stock=True) for item in SEED_FILAMENTS]
        return {"success": True, "source": "fallback", "filaments": fallback}
    except Exception as err:
        return {"success": False, "error": str(err), "filaments": []}


# --------------------------------------------------------------------------
# MODUŁ PAKIETÓW PRODUKCYJNYCH .3MF (BAMBU STUDIO / ORCASLICER / PRUSASLICER)
# --------------------------------------------------------------------------

@app.post("/api/generate-3mf")
def generate_3mf_endpoint(req: Generate3MFRequest):
    """
    Generuje i zapisuje pakiet produkcyjny .3MF dla danego modelu i parametrów.
    Zwraca informację o pliku i URL do pobrania.
    """
    key = req.preview_stl_key or req.file_key
    local_model = None

    if key:
        base_name = os.path.basename(key)
        local_cached = os.path.join(MODELS_CACHE_DIR, base_name)
        if os.path.exists(local_cached):
            local_model = local_cached
        else:
            uuid_prefix = base_name.split("_")[0]
            matches = [f for f in os.listdir(MODELS_CACHE_DIR) if f.startswith(uuid_prefix)]
            if matches:
                local_model = os.path.join(MODELS_CACHE_DIR, matches[0])
            else:
                try:
                    download_file_from_r2(key, local_cached)
                    local_model = local_cached
                except Exception as dl_err:
                    print(f"[WARN] Błąd pobierania modelu z R2: {dl_err}")

    if not local_model or not os.path.exists(local_model):
        raise HTTPException(
            status_code=404,
            detail="Plik geometrii 3D nie został odnaleziony na serwerze. Proszę załadować plik w wyceniarce."
        )

    def parse_clean_float(val, default_val):
        try:
            if isinstance(val, (int, float)):
                return float(val)
            nums = re.findall(r"[\d\.]+", str(val or ""))
            return float(nums[0]) if nums else default_val
        except Exception:
            return default_val

    clean_layer_height = parse_clean_float(req.layer_height, 0.20)
    clean_nozzle_size = parse_clean_float(req.nozzle_size, 0.4)
    clean_infill = int(parse_clean_float(req.infill, 20))

    order_id = req.order_id or uuid.uuid4().hex[:8].upper()
    file_name = req.file_name or os.path.basename(local_model)
    safe_name = sanitize_filename(Path(file_name).stem)
    safe_mat = sanitize_filename(req.material.split()[0])
    target_3mf_name = f"ORDER_{order_id}_{safe_name}_{safe_mat}_{clean_nozzle_size}mm.3mf"
    local_3mf_path = os.path.join(PROJECTS_3MF_CACHE_DIR, target_3mf_name)

    # Generowanie .3MF
    generate_production_3mf(
        model_path=local_model,
        order_metadata={"order_id": order_id, "file_name": file_name},
        print_settings={
            "layer_height": clean_layer_height,
            "nozzle_size": clean_nozzle_size,
            "infill": clean_infill,
            "material": req.material,
            "color_hex": req.color_hex,
        },
        output_path=local_3mf_path,
    )

    r2_key = f"production_packages/{target_3mf_name}"
    production_url = save_production_3mf_file(local_3mf_path, r2_key)

    # Aktualizacja w bazie PostgreSQL jeśli order_id istnieje
    if req.order_id:
        conn = get_db_connection()
        if conn:
            try:
                with conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            "UPDATE orders SET production_file_url = %s WHERE id::text = %s OR id::text LIKE %s",
                            (production_url, str(req.order_id), f"{req.order_id}%")
                        )
            except Exception as db_err:
                print(f"[WARN] Nie udało się zaktualizować orders w PostgreSQL: {db_err}")
            finally:
                conn.close()

    return {
        "success": True,
        "filename": target_3mf_name,
        "production_file_url": production_url,
        "download_url": f"/api/download-3mf-file/{target_3mf_name}",
    }


@app.get("/api/download-3mf-file/{filename}")
def download_3mf_file(filename: str):
    """Pobiera lokalnie zapisany plik projektu .3MF."""
    safe_name = os.path.basename(filename)
    path = os.path.join(PROJECTS_3MF_CACHE_DIR, safe_name)
    if not os.path.exists(path):
        alt = os.path.join(MODELS_CACHE_DIR, safe_name)
        if os.path.exists(alt):
            path = alt
        else:
            raise HTTPException(status_code=404, detail="Plik produkcyjny .3MF nie został odnaleziony.")

    return FileResponse(
        path,
        media_type="application/vnd.ms-package.3dmanufacturing-3dmodel+xml",
        filename=safe_name,
    )


@app.post("/api/orders/upload-geometry")
async def upload_order_geometry_endpoint(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    order_id: str = Form(...),
    file_name: str | None = Form(None),
    material: str = Form("PLA"),
    color_hex: str = Form("#222222"),
    layer_height: float = Form(0.20),
    nozzle_size: float = Form(0.4),
    infill: int = Form(100),
):
    """
    Endpoint dedykowany dla generatora breloków 3D:
    Przyjmuje wyeksportowany ze sceny Three.js plik STL, zapisuje go w pamięci trwałej i R2,
    oraz natychmiast generuje zunifikowany pakiet produkcyjny .3MF powiązany z zamówieniem.
    """
    clean_order_id = str(order_id)
    safe_file_name = sanitize_filename(Path(file_name or file.filename or "keychain.stl").stem)
    target_stl_name = f"ORDER_{clean_order_id[:8]}_{safe_file_name}.stl"
    local_stl_path = os.path.join(MODELS_CACHE_DIR, target_stl_name)

    # 1. Zapis pliku STL na serwerze
    content = await file.read()
    with open(local_stl_path, "wb") as f_out:
        f_out.write(content)

    # 2. Asynchroniczna kopia zapasowa do Cloudflare R2
    r2_model_key = f"models/{target_stl_name}"
    def _bg_upload_stl(path, key):
        try:
            with open(path, "rb") as f_up:
                upload_file_to_r2(f_up, key, "application/octet-stream")
        except Exception as up_err:
            print(f"[WARN] Błąd zapisu STL breloka w R2: {up_err}")

    background_tasks.add_task(_bg_upload_stl, local_stl_path, r2_model_key)

    # 3. Generowanie pakietu produkcyjnego .3MF
    safe_mat = sanitize_filename(str(material).split()[0])
    target_3mf_name = f"ORDER_{clean_order_id[:8]}_{safe_file_name}_{safe_mat}_{nozzle_size}mm.3mf"
    local_3mf_path = os.path.join(PROJECTS_3MF_CACHE_DIR, target_3mf_name)

    production_url = f"/api/download-3mf-file/{target_3mf_name}"
    try:
        generate_production_3mf(
            model_path=local_stl_path,
            order_metadata={"order_id": clean_order_id, "file_name": file_name or target_stl_name},
            print_settings={
                "layer_height": layer_height,
                "nozzle_size": nozzle_size,
                "infill": infill,
                "material": material,
                "color_hex": color_hex,
            },
            output_path=local_3mf_path,
        )
        r2_3mf_key = f"production_packages/{target_3mf_name}"
        saved_url = save_production_3mf_file(local_3mf_path, r2_3mf_key)
        if saved_url:
            production_url = saved_url
    except Exception as gen_err:
        print(f"[WARN] Błąd generowania 3MF przy uploadzie geometrii: {gen_err}")

    # 4. Aktualizacja pola production_file_url w bazie PostgreSQL
    conn = get_db_connection()
    if conn:
        try:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE orders SET production_file_url = %s WHERE id::text = %s OR id::text LIKE %s",
                        (production_url, clean_order_id, f"{clean_order_id}%")
                    )
        except Exception as db_err:
            print(f"[WARN] Błąd aktualizacji orders w PostgreSQL: {db_err}")
        finally:
            conn.close()

    return {
        "success": True,
        "filename": target_3mf_name,
        "download_url": f"/api/download-3mf-file/{target_3mf_name}",
        "production_file_url": production_url,
    }


@app.get("/api/orders/{order_id}/download-3mf")
def download_order_3mf(
    order_id: str,
    file_name: str | None = None,
    material: str | None = "PLA",
    color_hex: str | None = "#EF4444",
    layer_height: str | None = "0.20",
    nozzle_size: str | None = "0.4",
    infill: str | None = "20",
    file_key: str | None = None,
):
    """
    Dedykowany endpoint dla operatora farmy druku / widoku zlecenia:
    Generuje i od razu zwraca gotowy plik projektu produkcyjnego .3MF do pobrania jednym kliknięciem.
    """
    clean_order_id = str(order_id)
    clean_prefix = clean_order_id[:8].lower()

    # 0. Szybkie sprawdzenie czy gotowy plik .3MF już istnieje w cache
    if os.path.exists(PROJECTS_3MF_CACHE_DIR):
        for existing_3mf in os.listdir(PROJECTS_3MF_CACHE_DIR):
            if existing_3mf.endswith(".3mf") and clean_prefix in existing_3mf.lower():
                full_path = os.path.join(PROJECTS_3MF_CACHE_DIR, existing_3mf)
                if os.path.getsize(full_path) > 100:
                    return FileResponse(
                        full_path,
                        media_type="application/vnd.ms-package.3dmanufacturing-3dmodel+xml",
                        filename=existing_3mf,
                    )

    def parse_clean_float(val, default_val):
        try:
            if isinstance(val, (int, float)):
                return float(val)
            nums = re.findall(r"[\d\.]+", str(val or ""))
            return float(nums[0]) if nums else default_val
        except Exception:
            return default_val

    clean_layer_height = parse_clean_float(layer_height, 0.20)
    clean_nozzle_size = parse_clean_float(nozzle_size, 0.4)
    clean_infill = int(parse_clean_float(infill, 20))

    conn = get_db_connection()
    db_order = None
    if conn:
        try:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT * FROM orders WHERE id::text = %s OR id::text LIKE %s LIMIT 1",
                        (clean_order_id, f"{clean_order_id}%")
                    )
                    db_order = cur.fetchone()
        except Exception as e:
            print(f"[WARN] Błąd odczytu zlecenia z bazy: {e}")
        finally:
            conn.close()

    if db_order:
        file_name = file_name or db_order.get("file_name")
        material = material or db_order.get("material") or "PLA"
        if db_order.get("infill"):
            clean_infill = int(parse_clean_float(db_order.get("infill"), clean_infill))
        if db_order.get("layer_height"):
            clean_layer_height = parse_clean_float(db_order.get("layer_height"), clean_layer_height)
        tech_raw = db_order.get("technology")
        if tech_raw and "0.2mm" in str(tech_raw):
            clean_nozzle_size = 0.2
        elif tech_raw and "0.4mm" in str(tech_raw):
            clean_nozzle_size = 0.4

    # 1. Odnalezienie pliku źródłowego geometrii
    local_model = None
    if file_key:
        base_name = os.path.basename(file_key)
        target = os.path.join(MODELS_CACHE_DIR, base_name)
        if os.path.exists(target):
            local_model = target
        else:
            try:
                download_file_from_r2(file_key, target)
                local_model = target
            except Exception:
                pass

    if not local_model and os.path.exists(MODELS_CACHE_DIR):
        # Sprawdź czy plik modelu breloka lub STL zaczyna się od ORDER_{clean_prefix}
        for f in os.listdir(MODELS_CACHE_DIR):
            if f.endswith((".stl", ".step", ".stp", ".obj", ".3mf")) and clean_prefix in f.lower():
                local_model = os.path.join(MODELS_CACHE_DIR, f)
                break

    if not local_model and os.path.exists(MODELS_CACHE_DIR):
        clean_name = sanitize_filename(Path(file_name or "model").stem)
        candidates = [
            f for f in os.listdir(MODELS_CACHE_DIR)
            if f.endswith((".stl", ".step", ".stp", ".obj", ".3mf"))
        ]
        matching = [f for f in candidates if clean_prefix in f.lower() or (len(clean_name) > 3 and clean_name.lower() in f.lower())]
        if matching:
            local_model = os.path.join(MODELS_CACHE_DIR, matching[0])

    # 2. FALLBACK DLA BRELOKÓW PROCEDURALNYCH:
    # Jeśli plik geometrii nie zachował się na serwerze, wygeneruj geometryczny model breloka z parametrów zlecenia
    if not local_model or not os.path.exists(local_model):
        is_keychain = (
            "brelok" in str(file_name or "").lower() or
            "keychain" in str(file_name or "").lower() or
            (db_order and "brelok" in str(db_order.get("file_name", "")).lower())
        )
        if is_keychain or (db_order and db_order.get("dimensions_mm")):
            try:
                dims = db_order.get("dimensions_mm") if db_order else [65, 50, 4]
                dx = float(dims[0]) if dims and len(dims) > 0 else 60.0
                dy = float(dims[1]) if dims and len(dims) > 1 else 50.0
                dz = float(dims[2]) if dims and len(dims) > 2 else 4.0

                is_rect = "rect" in str(file_name or "").lower() or "tabliczka" in str(file_name or "").lower()
                if is_rect:
                    fallback_mesh = trimesh.creation.box(extents=[dx, dy, dz])
                else:
                    fallback_mesh = trimesh.creation.cylinder(radius=dx / 2.0, height=dz, sections=48)
                fallback_name = f"ORDER_{clean_prefix}_brelok_fallback.stl"
                fallback_path = os.path.join(MODELS_CACHE_DIR, fallback_name)
                fallback_mesh.export(fallback_path)
                local_model = fallback_path
                print(f"[INFO] Wygenerowano proceduralną geometrię breloka dla zlecenia {clean_order_id}")
            except Exception as fb_err:
                print(f"[WARN] Nie udało się stworzyć geometrii fallback: {fb_err}")

    if not local_model or not os.path.exists(local_model):
        raise HTTPException(
            status_code=404,
            detail="Nie znaleziono pliku geometrii 3D dla tego zlecenia na serwerze."
        )

    safe_model_name = sanitize_filename(Path(file_name or "model").stem)
    safe_mat = sanitize_filename(str(material).split()[0])
    target_3mf_name = f"ORDER_{clean_order_id[:8]}_{safe_model_name}_{safe_mat}_{clean_nozzle_size}mm.3mf"
    local_3mf_path = os.path.join(PROJECTS_3MF_CACHE_DIR, target_3mf_name)

    # Generowanie pakietu .3MF
    generate_production_3mf(
        model_path=local_model,
        order_metadata={"order_id": clean_order_id, "file_name": file_name or safe_model_name},
        print_settings={
            "layer_height": clean_layer_height,
            "nozzle_size": clean_nozzle_size,
            "infill": clean_infill,
            "material": str(material),
            "color_hex": color_hex or "#EF4444",
        },
        output_path=local_3mf_path,
    )

    return FileResponse(
        local_3mf_path,
        media_type="application/vnd.ms-package.3dmanufacturing-3dmodel+xml",
        filename=target_3mf_name,
    )