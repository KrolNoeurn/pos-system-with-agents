"""Business services for Catalog Categories, Units, and Products."""

from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models.deletion import ProtectedError
from django.utils.text import slugify
from rest_framework import status
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError

from apps.audit.services import log_audit_event
from apps.catalog.models import Category, Product, ProductImage, Unit

MONEY_QUANT = Decimal("0.01")
QTY_QUANT = Decimal("0.001")
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB
MAX_IMAGES_PER_PRODUCT = 10
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


class CategoryInUseError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "Cannot delete this category because it is currently in use."
    default_code = "category_in_use"


class UnitInUseError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "Cannot delete this unit because it is currently in use."
    default_code = "unit_in_use"


class ProductInUseError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "Cannot delete this product because it is referenced in historical transactions."
    default_code = "product_in_use"


# ---------------------------------------------------------------------------
# Category Services
# ---------------------------------------------------------------------------

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
    """Delete a category only if it is not referenced by child categories or products."""
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
            f"Cannot delete category '{cat_name}' because it is currently referenced by products or other records."
        ) from exc

    log_audit_event(
        actor=actor,
        action="category.deleted",
        target_type="Category",
        target_id=cat_id,
        ip_address=ip_address,
        metadata={"name": cat_name, "slug": cat_slug},
    )


# ---------------------------------------------------------------------------
# Units of Measure Services
# ---------------------------------------------------------------------------

def _validate_unit_conversion(
    *,
    unit: Unit | None,
    unit_type: str,
    base_unit: Unit | None,
    conversion_factor: Decimal,
) -> Decimal:
    if conversion_factor is None or conversion_factor <= Decimal("0"):
        raise ValidationError({"conversion_factor": ["Conversion factor must be greater than zero."]})

    if base_unit is None:
        return Decimal("1.000000")

    if base_unit.unit_type != unit_type:
        raise ValidationError(
            {"base_unit": ["Base unit must have the same unit type as this unit."]}
        )

    if unit is not None:
        if base_unit.pk == unit.pk:
            raise ValidationError({"base_unit": ["A unit cannot reference itself as base unit."]})
        cursor = base_unit
        visited = {unit.pk}
        while cursor is not None:
            if cursor.pk in visited:
                raise ValidationError(
                    {"base_unit": ["Circular base unit reference is not allowed."]}
                )
            visited.add(cursor.pk)
            cursor = cursor.base_unit

    return conversion_factor


@transaction.atomic
def create_unit(
    *,
    actor,
    name: str,
    abbreviation: str,
    unit_type: str = Unit.UnitType.COUNT,
    name_km: str = "",
    allow_decimal: bool = False,
    base_unit: Unit | None = None,
    conversion_factor: Decimal = Decimal("1.000000"),
    is_active: bool = True,
    ip_address: str | None = None,
) -> Unit:
    clean_name = name.strip()
    clean_abbr = abbreviation.strip()
    if not clean_name:
        raise ValidationError({"name": ["Unit name cannot be blank."]})
    if not clean_abbr:
        raise ValidationError({"abbreviation": ["Abbreviation cannot be blank."]})
    if Unit.objects.filter(name__iexact=clean_name).exists():
        raise ValidationError({"name": ["A unit with this name already exists."]})
    if Unit.objects.filter(abbreviation__iexact=clean_abbr).exists():
        raise ValidationError({"abbreviation": ["A unit with this abbreviation already exists."]})

    effective_factor = _validate_unit_conversion(
        unit=None,
        unit_type=unit_type,
        base_unit=base_unit,
        conversion_factor=conversion_factor,
    )

    unit = Unit.objects.create(
        name=clean_name,
        name_km=(name_km or "").strip(),
        abbreviation=clean_abbr,
        unit_type=unit_type,
        allow_decimal=allow_decimal,
        base_unit=base_unit,
        conversion_factor=effective_factor,
        is_active=is_active,
    )

    log_audit_event(
        actor=actor,
        action="unit.created",
        target_type="Unit",
        target_id=unit.id,
        ip_address=ip_address,
        metadata={
            "name": unit.name,
            "abbreviation": unit.abbreviation,
            "unit_type": unit.unit_type,
            "is_active": unit.is_active,
        },
    )
    return unit


