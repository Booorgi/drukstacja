"""
Drukstacja - backend API
Obsluguje: upload pliku CAD (STL/STEP/OBJ) -> konwersja STEP -> cięcie slicerem -> zapis w R2 -> wycena druku 3D
"""
import os
import shutil
import tempfile
import uuid
import traceback
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import trimesh

from analysis import analyze_file, UnsupportedFileType
from pricing import calculate_price, MATERIALS
from storage import upload_file_to_r2, get_file_url
from slicer import convert_step_to_stl, run_slicer
from orientation import auto_orient_mesh

app = FastAPI(title="Drukstacja API", version="0.2.0")

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


@app.get("/")
def root():
    return {"status": "ok", "service": "drukstacja-backend"}


@app.get("/materials")
def get_materials():
    """Lista dostepnych materialow i ich cen za kg."""
    return MATERIALS


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
            detail=f"Nieobslugiwany format pliku: {ext}. Dozwolone: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    tmp_dir = tempfile.mkdtemp()
    unique_id = uuid.uuid4().hex
    tmp_path = os.path.join(tmp_dir, f"{unique_id}{ext}")
    r2_key = f"models/{unique_id}_{file.filename}"

    try:
        # Zapisz plik lokalnie na dysku kontenera
        with open(tmp_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        # Kontrola rozmiaru
        size_mb = os.path.getsize(tmp_path) / (1024 * 1024)
        if size_mb > MAX_FILE_SIZE_MB:
            raise HTTPException(
                status_code=400,
                detail=f"Plik za duzy ({size_mb:.1f}MB). Limit: {MAX_FILE_SIZE_MB}MB",
            )

        # 1. Wysyłka oryginalnego pliku do Cloudflare R2
        with open(tmp_path, "rb") as f_upload:
            upload_file_to_r2(
                file_obj=f_upload,
                object_name=r2_key,
                content_type=file.content_type or "application/octet-stream",
            )

        # 2. Zamiana wejscia na siatke STL (STEP wymaga konwersji, STL/OBJ juz sa siatka)
        if ext in [".step", ".stp"]:
            converted_stl_path = os.path.join(tmp_dir, f"{unique_id}_converted.stl")
            convert_step_to_stl(tmp_path, converted_stl_path)
            mesh_source_path = converted_stl_path
        else:
            mesh_source_path = tmp_path

        # 3. AUTO-ORIENTACJA: PrusaSlicer w trybie CLI nie ma wbudowanej
        # optymalizacji ustawienia modelu (w przeciwienstwie do GUI), wiec
        # robimy to sami PRZED cieciem - dokladnie tak jak "Optimize
        # orientation" w prawdziwym slicerze: szukamy obrotu minimalizujacego
        # powierzchnie nawisow, a wiec ilosc potrzebnych podpor.
        raw_mesh = trimesh.load(mesh_source_path, force="mesh")
        oriented_mesh, orientation_info = auto_orient_mesh(raw_mesh)

        oriented_stl_path = os.path.join(tmp_dir, f"{unique_id}_oriented.stl")
        oriented_mesh.export(oriented_stl_path)

        # 4. Ten SAM zorientowany plik jest uzywany do: analizy geometrii,
        # ciecia slicerem ORAZ podgladu w przegladarce - dzieki temu model
        # widoczny na stronie zawsze idealnie pokrywa sie z wygenerowanymi
        # podporami (obie rzeczy licza sie z tych samych, juz obroconych osi).
        preview_stl_key = f"models/{unique_id}_oriented.stl"
        with open(oriented_stl_path, "rb") as f_stl:
            upload_file_to_r2(
                file_obj=f_stl,
                object_name=preview_stl_key,
                content_type="model/stl",
            )
        preview_stl_url = get_file_url(preview_stl_key)

        # 5. Analiza geometrii na juz zorientowanym modelu (bbox odzwierciedla
        # realny gabaryt na stole roboczym, nie oryginalna orientacje z CAD-a)
        result = analyze_file(oriented_stl_path, ".stl")

        # 6. Ciecie silnikiem slicera CLI na zorientowanym pliku (dokladny
        # czas, zuzycie i wspolrzedne podpor)
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

        # 7. Dolaczamy metadane do odpowiedzi dla frontendu
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
        raise HTTPException(status_code=500, detail=f"Blad analizy lub zapisu w R2: {str(e)}")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


@app.post("/quote")
def quote(req: QuoteRequest):
    """Liczy cene na podstawie danych geometrii zwroconych przez /analyze."""
    if req.material not in MATERIALS:
        raise HTTPException(status_code=400, detail=f"Nieznany material: {req.material}")

    result = calculate_price(
        volume_cm3=req.volume_cm3,
        bbox_mm=req.bbox_mm,
        material=req.material,
        quantity=req.quantity,
        infill_percent=req.infill_percent,
    )
    return result
