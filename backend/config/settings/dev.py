"""Development settings for the POS backend."""

import os

from .base import *  # noqa: F401, F403
from .base import _env_bool

DEBUG = _env_bool("DJANGO_DEBUG", default=True)

if not SECRET_KEY:  # noqa: F405
    # Development-only fallback so local setup runs before .env customization.
    SECRET_KEY = os.environ.get(
        "DJANGO_SECRET_KEY",
        "dev-insecure-local-key-change-before-production",
    )

if DEBUG:
    REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"] = [  # noqa: F405
        "rest_framework.renderers.JSONRenderer",
        "rest_framework.renderers.BrowsableAPIRenderer",
    ]
