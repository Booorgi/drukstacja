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
    # 1. AI Cutout (jeśli dostępne i keep_bg == False)
    processed_bytes = image_bytes
    if not keep_bg and REMBG_AVAILABLE:
        try:
            processed_bytes = rembg_remove(image_bytes)
        except Exception as err:
            print(f"[WARN] Błąd wykonania rembg: {err}")
            processed_bytes = image_bytes

    nparr = np.frombuffer(processed_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
    if img is None:
        # Fallback do surowego obrazu, jeśli obróbka dała błąd
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)

    if img is None:
        raise ValueError("Nie udało się zdekodować przesłanego obrazu.")

    # 2. Detekcja kanału Alfa (np. z PNG lub po wycięciu tła)
    has_alpha = False
    if len(img.shape) == 3 and img.shape[2] == 4:
        has_alpha = True
        alpha_mask = img[:, :, 3] > 25
        bgr = img[:, :, :3]
    else:
        bgr = img if len(img.shape) == 3 else cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)

    target_dim = 380
    h, w = bgr.shape[:2]
    scale = target_dim / max(h, w)
    new_w, new_h = max(int(w * scale), 1), max(int(h * scale), 1)
    bgr_resized = cv2.resize(bgr, (new_w, new_h), interpolation=cv2.INTER_AREA)

    # 3. Kontrast CLAHE (uwydatnia detale i kontury)
    lab = cv2.cvtColor(bgr_resized, cv2.COLOR_BGR2LAB)
    l_chan, a_chan, b_chan = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    l_clahe = clahe.apply(l_chan)
    bgr_clean = cv2.cvtColor(cv2.merge((l_clahe, a_chan, b_chan)), cv2.COLOR_LAB2BGR)
    bgr_clean = cv2.bilateralFilter(bgr_clean, d=7, sigmaColor=75, sigmaSpace=75)

    if has_alpha:
        alpha_resized = cv2.resize(
            alpha_mask.astype(np.uint8), (new_w, new_h), interpolation=cv2.INTER_NEAREST
        ).astype(bool)
    else:
        if keep_bg:
            alpha_resized = np.ones((new_h, new_w), dtype=bool)
        else:
            # Inteligentny FloodFill z 4 rogów dla obrazów bez przezroczystości
            flood_mask = np.zeros((new_h + 2, new_w + 2), np.uint8)
            bgr_flood = bgr_clean.copy()
            diff_tol = (25, 25, 25)
            for seed in [(0, 0), (new_w - 1, 0), (0, new_h - 1), (new_w - 1, new_h - 1)]:
                cv2.floodFill(bgr_flood, flood_mask, seed, (0, 255, 0), diff_tol, diff_tol, cv2.FLOODFILL_MASK_ONLY | (4 << 8))
            bg_mask = (flood_mask[1:-1, 1:-1] == 1)
            alpha_resized = ~bg_mask

    pixels = bgr_clean[alpha_resized].reshape(-1, 3)
    if len(pixels) < n_colors:
        pixels = bgr_clean.reshape(-1, 3)
        alpha_resized = np.ones((new_h, new_w), dtype=bool)

    # 4. Kwantyzacja K-Means
    kmeans = KMeans(n_clusters=n_colors, random_state=42, n_init=4)
    kmeans.fit(pixels)

    centers = kmeans.cluster_centers_.astype(int)
    hex_colors = [f"#{c[2]:02x}{c[1]:02x}{c[0]:02x}".upper() for c in centers]

    quantized_map = np.full((new_h, new_w), -1, dtype=int)
    quantized_map[alpha_resized] = kmeans.labels_

    # 5. Centrowanie Bounding Box
    y_indices, x_indices = np.where(alpha_resized)
    if len(x_indices) > 0 and len(y_indices) > 0:
        min_x, max_x = np.min(x_indices), np.max(x_indices)
        min_y, max_y = np.min(y_indices), np.max(y_indices)
    else:
        min_x, max_x, min_y, max_y = 0, new_w, 0, new_h

    bbox_w = max(max_x - min_x, 1)
    bbox_h = max(max_y - min_y, 1)
    max_side = max(bbox_w, bbox_h)

    pad = 4.0
    usable_box = 100.0 - (2 * pad)
    scale_fit = usable_box / max_side

    center_x = (min_x + max_x) / 2.0
    center_y = (min_y + max_y) / 2.0

    collected_paths = []
    color_ids = ["color_1", "color_2", "color_3", "color_4"]

    kernel_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    kernel_dilate = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2, 2))

    for cluster_idx in range(n_colors):
        mask = (quantized_map == cluster_idx).astype(np.uint8) * 255
        if not np.any(mask):
            continue

        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel_close)
        if cluster_idx > 0:
            mask = cv2.dilate(mask, kernel_dilate, iterations=1)

        mask = cv2.medianBlur(mask, 3)
        contours, _ = cv2.findContours(mask, cv2.RETR_TREE, cv2.CHAIN_APPROX_TC89_KCOS)

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < 16 or area > (0.92 * (new_w * new_h)):
                continue

            perimeter = cv2.arcLength(cnt, True)
            epsilon = 0.0018 * perimeter
            approx_cnt = cv2.approxPolyDP(cnt, epsilon, True)

            pts = approx_cnt.reshape(-1, 2)
            if len(pts) < 3:
                continue

            def map_pt(pt):
                nx = 50.0 + (pt[0] - center_x) * scale_fit
                ny = 50.0 + (pt[1] - center_y) * scale_fit
                return nx, ny

            start_x, start_y = map_pt(pts[0])
            path_d = f"M {start_x:.2f} {start_y:.2f} "

            for pt in pts[1:]:
                x, y = map_pt(pt)
                path_d += f"L {x:.2f} {y:.2f} "
            path_d += "Z"

            collected_paths.append({
                "area": area,
                "cluster_idx": cluster_idx,
                "path_d": path_d
            })

    collected_paths.sort(key=lambda x: x["area"], reverse=True)

    svg_output = ['<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">']
    final_colors = []

    for cluster_idx in range(n_colors):
        c_id = color_ids[cluster_idx]
        c_hex = hex_colors[cluster_idx]
        group_paths = [p["path_d"] for p in collected_paths if p["cluster_idx"] == cluster_idx]

        if group_paths:
            paths_str = " ".join([f'<path d="{p}" />' for p in group_paths])
            svg_output.append(f'<g id="{c_id}" fill="{c_hex}">{paths_str}</g>')
            final_colors.append(c_hex)
        else:
            final_colors.append("#111111")

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
    keep_bg: str = Form("false")
):
    """Wektoryzacja konturów z obsługą AI cutout i doborem barw."""
    try:
        should_keep_bg = keep_bg.lower() in ("true", "1", "yes")
        contents = await file.read()
        svg_result, detected_colors = image_to_quantized_svg(
            contents, n_colors=4, keep_bg=should_keep_bg
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