@transaction.atomic
def update_unit(
    *,
    actor,
    unit: Unit,
    name: str | None = None,
    name_km: str | None = None,
    abbreviation: str | None = None,
    unit_type: str | None = None,
    allow_decimal: bool | None = None,
    base_unit_provided: bool = False,
    base_unit: Unit | None = None,
    conversion_factor: Decimal | None = None,
    is_active: bool | None = None,
    ip_address: str | None = None,
) -> Unit:
    updated_fields: list[str] = []

    if name is not None:
        clean_name = name.strip()
        if not clean_name:
            raise ValidationError({"name": ["Unit name cannot be blank."]})
        if Unit.objects.filter(name__iexact=clean_name).exclude(pk=unit.pk).exists():
            raise ValidationError({"name": ["A unit with this name already exists."]})
        if clean_name != unit.name:
            unit.name = clean_name
            updated_fields.append("name")

    if name_km is not None:
        clean_km = name_km.strip()
        if clean_km != unit.name_km:
            unit.name_km = clean_km
            updated_fields.append("name_km")

    if abbreviation is not None:
        clean_abbr = abbreviation.strip()
        if not clean_abbr:
            raise ValidationError({"abbreviation": ["Abbreviation cannot be blank."]})
        if Unit.objects.filter(abbreviation__iexact=clean_abbr).exclude(pk=unit.pk).exists():
            raise ValidationError({"abbreviation": ["A unit with this abbreviation already exists."]})
        if clean_abbr != unit.abbreviation:
            unit.abbreviation = clean_abbr
            updated_fields.append("abbreviation")

    effective_type = unit_type if unit_type is not None else unit.unit_type
    if unit_type is not None and unit_type != unit.unit_type:
        if unit.derived_units.exists():
            raise ValidationError(
                {"unit_type": ["Cannot change unit type while derived units reference this unit."]}
            )
        unit.unit_type = unit_type
        updated_fields.append("unit_type")

    if allow_decimal is not None and unit.allow_decimal != allow_decimal:
        unit.allow_decimal = allow_decimal
        updated_fields.append("allow_decimal")

    effective_base = base_unit if base_unit_provided else unit.base_unit
    effective_factor_input = (
        conversion_factor if conversion_factor is not None else unit.conversion_factor
    )
    validated_factor = _validate_unit_conversion(
        unit=unit,
        unit_type=effective_type,
        base_unit=effective_base,
        conversion_factor=effective_factor_input,
    )

    if base_unit_provided:
        new_base_id = base_unit.pk if base_unit else None
        if unit.base_unit_id != new_base_id:
            unit.base_unit = base_unit
            updated_fields.append("base_unit")

    if unit.conversion_factor != validated_factor:
        unit.conversion_factor = validated_factor
        updated_fields.append("conversion_factor")

    if is_active is not None and unit.is_active != is_active:
        unit.is_active = is_active
        updated_fields.append("is_active")

    if updated_fields:
        unit.save(update_fields=[*updated_fields, "updated_at"])
        log_audit_event(
            actor=actor,
            action="unit.updated",
            target_type="Unit",
            target_id=unit.id,
            ip_address=ip_address,
            metadata={"name": unit.name, "updated_fields": updated_fields},
        )
    return unit


@transaction.atomic
def set_unit_active_status(
    *,
    actor,
    unit: Unit,
    is_active: bool,
    ip_address: str | None = None,
) -> Unit:
    if unit.is_active != is_active:
        unit.is_active = is_active
        unit.save(update_fields=["is_active", "updated_at"])

    log_audit_event(
        actor=actor,
        action="unit.activated" if is_active else "unit.deactivated",
        target_type="Unit",
        target_id=unit.id,
        ip_address=ip_address,
        metadata={"name": unit.name, "abbreviation": unit.abbreviation, "is_active": is_active},
    )
    return unit


@transaction.atomic
def delete_unit(*, actor, unit: Unit, ip_address: str | None = None) -> None:
    """Prevent deleting units referenced by derived units or products (ProtectedError)."""
    derived_count = unit.derived_units.count()
    if derived_count > 0:
        raise UnitInUseError(
            f"Cannot delete unit '{unit.name}' because {derived_count} derived unit(s) reference it."
        )

    unit_id = unit.id
    unit_name = unit.name
    unit_abbr = unit.abbreviation

    try:
        unit.delete()
    except ProtectedError as exc:
        raise UnitInUseError(
            f"Cannot delete unit '{unit_name}' because it is currently used by products or other records."
        ) from exc

    log_audit_event(
        actor=actor,
        action="unit.deleted",
        target_type="Unit",
        target_id=unit_id,
        ip_address=ip_address,
        metadata={"name": unit_name, "abbreviation": unit_abbr},
    )


