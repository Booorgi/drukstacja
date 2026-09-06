import os
import boto3
from botocore.config import Config

R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME")
# Pobieramy bezpośrednio gotowy URL skonfigurowany w Railway
R2_ENDPOINT_URL = os.getenv("R2_ENDPOINT_URL")

s3_client = boto3.client(
    service_name="s3",
    endpoint_url=R2_ENDPOINT_URL,
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    region_name="auto",
    config=Config(s3={"addressing_style": "path"})
)

def upload_file_to_r2(file_obj, object_name: str, content_type: str = "application/octet-stream") -> str:
    """Wysyła plik do Cloudflare R2."""
    s3_client.upload_fileobj(
        file_obj,
        R2_BUCKET_NAME,
        object_name,
        ExtraArgs={"ContentType": content_type}
    )
    return object_name


def get_file_url(object_name: str, expires_in: int = 3600) -> str:
    """
    Zwraca URL do pobrania pliku z R2.
    Jesli w zmiennych srodowiskowych ustawiony jest R2_PUBLIC_BASE_URL
    (np. custom domain lub r2.dev), zwracamy zwykly, staly link publiczny -
    to zalecane w produkcji.
    W przeciwnym razie generujemy podpisany (presigned) URL wazny przez
    `expires_in` sekund - dziala od razu, bez konfiguracji publicznego dostepu.
    """
    public_base = os.getenv("R2_PUBLIC_BASE_URL")
    if public_base:
        return f"{public_base.rstrip('/')}/{object_name}"

    return s3_client.generate_presigned_url(
        "get_object",
        Params={"Bucket": R2_BUCKET_NAME, "Key": object_name},
        ExpiresIn=expires_in,
    )


def download_file_from_r2(object_name: str, target_path: str):
    """Pobiera plik z Cloudflare R2."""
    if not R2_BUCKET_NAME:
        raise ValueError("R2_BUCKET_NAME nie jest skonfigurowany.")
    s3_client.download_file(R2_BUCKET_NAME, object_name, target_path)


def save_production_3mf_file(local_3mf_path: str, object_name: str) -> str:
    """
    Zapisuje wygenerowany plik .3mf w storage Cloudflare R2 (jeśli skonfigurowane)
    lub zwraca endpoint URL.
    """
    if R2_BUCKET_NAME and R2_ACCESS_KEY_ID:
        try:
            with open(local_3mf_path, "rb") as f:
                upload_file_to_r2(
                    f,
                    object_name,
                    content_type="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"
                )
            return get_file_url(object_name)
        except Exception as e:
            print(f"[WARN] Błąd uploadu .3MF do R2: {e}")
    return f"/api/download-3mf-file/{os.path.basename(local_3mf_path)}"


