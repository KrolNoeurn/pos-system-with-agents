#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys
from pathlib import Path

from dotenv import load_dotenv


def main() -> None:
    """Run administrative tasks."""
    base_dir = Path(__file__).resolve().parent
    load_dotenv(base_dir / ".env")
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Make sure the backend virtual environment "
            "is activated and dependencies are installed."
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
