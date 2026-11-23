"""Authentication, user management, and anti-privilege-escalation services."""

from typing import Iterable

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied, ValidationError
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from apps.audit.services import log_audit_event
from apps.rbac.models import Role

User = get_user_model()


def _resolve_roles(role_ids: Iterable[int]) -> list[Role]:
    unique_ids = list(dict.fromkeys(role_ids))
    roles = list(Role.objects.prefetch_related("permissions").filter(id__in=unique_ids))
    if len(roles) != len(unique_ids):
        found = {r.id for r in roles}
        missing = [rid for rid in unique_ids if rid not in found]
        raise ValidationError({"role_ids": [f"Unknown role IDs: {missing}"]})
    return roles


def _count_other_active_super_admins(exclude_user_id: int) -> int:
    return (
        User.objects.filter(is_active=True)
        .filter(Q(is_superuser=True) | Q(roles__is_super_admin=True))
        .exclude(id=exclude_user_id)
        .distinct()
        .count()
    )


def _assert_actor_can_manage_target_user(*, actor: User, target: User) -> None:
    """Prevent ordinary admins from modifying Super Admins, system accounts, or higher-privileged users."""
    if actor.is_super_admin_user:
        return
    if target.is_super_admin_user:
        raise PermissionDenied("Only a Super Administrator can manage a Super Administrator account.")
    if target.is_system_account:
        raise PermissionDenied("Only a Super Administrator can manage protected system accounts.")

    actor_codes = actor.get_permission_codes()
    target_codes = target.get_permission_codes()
    exceeding = sorted(target_codes - actor_codes)
    if exceeding:
        raise PermissionDenied(
            f"Privilege escalation blocked: target user holds permissions beyond your authority ({', '.join(exceeding)})."
        )


def _assert_actor_can_assign_roles(*, actor: User, roles: Iterable[Role]) -> None:
    """Prevent non-super-admins from assigning Super Admin roles or permissions they do not possess."""
    if actor.is_super_admin_user:
        return
    actor_codes = actor.get_permission_codes()
    for role in roles:
        if role.is_super_admin:
            raise PermissionDenied("Only a Super Administrator can assign the Super Administrator role.")
        role_codes = {p.code for p in role.permissions.all()}
        exceeding = sorted(role_codes - actor_codes)
        if exceeding:
            raise PermissionDenied(
                f"Privilege escalation blocked: role '{role.name}' grants permissions beyond your authority ({', '.join(exceeding)})."
            )


def authenticate_user(*, username: str, password: str, ip_address: str | None = None) -> dict:
    """Authenticate username/email + password, verify active status, and issue JWT tokens."""
    identifier = (username or "").strip()
    if not identifier or not password:
        raise AuthenticationFailed("Username and password are required.")

    user = (
        User.objects.prefetch_related("roles__permissions")
        .filter(Q(username__iexact=identifier) | Q(email__iexact=identifier))
        .first()
    )

    if user is None or not user.check_password(password):
        log_audit_event(
            actor=None,
            action="auth.login_failed",
            target_type="User",
            target_id=user.id if user else "",
            ip_address=ip_address,
            metadata={"identifier": identifier, "reason": "invalid_credentials"},
        )
        raise AuthenticationFailed("Invalid username or password.")

    if not user.is_active:
        log_audit_event(
            actor=None,
            action="auth.login_failed",
            target_type="User",
            target_id=user.id,
            ip_address=ip_address,
            metadata={"identifier": identifier, "reason": "inactive_account"},
        )
        raise AuthenticationFailed("This account has been deactivated. Contact an administrator.")

    refresh = RefreshToken.for_user(user)
    user.last_login = timezone.now()
    user.save(update_fields=["last_login"])

    log_audit_event(
        actor=user,
        action="auth.login",
        target_type="User",
        target_id=user.id,
        ip_address=ip_address,
        metadata={"username": user.username},
    )

    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "user": user,
    }


def refresh_user_token(*, refresh_token_str: str) -> dict[str, str]:
    """Rotate refresh token while enforcing user active status."""
    try:
        token = RefreshToken(refresh_token_str)
    except TokenError as exc:
        raise AuthenticationFailed("Invalid or expired refresh token.") from exc

    user_id = token.get("user_id")
    user = User.objects.filter(id=user_id).first()
    if user is None or not user.is_active:
        raise AuthenticationFailed("Account is inactive or no longer exists.")

    try:
        token.blacklist()
    except TokenError as exc:
        raise AuthenticationFailed("Refresh token has already been revoked.") from exc

    new_refresh = RefreshToken.for_user(user)
    return {
        "access": str(new_refresh.access_token),
        "refresh": str(new_refresh),
    }


