"""
Drukstacja - backend API
Obsługuje: upload pliku CAD (STL/STEP/OBJ) -> konwersja STEP -> cięcie slicerem -> zapis w R2 -> wycena druku 3D
oraz precyzyjną kwantyzację i wektoryzację obrazów (standard MakerWorld) pod wielokolorowy generator breloków FDM.
"""
import os
import re
import json
import shutil
import tempfile
import uuid
import traceback
import base64
from pathlib import Path

from typing import Any
from contextlib import asynccontextmanager
from fastapi import FastAPI, File, UploadFile, HTTPException, Form, BackgroundTasks, Request
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict
import trimesh
import cv2
import numpy as np
from sklearn.cluster import KMeans

from analysis import (
    process_uploaded_file,
    analyze_file,
    export_colored_preview_glb,
    COLORED_PREVIEW_FACE_LIMIT,
    skipped_preview_status_message,
    reliable_volume_cm3,
    ALL_SUPPORTED_EXTENSIONS,
    INSTANT_3D_EXTENSIONS,
    INSTANT_MESH_EXTENSIONS,
    INSTANT_CAD_EXTENSIONS,
    ARCHIVE_EXTENSIONS,
    UnsupportedFileType,
)
from pricing import calculate_price, calculate_price_from_slicer, MATERIALS
from storage import upload_file_to_r2, get_file_url, download_file_from_r2, save_production_3mf_file
from slicer import (
    convert_step_to_stl,
    run_slicer,
    slice_result_from_bambu_stats,
    slice_result_from_geometry,
    validated_bambu_slice_stats,
)
from orientation import auto_orient_mesh
from packager_3mf import generate_production_3mf, sanitize_filename
from db import get_db_connection
from db_setup import ensure_oms_schema, ensure_products_on_startup
from orders_api import router as orders_router, update_production_file_url
from products_api import router as products_router
from checkout_api import router as checkout_router, webhook_router
from admin_api import router as admin_router

# Katalog cache dla wygenerowanych i zorientowanych siatek STL do szybkiego ponownego cięcia
MODELS_CACHE_DIR = os.path.join(tempfile.gettempdir(), "drukstacja_cache")
os.makedirs(MODELS_CACHE_DIR, exist_ok=True)

# Katalog cache dla wygenerowanych pakietów produkcyjnych .3MF
PROJECTS_3MF_CACHE_DIR = os.path.join(tempfile.gettempdir(), "drukstacja_3mf")
os.makedirs(PROJECTS_3MF_CACHE_DIR, exist_ok=True)

