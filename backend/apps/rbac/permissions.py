"""Authoritative server-side DRF RBAC permission classes."""

from rest_framework.permissions import BasePermission


class IsActiveAuthenticated(BasePermission):
    """Require an authenticated AND active user on every protected endpoint."""

    message = "Authentication credentials were not provided or account is inactive."

    def has_permission(self, request, view) -> bool:
        user = getattr(request, "user", None)
        return bool(user and user.is_authenticated and user.is_active)


class HasRBACPermission(BasePermission):
    """
    Check required RBAC permission(s) declared on the view.

    Supported view attributes:
    - `required_permission: str`
    - `required_any_permissions: tuple[str, ...] | list[str]`
    - `permission_map: dict[str, str | tuple[str, ...]]` (keyed by HTTP method)
    """

    message = "You do not have permission to perform this action."

    def has_permission(self, request, view) -> bool:
        user = getattr(request, "user", None)
        if not (user and user.is_authenticated and user.is_active):
            return False

        if getattr(user, "is_super_admin_user", False):
            return True

        required = None
        permission_map = getattr(view, "permission_map", None)
        if permission_map and request.method in permission_map:
            required = permission_map[request.method]
        elif hasattr(view, "required_any_permissions"):
            required = getattr(view, "required_any_permissions")
        elif hasattr(view, "required_permission"):
            required = getattr(view, "required_permission")

        if not required:
            return False

        if isinstance(required, str):
            return user.has_rbac_permission(required)
        return any(user.has_rbac_permission(code) for code in required)


def require_permission(*codes: str) -> type[BasePermission]:
    """Build a declarative DRF permission class requiring any of the given permission codes."""

    class _RequiredPermission(BasePermission):
        message = f"Missing required permission: {', '.join(codes)}."

        def has_permission(self, request, view) -> bool:
            user = getattr(request, "user", None)
            if not (user and user.is_authenticated and user.is_active):
                return False
            if getattr(user, "is_super_admin_user", False):
                return True
            return any(user.has_rbac_permission(code) for code in codes)

    _RequiredPermission.__name__ = f"Require_{'_or_'.join(c.replace('.', '_') for c in codes)}"
    return _RequiredPermission
