"""Audit logging service — never persists secrets, passwords, or tokens."""

from typing import Any

from apps.audit.models import AuditLog

REDACTED_KEYS = {
    "password",
    "current_password",
    "new_password",
    "confirm_password",
    "token",
    "access",
    "refresh",
    "secret",
    "authorization",
}


def _sanitize_metadata(data: dict[str, Any] | None) -> dict[str, Any]:
    if not data:
        return {}
    sanitized: dict[str, Any] = {}
    for key, value in data.items():
        if str(key).lower() in REDACTED_KEYS:
            sanitized[key] = "[REDACTED]"
        elif isinstance(value, dict):
            sanitized[key] = _sanitize_metadata(value)
        else:
            sanitized[key] = value
    return sanitized


def get_client_ip(request) -> str | None:
    if request is None:
        return None
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def log_audit_event(
    *,
    actor=None,
    action: str,
    target_type: str = "",
    target_id: Any = "",
    ip_address: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> AuditLog:
    """Create an append-only audit record safely."""
    actor_obj = actor if getattr(actor, "is_authenticated", False) else None
    return AuditLog.objects.create(
        actor=actor_obj,
        action=action,
        target_type=target_type,
        target_id=str(target_id) if target_id not in (None, "") else "",
        ip_address=ip_address,
        metadata=_sanitize_metadata(metadata),
    )
