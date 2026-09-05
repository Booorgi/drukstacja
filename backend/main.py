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
app = FastAPI(title="Drukstacja API", version="0.4.0")

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


def image_to_quantized_svg(image_bytes: bytes, n_colors: int = 4):
    """
    Algorytmiczna kwantyzacja i wektoryzacja konturów (MakerWorld Standard).
    Zwraca krotkę: (kod_svg, lista_wykrytych_kolorow_hex).
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError("Nie udało się zdekodować przesłanego pliku graficznego.")

    has_alpha = False
    if len(img.shape) == 3 and img.shape[2] == 4:
        has_alpha = True
        alpha_mask = img[:, :, 3] > 25
        bgr = img[:, :, :3]
    else:
        bgr = img if len(img.shape) == 3 else cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)

    target_dim = 400
    h, w = bgr.shape[:2]
    scale = target_dim / max(h, w)
    new_w, new_h = max(int(w * scale), 1), max(int(h * scale), 1)
    bgr_resized = cv2.resize(bgr, (new_w, new_h), interpolation=cv2.INTER_AREA)

    if has_alpha:
        alpha_resized = cv2.resize(
            alpha_mask.astype(np.uint8), (new_w, new_h), interpolation=cv2.INTER_NEAREST
        ).astype(bool)
    else:
        corners = [
            bgr_resized[0, 0],
            bgr_resized[0, -1],
            bgr_resized[-1, 0],
            bgr_resized[-1, -1]
        ]
        avg_corner = np.mean(corners, axis=0)
        if np.all(avg_corner > 210):
            diff = np.linalg.norm(bgr_resized.astype(float) - avg_corner, axis=2)
            alpha_resized = diff > 30
        else:
            alpha_resized = np.ones((new_h, new_w), dtype=bool)

    pixels = bgr_resized[alpha_resized].reshape(-1, 3)
    if len(pixels) < n_colors:
        pixels = bgr_resized.reshape(-1, 3)
        alpha_resized = np.ones((new_h, new_w), dtype=bool)

    kmeans = KMeans(n_clusters=n_colors, random_state=42, n_init=4)
    kmeans.fit(pixels)

    centers = kmeans.cluster_centers_.astype(int)
    hex_colors = [f"#{c[2]:02x}{c[1]:02x}{c[0]:02x}".upper() for c in centers]

    quantized_map = np.full((new_h, new_w), -1, dtype=int)
    quantized_map[alpha_resized] = kmeans.labels_

    total_area = new_w * new_h
    pad = 4.0
    usable_box = 100.0 - (2 * pad)

    collected_paths = []
    color_ids = ["color_1", "color_2", "color_3", "color_4"]

    for cluster_idx in range(n_colors):
        mask = (quantized_map == cluster_idx).astype(np.uint8) * 255
        if not np.any(mask):
            continue

        mask = cv2.medianBlur(mask, 3)
        contours, _ = cv2.findContours(mask, cv2.RETR_TREE, cv2.CHAIN_APPROX_TC89_KCOS)

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < 6 or area > (0.88 * total_area):
                continue

            pts = cnt.reshape(-1, 2)
            if len(pts) < 3:
                continue

            start_x = pad + (pts[0][0] / new_w) * usable_box
            start_y = pad + (pts[0][1] / new_h) * usable_box
            path_d = f"M {start_x:.2f} {start_y:.2f} "

            for pt in pts[1:]:
                x = pad + (pt[0] / new_w) * usable_box
                y = pad + (pt[1] / new_h) * usable_box
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


@app.post("/vectorize-ai")
async def vectorize_image_ai(file: UploadFile = File(...)):
    """Wektoryzacja konturów z auto-pobieraniem palety barw."""
    try:
        contents = await file.read()
        svg_result, detected_colors = image_to_quantized_svg(contents, n_colors=4)
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