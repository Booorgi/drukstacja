"""Weryfikacja podpisu webhooka Stripe (bez bazy)."""
import hashlib
import hmac
import os
import time

os.environ.setdefault("STRIPE_WEBHOOK_SECRET", "whsec_test_oms")

from checkout_api import construct_stripe_event  # noqa: E402
from fastapi import HTTPException
import pytest


def _signed(payload: bytes, secret: str) -> str:
    timestamp = str(int(time.time()))
    signed_payload = f"{timestamp}.{payload.decode('utf-8')}"
    digest = hmac.new(secret.encode("utf-8"), signed_payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={digest}"


def test_valid_stripe_signature_is_accepted():
    payload = b'{"id":"evt_test","object":"event","type":"ping","data":{"object":{}}}'
    header = _signed(payload, os.environ["STRIPE_WEBHOOK_SECRET"])
    event = construct_stripe_event(payload, header)
    if hasattr(event, "to_dict"):
        event = event.to_dict()
    assert event["type"] == "ping"


def test_invalid_stripe_signature_is_rejected():
    payload = b'{"id":"evt_test","object":"event","type":"ping","data":{"object":{}}}'
    with pytest.raises(HTTPException) as exc:
        construct_stripe_event(payload, "t=1,v1=deadbeef")
    assert exc.value.status_code == 400
