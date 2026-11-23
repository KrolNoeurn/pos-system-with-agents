"""RBAC business services with strict privilege-escalation guards."""

from typing import Iterable

from django.db import transaction
from django.utils.text import slugify
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.audit.services import log_audit_event
from apps.rbac.constants import DEFAULT_PERMISSIONS, DEFAULT_ROLES
from apps.rbac.models import Permission, Role


def sync_default_rbac() -> dict[str, int]:
    """Idempotently seed canonical permissions and default system roles."""
    perms_by_code: dict[str, Permission] = {}
    created_perms = 0
    for code, module, action, description in DEFAULT_PERMISSIONS:
        perm, created = Permission.objects.update_or_create(
            code=code,
            defaults={
                "module": module,
                "action": action,
                "description": description,
            },
        )
        perms_by_code[code] = perm
        if created:
            created_perms += 1

    created_roles = 0
    for spec in DEFAULT_ROLES:
        role, created = Role.objects.get_or_create(
            slug=spec["slug"],
            defaults={
                "name": spec["name"],
                "description": spec["description"],
                "is_system": spec["is_system"],
                "is_super_admin": spec["is_super_admin"],
            },
        )
        if created:
            created_roles += 1
            if spec["permissions"] == "__ALL__":
                role.permissions.set(perms_by_code.values())
            else:
                role.permissions.set([perms_by_code[c] for c in spec["permissions"]])
        elif spec["is_super_admin"]:
            # Ensure Super Administrator always stays synchronized with all canonical permissions.
            role.is_system = True
            role.is_super_admin = True
            role.save(update_fields=["is_system", "is_super_admin", "updated_at"])
            role.permissions.set(perms_by_code.values())

    return {
        "permissions_total": len(perms_by_code),
        "permissions_created": created_perms,
        "roles_created": created_roles,
    }


def _resolve_permissions(permission_ids: Iterable[int]) -> list[Permission]:
    unique_ids = list(dict.fromkeys(permission_ids))
    permissions = list(Permission.objects.filter(id__in=unique_ids))
    if len(permissions) != len(unique_ids):
        found = {p.id for p in permissions}
        missing = [pid for pid in unique_ids if pid not in found]
        raise ValidationError({"permission_ids": [f"Unknown permission IDs: {missing}"]})
    return permissions


def _assert_actor_can_grant_permissions(*, actor, permissions: Iterable[Permission]) -> None:
    """Prevent non-super-admins from granting permissions outside their own authority."""
    if actor.is_super_admin_user:
        return
    actor_codes = actor.get_permission_codes()
    requested_codes = {p.code for p in permissions}
    unauthorized = sorted(requested_codes - actor_codes)
    if unauthorized:
        raise PermissionDenied(
            f"Privilege escalation blocked: you cannot assign permissions you do not hold ({', '.join(unauthorized)})."
        )


def _assert_actor_can_manage_role(*, actor, role: Role) -> None:
    """Prevent ordinary admins from modifying Super Admin or higher-privileged roles."""
    if actor.is_super_admin_user:
        return
    if role.is_super_admin:
        raise PermissionDenied("Only a Super Administrator can modify the Super Administrator role.")
    if role.is_system:
        raise PermissionDenied("Only a Super Administrator can modify protected system roles.")
    actor_codes = actor.get_permission_codes()
    role_codes = set(role.permissions.values_list("code", flat=True))
    exceeding = sorted(role_codes - actor_codes)
    if exceeding:
        raise PermissionDenied(
            f"Privilege escalation blocked: target role contains permissions beyond your authority ({', '.join(exceeding)})."
        )


