"""Business services for Category management with validation, cycle checks, and delete protection."""

from django.db import transaction
from django.db.models.deletion import ProtectedError
from django.utils.text import slugify
from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError

from apps.audit.services import log_audit_event
from apps.catalog.models import Category


class CategoryInUseError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "Cannot delete this category because it is currently in use."
    default_code = "category_in_use"


def _generate_unique_slug(base_value: str, exclude_id: int | None = None) -> str:
    base_slug = slugify(base_value) or "category"
    candidate = base_slug[:140]
    counter = 2
    queryset = Category.objects.all()
    if exclude_id is not None:
        queryset = queryset.exclude(pk=exclude_id)
    while queryset.filter(slug=candidate).exists():
        suffix = f"-{counter}"
        candidate = f"{base_slug[: 140 - len(suffix)]}{suffix}"
        counter += 1
    return candidate


def _validate_parent_assignment(category: Category | None, parent: Category | None) -> None:
    if parent is None:
        return
    if category is not None:
        if parent.pk == category.pk:
            raise ValidationError({"parent": ["A category cannot be its own parent."]})
        # Walk upward from proposed parent to block indirect circular references.
        cursor = parent
        visited = {category.pk}
        while cursor is not None:
            if cursor.pk in visited:
                raise ValidationError(
                    {"parent": ["Circular parent hierarchy is not allowed."]}
                )
            visited.add(cursor.pk)
            cursor = cursor.parent


@transaction.atomic
def create_category(
    *,
    actor,
    name: str,
    name_km: str = "",
    slug: str | None = None,
    parent: Category | None = None,
    description: str = "",
    is_active: bool = True,
    ip_address: str | None = None,
) -> Category:
    clean_name = name.strip()
    if not clean_name:
        raise ValidationError({"name": ["Category name cannot be blank."]})
    if Category.objects.filter(name__iexact=clean_name).exists():
        raise ValidationError({"name": ["A category with this name already exists."]})

    if slug is not None and slug.strip():
        clean_slug = slugify(slug.strip())
        if not clean_slug:
            raise ValidationError({"slug": ["Slug must contain letters or numbers."]})
        if Category.objects.filter(slug=clean_slug).exists():
            raise ValidationError({"slug": ["A category with this slug already exists."]})
    else:
        clean_slug = _generate_unique_slug(clean_name)

    _validate_parent_assignment(None, parent)

    category = Category.objects.create(
        name=clean_name,
        name_km=(name_km or "").strip(),
        slug=clean_slug,
        parent=parent,
        description=(description or "").strip(),
        is_active=is_active,
    )

    log_audit_event(
        actor=actor,
        action="category.created",
        target_type="Category",
        target_id=category.id,
        ip_address=ip_address,
        metadata={
            "name": category.name,
            "slug": category.slug,
            "is_active": category.is_active,
        },
    )
    return category


@transaction.atomic
def update_category(
    *,
    actor,
    category: Category,
    name: str | None = None,
    name_km: str | None = None,
    slug: str | None = None,
    parent_provided: bool = False,
    parent: Category | None = None,
    description: str | None = None,
    is_active: bool | None = None,
    ip_address: str | None = None,
) -> Category:
    updated_fields: list[str] = []

    if name is not None:
        clean_name = name.strip()
        if not clean_name:
            raise ValidationError({"name": ["Category name cannot be blank."]})
        if Category.objects.filter(name__iexact=clean_name).exclude(pk=category.pk).exists():
            raise ValidationError({"name": ["A category with this name already exists."]})
        if clean_name != category.name:
            category.name = clean_name
            updated_fields.append("name")

    if name_km is not None:
        clean_km = name_km.strip()
        if clean_km != category.name_km:
            category.name_km = clean_km
            updated_fields.append("name_km")

    if slug is not None and slug.strip():
        clean_slug = slugify(slug.strip())
        if not clean_slug:
            raise ValidationError({"slug": ["Slug must contain letters or numbers."]})
        if Category.objects.filter(slug=clean_slug).exclude(pk=category.pk).exists():
            raise ValidationError({"slug": ["A category with this slug already exists."]})
        if clean_slug != category.slug:
            category.slug = clean_slug
            updated_fields.append("slug")

    if parent_provided:
        _validate_parent_assignment(category, parent)
        new_parent_id = parent.pk if parent else None
        if category.parent_id != new_parent_id:
            category.parent = parent
            updated_fields.append("parent")

    if description is not None:
        clean_desc = description.strip()
        if clean_desc != category.description:
            category.description = clean_desc
            updated_fields.append("description")

    if is_active is not None and category.is_active != is_active:
        category.is_active = is_active
        updated_fields.append("is_active")

    if updated_fields:
        category.save(update_fields=[*updated_fields, "updated_at"])
        log_audit_event(
            actor=actor,
            action="category.updated",
            target_type="Category",
            target_id=category.id,
            ip_address=ip_address,
            metadata={"name": category.name, "updated_fields": updated_fields},
        )
    return category


@transaction.atomic
def set_category_active_status(
    *,
    actor,
    category: Category,
    is_active: bool,
    ip_address: str | None = None,
) -> Category:
    if category.is_active != is_active:
        category.is_active = is_active
        category.save(update_fields=["is_active", "updated_at"])

    log_audit_event(
        actor=actor,
        action="category.activated" if is_active else "category.deactivated",
        target_type="Category",
        target_id=category.id,
        ip_address=ip_address,
        metadata={"name": category.name, "is_active": is_active},
    )
    return category


@transaction.atomic
def delete_category(*, actor, category: Category, ip_address: str | None = None) -> None:
    """Delete a category only if it is not referenced by child categories or protected records."""
    child_count = category.children.count()
    if child_count > 0:
        raise CategoryInUseError(
            f"Cannot delete category '{category.name}' because it has {child_count} subcategory(ies)."
        )

    cat_id = category.id
    cat_name = category.name
    cat_slug = category.slug

    try:
        category.delete()
    except ProtectedError as exc:
        raise CategoryInUseError(
            f"Cannot delete category '{cat_name}' because it is currently referenced by other records."
        ) from exc

    log_audit_event(
        actor=actor,
        action="category.deleted",
        target_type="Category",
        target_id=cat_id,
        ip_address=ip_address,
        metadata={"name": cat_name, "slug": cat_slug},
    )