@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Tworzy / seeduje products i schemat OMS. Błąd DB nie wyłącza API."""
    ensure_products_on_startup()
    ensure_oms_schema()
    yield


# Inicjalizacja aplikacji FastAPI
app = FastAPI(title="Drukstacja API", version="0.5.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(orders_router)
app.include_router(products_router)
app.include_router(checkout_router)
app.include_router(webhook_router)
app.include_router(admin_router)

MAX_FILE_SIZE_MB = 100
ALLOWED_EXTENSIONS = ALL_SUPPORTED_EXTENSIONS
CACHED_MODEL_NAME = re.compile(
    r"^[a-fA-F0-9]+_(oriented\.stl|preview\.glb|preview\.(png|jpe?g|webp))$"
)


def _bg_upload_cached(path_to_upload, key, ctype):
    if not path_to_upload or not os.path.exists(path_to_upload):
        return
    try:
        with open(path_to_upload, "rb") as f_up:
            upload_file_to_r2(f_up, key, ctype)
    except Exception as up_err:
        print(f"[WARN] Błąd zapisu w R2 w tle: {up_err}")


def _cached_preview_media_type(name: str) -> str:
    lower = (name or "").lower()
    if lower.endswith(".glb"):
        return "model/gltf-binary"
    if lower.endswith(".stl"):
        return "model/stl"
    if lower.endswith(".png"):
        return "image/png"
    if lower.endswith(".webp"):
        return "image/webp"
    if lower.endswith(".jpg") or lower.endswith(".jpeg"):
        return "image/jpeg"
    return "application/octet-stream"


def _attach_embedded_preview_image(result: dict, unique_id: str, background_tasks: BackgroundTasks) -> None:
    """Zapisuje miniaturę 3MF na dysk i wstawia preview_image_url. Bajty nie idą w JSON."""
    img = result.pop("preview_image", None) if isinstance(result, dict) else None
    if not isinstance(img, dict) or not img.get("bytes"):
        result.setdefault("preview_image_url", None)
        result.setdefault("preview_image_key", None)
        result.setdefault("preview_image_source", None)
        return
    ext = img.get("ext") or ".png"
    if ext not in (".png", ".jpg", ".jpeg", ".webp"):
        ext = ".png"
    mime = img.get("mime") or _cached_preview_media_type(f"preview{ext}")
    cached_name = f"{unique_id}_preview{ext}"
    cached_path = os.path.join(MODELS_CACHE_DIR, cached_name)
    try:
        with open(cached_path, "wb") as f_img:
            f_img.write(img["bytes"])
    except Exception as err:
        print(f"[WARN] Nie udało się zapisać miniatury 3MF: {err}")
        result["preview_image_url"] = None
        result["preview_image_key"] = None
        result["preview_image_source"] = None
        return
    preview_key = f"models/{cached_name}"
    background_tasks.add_task(_bg_upload_cached, cached_path, preview_key, mime)
    result["preview_image_url"] = f"/api/cached-model/{cached_name}"
    result["preview_image_key"] = preview_key
    result["preview_image_source"] = img.get("source")


@app.get("/api/cached-model/{name}")
def serve_cached_model(name: str):
    """Podgląd STL/GLB/miniatury 3MF od razu z dysku, bez czekania na upload do R2."""
    if not CACHED_MODEL_NAME.match(name or ""):
        raise HTTPException(status_code=400, detail="Nieprawidłowa nazwa pliku podglądu.")
    path = os.path.join(MODELS_CACHE_DIR, name)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Podgląd modelu nie jest jeszcze dostępny.")
    media = _cached_preview_media_type(name)
    return FileResponse(path, media_type=media, filename=name)


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
    color_count: int = 1
    support_needed: bool = True
    painted_ratio: float = 0.0
    volume_cm3: float | None = None
    surface_area_cm2: float | None = None
    dimensions_mm: list[float] | None = None
    triangle_count: int | None = None
    scale: float = 1.0


class Generate3MFRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    preview_stl_key: str | None = None
    file_key: str | None = None
    model_key: str | None = None
    order_id: str | None = None
    file_name: str | None = None
    layer_height: Any = 0.20
    nozzle_size: Any = 0.4
    infill: Any = 20
    material: str = "PLA"
    color_hex: str = "#EF4444"
    scale: float = 1.0


def clamp_model_scale(scale) -> float:
    try:
        value = float(scale)
    except (TypeError, ValueError):
        return 1.0
    return max(0.05, min(2.0, value))


def scaled_geometry(volume_cm3, surface_area_cm2, dimensions_mm, scale: float):
    factor = clamp_model_scale(scale)
    dims = None
    if dimensions_mm and len(dimensions_mm) == 3:
        dims = [round(float(v) * factor, 2) for v in dimensions_mm]
    vol = None if volume_cm3 is None else round(float(volume_cm3) * (factor ** 3), 3)
    area = None if surface_area_cm2 is None else round(float(surface_area_cm2) * (factor ** 2), 2)
    return vol, area, dims


def write_scaled_mesh(src_path: str, scale: float) -> str:
    factor = clamp_model_scale(scale)
    if abs(factor - 1.0) < 1e-6:
        return src_path
    loaded = trimesh.load(src_path)
    if isinstance(loaded, trimesh.Scene):
        loaded = loaded.to_geometry()
    loaded.apply_scale(factor)
    tmp = tempfile.NamedTemporaryFile(suffix=".stl", delete=False)
    tmp.close()
    loaded.export(tmp.name, file_type="stl")
    return tmp.name


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


def _clamp_int(value, lo: int, hi: int, default: int) -> int:
    try:
        return max(lo, min(hi, int(value)))
    except (TypeError, ValueError):
        return default


def _clamp_float(value, lo: float, hi: float, default: float) -> float:
    try:
        return max(lo, min(hi, float(value)))
    except (TypeError, ValueError):
        return default


def _working_dim(nozzle_mm: float) -> int:
    """Rozdzielczość robocza: 0.4 mm → 800 px, 0.2 mm → 1600 px (max 2000)."""
    n = _clamp_float(nozzle_mm, 0.15, 0.80, 0.2)
    return int(np.clip(round(800.0 * (0.4 / n)), 800, 2000))


def _wall_dilate_iterations(nozzle_mm: float, long_side: int | None = None) -> int:
    """Bez dylatacji tylko gdy siatka jest gęsta (≈1600 px) i dysza ≤0.25 mm."""
    n = _clamp_float(nozzle_mm, 0.15, 0.80, 0.2)
    if n <= 0.25 and long_side is not None and long_side >= 1400:
        return 0
    if n <= 0.25 and long_side is None:
        return 0
    return 1


def _ellipse_kernel(size: int):
    size = max(1, int(size))
    if size % 2 == 0:
        size += 1
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size, size))


def _denoise_for_quantize(
    bgr: np.ndarray, filter_noise: int, texture: bool = False
) -> np.ndarray:
    """Bilateral + median przed KMeans — gasi ziarno, bez ruszania epsilon konturów.

    texture=True (tylko po drabinie L*): lżejszy blur, żeby sierść nie stała się plamą.
    Globalnie tego nie wolno — na posterze FN=5 wyspy skaczą z ~7 do 150+.
    """
    if texture:
        den = cv2.bilateralFilter(bgr, d=5, sigmaColor=28.0, sigmaSpace=28.0)
        if filter_noise >= 1:
            den = cv2.medianBlur(den, 3)
        return den
    diameter = 5 if filter_noise < 4 else (7 if filter_noise < 8 else 9)
    sigma = 16.0 + 10.0 * filter_noise  # Filter Noise=5 → ~66
    den = cv2.bilateralFilter(bgr, d=diameter, sigmaColor=sigma, sigmaSpace=sigma)
    if filter_noise >= 1:
        k = 3 if filter_noise < 4 else (5 if filter_noise < 8 else 7)
        den = cv2.medianBlur(den, k)
    return den


def _min_region_area(
    filter_noise: int, width: int, height: int, nozzle_mm: float = 0.2
) -> int:
    """Min. wyspa w px. FN=5 @800 ≈ 90 px. Przy faktycznych 1600 px i 0.2 mm też ≈ 90 px (mniej mm²)."""
    long_side = max(width, height)
    res_scale = (long_side / 800.0) ** 2
    px_ref = 5.0 * (filter_noise ** 1.8)
    # Cieńsza dysza zmniejsza próg tylko gdy naprawdę pracujemy na gęstszej siatce
    if long_side >= 1400:
        px_ref *= (_clamp_float(nozzle_mm, 0.15, 0.80, 0.2) / 0.4) ** 2
    area = max(8, int(px_ref * res_scale))
    return area


def count_label_islands(labels: np.ndarray, n_colors: int, max_area: int | None = None) -> int:
    """Liczba spójnych regionów koloru; opcjonalnie tylko mniejszych niż max_area."""
    sil = labels >= 0
    total = 0
    for c_idx in range(n_colors):
        mask = ((labels == c_idx) & sil).astype(np.uint8)
        n_cc, _, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
        for i in range(1, n_cc):
            area = int(stats[i, cv2.CC_STAT_AREA])
            if max_area is None or area < max_area:
                total += 1
    return total


def _smooth_label_map(
    labels: np.ndarray, sil: np.ndarray, filter_noise: int, texture: bool = False
) -> np.ndarray:
    """Median na mapie etykiet — usuwa salt-and-pepper bez mieszania barw."""
    sil_bool = sil.astype(bool)
    if filter_noise < 1:
        out = labels.copy()
        out[~sil_bool] = -1
        return out

    # 5×5 przy FN=5 jak w #29; texture (drabina L*) zostawia kępki 3×3
    if texture:
        k = 3
    else:
        k = 3 if filter_noise < 3 else (5 if filter_noise < 7 else 7)
    work = (labels + 1).astype(np.uint8)  # tło -1 → 0
    blurred = cv2.medianBlur(work, k)
    out = labels.copy()
    accept = sil_bool & (blurred > 0)
    out[accept] = blurred[accept].astype(np.int32) - 1
    out[~sil_bool] = -1
    return out


def _merge_small_regions(
    labels: np.ndarray,
    sil: np.ndarray,
    n_colors: int,
    min_area: int,
    max_passes: int = 4,
) -> np.ndarray:
    """Przypisz drobne wyspy do dominującego sąsiada (Makerlab-like Filter Noise).

    Próg bezwzględny + względny z capem: pepper znika, oko/ucho (~setki px) zostaje.
    """
    cleaned = labels.copy()
    kernel = np.ones((3, 3), np.uint8)
    sil_bool = sil.astype(bool)
    min_area = max(1, int(min_area))
    rel_cap = max(min_area, int(min_area * 2.4))
    for _ in range(max_passes):
        merged_any = False
        largest = []
        for c_idx in range(n_colors):
            mask = ((cleaned == c_idx) & sil_bool).astype(np.uint8)
            _n, _cc, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
            areas = [int(stats[i, cv2.CC_STAT_AREA]) for i in range(1, _n)]
            largest.append(max(areas) if areas else 0)
        for c_idx in range(n_colors):
            mask = ((cleaned == c_idx) & sil_bool).astype(np.uint8)
            n_cc, cc, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
            rel_lim = min(rel_cap, max(min_area, int(0.02 * largest[c_idx])))
            for i in range(1, n_cc):
                area = int(stats[i, cv2.CC_STAT_AREA])
                if area >= rel_lim:
                    continue
                component = cc == i
                ring = cv2.dilate(component.astype(np.uint8), kernel, iterations=1).astype(bool)
                ring &= ~component
                ring &= sil_bool
                neigh = cleaned[ring]
                neigh = neigh[neigh >= 0]
                if neigh.size == 0:
                    continue
                vals, counts = np.unique(neigh, return_counts=True)
                target = int(vals[np.argmax(counts)])
                # Midtones / jasny pysk nie wpadają w najciemniejszą warstwę
                if (
                    n_colors >= 3
                    and target == n_colors - 1
                    and c_idx <= n_colors - 3
                    and area >= min_area * 0.5
                ):
                    continue
                cleaned[component] = target
                merged_any = True
        if not merged_any:
            break
    cleaned[~sil_bool] = -1
    return cleaned


def _layer_fractions(remapped: np.ndarray, n_colors: int) -> list[float]:
    sil_n = float(np.sum(remapped >= 0))
    if sil_n < 1:
        return [0.0] * n_colors
    return [float(np.sum(remapped == i)) / sil_n for i in range(n_colors)]


def _needs_luminance_ladder(fracs: list[float], n_colors: int) -> bool:
    """Czy RGB KMeans oddał twarz dwóm ciemnym warstwom (casus psa / Makerlab)."""
    if n_colors < 3 or len(fracs) < n_colors:
        return False
    pair = fracs[-1] + fracs[-2]
    # Dwie ciemne zjadają podmiot, a jasna baza (pysk/klatka) jest za mała
    return pair > 0.56 and fracs[0] < 0.22


def _assign_luminance_quantiles(bgr: np.ndarray, sil: np.ndarray, n_colors: int) -> np.ndarray:
    """Koszyki L* z lekkim biasem w jasne: czerń zostaje warstwą cech (oczy/nos/uszy).

    x^1.25 przy 4 kolorach ≈ 30/28/25/17 zamiast równych 25%. Równy podział nadal
    zostawiał ciemnobrązową plamę na pysku; Makerlab trzyma czerń na detalach.
    """
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    L = lab[:, :, 0].astype(np.float32)
    sil_bool = sil.astype(bool)
    fg_L = L[sil_bool]
    xs = np.linspace(0.0, 1.0, n_colors + 1)
    pcts = 100.0 * np.power(xs, 1.25)
    edges = np.percentile(fg_L, pcts)
    for i in range(1, len(edges)):
        if edges[i] <= edges[i - 1]:
            edges[i] = edges[i - 1] + 0.5
    out = np.full(L.shape, -1, dtype=np.int32)
    for i in range(n_colors):
        lo = edges[n_colors - 1 - i]
        hi = edges[n_colors - i]
        if i == 0:
            sel = sil_bool & (L >= lo)
        elif i == n_colors - 1:
            sel = sil_bool & (L < hi)
        else:
            sel = sil_bool & (L >= lo) & (L < hi)
        out[sel] = i
    out[~sil_bool] = -1
    return out


def _collapse_near_duplicate_clusters(
    centers: np.ndarray,
    remapped: np.ndarray,
    n_colors: int,
    max_lab_dist: float,
) -> np.ndarray:
    """Złącz klastry o niemal tym samym kolorze, żeby dwa odcienie czerni nie sypały się w wyspy."""
    if n_colors < 2 or max_lab_dist <= 0:
        return remapped
    bgr = np.clip(centers.reshape(-1, 1, 3), 0, 255).astype(np.uint8)
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(np.float32)
    counts = [int(np.sum(remapped == i)) for i in range(n_colors)]
    parent = list(range(n_colors))

    def find(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for i in range(n_colors):
        for j in range(i + 1, n_colors):
            if float(np.linalg.norm(lab[i] - lab[j])) >= max_lab_dist:
                continue
            ia, ja = find(i), find(j)
            if ia == ja:
                continue
            if counts[ia] < counts[ja]:
                ia, ja = ja, ia
            parent[ja] = ia

    out = remapped.copy()
    for i in range(n_colors):
        root = find(i)
        if root != i:
            out[remapped == i] = root
    return out


def _etch_lighter_boundaries(
    labels: np.ndarray, sil: np.ndarray, n_colors: int, min_component: int = 80
) -> np.ndarray:
    """1 px ciemniejszej krawędzi dużych plam → jaśniejszy sąsiad (mozaika, bez dziur).

    Małych kępek nie ruszamy — obrys 1 px rozrywał je w pieprz.
    """
    sil_bool = sil.astype(bool)
    work = labels.copy()
    large = np.zeros(work.shape, dtype=bool)
    for c_idx in range(n_colors):
        mask = ((work == c_idx) & sil_bool).astype(np.uint8)
        n_cc, cc, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
        for i in range(1, n_cc):
            if int(stats[i, cv2.CC_STAT_AREA]) >= min_component:
                large[cc == i] = True
    neigh_min = np.full(work.shape, n_colors + 8, dtype=np.int32)
    for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        rolled = np.roll(np.roll(work, dy, axis=0), dx, axis=1)
        valid = sil_bool.copy()
        if dy == -1:
            valid[-1, :] = False
        elif dy == 1:
            valid[0, :] = False
        if dx == -1:
            valid[:, -1] = False
        elif dx == 1:
            valid[:, 0] = False
        valid &= rolled >= 0
        neigh_min = np.where(valid, np.minimum(neigh_min, rolled), neigh_min)
    edge = sil_bool & large & (work >= 0) & (neigh_min < work)
    work[edge] = neigh_min[edge]
    work[~sil_bool] = -1
    return work


def _approx_epsilon(contour, detail: int, tight: bool = False) -> float:
    """Detail=10 = stary pipeline (0.0010 * peri). Niższy detail grubiej upraszcza, z capem w px."""
    peri = float(cv2.arcLength(contour, True))
    d = max(1, min(10, int(detail)))
    frac = 0.0010 + (10 - d) * 0.0007  # 10→0.0010, 1→0.0073
    cap = 1.15 + (10 - d) * 0.35  # 10→1.15px, żeby duże plamy nie stały się drzazgami
    if tight:
        cap = min(cap, 0.85)
    return min(cap, max(0.25, frac * peri))


def _is_needle_polygon(pts: np.ndarray, min_area: int) -> bool:
    """Odrzuć cienkie igły / drzazgi po approx, nie ruszając większych realnych kształtów."""
    if len(pts) < 3:
        return True
    cnt = np.ascontiguousarray(pts.reshape(-1, 1, 2), dtype=np.float32)
    area = float(cv2.contourArea(cnt))
    peri = float(cv2.arcLength(cnt, True))
    if peri <= 1e-6:
        return True
    compactness = (4.0 * np.pi * area) / (peri * peri)
    return compactness < 0.06 and area < max(80.0, float(min_area) * 2.5)


def image_to_quantized_svg(
    image_bytes: bytes,
    n_colors: int = 4,
    keep_bg: bool = False,
    filter_noise: int = 5,
    detail: int = 10,
    nozzle_mm: float = 0.2,
    _debug: bool = False,
):
    """
    Wektoryzacja pod wielokolorowe breloki (Makerlab-like):
    1. Segmentacja AI / GrabCut (bez zmian w logice wycinania).
    2. Rozdzielczość robocza zależy od dyszy: 0.2 mm → 1600 px, 0.4 mm → 800 px.
    3. RGB KMeans; drabina L* tylko gdy dwie ciemne warstwy zjadają pysk (casus Makerlab).
    4. Po drabinie: lżejszy denoise / merge, 1 px obrys w jaśniejszy sąsiad (sierść, nie sól).
    5. Denoise + scalanie wysp (Filter Noise); midtones nie wpadają w najciemniejszą warstwę.
    6. Brak dylatacji ścianek przy dyszy ≤0.25 mm (stary kernel 3×3 był pod 0.4 mm).
    7. Detail=10 = 0.0010*peri z capem ~1.15 px (0.85 px przy drabinie — kępki futra).
    """
    n_colors = max(2, min(6, n_colors))
    filter_noise = _clamp_int(filter_noise, 0, 10, 5)
    detail = _clamp_int(detail, 1, 10, 10)
    nozzle_mm = _clamp_float(nozzle_mm, 0.15, 0.80, 0.2)

    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError("Błąd odczytu grafiki.")

    if len(img.shape) == 3 and img.shape[2] == 4:
        bgr = img[:, :, :3]
    else:
        bgr = img if len(img.shape) == 3 else cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)

    h, w = bgr.shape[:2]
    native = max(h, w)
    wanted = _working_dim(nozzle_mm)
    if native >= wanted:
        target_dim = wanted
    else:
        target_dim = min(wanted, max(native * 2, 800))
    scale = target_dim / native
    new_w, new_h = max(int(w * scale), 1), max(int(h * scale), 1)
    # AREA przy downscale i przy dużym upscale (sól/pieprz nie rośnie do wysp 90 px)
    if scale < 1.0 or scale > 1.35:
        interp = cv2.INTER_AREA
    else:
        interp = cv2.INTER_LINEAR
    bgr_resized = cv2.resize(bgr, (new_w, new_h), interpolation=interp)

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

    # 3. DENOISE + KWANTYZACJA KMEANS POSORTOWANA PO LUMINANCJI
    denoised = _denoise_for_quantize(bgr_resized, filter_noise)
    fg_pixels = denoised[sil].reshape(-1, 3)
    if len(fg_pixels) < n_colors * 10:
        sil = np.ones((new_h, new_w), dtype=bool)
        sil_u8 = np.full((new_h, new_w), 255, dtype=np.uint8)

    fg_pixels = denoised[sil].reshape(-1, 3)
    if len(fg_pixels) > 900_000:
        sample_idx = np.random.RandomState(42).choice(len(fg_pixels), 280_000, replace=False)
        kmeans = KMeans(n_clusters=n_colors, random_state=42, n_init=5).fit(fg_pixels[sample_idx])
        fg_labels = kmeans.predict(fg_pixels)
    else:
        kmeans = KMeans(n_clusters=n_colors, random_state=42, n_init=5).fit(fg_pixels)
        fg_labels = kmeans.labels_
    centers = kmeans.cluster_centers_.astype(int)
    brightness = [0.299 * c[2] + 0.587 * c[1] + 0.114 * c[0] for c in centers]
    sorted_order = np.argsort(brightness)[::-1]
    centers = centers[sorted_order]
    raw = np.full((new_h, new_w), -1, dtype=int)
    raw[sil] = fg_labels
    remapped = np.full((new_h, new_w), -1, dtype=int)
    for new_idx, old_cluster in enumerate(sorted_order):
        remapped[raw == old_cluster] = new_idx
    rebalanced = False
    texture_src = denoised
    fr0 = _layer_fractions(remapped, n_colors)
    if _needs_luminance_ladder(fr0, n_colors):
        texture_src = _denoise_for_quantize(bgr_resized, filter_noise, texture=True)
        remapped = _assign_luminance_quantiles(texture_src, sil, n_colors)
        rebalanced = True
        for i in range(n_colors):
            pix = texture_src[remapped == i]
            if len(pix) > 0:
                centers[i] = np.mean(pix, axis=0).astype(int)

    remapped = _smooth_label_map(remapped, sil, filter_noise, texture=rebalanced)
    # Filter Noise=5 → ΔE_Lab ≈ 11: tylko niemal identyczne czernie, nie beż z brązem
    remapped = _collapse_near_duplicate_clusters(
        centers, remapped, n_colors, max_lab_dist=8.0 + filter_noise * 0.6
    )
    fr = _layer_fractions(remapped, n_colors)
    if _needs_luminance_ladder(fr, n_colors):
        texture_src = _denoise_for_quantize(bgr_resized, filter_noise, texture=True)
        remapped = _assign_luminance_quantiles(texture_src, sil, n_colors)
        rebalanced = True
    min_area = _min_region_area(filter_noise, new_w, new_h, nozzle_mm=nozzle_mm)
    if rebalanced:
        # ~0.4 mm kępka przy 1600 px / 100 mm; pieprz nadal znika
        min_area = max(20, int(min_area * 0.45))
    remapped = _merge_small_regions(remapped, sil, n_colors, min_area)
    if rebalanced:
        remapped = _etch_lighter_boundaries(
            remapped, sil, n_colors, min_component=max(80, min_area * 2)
        )
        # Obrys może odłamać 1 px — zbierz pieprz, nie kępki
        remapped = _merge_small_regions(
            remapped, sil, n_colors, max(16, min_area // 2), max_passes=2
        )

    # Kolory z oczyszczonych regionów (puste klastry zachowują środek KMeans)
    for i in range(n_colors):
        pix = denoised[remapped == i]
        if len(pix) > 0:
            centers[i] = np.mean(pix, axis=0).astype(int)

    hex_colors = [
        f"#{centers[i][2]:02x}{centers[i][1]:02x}{centers[i][0]:02x}".upper()
        for i in range(n_colors)
    ]

    # 4. MASKI WARSTW: przy 0.2 mm bez dylatacji 0.4 mm (kernel 3×3 zjada oczy / krawędzie)
    kernel_wall = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    kernel_open = _ellipse_kernel(2)
    dilate_iters = _wall_dilate_iterations(nozzle_mm, long_side=max(new_w, new_h))
    layer_masks = []

    for c_idx in range(n_colors):
        m = (remapped == c_idx).astype(np.uint8) * 255
        # 2×2 open gładzi kępki sierści; po drabinie L* zostawiamy ząbek Makerlab
        if not rebalanced:
            m = cv2.morphologyEx(m, cv2.MORPH_OPEN, kernel_open)
        if dilate_iters > 0:
            m = cv2.dilate(m, kernel_wall, iterations=dilate_iters)
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

        contours, hierarchy = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
        if not contours or hierarchy is None:
            continue

        hier = hierarchy[0]
        compound_paths = []
        min_contour = max(8 if rebalanced else 15, int(min_area * 0.25))
        min_hole = max(6, int(min_area * 0.12))

        for i in range(len(contours)):
            if hier[i][3] != -1:
                continue  # Pomiń otwory na poziomie głównym (są przetwarzane w rodzicu)

            cnt = contours[i]
            # Eliminacja okruchów, które nie mają przyczepności i łamią się pod dyszą
            if cv2.contourArea(cnt) < min_contour:
                continue

            approx = cv2.approxPolyDP(cnt, _approx_epsilon(cnt, detail, tight=rebalanced), True)
            pts = approx.reshape(-1, 2)
            if len(pts) < 3 or _is_needle_polygon(pts, min_area):
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
                if cv2.contourArea(hole_cnt) >= min_hole:
                    hole_approx = cv2.approxPolyDP(
                        hole_cnt, _approx_epsilon(hole_cnt, detail, tight=rebalanced), True
                    )
                    hole_pts = hole_approx.reshape(-1, 2)
                    if len(hole_pts) >= 3 and not _is_needle_polygon(hole_pts, min_area):
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
    svg = "".join(svg_parts)
    if _debug:
        n_islands = count_label_islands(remapped, n_colors)
        n_small = count_label_islands(remapped, n_colors, max_area=max(50, min_area))
        preview = np.full((new_h, new_w, 3), 255, dtype=np.uint8)
        for i in range(n_colors):
            preview[remapped == i] = centers[i]
        return svg, hex_colors, {
            "remapped": remapped,
            "preview_bgr": preview,
            "min_area": min_area,
            "islands": n_islands,
            "small_islands": n_small,
            "working_dim": int(target_dim),
            "nozzle_mm": float(nozzle_mm),
            "wall_dilate": int(dilate_iters),
            "rebalanced": bool(rebalanced),
            "darkest_frac": float(_layer_fractions(remapped, n_colors)[-1]),
            "layer_fracs": _layer_fractions(remapped, n_colors),
        }
    return svg, hex_colors




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
    n_colors: str = Form("4"),
    filter_noise: str = Form("5"),
    detail: str = Form("10"),
    nozzle_mm: str = Form("0.2"),
):
    """Wektoryzacja konturów pod breloki (domyślnie dysza 0.2 mm → 1600 px roboczych).

    filter_noise (0-10) i detail (1-10) jak Makerlab. nozzle_mm steruje rozdzielczością
    i dylatacją ścianek (0.2 = bez pogrubiania pod 0.4 mm).
    """
    try:
        should_keep_bg = keep_bg.lower() in ("true", "1", "yes")
        num_colors = max(2, min(6, int(n_colors)))
        noise = _clamp_int(filter_noise, 0, 10, 5)
        det = _clamp_int(detail, 1, 10, 10)
        nozzle = _clamp_float(nozzle_mm, 0.15, 0.80, 0.2)
        contents = await file.read()
        svg_result, detected_colors = image_to_quantized_svg(
            contents,
            n_colors=num_colors,
            keep_bg=should_keep_bg,
            filter_noise=noise,
            detail=det,
            nozzle_mm=nozzle,
        )
        return {
            "svg": svg_result,
            "detected_colors": detected_colors
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Błąd wektoryzacji: {str(e)}")
def _apply_slicer_quote_to_result(
    result: dict,
    slice_data: dict,
    *,
    layer_height: float,
    nozzle_size: float,
    infill: int,
    filament_type: str,
    preview_skipped: bool,
    from_slice_info: bool,
) -> None:
    result["slicer_engine"] = slice_data.get("engine")
    result["quote_source"] = slice_data.get("engine")
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
    result["flush_cm3"] = slice_data.get("flush_cm3") or 0
    result["support_cm3"] = slice_data.get("support_cm3") or 0
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
    result["quote_ready"] = True
    result["instant_pricing"] = True
    if (
        preview_skipped
        and not result.get("preview_stl_url")
        and not result.get("preview_glb_url")
    ):
        result["preview_skipped"] = True
        result["message"] = skipped_preview_status_message(
            True,
            bool(result.get("preview_image_url")),
            from_slice_info=from_slice_info,
        )
    elif from_slice_info:
        base_msg = result.get("message") or ""
        if "ze slicera 3MF" not in base_msg:
            result["message"] = (
                f"{base_msg} Waga i czas ze slicera 3MF.".strip()
                if base_msg
                else "Waga i czas ze slicera 3MF."
            )


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
        _attach_embedded_preview_image(result, unique_id, background_tasks)

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

            colored_mesh = result.pop("colored_mesh", None)
            skip_colored_preview = bool(result.get("skipped_colored_preview"))
            preview_skipped = bool(result.get("preview_skipped") or result.get("skipped_geometry"))

            bambu_stats = validated_bambu_slice_stats(
                ((result.get("file_profile") or {}).get("slice_stats"))
            )

            file_profile = result.get("file_profile") or {}
            if file_profile.get("layer_height"):
                layer_height = float(file_profile["layer_height"])
            if file_profile.get("nozzle_size"):
                nozzle_size = float(file_profile["nozzle_size"])
            if file_profile.get("infill") is not None:
                infill = int(file_profile["infill"])
            if file_profile.get("filament_types"):
                filament_type = str(file_profile["filament_types"][0])

            quoted_from_bambu = False
            if (
                bambu_stats
                and result.get("instant_pricing") is True
                and not result.get("skipped_geometry")
            ):
                # Pocięty 3MF: waga/czas z Bambu. STL/GLB/orientacja zjadały ~60 s proxy
                # zanim wycena wróciła — Lampara i Photoset padały na RFQ (Failed to fetch).
                print("[INFO] Wycena ze slice_info Bambu — pomijam orientację i eksport STL/GLB.")
                result["preview_glb_url"] = None
                result["preview_glb_key"] = None
                result["preview_stl_key"] = None
                result["preview_stl_url"] = None
                result["orientation"] = None
                preview_skipped = True
                result["preview_skipped"] = True
                color_count = int(
                    result.get("color_count")
                    or len(result.get("filament_colours") or [])
                    or bambu_stats.get("color_count")
                    or 1
                )
                result["color_count"] = color_count
                slice_data = slice_result_from_bambu_stats(
                    bambu_stats,
                    infill=int(infill),
                    layer_height=float(layer_height),
                    filament_type=filament_type,
                    nozzle_size=float(nozzle_size),
                )
                _apply_slicer_quote_to_result(
                    result,
                    slice_data,
                    layer_height=layer_height,
                    nozzle_size=nozzle_size,
                    infill=infill,
                    filament_type=filament_type,
                    preview_skipped=True,
                    from_slice_info=True,
                )
                quoted_from_bambu = True
                raw_mesh = None
                colored_mesh = None

            if raw_mesh is None and result.get("instant_pricing") is True and not quoted_from_bambu:
                # Bez siatki i bez wiarygodnej slice_info: RFQ.
                # Pusta płyta + leftover 16 g to nie zamówienie.
                result["instant_pricing"] = False
                result["quote_ready"] = False
                result["preview_skipped"] = True
                result["preview_glb_url"] = None
                result["preview_stl_url"] = None
                result["message"] = skipped_preview_status_message(
                    False, bool(result.get("preview_image_url"))
                )

            if (
                raw_mesh is not None
                and not quoted_from_bambu
                and bambu_stats is None
                and reliable_volume_cm3(result.get("volume_cm3")) is None
            ):
                result["instant_pricing"] = False
                result["quote_ready"] = False
                result["volume_cm3"] = None
                result["preview_skipped"] = bool(
                    result.get("preview_skipped") or skip_colored_preview or preview_skipped
                )
                if result.get("preview_skipped"):
                    result["message"] = skipped_preview_status_message(
                        False, bool(result.get("preview_image_url"))
                    )

            if raw_mesh is not None and result.get("instant_pricing") is True and not quoted_from_bambu:
                try:
                    dense_preview = int(result.get("triangle_count") or len(raw_mesh.faces) or 0) >= COLORED_PREVIEW_FACE_LIMIT
                    skip_preview_export = bool(dense_preview or preview_skipped)
                    oriented_mesh, orientation_info = auto_orient_mesh(raw_mesh)
                    oriented_stl_path = os.path.join(tmp_dir, f"{unique_id}_oriented.stl")
                    result["orientation"] = orientation_info
                    result["preview_glb_url"] = None
                    result["preview_glb_key"] = None
                    result["preview_stl_key"] = None
                    result["preview_stl_url"] = None

                    if skip_preview_export:
                        print(
                            f"[INFO] Gęsta siatka ({result.get('triangle_count')} ścianek) "
                            "— pomijam eksport STL/GLB podglądu, wycena z slice_info albo geometrii."
                        )
                        colored_mesh = None
                        preview_skipped = True
                        result["preview_skipped"] = True
                    else:
                        oriented_mesh.export(oriented_stl_path)
                        preview_stl_key = f"models/{unique_id}_oriented.stl"
                        cached_stl_name = f"{unique_id}_oriented.stl"
                        cached_path = os.path.join(MODELS_CACHE_DIR, cached_stl_name)
                        try:
                            shutil.copyfile(oriented_stl_path, cached_path)
                        except Exception as c_err:
                            print(f"[WARN] Błąd zapisu do lokalnego cache: {c_err}")
                            cached_path = oriented_stl_path

                        background_tasks.add_task(
                            _bg_upload_cached, cached_path, preview_stl_key, "model/stl"
                        )
                        result["preview_stl_key"] = preview_stl_key
                        result["preview_stl_url"] = f"/api/cached-model/{cached_stl_name}"

                        # Podgląd GLB z kolorami AMS — pomijany na gęstych 3MF (Jaguar),
                        # bo split + normalne zjada limit czasu / RAM i zrywa fetch.
                        preview_face_count = int(
                            result.get("triangle_count")
                            or len(getattr(colored_mesh, "faces", []) or [])
                            or 0
                        )
                        if (
                            colored_mesh is not None
                            and not skip_colored_preview
                            and preview_face_count < COLORED_PREVIEW_FACE_LIMIT
                        ):
                            try:
                                matrix = orientation_info.get("matrix")
                                preview_colored = colored_mesh.copy()
                                if matrix:
                                    preview_colored.apply_transform(np.array(matrix, dtype=float))
                                glb_path = os.path.join(tmp_dir, f"{unique_id}_preview.glb")
                                export_colored_preview_glb(preview_colored, glb_path)
                                cached_glb_name = f"{unique_id}_preview.glb"
                                cached_glb = os.path.join(MODELS_CACHE_DIR, cached_glb_name)
                                try:
                                    shutil.copyfile(glb_path, cached_glb)
                                except Exception:
                                    cached_glb = glb_path
                                preview_glb_key = f"models/{unique_id}_preview.glb"
                                background_tasks.add_task(
                                    _bg_upload_cached,
                                    cached_glb,
                                    preview_glb_key,
                                    "model/gltf-binary",
                                )
                                result["preview_glb_key"] = preview_glb_key
                                result["preview_glb_url"] = f"/api/cached-model/{cached_glb_name}"
                                result["has_file_colors"] = True
                            except Exception as glb_err:
                                print(f"[WARN] Nie udało się wyeksportować kolorowego podglądu GLB: {glb_err}")
                        elif colored_mesh is not None:
                            print(
                                f"[INFO] Pomijam eksport GLB ({preview_face_count} ścianek) "
                                "— analiza i wycena z geometrii idą dalej."
                            )
                            preview_skipped = True
                            result["preview_skipped"] = True
                    # Liczba slotow AMS i gestosc malowania - NIE zalezna od tego,
                    # czy GLB wrocil (to tylko podglad). Wycena musi doliczyc plykanie.
                    color_count = int(
                        result.get("color_count")
                        or len(result.get("filament_colours") or [])
                        or 1
                    )
                    painted_ratio = float(result.get("painted_ratio") or 0.0)
                    result["color_count"] = color_count
                    result["painted_ratio"] = painted_ratio

                    result["has_file_colors"] = bool(
                        result.get("has_file_colors") or result.get("preview_glb_url")
                    )

                    # STL / STEP / 3MF bez slice_info: geometria albo Prusa.
                    # Nigdy: volume_cm3==0 → estymator (historyczne fałszywe 16 g).
                    try:
                        vol = reliable_volume_cm3(result.get("volume_cm3"))
                        if skip_preview_export and vol:
                            slice_data = slice_result_from_geometry(
                                volume_cm3=float(vol),
                                surface_area_cm2=float(result.get("surface_area_cm2") or 0.0),
                                dimensions_mm=result.get("dimensions_mm"),
                                infill=int(infill),
                                layer_height=float(layer_height),
                                filament_type=filament_type,
                                nozzle_size=float(nozzle_size),
                                color_count=color_count,
                                support_needed=True,
                                painted_ratio=painted_ratio,
                            )
                        elif vol or not skip_preview_export:
                            slice_data = run_slicer(
                                oriented_stl_path,
                                infill=int(infill),
                                layer_height=float(layer_height),
                                nozzle_size=float(nozzle_size),
                                filament_type=filament_type,
                                color_count=color_count,
                                support_needed=True,
                                painted_ratio=painted_ratio,
                                triangle_count=result.get("triangle_count"),
                                volume_cm3=result.get("volume_cm3"),
                                surface_area_cm2=result.get("surface_area_cm2"),
                                dimensions_mm=result.get("dimensions_mm"),
                            )
                        else:
                            raise RuntimeError("Brak slice_info i wiarygodnej objętości — bez wyceny.")
                        _apply_slicer_quote_to_result(
                            result,
                            slice_data,
                            layer_height=layer_height,
                            nozzle_size=nozzle_size,
                            infill=infill,
                            filament_type=filament_type,
                            preview_skipped=preview_skipped,
                            from_slice_info=slice_data.get("engine") == "bambu-slice-info",
                        )
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
                    result["preview_glb_key"] = None
                    result["preview_glb_url"] = None
                    result["orientation"] = None
                    result.pop("colored_mesh", None)

        # 4. Przypadek B: Dokument RFQ (Rysunek 2D, PCB Gerber, CAD BIM itp.)
        if result.get("instant_pricing") is not True:
            result["instant_pricing"] = False
            result["quote_ready"] = False
            result["type"] = "rfq_document"
            result["preview_stl_key"] = None
            result["preview_stl_url"] = None
            result["preview_glb_key"] = None
            result["preview_glb_url"] = None
            result["orientation"] = None
            result["print_time_exact"] = None
            result["filament_weight_g"] = None
            result["filament_weight_g_exact"] = None
            result["has_supports"] = False
            result["support_lines"] = []
            result["price_breakdown"] = None
            result["unit_price"] = None
            if result.get("preview_skipped") or result.get("skipped_geometry"):
                result["preview_skipped"] = True
                result["volume_cm3"] = None
                result["message"] = skipped_preview_status_message(
                    False, bool(result.get("preview_image_url"))
                )

        result.pop("mesh_object", None)
        result.pop("colored_mesh", None)
        result.pop("mesh_source_path", None)
        result.pop("preview_image", None)
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

    scale = clamp_model_scale(req.scale)
    volume_cm3, surface_area_cm2, dimensions_mm = scaled_geometry(
        req.volume_cm3, req.surface_area_cm2, req.dimensions_mm, scale
    )
    scaled_stl = local_cached
    if abs(scale - 1.0) >= 1e-6:
        try:
            scaled_stl = write_scaled_mesh(local_cached, scale)
        except Exception as scale_err:
            print(f"[WARN] Nie udało się przeskalować siatki: {scale_err}")
            scaled_stl = local_cached

    slice_data = run_slicer(
        stl_path=scaled_stl,
        infill=int(req.infill),
        layer_height=float(req.layer_height),
        nozzle_size=float(req.nozzle_size),
        filament_type=req.filament_type,
        color_count=int(req.color_count or 1),
        support_needed=bool(req.support_needed),
        painted_ratio=float(req.painted_ratio or 0.0),
        triangle_count=req.triangle_count,
        volume_cm3=volume_cm3,
        surface_area_cm2=surface_area_cm2,
        dimensions_mm=dimensions_mm,
    )
    if scaled_stl != local_cached:
        try:
            os.remove(scaled_stl)
        except OSError:
            pass

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
        "flush_cm3": slice_data.get("flush_cm3") or 0,
        "support_cm3": slice_data.get("support_cm3") or 0,
        "price_breakdown": price_info,
        "unit_price": price_info["unit_price_pln"],
        "total_price": price_info["total_price_pln"],
        "scale": scale,
        "volume_cm3": volume_cm3,
        "surface_area_cm2": surface_area_cm2,
        "dimensions_mm": dimensions_mm,
    }


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
    key = req.preview_stl_key or req.file_key or req.model_key
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

    # Sprawdzenie czy dla tego zamówienia istnieją zapisane części wielomateriałowe AMS
    clean_prefix = order_id[:8]
    cached_parts = None
    parts_meta_file = os.path.join(MODELS_CACHE_DIR, f"ORDER_{clean_prefix}_parts.json")
    if os.path.exists(parts_meta_file):
        try:
            with open(parts_meta_file, "r", encoding="utf-8") as f_meta:
                cached_parts = json.load(f_meta)
        except Exception as meta_err:
            print(f"[WARN] Błąd odczytu {parts_meta_file}: {meta_err}")

    scale = clamp_model_scale(getattr(req, "scale", 1.0))
    scaled_model = local_model
    if abs(scale - 1.0) >= 1e-6:
        try:
            scaled_model = write_scaled_mesh(local_model, scale)
        except Exception as scale_err:
            print(f"[WARN] Skala 3MF: {scale_err}")
            scaled_model = local_model

    # Generowanie .3MF
    generate_production_3mf(
        model_path=scaled_model,
        order_metadata={"order_id": order_id, "file_name": file_name},
        print_settings={
            "layer_height": clean_layer_height,
            "nozzle_size": clean_nozzle_size,
            "infill": clean_infill,
            "material": req.material,
            "color_hex": req.color_hex,
        },
        parts=cached_parts,
        output_path=local_3mf_path,
    )

    r2_key = f"production_packages/{target_3mf_name}"
    production_url = save_production_3mf_file(local_3mf_path, r2_key)

    if req.order_id:
        update_production_file_url(req.order_id, production_url)

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
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile | None = File(None),
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
    Przyjmuje wyeksportowane ze sceny Three.js części STL (Multi-part AMS) lub pojedynczy plik STL,
    zapisuje je w pamięci trwałej i R2, oraz natychmiast generuje zunifikowany pakiet produkcyjny
    .3MF w standardzie Bambu Studio / OrcaSlicer z kompletnym podziałem na kolory.
    """
    clean_order_id = str(order_id)
    clean_prefix = clean_order_id[:8]
    safe_file_name = sanitize_filename(Path(file_name or (file.filename if file else "keychain.stl")).stem)
    target_stl_name = f"ORDER_{clean_prefix}_{safe_file_name}.stl"
    local_stl_path = os.path.join(MODELS_CACHE_DIR, target_stl_name)

    # 1. Zapis połączonego pliku STL (jeśli przesłano)
    if file:
        content = await file.read()
        with open(local_stl_path, "wb") as f_out:
            f_out.write(content)

        r2_model_key = f"models/{target_stl_name}"
        def _bg_upload_stl(path, key):
            try:
                with open(path, "rb") as f_up:
                    upload_file_to_r2(f_up, key, "application/octet-stream")
            except Exception as up_err:
                print(f"[WARN] Błąd zapisu STL breloka w R2: {up_err}")

        background_tasks.add_task(_bg_upload_stl, local_stl_path, r2_model_key)

    # 2. Obsługa wieloczęściowych siatek AMS (files + colors LUB parts_files + parts_json + stl_base64)
    form = await request.form()
    parts_json_raw = form.get("parts_json")
    parts_files_list = form.getlist("parts_files")
    uploaded_files = form.getlist("files")
    raw_colors = form.get("colors")
    raw_metadata = form.get("metadata")

    parsed_metadata = []
    if raw_metadata:
        try:
            parsed_metadata = json.loads(raw_metadata)
            if not isinstance(parsed_metadata, list):
                parsed_metadata = []
        except Exception as meta_err:
            print(f"[WARN] Błąd parsowania metadata w upload-geometry: {meta_err}")

    parsed_colors = []
    if raw_colors:
        try:
            parsed_colors = json.loads(raw_colors)
            if not isinstance(parsed_colors, list):
                parsed_colors = [str(raw_colors)]
        except Exception:
            parsed_colors = [c.strip().strip('"') for c in str(raw_colors).replace("[", "").replace("]", "").split(",") if c.strip()]

    parts_list = []

    if uploaded_files:
        for idx, ufile in enumerate(uploaded_files):
            if hasattr(ufile, "read"):
                meta_item = None
                if parsed_metadata:
                    if idx < len(parsed_metadata):
                        meta_item = parsed_metadata[idx]
                    for m in parsed_metadata:
                        if m.get("fileName") == ufile.filename:
                            meta_item = m
                            break

                part_name = (meta_item.get("name") if meta_item else None) or (
                    Path(ufile.filename).stem if (hasattr(ufile, "filename") and ufile.filename) else f"Part_{idx+1}"
                )
                part_color = (meta_item.get("color") if meta_item else None) or (
                    parsed_colors[idx] if idx < len(parsed_colors) else color_hex
                )
                safe_pname = sanitize_filename(part_name)
                target_part_name = f"ORDER_{clean_prefix}_part_{idx+1}_{safe_pname}.stl"
                local_part_path = os.path.join(MODELS_CACHE_DIR, target_part_name)

                try:
                    p_bytes = await ufile.read()
                    if p_bytes and len(p_bytes) > 0:
                        with open(local_part_path, "wb") as f_out:
                            f_out.write(p_bytes)
                        parts_list.append({
                            "name": part_name,
                            "color_hex": part_color,
                            "path": local_part_path,
                            "role": meta_item.get("role", "part") if meta_item else "part",
                            "extruder": meta_item.get("extruder") or meta_item.get("slot") if meta_item else None,
                            "filament": meta_item.get("filament") if meta_item else None,
                        })
                except Exception as rf_err:
                    print(f"[WARN] Błąd zapisu części {part_name}: {rf_err}")
    elif parts_json_raw:
        try:
            parts_meta = json.loads(parts_json_raw)
        except Exception as json_err:
            print(f"[WARN] Błąd dekodowania parts_json: {json_err}")
            parts_meta = []

        file_map = {}
        for pf in parts_files_list:
            if hasattr(pf, "filename") and pf.filename:
                file_map[pf.filename] = pf

        for idx, p_meta in enumerate(parts_meta):
            p_name = p_meta.get("name", f"Part_{idx+1}")
            p_color = p_meta.get("color", color_hex)
            p_role = p_meta.get("role", "")
            safe_pname = sanitize_filename(p_name)
            target_part_name = f"ORDER_{clean_prefix}_part_{idx}_{safe_pname}.stl"
            local_part_path = os.path.join(MODELS_CACHE_DIR, target_part_name)

            p_bytes = None
            if p_meta.get("stl_base64"):
                try:
                    p_bytes = base64.b64decode(p_meta["stl_base64"])
                except Exception as b64_err:
                    print(f"[WARN] Błąd dekodowania base64 dla {p_name}: {b64_err}")

            if not p_bytes:
                fname = p_meta.get("filename")
                pf = file_map.get(fname)
                if not pf and idx < len(parts_files_list):
                    pf = parts_files_list[idx]
                if pf and hasattr(pf, "read"):
                    try:
                        p_bytes = await pf.read()
                    except Exception as rf_err:
                        print(f"[WARN] Błąd odczytu pliku {fname}: {rf_err}")

            if p_bytes and len(p_bytes) > 0:
                with open(local_part_path, "wb") as f_out:
                    f_out.write(p_bytes)
                parts_list.append({
                    "name": p_name,
                    "color_hex": p_color,
                    "path": local_part_path,
                    "role": p_role,
                    "extruder": p_meta.get("extruder") or p_meta.get("slot"),
                    "filament": p_meta.get("filament"),
                })

        # Zapis metadanych części do cache JSON na potrzeby późniejszego pobierania
        if parts_list:
            parts_meta_file = os.path.join(MODELS_CACHE_DIR, f"ORDER_{clean_prefix}_parts.json")
            try:
                with open(parts_meta_file, "w", encoding="utf-8") as f_meta:
                    json.dump(parts_list, f_meta, indent=2)
            except Exception as meta_save_err:
                print(f"[WARN] Błąd zapisu ORDER_{clean_prefix}_parts.json: {meta_save_err}")

    # 3. Generowanie pakietu produkcyjnego .3MF
    safe_mat = sanitize_filename(str(material).split()[0])
    target_3mf_name = f"ORDER_{clean_prefix}_{safe_file_name}_{safe_mat}_{nozzle_size}mm.3mf"
    local_3mf_path = os.path.join(PROJECTS_3MF_CACHE_DIR, target_3mf_name)

    production_url = f"/api/download-3mf-file/{target_3mf_name}"
    try:
        generate_production_3mf(
            model_path=local_stl_path if os.path.exists(local_stl_path) else None,
            order_metadata={"order_id": clean_order_id, "file_name": file_name or target_stl_name},
            print_settings={
                "layer_height": layer_height,
                "nozzle_size": nozzle_size,
                "infill": infill,
                "material": material,
                "color_hex": color_hex,
            },
            output_path=local_3mf_path,
            parts=parts_list if parts_list else None,
        )
        r2_3mf_key = f"production_packages/{target_3mf_name}"
        saved_url = save_production_3mf_file(local_3mf_path, r2_3mf_key)
        if saved_url:
            production_url = saved_url
    except Exception as gen_err:
        print(f"[WARN] Błąd generowania 3MF przy uploadzie geometrii: {gen_err}")

    update_production_file_url(clean_order_id, production_url)

    return {
        "success": True,
        "filename": target_3mf_name,
        "download_url": f"/api/download-3mf-file/{target_3mf_name}",
        "production_file_url": production_url,
    }