# ---------------------------------------------------------------------------
# Product Services
# ---------------------------------------------------------------------------

def _validate_money(value: Decimal, field_name: str) -> Decimal:
    if value is None or value.is_nan() or value.is_infinite():
        raise ValidationError({field_name: ["Enter a valid decimal monetary amount."]})
    if value < Decimal("0.00"):
        raise ValidationError({field_name: ["Amount cannot be negative."]})
    return value.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def _validate_quantity(value: Decimal, field_name: str) -> Decimal:
    if value is None or value.is_nan() or value.is_infinite():
        raise ValidationError({field_name: ["Enter a valid decimal quantity."]})
    if value < Decimal("0.000"):
        raise ValidationError({field_name: ["Value cannot be negative."]})
    return value.quantize(QTY_QUANT, rounding=ROUND_HALF_UP)


def _validate_tax_rate(value: Decimal) -> Decimal:
    if value is None or value.is_nan() or value.is_infinite():
        raise ValidationError({"tax_rate": ["Enter a valid tax percentage."]})
    if value < Decimal("0.00") or value > Decimal("100.00"):
        raise ValidationError({"tax_rate": ["Tax rate must be between 0.00 and 100.00."]})
    return value.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def _validate_product_image(image) -> None:
    if not image:
        return
    if getattr(image, "size", 0) > MAX_IMAGE_BYTES:
        raise ValidationError({"image": ["Product image must be 5 MB or smaller."]})
    name = getattr(image, "name", "")
    ext = f".{name.rsplit('.', 1)[-1].lower()}" if "." in name else ""
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise ValidationError(
            {"image": ["Supported image formats are JPG, JPEG, PNG, and WEBP."]}
        )


def _normalize_barcode(barcode: str | None) -> str | None:
    if barcode is None:
        return None
    clean = barcode.strip()
    return clean if clean else None


def _schedule_file_delete(file_field) -> None:
    if not file_field or not getattr(file_field, "name", ""):
        return
    storage = file_field.storage
    name = file_field.name

    def _cleanup():
        try:
            storage.delete(name)
        except Exception:
            pass

    transaction.on_commit(_cleanup)


def _sync_primary_gallery_image(product: Product) -> None:
    """Ensure product has a single primary gallery image when gallery items exist."""
    gallery = list(product.images.order_by("-is_primary", "sort_order", "id"))
    if not gallery:
        return
    primaries = [img for img in gallery if img.is_primary]
    chosen = primaries[0] if primaries else gallery[0]
    for img in gallery:
        desired = img.id == chosen.id
        if img.is_primary != desired:
            img.is_primary = desired
            img.save(update_fields=["is_primary"])


@transaction.atomic
def add_product_images(
    *,
    actor,
    product: Product,
    images: list,
    ip_address: str | None = None,
) -> list[ProductImage]:
    if not images:
        raise ValidationError({"images": ["Please upload at least one product image."]})

    existing_count = product.images.count()
    if existing_count + len(images) > MAX_IMAGES_PER_PRODUCT:
        raise ValidationError(
            {
                "images": [
                    f"A product can have at most {MAX_IMAGES_PER_PRODUCT} images "
                    f"(currently {existing_count})."
                ]
            }
        )

    for img_file in images:
        _validate_product_image(img_file)

    has_primary = product.images.filter(is_primary=True).exists()
    created_items: list[ProductImage] = []
    start_order = existing_count

    for idx, img_file in enumerate(images):
        is_primary = not has_primary and idx == 0
        item = ProductImage.objects.create(
            product=product,
            image=img_file,
            is_primary=is_primary,
            sort_order=start_order + idx,
        )
        created_items.append(item)

    _sync_primary_gallery_image(product)

    log_audit_event(
        actor=actor,
        action="product.images_added",
        target_type="Product",
        target_id=product.id,
        ip_address=ip_address,
        metadata={"sku": product.sku, "added_count": len(created_items)},
    )
    return created_items


