import base64
import logging
import uuid
from datetime import datetime
from decimal import Decimal

import requests
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

SANDBOX_URL = "https://sandbox.safaricom.co.ke"
PROD_URL = "https://api.safaricom.co.ke"


def get_base_url():
    if settings.MPESA_ENVIRONMENT == "production":
        return PROD_URL
    return SANDBOX_URL


def get_active_shortcode() -> str:
    """Returns DB-configured shortcode if set, otherwise falls back to env var."""
    try:
        from catalog.models import StoreSettings

        db_shortcode = StoreSettings.load().mpesa_shortcode
        if db_shortcode:
            return db_shortcode
    except Exception:
        pass
    return settings.MPESA_SHORTCODE


def format_phone_number(phone: str) -> str:
    """Formats phone number to Kenyan international format without + (e.g. 254712345678)."""
    cleaned = "".join(filter(str.isdigit, str(phone)))
    if cleaned.startswith("00254") and len(cleaned) == 14:
        cleaned = cleaned[2:]
    if cleaned.startswith("2540") and len(cleaned) == 13:
        cleaned = "254" + cleaned[4:]
    if cleaned.startswith("0") and len(cleaned) == 10:
        return "254" + cleaned[1:]
    if cleaned.startswith("7") and len(cleaned) == 9:
        return "254" + cleaned
    if cleaned.startswith("1") and len(cleaned) == 9:
        return "254" + cleaned
    if cleaned.startswith("254") and len(cleaned) == 12:
        return cleaned
    return cleaned


def redact_phone(phone: str) -> str:
    """Log-safe phone representation (keeps first 4 + last 3 digits only)."""
    digits = "".join(filter(str.isdigit, str(phone)))
    if len(digits) < 7:
        return "****"
    return f"{digits[:4]}****{digits[-3:]}"


def get_oauth_token() -> str:
    """Fetches and caches Daraja OAuth bearer token."""
    cache_key = f"daraja_oauth_token_{settings.MPESA_ENVIRONMENT}"
    cached_token = cache.get(cache_key)
    if cached_token:
        return cached_token

    consumer_key = settings.MPESA_CONSUMER_KEY
    consumer_secret = settings.MPESA_CONSUMER_SECRET
    if not consumer_key or not consumer_secret:
        raise ValueError("M-Pesa Consumer Key or Secret not configured.")

    url = f"{get_base_url()}/oauth/v1/generate?grant_type=client_credentials"
    auth = requests.auth.HTTPBasicAuth(consumer_key, consumer_secret)

    response = requests.get(url, auth=auth, timeout=30)
    response.raise_for_status()
    data = response.json()
    token = data.get("access_token")
    expires_in = int(data.get("expires_in", 3599)) - 60  # Buffer by 60s
    cache.set(cache_key, token, timeout=max(60, expires_in))
    return token


def generate_stk_password(shortcode: str, passkey: str, timestamp: str) -> str:
    """Generates base64 encoded password: Base64(Shortcode + Passkey + Timestamp)."""
    data = f"{shortcode}{passkey}{timestamp}"
    return base64.b64encode(data.encode("utf-8")).decode("utf-8")


def initiate_stk_push(order, phone_number: str) -> dict:
    """Triggers Lipa na M-Pesa Online STK Push; 'mock' mode answers
    immediately without external Safaricom connectivity."""
    formatted_phone = format_phone_number(phone_number)
    amount = int(Decimal(str(order.total_amount)).quantize(Decimal("1")))

    if settings.MPESA_ENVIRONMENT == "mock":
        # Deterministic mock response for seamless development & QA
        checkout_request_id = (
            f"ws_CO_{datetime.now().strftime('%d%m%Y%H%M%S')}_{uuid.uuid4().hex[:8]}"
        )
        merchant_request_id = f"{uuid.uuid4().hex[:12]}"
        logger.info(
            f"[MOCK DARJA] STK push initiated for Order {order.order_number}: "
            f"Amount={amount}, Phone={redact_phone(formatted_phone)}"
        )
        return {
            "MerchantRequestID": merchant_request_id,
            "CheckoutRequestID": checkout_request_id,
            "ResponseCode": "0",
            "ResponseDescription": "Success. Request accepted for processing (Mock Mode)",
            "CustomerMessage": "Success. Request accepted for processing",
            "is_mock": True,
        }

    token = get_oauth_token()
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    shortcode = get_active_shortcode()
    password = generate_stk_password(shortcode, settings.MPESA_PASSKEY, timestamp)

    url = f"{get_base_url()}/mpesa/stkpush/v1/processrequest"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    payload = {
        "BusinessShortCode": shortcode,
        "Password": password,
        "Timestamp": timestamp,
        "TransactionType": "CustomerPayBillOnline",
        "Amount": amount,
        "PartyA": formatted_phone,
        "PartyB": shortcode,
        "PhoneNumber": formatted_phone,
        "CallBackURL": settings.MPESA_CALLBACK_URL,
        "AccountReference": f"Wayaz {order.order_number}",
        "TransactionDesc": f"Payment for Order {order.order_number}",
    }

    response = requests.post(url, json=payload, headers=headers, timeout=30)
    response_data = response.json()

    if response.status_code != 200 or response_data.get("ResponseCode") != "0":
        logger.error(f"[DARAJA ERROR] STK Push Failed: {response_data}")
        error_msg = (
            response_data.get("errorMessage")
            or response_data.get("ResponseDescription")
            or "Daraja request failed"
        )
        raise RuntimeError(error_msg)

    return response_data


def stk_query(checkout_request_id: str) -> dict | None:
    """Ask Safaricom for the authoritative status of an STK Push request,
    re-verifying a success callback (the callback POST alone is not proof).
    Returns the Daraja dict, or None when it could not be asked."""
    if settings.MPESA_ENVIRONMENT == "mock":
        # Local mock has no Safaricom to ask; the simulated callback is
        # its own authority here.
        return {"ResultCode": 0, "ResultDesc": "Mock gateway: processed successfully."}

    try:
        token = get_oauth_token()
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        shortcode = get_active_shortcode()
        password = generate_stk_password(shortcode, settings.MPESA_PASSKEY, timestamp)

        url = f"{get_base_url()}/mpesa/stkpushquery/v1/query"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        payload = {
            "BusinessShortCode": shortcode,
            "Password": password,
            "Timestamp": timestamp,
            "CheckoutRequestID": checkout_request_id,
        }
        response = requests.post(url, json=payload, headers=headers, timeout=30)
        data = response.json()
    except (requests.RequestException, ValueError) as exc:
        logger.error(f"[DARAJA] STK query failed for {checkout_request_id}: {exc}")
        return None

    if response.status_code != 200 or "ResultCode" not in data:
        # Daraja error envelope ({"errorMessage": ...}) or a non-200:
        # If transaction is simply still in progress at PIN entry, log at INFO.
        msg = data.get("errorMessage") or data.get("ResponseDescription") or ""
        if "being processed" in str(msg).lower():
            logger.info(
                f"[DARAJA] STK transaction in progress for {checkout_request_id}: {msg}"
            )
        else:
            logger.warning(
                f"[DARAJA] STK query inconclusive for {checkout_request_id} "
                f"(HTTP {response.status_code}): {data}"
            )
        return None
    return data
