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
