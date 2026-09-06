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


# Bezpieczny import rembg - jeśli brakuje runtime ONNX dla Python 3.14, serwer nie padnie
try:
    from rembg import remove as rembg_remove
    REMBG_AVAILABLE = True
except Exception as _e:
    print(f"[WARN] Rembg niedostępne ({_e}), używam inteligentnego FloodFill/GrabCut")
    REMBG_AVAILABLE = False


def image_to_quantized_svg(image_bytes: bytes, n_colors: int = 4, keep_bg: bool = False):
    """
    Uniwersalny algorytm wektoryzacji obrazu na wielowarstwowe SVG.
    Obsługuje dowolną grafikę (nie tylko psy beagle).
    n_colors: 2-6 — liczba warstw kolorów w wynikowym SVG.
    """
    n_colors = max(2, min(6, n_colors))

    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError("Błąd odczytu grafiki.")

    # 1. Sprawdzenie przezroczystości alfa
    has_alpha = False
    if len(img.shape) == 3 and img.shape[2] == 4:
        alpha_raw = img[:, :, 3] > 20
        if np.sum(alpha_raw) > 0.05 * alpha_raw.size:
            has_alpha = True
            alpha_mask = alpha_raw
        bgr = img[:, :, :3]
    else:
        bgr = img if len(img.shape) == 3 else cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)

    target_dim = 400
    h, w = bgr.shape[:2]
    scale = target_dim / max(h, w)
    new_w, new_h = max(int(w * scale), 1), max(int(h * scale), 1)
    bgr_resized = cv2.resize(bgr, (new_w, new_h), interpolation=cv2.INTER_AREA)

    # 2. USUWANIE TŁA — kaskada: alfa → FloodFill → GrabCut fallback
    if has_alpha:
        fg_mask = cv2.resize(
            alpha_mask.astype(np.uint8), (new_w, new_h), interpolation=cv2.INTER_NEAREST
        ).astype(bool)
    elif keep_bg:
        fg_mask = np.ones((new_h, new_w), dtype=bool)
    else:
        # Metoda 1: FloodFill z 4 narożników
        flood_mask = np.zeros((new_h + 2, new_w + 2), np.uint8)
        bgr_flood = bgr_resized.copy()
        diff = (22, 22, 22)
        for seed in [(0, 0), (new_w - 1, 0), (0, new_h - 1), (new_w - 1, new_h - 1)]:
            cv2.floodFill(bgr_flood, flood_mask, seed, (0, 255, 0), diff, diff, cv2.FLOODFILL_MASK_ONLY | (4 << 8))
        bg_candidate = (flood_mask[1:-1, 1:-1] == 1)
        fg_candidate = ~bg_candidate

        # Wyciągamy największy komponent blisko centrum
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
            if area > max_area and dist < (max(new_w, new_h) * 0.45):
                max_area = area
                best_label = i

        if best_label != -1:
            fg_mask = (labels == best_label)
        else:
            # Metoda 2: GrabCut fallback — gdy FloodFill nie dał sensownego wyniku
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

    # 3. UNIWERSALNA KWANTYZACJA KOLORÓW — KMeans na N kolorów
    fg_pixels = bgr_resized[fg_mask].reshape(-1, 3)
    if len(fg_pixels) < 20:
        fg_pixels = bgr_resized.reshape(-1, 3)
        fg_mask = np.ones((new_h, new_w), dtype=bool)

    # Wyrównanie histogramu CLAHE dla lepszej separacji kolorów
    lab = cv2.cvtColor(bgr_resized, cv2.COLOR_BGR2LAB)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    lab[:, :, 0] = clahe.apply(lab[:, :, 0])
    bgr_enhanced = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
    fg_pixels_enhanced = bgr_enhanced[fg_mask].reshape(-1, 3)

    kmeans = KMeans(n_clusters=n_colors, random_state=42, n_init=5)
    kmeans.fit(fg_pixels_enhanced)
    centers = kmeans.cluster_centers_.astype(int)

    # Mapowanie z powrotem na oryginalne kolory (bez CLAHE)
    original_centers = []
    for ci in range(n_colors):
        cluster_mask = (kmeans.labels_ == ci)
        cluster_pixels = fg_pixels[cluster_mask]
        if len(cluster_pixels) > 0:
            original_centers.append(np.mean(cluster_pixels, axis=0).astype(int))
        else:
            original_centers.append(centers[ci])
    centers = np.array(original_centers)

    # Sortujemy warstwy od najjaśniejszej do najciemniejszej (brightness)
    brightness = [np.mean(c) for c in centers]
    sorted_indices = np.argsort(brightness)[::-1]
    centers = centers[sorted_indices]

    # Konwersja do hex
    final_colors = []
    for c in centers:
        hex_val = f"#{int(c[2]):02x}{int(c[1]):02x}{int(c[0]):02x}".upper()
        final_colors.append(hex_val)

    # Mapa pikseli do klastrów (przeindeksowane po sortowaniu)
    labels_reindexed = np.full(kmeans.labels_.shape, -1, dtype=int)
    for new_idx, old_idx in enumerate(sorted_indices):
        labels_reindexed[kmeans.labels_ == old_idx] = new_idx

    pixel_labels = np.full((new_h, new_w), -1, dtype=int)
    pixel_labels[fg_mask] = labels_reindexed

    # 4. Tworzenie masek warstw
    layer_masks = []
    for ci in range(n_colors):
        mask = (pixel_labels == ci).astype(np.uint8) * 255
        layer_masks.append(mask)

    # 5. Centrowanie obiektu w SVG viewBox
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

    color_ids = [f"color_{i+1}" for i in range(n_colors)]
    svg_output = ['<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">']

    for l_idx in range(n_colors):
        mask = layer_masks[l_idx]
        if not np.any(mask):
            continue

        # Wygładzenie konturów
        mask = cv2.medianBlur(mask, 3)
        contours, hierarchy = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_TC89_KCOS)

        paths = []
        if contours:
            for cnt_idx, cnt in enumerate(contours):
                area = cv2.contourArea(cnt)
                min_a = 4 if l_idx >= n_colors - 1 else (10 if l_idx >= n_colors - 2 else 20)
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