def logout_user(*, actor: User, refresh_token_str: str | None, ip_address: str | None = None) -> None:
    """Blacklist provided refresh token and record logout audit event."""
    if refresh_token_str:
        try:
            token = RefreshToken(refresh_token_str)
            token.blacklist()
        except TokenError:
            pass

    log_audit_event(
        actor=actor,
        action="auth.logout",
        target_type="User",
        target_id=actor.id,
        ip_address=ip_address,
        metadata={"username": actor.username},
    )


@transaction.atomic
def update_own_profile(
    *,
    user: User,
    full_name: str | None = None,
    phone: str | None = None,
    preferred_language: str | None = None,
    preferred_theme: str | None = None,
    preferred_layout: str | None = None,
    ip_address: str | None = None,
) -> User:
    updated_fields: list[str] = []
    field_updates = {
        "full_name": full_name.strip() if full_name is not None else None,
        "phone": phone.strip() if phone is not None else None,
        "preferred_language": preferred_language,
        "preferred_theme": preferred_theme,
        "preferred_layout": preferred_layout,
    }
    for field_name, value in field_updates.items():
        if value is not None and getattr(user, field_name) != value:
            setattr(user, field_name, value)
            updated_fields.append(field_name)

    if updated_fields:
        user.save(update_fields=[*updated_fields, "updated_at"])
        log_audit_event(
            actor=user,
            action="auth.profile_updated",
            target_type="User",
            target_id=user.id,
            ip_address=ip_address,
            metadata={"updated_fields": updated_fields},
        )
    return user


@transaction.atomic
def change_own_password(
    *,
    user: User,
    current_password: str,
    new_password: str,
    ip_address: str | None = None,
) -> None:
    if not user.check_password(current_password):
        raise ValidationError({"current_password": ["Current password is incorrect."]})

    if current_password == new_password:
        raise ValidationError({"new_password": ["New password must differ from current password."]})

    try:
        validate_password(new_password, user=user)
    except DjangoValidationError as exc:
        raise ValidationError({"new_password": list(exc.messages)}) from exc

    user.set_password(new_password)
    user.save(update_fields=["password", "updated_at"])

    log_audit_event(
        actor=user,
        action="auth.password_changed",
        target_type="User",
        target_id=user.id,
        ip_address=ip_address,
        metadata={"username": user.username},
    )


@transaction.atomic
def create_user_account(
    *,
    actor: User,
    username: str,
    email: str,
    password: str,
    full_name: str = "",
    phone: str = "",
    is_active: bool = True,
    role_ids: list[int] | None = None,
    ip_address: str | None = None,
) -> User:
    clean_username = username.strip()
    clean_email = email.strip().lower()

    if User.objects.filter(username__iexact=clean_username).exists():
        raise ValidationError({"username": ["A user with this username already exists."]})
    if User.objects.filter(email__iexact=clean_email).exists():
        raise ValidationError({"email": ["A user with this email already exists."]})

    roles = _resolve_roles(role_ids or [])
    _assert_actor_can_assign_roles(actor=actor, roles=roles)

    candidate = User(username=clean_username, email=clean_email, full_name=full_name.strip())
    try:
        validate_password(password, user=candidate)
    except DjangoValidationError as exc:
        raise ValidationError({"password": list(exc.messages)}) from exc

    user = User.objects.create_user(
        username=clean_username,
        email=clean_email,
        password=password,
        full_name=full_name.strip(),
        phone=phone.strip(),
        is_active=is_active,
    )
    if roles:
        user.roles.set(roles)

    log_audit_event(
        actor=actor,
        action="user.created",
        target_type="User",
        target_id=user.id,
        ip_address=ip_address,
        metadata={
            "username": user.username,
            "email": user.email,
            "is_active": user.is_active,
            "roles": sorted(r.slug for r in roles),
        },
    )
    return user


