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

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import trimesh
import cv2
import numpy as np
from sklearn.cluster import KMeans

from analysis import analyze_file, UnsupportedFileType
from pricing import calculate_price, MATERIALS
from storage import upload_file_to_r2, get_file_url
from slicer import convert_step_to_stl, run_slicer
from orientation import auto_orient_mesh

# Inicjalizacja aplikacji FastAPI
app = FastAPI(title="Drukstacja API", version="0.4.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_FILE_SIZE_MB = 100
ALLOWED_EXTENSIONS = {".stl", ".step", ".stp", ".obj"}


class QuoteRequest(BaseModel):
    volume_cm3: float
    bbox_mm: list[float]  # [x, y, z]
    material: str = "PLA"
    quantity: int = 1
    infill_percent: int = 20


REMBG_AVAILABLE = False
REMBG_SESSION = None

try:
    from rembg import remove as rembg_remove, new_session
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
    Zaawansowany algorytm wektoryzacji w stylu MakerWorld:
    1. Inteligentne usuwanie tła (rembg u2netp -> detekcja szachownicy -> FloodFill -> GrabCut).
    2. Zachowanie kluczowych detali: źrenice, błysk oka (catchlights), obrysy, nos.
    3. Hierarchia warstw stacking (Podkład sylwetki -> Ciało -> Ciemne detale -> Błysk).
    """
    n_colors = max(2, min(6, n_colors))

    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError("Błąd odczytu grafiki.")

    target_dim = 400
    if len(img.shape) == 3 and img.shape[2] == 4:
        bgr = img[:, :, :3]
    else:
        bgr = img if len(img.shape) == 3 else cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)

    h, w = bgr.shape[:2]
    scale = target_dim / max(h, w)
    new_w, new_h = max(int(w * scale), 1), max(int(h * scale), 1)
    bgr_resized = cv2.resize(bgr, (new_w, new_h), interpolation=cv2.INTER_AREA)

    # 1. USUWANIE TŁA
    fg_mask = None

    if keep_bg:
        fg_mask = np.ones((new_h, new_w), dtype=bool)
    else:
        # A. Prawdziwa przezroczystość alfa w przesłanym pliku
        if len(img.shape) == 3 and img.shape[2] == 4:
            alpha_raw = img[:, :, 3] > 20
            alpha_ratio = np.sum(alpha_raw) / alpha_raw.size
            if 0.05 < alpha_ratio < 0.98:
                fg_mask = cv2.resize(
                    alpha_raw.astype(np.uint8), (new_w, new_h), interpolation=cv2.INTER_NEAREST
                ).astype(bool)

        # B. Wycięcie przez AI (rembg z modelem u2netp)
        if fg_mask is None and REMBG_AVAILABLE and REMBG_SESSION is not None:
            try:
                cutout_bytes = rembg_remove(image_bytes, session=REMBG_SESSION)
                cutout_arr = np.frombuffer(cutout_bytes, np.uint8)
                cutout_img = cv2.imdecode(cutout_arr, cv2.IMREAD_UNCHANGED)
                if cutout_img is not None and len(cutout_img.shape) == 3 and cutout_img.shape[2] == 4:
                    c_alpha = cutout_img[:, :, 3] > 25
                    alpha_ratio = np.sum(c_alpha) / c_alpha.size
                    if 0.05 < alpha_ratio < 0.95:
                        fg_mask = cv2.resize(
                            c_alpha.astype(np.uint8), (new_w, new_h), interpolation=cv2.INTER_NEAREST
                        ).astype(bool)
            except Exception as _r_err:
                print(f"[WARN] Błąd wycinania rembg: {_r_err}")

        # C. Klasyczny FloodFill + usuwanie szachownicy + connected components
        if fg_mask is None:
            bgr_clean, had_checker = remove_checkerboard_pattern(bgr_resized)
            flood_mask = np.zeros((new_h + 2, new_w + 2), np.uint8)
            bgr_flood = bgr_clean.copy()
            diff_tol = (28, 28, 28)
            for seed in [(0, 0), (new_w - 1, 0), (0, new_h - 1), (new_w - 1, new_h - 1)]:
                cv2.floodFill(bgr_flood, flood_mask, seed, (0, 255, 0), diff_tol, diff_tol, cv2.FLOODFILL_MASK_ONLY | (4 << 8))
            bg_candidate = (flood_mask[1:-1, 1:-1] == 1)
            fg_candidate = ~bg_candidate

            if had_checker:
                gray_res = cv2.cvtColor(bgr_clean, cv2.COLOR_BGR2GRAY)
                fg_candidate = fg_candidate & (gray_res < 215)

            num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(fg_candidate.astype(np.uint8))
            best_label = -1
            max_area = 0
            cx_mid, cy_mid = new_w / 2, new_h / 2

            for i in range(1, num_labels):
                area = stats[i, cv2.CC_STAT_AREA]
                bw = stats[i, cv2.CC_STAT_WIDTH]
                bh = stats[i, cv2.CC_STAT_HEIGHT]
                if bw >= (new_w - 2) and bh >= (new_h - 2):
                    continue
                dist = np.hypot(centroids[i][0] - cx_mid, centroids[i][1] - cy_mid)
                if area > max_area and dist < (max(new_w, new_h) * 0.48):
                    max_area = area
                    best_label = i

            if best_label != -1:
                fg_mask = (labels == best_label)
            else:
                try:
                    grab_mask = np.zeros((new_h, new_w), np.uint8)
                    margin = max(5, int(min(new_w, new_h) * 0.05))
                    rect = (margin, margin, new_w - 2 * margin, new_h - 2 * margin)
                    bgd_model = np.zeros((1, 65), np.float64)
                    fgd_model = np.zeros((1, 65), np.float64)
                    cv2.grabCut(bgr_resized, grab_mask, rect, bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_RECT)
                    fg_mask = ((grab_mask == cv2.GC_FGD) | (grab_mask == cv2.GC_PR_FGD))
                except Exception:
                    fg_mask = fg_candidate

    if fg_mask is None or np.sum(fg_mask) < 20:
        fg_mask = np.ones((new_h, new_w), dtype=bool)

    # Pełna baza bez szczelin
    fg_mask_clean = cv2.morphologyEx(
        fg_mask.astype(np.uint8) * 255,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    ) > 0

    # 2. EKSTRAKCJA DETALI, OCZU I BŁYSKÓW (MAKERWORLD STACKING)
    gray = cv2.cvtColor(bgr_resized, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    gray_clahe = clahe.apply(gray)

    # Ciemne linie i źrenice
    dark_mask = (gray_clahe < 65) & fg_mask
    dark_mask = cv2.morphologyEx(
        dark_mask.astype(np.uint8) * 255,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2, 2))
    ) > 0

    # Białe błyski w oczach i jasne plamki
    highlights_mask = (gray_clahe > 215) & fg_mask
    highlights_mask = cv2.morphologyEx(
        highlights_mask.astype(np.uint8) * 255,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2, 2))
    ) > 0

    # Ciało (piksele między czernią a bielą)
    mid_body_mask = fg_mask & (~dark_mask) & (~highlights_mask)
    body_pixels = bgr_resized[mid_body_mask].reshape(-1, 3)

    if len(body_pixels) < 20:
        body_pixels = bgr_resized[fg_mask].reshape(-1, 3)
        mid_body_mask = fg_mask

    if n_colors == 2:
        n_body_colors = 1
        has_highlights = False
    elif n_colors == 3:
        n_body_colors = 1
        has_highlights = True
    else:
        n_body_colors = n_colors - 2
        has_highlights = True

    kmeans = KMeans(n_clusters=n_body_colors, random_state=42, n_init=3)
    kmeans.fit(body_pixels)
    centers = kmeans.cluster_centers_.astype(int)

    body_brightness = [np.mean(c) for c in centers]
    sorted_body_indices = np.argsort(body_brightness)[::-1]
    centers = centers[sorted_body_indices]

    body_hex_colors = [
        f"#{centers[i][2]:02x}{centers[i][1]:02x}{centers[i][0]:02x}".upper()
        for i in range(n_body_colors)
    ]

    final_colors = []
    layer_masks = []

    # Warstwa 1: Podkład ciała (cała sylwetka, zero tła)
    final_colors.append(body_hex_colors[0])
    layer_masks.append(fg_mask_clean.astype(np.uint8) * 255)

    # Warstwy pośrednie ciała (cienie, łaty)
    labels_map = np.full((new_h, new_w), -1, dtype=int)
    labels_map[mid_body_mask] = kmeans.labels_

    for sub_idx in range(1, n_body_colors):
        orig_cluster = sorted_body_indices[sub_idx]
        mask_sub = (labels_map == orig_cluster).astype(np.uint8) * 255
        mask_sub = cv2.dilate(mask_sub, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
        final_colors.append(body_hex_colors[sub_idx])
        layer_masks.append(mask_sub)

    # Warstwa detali: źrenice z wyciętym miejscem na błysk + nos + linie
    pupils_and_lines = dark_mask & (~highlights_mask)
    final_colors.append("#181818")
    layer_masks.append(pupils_and_lines.astype(np.uint8) * 255)

    # Warstwa błysku oka
    if has_highlights:
        final_colors.append("#F4F4F4")
        layer_masks.append(highlights_mask.astype(np.uint8) * 255)

    # 3. CENTROWANIE I GENEROWANIE WEKTORÓW SVG
    y_idx, x_idx = np.where(fg_mask)
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

    num_layers = len(layer_masks)
    color_ids = [f"color_{i+1}" for i in range(num_layers)]
    svg_output = ['<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">']

    for l_idx in range(num_layers):
        mask = layer_masks[l_idx]
        if not np.any(mask):
            continue

        mask = cv2.medianBlur(mask, 3)
        contours, hierarchy = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_TC89_KCOS)

        paths = []
        if contours:
            for cnt_idx, cnt in enumerate(contours):
                area = cv2.contourArea(cnt)
                min_a = 4 if l_idx >= num_layers - 1 else (10 if l_idx >= num_layers - 2 else 20)
                if area < min_a:
                    continue

                perimeter = cv2.arcLength(cnt, True)
                epsilon = 0.0012 * perimeter
                approx = cv2.approxPolyDP(cnt, epsilon, True)

                pts = approx.reshape(-1, 2)
                if len(pts) < 3:
                    continue

                def map_pt(pt, _cx=center_x, _cy=center_y, _sf=scale_fit):
                    nx = 50.0 + (pt[0] - _cx) * _sf
                    ny = 50.0 + (pt[1] - _cy) * _sf
                    return nx, ny

                start_x, start_y = map_pt(pts[0])
                d = f"M {start_x:.2f} {start_y:.2f} "
                for pt in pts[1:]:
                    x, y = map_pt(pt)
                    d += f"L {x:.2f} {y:.2f} "
                d += "Z "
                paths.append(d)

        c_id = color_ids[l_idx]
        c_hex = final_colors[l_idx]
        paths_str = "".join([f'<path d="{p}"/>' for p in paths])
        svg_output.append(f'<g id="{c_id}" fill="{c_hex}">{paths_str}</g>')

    svg_output.append("</svg>")
    return "".join(svg_output), final_colors



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
async def analyze(file: UploadFile = File(...)):
    """
    Przyjmuje plik CAD (STL/STEP/OBJ):
    1. Zapisuje oryginalny plik
    2. W przypadku .STEP konwertuje go na .STL
    3. Tnie model slicerem (Bambu/Prusa CLI) wyliczając realny czas i podpory
    4. Wysyła plik(i) do Cloudflare R2
    5. Zwraca dane geometrii, metadane slicera i klucze R2
    """
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Nieobsługiwany format pliku: {ext}. Dozwolone: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    tmp_dir = tempfile.mkdtemp()
    unique_id = uuid.uuid4().hex
    tmp_path = os.path.join(tmp_dir, f"{unique_id}{ext}")
    r2_key = f"models/{unique_id}_{file.filename}"

    try:
        with open(tmp_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        size_mb = os.path.getsize(tmp_path) / (1024 * 1024)
        if size_mb > MAX_FILE_SIZE_MB:
            raise HTTPException(
                status_code=400,
                detail=f"Plik za duży ({size_mb:.1f}MB). Limit: {MAX_FILE_SIZE_MB}MB",
            )

        # 1. Wysyłka do R2
        with open(tmp_path, "rb") as f_upload:
            upload_file_to_r2(
                file_obj=f_upload,
                object_name=r2_key,
                content_type=file.content_type or "application/octet-stream",
            )

        # 2. Konwersja STEP jeśli trzeba
        if ext in [".step", ".stp"]:
            converted_stl_path = os.path.join(tmp_dir, f"{unique_id}_converted.stl")
            convert_step_to_stl(tmp_path, converted_stl_path)
            mesh_source_path = converted_stl_path
        else:
            mesh_source_path = tmp_path

        # 3. Auto-orientacja
        raw_mesh = trimesh.load(mesh_source_path, force="mesh")
        oriented_mesh, orientation_info = auto_orient_mesh(raw_mesh)

        oriented_stl_path = os.path.join(tmp_dir, f"{unique_id}_oriented.stl")
        oriented_mesh.export(oriented_stl_path)

        # 4. Upload zorientowanego STL
        preview_stl_key = f"models/{unique_id}_oriented.stl"
        with open(oriented_stl_path, "rb") as f_stl:
            upload_file_to_r2(
                file_obj=f_stl,
                object_name=preview_stl_key,
                content_type="model/stl",
            )
        preview_stl_url = get_file_url(preview_stl_key)

        # 5. Analiza geometrii
        result = analyze_file(oriented_stl_path, ".stl")

        # 6. Slicing
        try:
            slice_data = run_slicer(oriented_stl_path, infill=20, layer_height=0.2)
            result["print_time_exact"] = slice_data["print_time"]
            result["filament_weight_g_exact"] = slice_data["filament_g"]
            result["has_supports"] = slice_data["has_supports"]
            result["support_lines"] = slice_data.get("support_lines", [])
        except Exception as slice_err:
            print(f"[WARN] Slicer error: {slice_err}")
            result["print_time_exact"] = None
            result["filament_weight_g_exact"] = None
            result["has_supports"] = False
            result["support_lines"] = []

        # 7. Zwrócenie wyniku
        result["file_key"] = r2_key
        result["preview_stl_key"] = preview_stl_key
        result["preview_stl_url"] = preview_stl_url
        result["orientation"] = orientation_info
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
    )
    return result