@transaction.atomic
def create_role(
    *,
    actor,
    name: str,
    description: str = "",
    slug: str | None = None,
    permission_ids: list[int] | None = None,
    ip_address: str | None = None,
) -> Role:
    clean_name = name.strip()
    clean_slug = slugify(slug or clean_name).replace("-", "_")
    if not clean_slug:
        raise ValidationError({"slug": ["A valid role slug could not be derived from name."]})
    if Role.objects.filter(name__iexact=clean_name).exists():
        raise ValidationError({"name": ["A role with this name already exists."]})
    if Role.objects.filter(slug=clean_slug).exists():
        raise ValidationError({"slug": ["A role with this slug already exists."]})

    permissions = _resolve_permissions(permission_ids or [])
    _assert_actor_can_grant_permissions(actor=actor, permissions=permissions)

    role = Role.objects.create(
        name=clean_name,
        slug=clean_slug,
        description=description.strip(),
        is_system=False,
        is_super_admin=False,
    )
    if permissions:
        role.permissions.set(permissions)

    log_audit_event(
        actor=actor,
        action="role.created",
        target_type="Role",
        target_id=role.id,
        ip_address=ip_address,
        metadata={
            "name": role.name,
            "slug": role.slug,
            "permissions": sorted(p.code for p in permissions),
        },
    )
    return role


@transaction.atomic
def update_role(
    *,
    actor,
    role: Role,
    name: str | None = None,
    description: str | None = None,
    permission_ids: list[int] | None = None,
    ip_address: str | None = None,
) -> Role:
    _assert_actor_can_manage_role(actor=actor, role=role)

    updated_fields: list[str] = []
    if name is not None:
        clean_name = name.strip()
        if Role.objects.filter(name__iexact=clean_name).exclude(id=role.id).exists():
            raise ValidationError({"name": ["A role with this name already exists."]})
        if clean_name != role.name:
            role.name = clean_name
            updated_fields.append("name")

    if description is not None:
        clean_desc = description.strip()
        if clean_desc != role.description:
            role.description = clean_desc
            updated_fields.append("description")

    if updated_fields:
        role.save(update_fields=[*updated_fields, "updated_at"])

    if permission_ids is not None:
        assign_role_permissions(
            actor=actor,
            role=role,
            permission_ids=permission_ids,
            ip_address=ip_address,
            emit_audit=False,
        )

    log_audit_event(
        actor=actor,
        action="role.updated",
        target_type="Role",
        target_id=role.id,
        ip_address=ip_address,
        metadata={
            "name": role.name,
            "updated_fields": updated_fields,
            "permissions_updated": permission_ids is not None,
        },
    )
    return role


@transaction.atomic
def assign_role_permissions(
    *,
    actor,
    role: Role,
    permission_ids: list[int],
    ip_address: str | None = None,
    emit_audit: bool = True,
) -> Role:
    _assert_actor_can_manage_role(actor=actor, role=role)
    if role.is_super_admin:
        raise ValidationError({"detail": "Super Administrator permissions cannot be restricted."})

    permissions = _resolve_permissions(permission_ids)
    _assert_actor_can_grant_permissions(actor=actor, permissions=permissions)

    previous_codes = sorted(role.permissions.values_list("code", flat=True))
    role.permissions.set(permissions)
    new_codes = sorted(p.code for p in permissions)

    if emit_audit:
        log_audit_event(
            actor=actor,
            action="role.permissions_assigned",
            target_type="Role",
            target_id=role.id,
            ip_address=ip_address,
            metadata={
                "role": role.slug,
                "previous_permissions": previous_codes,
                "new_permissions": new_codes,
            },
        )
    return role


@transaction.atomic
def delete_role(*, actor, role: Role, ip_address: str | None = None) -> None:
    if role.is_system or role.is_super_admin:
        raise PermissionDenied("Protected system roles cannot be deleted.")
    _assert_actor_can_manage_role(actor=actor, role=role)

    role_id = role.id
    role_name = role.name
    role_slug = role.slug
    role.delete()

    log_audit_event(
        actor=actor,
        action="role.deleted",
        target_type="Role",
        target_id=role_id,
        ip_address=ip_address,
        metadata={"name": role_name, "slug": role_slug},
    )
