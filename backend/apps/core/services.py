"""Core infrastructure services."""

from typing import Any

from django.db import DatabaseError, connection
from django.utils import timezone


def get_health_status() -> tuple[dict[str, Any], bool]:
    """Check backend and database readiness and return (payload, is_healthy)."""
    db_connected = True
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except DatabaseError:
        db_connected = False

    payload: dict[str, Any] = {
        "status": "ok" if db_connected else "degraded",
        "service": "pos-backend",
        "api_version": "v1",
        "database": "connected" if db_connected else "unavailable",
        "timestamp": timezone.now().isoformat(),
    }
    return payload, db_connected