@transaction.atomic
def set_primary_product_image(
    *,
    actor,
    product: Product,
    image_id: int,
    ip_address: str | None = None,
) -> ProductImage:
    target = product.images.filter(pk=image_id).first()
    if target is None:
        raise ValidationError({"primary_image_id": ["Selected image does not belong to this product."]})

    product.images.exclude(pk=target.pk).filter(is_primary=True).update(is_primary=False)
    if not target.is_primary:
        target.is_primary = True
        target.save(update_fields=["is_primary"])

    log_audit_event(
        actor=actor,
        action="product.primary_image_changed",
        target_type="Product",
        target_id=product.id,
        ip_address=ip_address,
        metadata={"sku": product.sku, "image_id": target.id},
    )
    return target


@transaction.atomic
def delete_product_image(
    *,
    actor,
    product: Product,
    image_id: int,
    ip_address: str | None = None,
) -> None:
    target = product.images.filter(pk=image_id).first()
    if target is None:
        raise ValidationError({"image_id": ["Image does not belong to this product."]})

    _schedule_file_delete(target.image)
    target.delete()
    _sync_primary_gallery_image(product)

    log_audit_event(
        actor=actor,
        action="product.image_deleted",
        target_type="Product",
        target_id=product.id,
        ip_address=ip_address,
        metadata={"sku": product.sku, "image_id": image_id},
    )


@transaction.atomic
def create_product(
    *,
    actor,
    sku: str,
    name: str,
    category: Category,
    unit: Unit,
    selling_price: Decimal,
    purchase_cost: Decimal = Decimal("0.00"),
    wholesale_price: Decimal | None = None,
    tax_rate: Decimal = Decimal("0.00"),
    min_stock_threshold: Decimal = Decimal("0.000"),
    barcode: str | None = None,
    name_km: str = "",
    description: str = "",
    image=None,
    images: list | None = None,
    track_inventory: bool = True,
    is_active: bool = True,
    ip_address: str | None = None,
) -> Product:
    clean_sku = sku.strip()
    clean_name = name.strip()
    clean_barcode = _normalize_barcode(barcode)

    if not clean_sku:
        raise ValidationError({"sku": ["SKU cannot be blank."]})
    if not clean_name:
        raise ValidationError({"name": ["Product name cannot be blank."]})
    if Product.objects.filter(sku__iexact=clean_sku).exists():
        raise ValidationError({"sku": ["A product with this SKU already exists."]})
    if clean_barcode and Product.objects.filter(barcode__iexact=clean_barcode).exists():
        raise ValidationError({"barcode": ["A product with this barcode already exists."]})

    if not category.is_active:
        raise ValidationError({"category": ["Selected category is inactive."]})
    if not unit.is_active:
        raise ValidationError({"unit": ["Selected unit is inactive."]})

    clean_cost = _validate_money(purchase_cost, "purchase_cost")
    clean_price = _validate_money(selling_price, "selling_price")
    clean_wholesale = (
        _validate_money(wholesale_price, "wholesale_price")
        if wholesale_price is not None
        else None
    )
    clean_tax = _validate_tax_rate(tax_rate)
    clean_min_stock = _validate_quantity(min_stock_threshold, "min_stock_threshold")
    _validate_product_image(image)

    gallery_uploads = list(images or [])
    if len(gallery_uploads) > MAX_IMAGES_PER_PRODUCT:
        raise ValidationError(
            {"images": [f"A product can have at most {MAX_IMAGES_PER_PRODUCT} images."]}
        )
    for img_file in gallery_uploads:
        _validate_product_image(img_file)

    product = Product.objects.create(
        sku=clean_sku,
        barcode=clean_barcode,
        name=clean_name,
        name_km=(name_km or "").strip(),
        description=(description or "").strip(),
        image=image,
        category=category,
        unit=unit,
        purchase_cost=clean_cost,
        selling_price=clean_price,
        wholesale_price=clean_wholesale,
        tax_rate=clean_tax,
        min_stock_threshold=clean_min_stock,
        track_inventory=track_inventory,
        is_active=is_active,
    )

    for idx, img_file in enumerate(gallery_uploads):
        ProductImage.objects.create(
            product=product,
            image=img_file,
            is_primary=(idx == 0),
            sort_order=idx,
        )

    log_audit_event(
        actor=actor,
        action="product.created",
        target_type="Product",
        target_id=product.id,
        ip_address=ip_address,
        metadata={
            "sku": product.sku,
            "barcode": product.barcode,
            "name": product.name,
            "purchase_cost": str(product.purchase_cost),
            "selling_price": str(product.selling_price),
            "wholesale_price": str(product.wholesale_price) if product.wholesale_price is not None else None,
            "gallery_images_count": len(gallery_uploads),
        },
    )
    return product


