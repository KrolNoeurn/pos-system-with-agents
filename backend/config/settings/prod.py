"""Production settings for the POS backend (HTTPS, HSTS, PostgreSQL-ready)."""

import os

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401, F403
from .base import BASE_DIR, _env_bool, _env_int, _env_list

DEBUG = False

if not SECRET_KEY or len(SECRET_KEY) < 50 or "replace-with" in SECRET_KEY:  # noqa: F405
    raise ImproperlyConfigured(
        "DJANGO_SECRET_KEY must be set to a strong random secret (>= 50 chars) in production."
    )

if not ALLOWED_HOSTS or "*" in ALLOWED_HOSTS:  # noqa: F405
    raise ImproperlyConfigured(
        "DJANGO_ALLOWED_HOSTS must list explicit hostnames in production (no wildcard '*')."
    )

# Optional PostgreSQL configuration via environment variables
DB_ENGINE = os.environ.get("DB_ENGINE", "sqlite3").strip().lower()
if DB_ENGINE in {"postgres", "postgresql"}:
    db_name = os.environ.get("DB_NAME", "").strip()
    db_user = os.environ.get("DB_USER", "").strip()
    db_password = os.environ.get("DB_PASSWORD", "")
    if not db_name or not db_user:
        raise ImproperlyConfigured("DB_NAME and DB_USER are required for PostgreSQL.")
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": db_name,
            "USER": db_user,
            "PASSWORD": db_password,
            "HOST": os.environ.get("DB_HOST", "127.0.0.1"),
            "PORT": os.environ.get("DB_PORT", "5432"),
            "CONN_MAX_AGE": _env_int("DB_CONN_MAX_AGE", default=60),
            "OPTIONS": {
                "sslmode": os.environ.get("DB_SSLMODE", "prefer"),
            },
        }
    }

STATIC_ROOT = BASE_DIR / "staticfiles"

# Transport & header security
SECURE_SSL_REDIRECT = _env_bool("DJANGO_SECURE_SSL_REDIRECT", default=True)
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_HSTS_SECONDS = _env_int("DJANGO_SECURE_HSTS_SECONDS", default=31536000)
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"

SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_SECURE = True
CSRF_TRUSTED_ORIGINS = _env_list("DJANGO_CSRF_TRUSTED_ORIGINS", default="")