@app.post("/api/breloki/generate-direct-3mf")
@app.post("/api/generate-direct-3mf")
async def generate_direct_3mf_endpoint(
    request: Request,
    file: UploadFile | None = File(None),
    files: list[UploadFile] | None = File(None),
    colors: str | None = Form(None),
    metadata: str | None = Form(None),
    filaments: str | None = Form(None),
    file_name: str | None = Form(None),
    material: str = Form("PLA"),
    color_hex: str = Form("#222222"),
    layer_height: float = Form(0.20),
    nozzle_size: float = Form(0.4),
    infill: int = Form(100),
):
    """
    Szybki generator .3MF bezpośrednio dla konfiguratora w przeglądarce.
    Przyjmuje części STL (wieloczęściowy zespół AMS 'files' + 'colors'), generuje plik projektu Bambu i od razu zwraca FileResponse.
    """
    temp_id = uuid.uuid4().hex[:8].upper()
    safe_file_name = sanitize_filename(Path(file_name or "keychain").stem)
    safe_mat = sanitize_filename(str(material).split()[0])
    target_3mf_name = f"BRELOK_{safe_file_name}_{safe_mat}_{nozzle_size}mm.3mf"
    local_3mf_path = os.path.join(PROJECTS_3MF_CACHE_DIR, f"DIRECT_{temp_id}_{target_3mf_name}")

    form = await request.form()
    parts_json_raw = form.get("parts_json")
    parts_files_list = form.getlist("parts_files")

    uploaded_files = list(files) if files else []
    if not uploaded_files:
        raw_files = form.getlist("files")
        for rf in raw_files:
            if hasattr(rf, "read"):
                uploaded_files.append(rf)

    raw_metadata = metadata or form.get("metadata")
    parsed_metadata = []
    if raw_metadata:
        try:
            parsed_metadata = json.loads(raw_metadata)
            if not isinstance(parsed_metadata, list):
                parsed_metadata = []
        except Exception as meta_err:
            print(f"[WARN] Błąd parsowania metadata w generate-direct-3mf: {meta_err}")

    raw_colors = colors or form.get("colors")
    parsed_colors = []
    if raw_colors:
        try:
            parsed_colors = json.loads(raw_colors)
            if not isinstance(parsed_colors, list):
                parsed_colors = [str(raw_colors)]
        except Exception:
            parsed_colors = [c.strip().strip('"') for c in str(raw_colors).replace("[", "").replace("]", "").split(",") if c.strip()]

    raw_filaments = filaments or form.get("filaments")
    parsed_filaments = []
    if raw_filaments:
        try:
            parsed_filaments = json.loads(raw_filaments)
            if not isinstance(parsed_filaments, list):
                parsed_filaments = []
        except Exception:
            pass

    parts_list = []

    if uploaded_files:
        for idx, ufile in enumerate(uploaded_files):
            meta_item = None
            if parsed_metadata:
                if idx < len(parsed_metadata):
                    meta_item = parsed_metadata[idx]
                for m in parsed_metadata:
                    if m.get("fileName") == ufile.filename:
                        meta_item = m
                        break

            part_name = (meta_item.get("name") if meta_item else None) or (
                Path(ufile.filename).stem if (hasattr(ufile, "filename") and ufile.filename) else f"Part_{idx+1}"
            )
            part_color = (meta_item.get("color") if meta_item else None) or (
                parsed_colors[idx] if idx < len(parsed_colors) else color_hex
            )
            safe_pname = sanitize_filename(part_name)
            target_part_name = f"TMP_{temp_id}_part_{idx+1}_{safe_pname}.stl"
            local_part_path = os.path.join(MODELS_CACHE_DIR, target_part_name)

            try:
                if hasattr(ufile, "seek"):
                    await ufile.seek(0)
                p_bytes = await ufile.read()
                if p_bytes and len(p_bytes) > 0:
                    with open(local_part_path, "wb") as f_out:
                        f_out.write(p_bytes)
                    parts_list.append({
                        "name": part_name,
                        "color_hex": part_color,
                        "path": local_part_path,
                        "role": meta_item.get("role", "part") if meta_item else "part",
                        "extruder": meta_item.get("extruder") or meta_item.get("slot") if meta_item else None,
                        "filament": meta_item.get("filament") if meta_item else None,
                    })
            except Exception as rf_err:
                print(f"[WARN] Błąd zapisu pliku części {part_name}: {rf_err}")

    # 2. Fallback na parts_json i parts_files
    elif parts_json_raw:
        try:
            parts_meta = json.loads(parts_json_raw)
        except Exception as json_err:
            print(f"[WARN] Błąd dekodowania parts_json: {json_err}")
            parts_meta = []

        file_map = {}
        for pf in parts_files_list:
            if hasattr(pf, "filename") and pf.filename:
                file_map[pf.filename] = pf

        for idx, p_meta in enumerate(parts_meta):
            p_name = p_meta.get("name", f"Part_{idx+1}")
            p_color = p_meta.get("color", color_hex)
            p_role = p_meta.get("role", "")
            safe_pname = sanitize_filename(p_name)
            target_part_name = f"TMP_{temp_id}_part_{idx}_{safe_pname}.stl"
            local_part_path = os.path.join(MODELS_CACHE_DIR, target_part_name)

            p_bytes = None
            if p_meta.get("stl_base64"):
                try:
                    p_bytes = base64.b64decode(p_meta["stl_base64"])
                except Exception as b64_err:
                    print(f"[WARN] Błąd dekodowania base64 dla {p_name}: {b64_err}")

            if not p_bytes:
                fname = p_meta.get("filename")
                pf = file_map.get(fname)
                if not pf and idx < len(parts_files_list):
                    pf = parts_files_list[idx]
                if pf and hasattr(pf, "read"):
                    try:
                        p_bytes = await pf.read()
                    except Exception as rf_err:
                        print(f"[WARN] Błąd odczytu pliku {fname}: {rf_err}")

            if p_bytes and len(p_bytes) > 0:
                with open(local_part_path, "wb") as f_out:
                    f_out.write(p_bytes)
                parts_list.append({
                    "name": p_name,
                    "color_hex": p_color,
                    "path": local_part_path,
                    "role": p_role,
                    "extruder": p_meta.get("extruder") or p_meta.get("slot"),
                    "filament": p_meta.get("filament"),
                })

    print(f"[3MF DIRECT] Wywołanie generate-direct-3mf dla {file_name}:")
    print(f"   -> uploaded_files liczba: {len(uploaded_files)}")
    print(f"   -> parsed_colors: {parsed_colors}")
    print(f"   -> parts_json_raw obecne: {bool(parts_json_raw)}, długość: {len(parts_json_raw) if parts_json_raw else 0}")
    print(f"   -> parts_files_list liczba plików: {len(parts_files_list)}")
    print(f"   -> Załadowano poprawnych części do projektu: {len(parts_list)}")
    for p in parts_list:
        print(f"      * Część: {p['name']} | Kolor: {p['color_hex']}")

    local_stl_path = None
    if (not parts_list) and file:
        if hasattr(file, "seek"):
            await file.seek(0)
        content = await file.read()
        target_stl_name = f"TMP_{temp_id}_{safe_file_name}.stl"
        local_stl_path = os.path.join(MODELS_CACHE_DIR, target_stl_name)
        with open(local_stl_path, "wb") as f_out:
            f_out.write(content)

    generate_production_3mf(
        model_path=local_stl_path if local_stl_path and os.path.exists(local_stl_path) else None,
        order_metadata={"order_id": temp_id, "file_name": file_name or target_3mf_name},
        print_settings={
            "layer_height": layer_height,
            "nozzle_size": nozzle_size,
            "infill": infill,
            "material": material,
            "color_hex": color_hex,
            "filaments": parsed_filaments if parsed_filaments else None,
        },
        output_path=local_3mf_path,
        parts=parts_list if parts_list else None,
    )

    return FileResponse(
        local_3mf_path,
        media_type="application/vnd.ms-package.3dmanufacturing-3dmodel+xml",
        filename=target_3mf_name,
    )


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
        if db_order.get("nozzle_size"):
            clean_nozzle_size = parse_clean_float(db_order.get("nozzle_size"), clean_nozzle_size)
        else:
            tech_raw = db_order.get("technology")
            if tech_raw and "0.2mm" in str(tech_raw):
                clean_nozzle_size = 0.2
            elif tech_raw and "0.4mm" in str(tech_raw):
                clean_nozzle_size = 0.4

    # 1. Sprawdzenie czy dla tego zamówienia istnieją zapisane części wielomateriałowe (AMS)
    cached_parts = None
    parts_meta_path = os.path.join(MODELS_CACHE_DIR, f"ORDER_{clean_prefix}_parts.json")
    if os.path.exists(parts_meta_path):
        try:
            with open(parts_meta_path, "r", encoding="utf-8") as f_parts:
                loaded_parts = json.load(f_parts)
                if any(os.path.exists(p.get("path", "")) for p in loaded_parts):
                    cached_parts = loaded_parts
        except Exception as e:
            print(f"[WARN] Błąd odczytu {parts_meta_path}: {e}")

    # 2. Odnalezienie pliku źródłowego pojedynczej geometrii (jeśli brak złożenia części)
    local_model = None
    if not cached_parts:
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

        # 3. FALLBACK DLA BRELOKÓW PROCEDURALNYCH:
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

    if not cached_parts and (not local_model or not os.path.exists(local_model)):
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
        parts=cached_parts,
    )

    return FileResponse(
        local_3mf_path,
        media_type="application/vnd.ms-package.3dmanufacturing-3dmodel+xml",
        filename=target_3mf_name,
    )