@transaction.atomic
def update_product(
    *,
    actor,
    product: Product,
    sku: str | None = None,
    barcode_provided: bool = False,
    barcode: str | None = None,
    name: str | None = None,
    name_km: str | None = None,
    description: str | None = None,
    image_provided: bool = False,
    image=None,
    remove_image: bool = False,
    new_images: list | None = None,
    delete_image_ids: list[int] | None = None,
    primary_image_id: int | None = None,
    category: Category | None = None,
    unit: Unit | None = None,
    purchase_cost: Decimal | None = None,
    selling_price: Decimal | None = None,
    wholesale_price_provided: bool = False,
    wholesale_price: Decimal | None = None,
    tax_rate: Decimal | None = None,
    min_stock_threshold: Decimal | None = None,
    track_inventory: bool | None = None,
    is_active: bool | None = None,
    ip_address: str | None = None,
) -> Product:
    updated_fields: list[str] = []
    price_changes: dict[str, dict[str, str | None]] = {}

    if sku is not None:
        clean_sku = sku.strip()
        if not clean_sku:
            raise ValidationError({"sku": ["SKU cannot be blank."]})
        if Product.objects.filter(sku__iexact=clean_sku).exclude(pk=product.pk).exists():
            raise ValidationError({"sku": ["A product with this SKU already exists."]})
        if clean_sku != product.sku:
            product.sku = clean_sku
            updated_fields.append("sku")

    if barcode_provided:
        clean_barcode = _normalize_barcode(barcode)
        if clean_barcode and Product.objects.filter(barcode__iexact=clean_barcode).exclude(pk=product.pk).exists():
            raise ValidationError({"barcode": ["A product with this barcode already exists."]})
        if clean_barcode != product.barcode:
            product.barcode = clean_barcode
            updated_fields.append("barcode")

    if name is not None:
        clean_name = name.strip()
        if not clean_name:
            raise ValidationError({"name": ["Product name cannot be blank."]})
        if clean_name != product.name:
            product.name = clean_name
            updated_fields.append("name")

    if name_km is not None:
        clean_km = name_km.strip()
        if clean_km != product.name_km:
            product.name_km = clean_km
            updated_fields.append("name_km")

    if description is not None:
        clean_desc = description.strip()
        if clean_desc != product.description:
            product.description = clean_desc
            updated_fields.append("description")

    if category is not None and category.pk != product.category_id:
        if not category.is_active:
            raise ValidationError({"category": ["Selected category is inactive."]})
        product.category = category
        updated_fields.append("category")

    if unit is not None and unit.pk != product.unit_id:
        if not unit.is_active:
            raise ValidationError({"unit": ["Selected unit is inactive."]})
        product.unit = unit
        updated_fields.append("unit")

    # Enforce products.edit_price if any monetary price changes
    if purchase_cost is not None:
        clean_cost = _validate_money(purchase_cost, "purchase_cost")
        if clean_cost != product.purchase_cost:
            price_changes["purchase_cost"] = {
                "from": str(product.purchase_cost),
                "to": str(clean_cost),
            }
            product.purchase_cost = clean_cost
            updated_fields.append("purchase_cost")

    if selling_price is not None:
        clean_price = _validate_money(selling_price, "selling_price")
        if clean_price != product.selling_price:
            price_changes["selling_price"] = {
                "from": str(product.selling_price),
                "to": str(clean_price),
            }
            product.selling_price = clean_price
            updated_fields.append("selling_price")

    if wholesale_price_provided:
        clean_wholesale = (
            _validate_money(wholesale_price, "wholesale_price")
            if wholesale_price is not None
            else None
        )
        if clean_wholesale != product.wholesale_price:
            price_changes["wholesale_price"] = {
                "from": str(product.wholesale_price) if product.wholesale_price is not None else None,
                "to": str(clean_wholesale) if clean_wholesale is not None else None,
            }
            product.wholesale_price = clean_wholesale
            updated_fields.append("wholesale_price")

    if price_changes and not actor.has_rbac_permission("products.edit_price"):
        raise PermissionDenied("Missing required permission: products.edit_price.")

    if tax_rate is not None:
        clean_tax = _validate_tax_rate(tax_rate)
        if clean_tax != product.tax_rate:
            product.tax_rate = clean_tax
            updated_fields.append("tax_rate")

    if min_stock_threshold is not None:
        clean_min_stock = _validate_quantity(min_stock_threshold, "min_stock_threshold")
        if clean_min_stock != product.min_stock_threshold:
            product.min_stock_threshold = clean_min_stock
            updated_fields.append("min_stock_threshold")

    if track_inventory is not None and product.track_inventory != track_inventory:
        product.track_inventory = track_inventory
        updated_fields.append("track_inventory")

    if is_active is not None and product.is_active != is_active:
        product.is_active = is_active
        updated_fields.append("is_active")

    if remove_image and product.image:
        _schedule_file_delete(product.image)
        product.image = None
        updated_fields.append("image")
    elif image_provided and image is not None:
        _validate_product_image(image)
        if product.image:
            _schedule_file_delete(product.image)
        product.image = image
        updated_fields.append("image")

    gallery_changed = False
    if delete_image_ids:
        to_delete = list(product.images.filter(id__in=delete_image_ids))
        for item in to_delete:
            _schedule_file_delete(item.image)
            item.delete()
            gallery_changed = True

    if new_images:
        existing_count = product.images.count()
        if existing_count + len(new_images) > MAX_IMAGES_PER_PRODUCT:
            raise ValidationError(
                {
                    "images": [
                        f"A product can have at most {MAX_IMAGES_PER_PRODUCT} images "
                        f"(currently {existing_count})."
                    ]
                }
            )
        for img_file in new_images:
            _validate_product_image(img_file)
        has_primary = product.images.filter(is_primary=True).exists()
        for idx, img_file in enumerate(new_images):
            ProductImage.objects.create(
                product=product,
                image=img_file,
                is_primary=(not has_primary and idx == 0),
                sort_order=existing_count + idx,
            )
        gallery_changed = True

    if primary_image_id is not None:
        target_img = product.images.filter(pk=primary_image_id).first()
        if target_img is None:
            raise ValidationError(
                {"primary_image_id": ["Selected primary image does not belong to this product."]}
            )
        product.images.exclude(pk=target_img.pk).filter(is_primary=True).update(is_primary=False)
        if not target_img.is_primary:
            target_img.is_primary = True
            target_img.save(update_fields=["is_primary"])
        gallery_changed = True

    if gallery_changed:
        _sync_primary_gallery_image(product)
        if "images" not in updated_fields:
            updated_fields.append("images")

    if updated_fields:
        save_fields = [f for f in updated_fields if f != "images"]
        if save_fields:
            product.save(update_fields=[*save_fields, "updated_at"])
        else:
            product.save(update_fields=["updated_at"])
        log_audit_event(
            actor=actor,
            action="product.updated",
            target_type="Product",
            target_id=product.id,
            ip_address=ip_address,
            metadata={"sku": product.sku, "updated_fields": updated_fields},
        )
        if price_changes:
            log_audit_event(
                actor=actor,
                action="product.price_changed",
                target_type="Product",
                target_id=product.id,
                ip_address=ip_address,
                metadata={"sku": product.sku, "changes": price_changes},
            )

    return product


@transaction.atomic
def set_product_active_status(
    *,
    actor,
    product: Product,
    is_active: bool,
    ip_address: str | None = None,
) -> Product:
    if product.is_active != is_active:
        product.is_active = is_active
        product.save(update_fields=["is_active", "updated_at"])

    log_audit_event(
        actor=actor,
        action="product.activated" if is_active else "product.deactivated",
        target_type="Product",
        target_id=product.id,
        ip_address=ip_address,
        metadata={"sku": product.sku, "name": product.name, "is_active": is_active},
    )
    return product


@transaction.atomic
def delete_product(*, actor, product: Product, ip_address: str | None = None) -> None:
    """Prevent deleting products referenced in historical transactions (sales, stock movements, purchases)."""
    prod_id = product.id
    prod_sku = product.sku
    prod_name = product.name

    try:
        product.delete()
    except ProtectedError as exc:
        raise ProductInUseError(
            f"Cannot delete product '{prod_name}' ({prod_sku}) because it is referenced in historical transactions."
        ) from exc

    log_audit_event(
        actor=actor,
        action="product.deleted",
        target_type="Product",
        target_id=prod_id,
        ip_address=ip_address,
        metadata={"sku": prod_sku, "name": prod_name},
    )
