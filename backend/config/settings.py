"""
Django settings for Wayaz e-commerce project.
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv

from django.core.exceptions import ImproperlyConfigured

# PyMySQL acts as the MySQLdb API module that Django's MySQL backend expects.
# Pure Python: no compiler or dev headers required (locally or on cPanel).
import pymysql

pymysql.install_as_MySQLdb()

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment variables from .env file
load_dotenv(BASE_DIR / ".env")

def _env_bool(name: str, default: str = "false") -> bool:
    return os.environ.get(name, default).lower() in ("1", "true", "yes")


# DEBUG defaults to False so production can never run debug mode by
# omission. Local dev flips it to True in backend/.env.
DEBUG = _env_bool("DEBUG")

# Fail closed on the secret key: production must provide its own, and the
# checked-in development key may never be used with DEBUG off.
_DEV_SECRET_KEY = "dev-secret-key-change-in-production-wayaz"
_secret_key = os.environ.get("SECRET_KEY", "")
if _secret_key:
    SECRET_KEY = _secret_key
elif DEBUG:
    SECRET_KEY = _DEV_SECRET_KEY  # local dev convenience only
else:
    raise ImproperlyConfigured(
        "SECRET_KEY must be set in the environment when DEBUG is off."
    )
if not DEBUG and SECRET_KEY == _DEV_SECRET_KEY:
    raise ImproperlyConfigured(
        "SECRET_KEY is still the bundled development value. Generate a real "
        "one with: python -c \"from django.core.management.utils import "
        "get_random_secret_key; print(get_random_secret_key())\""
    )

# Host allow-list defaults to localhost only; production/demo hosts
# (LAN IPs, ngrok tunnels, api.<domain>) come from the environment.
allowed_hosts_raw = os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1")
ALLOWED_HOSTS = [h.strip() for h in allowed_hosts_raw.split(",") if h.strip()]

# Application definition
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party apps
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    # Local apps
    "accounts",
    "catalog",
    "orders",
    "payments",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# Database (MariaDB/MySQL - the cPanel/DirectAdmin server has no PostgreSQL)
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.mysql",
        "NAME": os.environ.get("DB_NAME", "wayaz"),
        "USER": os.environ.get("DB_USER", "wayaz"),
        "PASSWORD": os.environ.get("DB_PASSWORD", "wayaz_secret"),
        "HOST": os.environ.get("DB_HOST", "localhost"),
        "PORT": os.environ.get("DB_PORT", "3306"),
        "CONN_MAX_AGE": int(os.environ.get("DB_CONN_MAX_AGE", "60")),
        "OPTIONS": {
            "charset": "utf8mb4",
            "init_command": "SET sql_mode='STRICT_TRANS_TABLES'",
        },
    }
}

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

# Internationalization
LANGUAGE_CODE = "en-us"
TIME_ZONE = "Africa/Nairobi"
USE_I18N = True
USE_TZ = True

# Static & Media Files
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Custom User Model
AUTH_USER_MODEL = "accounts.User"

# Django REST Framework
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        # JWTAuthentication + "was this token minted after the last
        # password change?" - see accounts/authentication.py.
        "accounts.authentication.PasswordAwareJWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.AllowAny",
    ],
    "DEFAULT_PAGINATION_CLASS": "config.pagination.StandardResultsSetPagination",
    "PAGE_SIZE": 24,
    # Anonymous traffic is capped globally, and sensitive view groups opt
    # into tighter per-scope rates via `throttle_scope`
    # (auth=10/min, forgot-password=5/min, payments=30/min).
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "60/min",
        "auth": "10/min",
        "forgot-password": "5/min",
        "payments": "30/min",
    },
}

# Throttling is disabled under `manage.py test`: the rate-limit cache is
# process-wide, so a full suite run would trip anon/auth limits and fail
# spuriously. Production behaviour is covered by the scope settings above.
if "test" in sys.argv:
    REST_FRAMEWORK["DEFAULT_THROTTLE_CLASSES"] = []

from datetime import timedelta

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(days=1),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
    "ROTATE_REFRESH_TOKENS": True,
    # Rotated-out refresh tokens are blacklisted so a stolen (already
    # used) refresh token can't be replayed for new sessions.
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# CORS: localhost by default; the production storefront origin and any
# demo/LAN origins come from the environment (comma-separated).
cors_raw = os.environ.get(
    "CORS_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
)
CORS_ALLOWED_ORIGINS = [o.strip() for o in cors_raw.split(",") if o.strip()]

# Default allowed headers + the guest storefront cart's X-Cart-ID header,
# which identifies an anonymous shopper's server-side cart.
CORS_ALLOW_HEADERS = [
    "accept",
    "accept-encoding",
    "authorization",
    "content-type",
    "dnt",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
    "x-cart-id",
]

# HTTPS posture. All off by default so plain-HTTP local dev keeps working;
# the production environment turns them on once DNS + SSL are live
# (see docs/deployment-guide.md).
# - SECURE_SSL_REDIRECT / *_COOKIE_SECURE: enforce HTTPS end to end.
# - TRUST_X_FORWARDED_PROTO: set true when Apache/DirectAdmin terminates
#   TLS and proxies to gunicorn over HTTP (honours X-Forwarded-Proto).
# - SECURE_HSTS_SECONDS: enable only after the domain serves HTTPS
#   everywhere (e.g. 31536000 = 1 year).
SECURE_SSL_REDIRECT = _env_bool("SECURE_SSL_REDIRECT")
SESSION_COOKIE_SECURE = _env_bool("SESSION_COOKIE_SECURE")
CSRF_COOKIE_SECURE = _env_bool("CSRF_COOKIE_SECURE")
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_HSTS_SECONDS = int(os.environ.get("SECURE_HSTS_SECONDS", "0"))
if _env_bool("TRUST_X_FORWARDED_PROTO"):
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# Origins trusted for CSRF-protected POSTs (Django admin, DRF session auth).
csrf_raw = os.environ.get("CSRF_TRUSTED_ORIGINS", "")
CSRF_TRUSTED_ORIGINS = [o.strip() for o in csrf_raw.split(",") if o.strip()]

# Email (order confirmations) - console backend by default in development.
EMAIL_BACKEND = os.environ.get(
    "EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend"
)
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "Wayaz <orders@wayaz.co.ke>")

# Base URL for links that must open in the browser (password reset emails).
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://127.0.0.1:3000").rstrip("/")

# WhatsApp support line used for order confirmation/dispatch links.
WHATSAPP_SUPPORT_NUMBER = os.environ.get("WHATSAPP_SUPPORT_NUMBER", "254700000000")

# M-Pesa Daraja Gateway Configuration
MPESA_ENVIRONMENT = os.environ.get("MPESA_ENVIRONMENT", "mock").lower()  # "mock" | "sandbox" | "production"
MPESA_CONSUMER_KEY = os.environ.get("MPESA_CONSUMER_KEY", "")
MPESA_CONSUMER_SECRET = os.environ.get("MPESA_CONSUMER_SECRET", "")
MPESA_SHORTCODE = os.environ.get("MPESA_SHORTCODE", "174379")
MPESA_PASSKEY = os.environ.get(
    "MPESA_PASSKEY",
    "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919",
)
MPESA_CALLBACK_URL = os.environ.get(
    "MPESA_CALLBACK_URL", "https://api.wayaz.co.ke/api/v1/payments/mpesa/callback/"
)
# Shared secret embedded in the callback URL path
# (mpesa/callback/<token>/) so only Safaricom - who we gave the URL to -
# can reach the webhook. Required outside mock mode; generate one with:
#   python -c "import secrets; print(secrets.token_urlsafe(32))"
MPESA_CALLBACK_SECRET = os.environ.get("MPESA_CALLBACK_SECRET", "")
