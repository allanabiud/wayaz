"""
Django settings for Wayaz e-commerce project.
"""

import os
import sys
from pathlib import Path

# PyMySQL substitutes for MySQLdb, which Django's MySQL backend expects.
import pymysql
from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

pymysql.install_as_MySQLdb()

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")


def _env_bool(name: str, default: str = "false") -> bool:
    return os.environ.get(name, default).lower() in ("1", "true", "yes")


# Defaults to False so production can never run debug mode by omission.
DEBUG = _env_bool("DEBUG")

# Fail closed: production must provide its own secret key.
_DEV_SECRET_KEY = "dev-secret-key-change-in-production-wayaz"
_secret_key = os.environ.get("SECRET_KEY", "")
if _secret_key:
    SECRET_KEY = _secret_key
elif DEBUG:
    SECRET_KEY = _DEV_SECRET_KEY
else:
    raise ImproperlyConfigured(
        "SECRET_KEY must be set in the environment when DEBUG is off."
    )
if not DEBUG and SECRET_KEY == _DEV_SECRET_KEY:
    raise ImproperlyConfigured(
        "SECRET_KEY is still the bundled development value. Generate a real "
        'one with: python -c "from django.core.management.utils import '
        'get_random_secret_key; print(get_random_secret_key())"'
    )

# Host allow-list; production/demo hosts come from the environment.
allowed_hosts_raw = os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1")
ALLOWED_HOSTS = [h.strip() for h in allowed_hosts_raw.split(",") if h.strip()]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "drf_spectacular",
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

# MariaDB/MySQL: the cPanel/DirectAdmin server has no PostgreSQL.
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
# Overridable so production can point inside the Apache-served document
# root (uploads are web-served by Apache, never through Django).
MEDIA_ROOT = Path(os.environ.get("MEDIA_ROOT", str(BASE_DIR / "media")))

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_USER_MODEL = "accounts.User"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        # Rejects tokens minted before the last password change.
        "accounts.authentication.PasswordAwareJWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.AllowAny",
    ],
    "DEFAULT_PAGINATION_CLASS": "config.pagination.StandardResultsSetPagination",
    "PAGE_SIZE": 24,
    # Sensitive view groups opt into tighter rates via throttle_scope
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
        "contact": "5/min",
        "restock-notifications": "10/min",
    },
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

# Docs follow DEBUG unless a staging box sets SERVE_DOCS.
SERVE_DOCS = _env_bool("SERVE_DOCS", str(DEBUG))

SPECTACULAR_SETTINGS = {
    "TITLE": "Wayaz API",
    "DESCRIPTION": "Headless API for the Wayaz Collection e-commerce storefront and admin portal.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "SERVE_PERMISSIONS": ["rest_framework.permissions.AllowAny"],
    "SECURITY": [{"jwtAuth": []}],
    # Uptime probes are not API surface; dropping them avoids duplicate
    # operationIds on the /health aliases.
    "PREPROCESSING_HOOKS": ["config.schema_hooks.exclude_health_endpoints"],
    "APPEND_COMPONENTS": {
        "securitySchemes": {
            "jwtAuth": {
                "type": "http",
                "scheme": "bearer",
                "bearerFormat": "JWT",
                "description": "JWT Authorization header using the Bearer scheme. Example: 'Bearer {token}'",
            }
        }
    },
}

# Throttling keys on client IP, so a full test suite would trip the limits
# spuriously. Covers both `manage.py test` and `manage.py test -v2`.
if any(arg.startswith("test") for arg in sys.argv):
    REST_FRAMEWORK["DEFAULT_THROTTLE_CLASSES"] = []

from datetime import timedelta

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(days=1),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
    "ROTATE_REFRESH_TOKENS": True,
    # Blacklist rotated-out refresh tokens so they can't be replayed.
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# CORS: localhost by default; other origins come from the environment.
cors_raw = os.environ.get(
    "CORS_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
)
CORS_ALLOWED_ORIGINS = [o.strip() for o in cors_raw.split(",") if o.strip()]

# Includes x-cart-id, which identifies a guest shopper's server-side cart.
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

# HTTPS posture: all off by default so plain-HTTP local dev works.
# TRUST_X_FORWARDED_PROTO goes true when Apache terminates TLS and proxies
# to gunicorn over HTTP. HSTS only after the domain serves HTTPS everywhere.
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

# Email: console backend in development; production points at a cPanel
# mailbox (465 = implicit TLS, 587 = STARTTLS).
EMAIL_BACKEND = os.environ.get(
    "EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend"
)
EMAIL_HOST = os.environ.get("EMAIL_HOST", "")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "465"))
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_SSL = _env_bool("EMAIL_USE_SSL", "true")
EMAIL_USE_TLS = _env_bool("EMAIL_USE_TLS", "false")
# Short timeout so a hanging mail server can't stall checkout.
EMAIL_TIMEOUT = int(os.environ.get("EMAIL_TIMEOUT", "10"))
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "Wayaz <orders@wayaz.co.ke>")

# Shop owner/manager address that receives a copy of every new order.
MANAGER_EMAIL = os.environ.get("MANAGER_EMAIL", "")

# Base URL for links that must open in the browser (password reset emails).
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://127.0.0.1:3000").rstrip("/")

WHATSAPP_SUPPORT_NUMBER = os.environ.get("WHATSAPP_SUPPORT_NUMBER", "254700000000")

# "mock" | "sandbox" | "production"
MPESA_ENVIRONMENT = os.environ.get("MPESA_ENVIRONMENT", "mock").lower()
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
# Secret embedded in the callback URL path (mpesa/callback/<token>/) so
# only Safaricom can reach the webhook. Generate with:
#   python -c "import secrets; print(secrets.token_urlsafe(32))"
MPESA_CALLBACK_SECRET = os.environ.get("MPESA_CALLBACK_SECRET", "")

# One console handler; cPanel/DirectAdmin captures stdout into the error log.
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "standard": {
            "format": "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "standard",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": LOG_LEVEL,
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": LOG_LEVEL,
            "propagate": False,
        },
        "django.server": {
            "handlers": ["console"],
            "level": "WARNING",
            "propagate": False,
        },
        "urllib3": {
            "handlers": ["console"],
            "level": "WARNING",
            "propagate": False,
        },
    },
}
