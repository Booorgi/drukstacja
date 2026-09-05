"""
Drukstacja - backend API
Obsluguje: upload pliku CAD -> zapis w R2 -> analiza geometrii -> wycena druku 3D
"""
import os
import shutil
import tempfile
import uuid
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from analysis import analyze_file, UnsupportedFileType
from pricing import calculate_price, MATERIALS
from storage import upload_file_to_r2  # <-- IMPORT FUNKCJI DO R2

app = FastAPI(title="Drukstacja API", version="0.1.0")

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
    1. Zapisuje w Cloudflare R2
    2. Przeprowadza analize geometrii
    3. Zwraca dane geometrii oraz file_key do zamowienia
    """
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Nieobslugiwany format pliku: {ext}. Dozwolone: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # Tymczasowy plik lokalny do analizy
    tmp_dir = tempfile.mkdtemp()
    unique_id = uuid.uuid4().hex
    tmp_path = os.path.join(tmp_dir, f"{unique_id}{ext}")
    r2_key = f"models/{unique_id}_{file.filename}"

    try:
        # Zapisz plik na dysku lokalnym
        with open(tmp_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        # Kontrola rozmiaru
        size_mb = os.path.getsize(tmp_path) / (1024 * 1024)
        if size_mb > MAX_FILE_SIZE_MB:
            raise HTTPException(
                status_code=400, 
                detail=f"Plik za duzy ({size_mb:.1f}MB). Limit: {MAX_FILE_SIZE_MB}MB"
            )

        # 1. Wysylka pliku do Cloudflare R2
        with open(tmp_path, "rb") as f_upload:
            upload_file_to_r2(
                file_obj=f_upload, 
                object_name=r2_key, 
                content_type=file.content_type or "application/octet-stream"
            )

        # 2. Analiza geometrii
        result = analyze_file(tmp_path, ext)
        
        # 3. Dodajemy klucz R2 do odpowiedzi, zeby frontend mogl go powiazac ze zlozonym zamowieniem
        result["file_key"] = r2_key
        result["original_filename"] = file.filename
        return result

    except UnsupportedFileType as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
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