@transaction.atomic
def update_user_account(
    *,
    actor: User,
    target: User,
    email: str | None = None,
    full_name: str | None = None,
    phone: str | None = None,
    password: str | None = None,
    role_ids: list[int] | None = None,
    ip_address: str | None = None,
) -> User:
    _assert_actor_can_manage_target_user(actor=actor, target=target)

    updated_fields: list[str] = []
    if email is not None:
        clean_email = email.strip().lower()
        if User.objects.filter(email__iexact=clean_email).exclude(id=target.id).exists():
            raise ValidationError({"email": ["A user with this email already exists."]})
        if clean_email != target.email:
            target.email = clean_email
            updated_fields.append("email")

    if full_name is not None:
        clean_full_name = full_name.strip()
        if clean_full_name != target.full_name:
            target.full_name = clean_full_name
            updated_fields.append("full_name")

    if phone is not None:
        clean_phone = phone.strip()
        if clean_phone != target.phone:
            target.phone = clean_phone
            updated_fields.append("phone")

    if password:
        try:
            validate_password(password, user=target)
        except DjangoValidationError as exc:
            raise ValidationError({"password": list(exc.messages)}) from exc
        target.set_password(password)
        updated_fields.append("password")

    if updated_fields:
        target.save(update_fields=[*updated_fields, "updated_at"])

    if role_ids is not None:
        assign_user_roles(
            actor=actor,
            target=target,
            role_ids=role_ids,
            ip_address=ip_address,
            emit_audit=False,
        )

    log_audit_event(
        actor=actor,
        action="user.updated",
        target_type="User",
        target_id=target.id,
        ip_address=ip_address,
        metadata={
            "username": target.username,
            "updated_fields": [f for f in updated_fields if f != "password"],
            "password_reset": "password" in updated_fields,
            "roles_updated": role_ids is not None,
        },
    )
    return target


@transaction.atomic
def assign_user_roles(
    *,
    actor: User,
    target: User,
    role_ids: list[int],
    ip_address: str | None = None,
    emit_audit: bool = True,
) -> User:
    _assert_actor_can_manage_target_user(actor=actor, target=target)
    roles = _resolve_roles(role_ids)
    _assert_actor_can_assign_roles(actor=actor, roles=roles)

    will_be_super_admin = target.is_superuser or any(r.is_super_admin for r in roles)
    if target.is_super_admin_user and not will_be_super_admin:
        if _count_other_active_super_admins(target.id) == 0:
            raise ValidationError({"role_ids": ["Cannot remove Super Administrator privileges from the last active Super Administrator."]})

    previous_roles = sorted(target.roles.values_list("slug", flat=True))
    target.roles.set(roles)
    new_roles = sorted(r.slug for r in roles)

    if emit_audit:
        log_audit_event(
            actor=actor,
            action="user.roles_assigned",
            target_type="User",
            target_id=target.id,
            ip_address=ip_address,
            metadata={
                "username": target.username,
                "previous_roles": previous_roles,
                "new_roles": new_roles,
            },
        )
    return target


@transaction.atomic
def set_user_active_status(
    *,
    actor: User,
    target: User,
    is_active: bool,
    ip_address: str | None = None,
) -> User:
    _assert_actor_can_manage_target_user(actor=actor, target=target)

    if not is_active:
        if actor.id == target.id:
            raise ValidationError({"detail": "You cannot deactivate your own account."})
        if target.is_system_account and not actor.is_super_admin_user:
            raise PermissionDenied("Protected system accounts cannot be deactivated.")
        if target.is_super_admin_user and _count_other_active_super_admins(target.id) == 0:
            raise ValidationError({"detail": "Cannot deactivate the last active Super Administrator."})

    if target.is_active != is_active:
        target.is_active = is_active
        target.save(update_fields=["is_active", "updated_at"])

    log_audit_event(
        actor=actor,
        action="user.activated" if is_active else "user.deactivated",
        target_type="User",
        target_id=target.id,
        ip_address=ip_address,
        metadata={"username": target.username, "is_active": is_active},
    )
    return target


@transaction.atomic
def delete_user_account(*, actor: User, target: User, ip_address: str | None = None) -> None:
    _assert_actor_can_manage_target_user(actor=actor, target=target)

    if actor.id == target.id:
        raise ValidationError({"detail": "You cannot delete your own account."})
    if target.is_system_account:
        raise PermissionDenied("Protected system accounts cannot be deleted.")
    if target.is_super_admin_user and _count_other_active_super_admins(target.id) == 0:
        raise ValidationError({"detail": "Cannot delete the last active Super Administrator."})

    target_id = target.id
    target_username = target.username
    target.delete()

    log_audit_event(
        actor=actor,
        action="user.deleted",
        target_type="User",
        target_id=target_id,
        ip_address=ip_address,
        metadata={"username": target_username},
    )
