"""Transactional business services for Store Settings."""

from decimal import Decimal, ROUND_HALF_UP

from django.db import IntegrityError, transaction
from rest_framework.exceptions import ValidationError

from apps.audit.services import log_audit_event
from apps.store_settings.models import StoreSetting

MONEY_QUANT = Decimal("0.01")
SINGLETON_PK = 1


def get_store_settings() -> StoreSetting:
    """Return the singleton StoreSetting instance, creating defaults if absent."""
    instance = StoreSetting.objects.select_related("updated_by").filter(pk=SINGLETON_PK).first()
    if instance is not None:
        return instance

    try:
        with transaction.atomic():
            instance, _ = StoreSetting.objects.get_or_create(pk=SINGLETON_PK)
            return instance
    except IntegrityError:
        return StoreSetting.objects.select_related("updated_by").get(pk=SINGLETON_PK)


@transaction.atomic
def update_store_settings(
    *,
    actor,
    ip_address: str | None = None,
    **updates,
) -> StoreSetting:
    """Validate and atomically update store settings with sanitized audit logging."""
    get_store_settings()
    locked = StoreSetting.objects.select_for_update().get(pk=SINGLETON_PK)

    changed_fields: list[str] = []
    change_summary: dict[str, dict[str, str]] = {}

    str_fields = {
        "store_name",
        "store_name_km",
        "tagline",
        "phone",
        "email",
        "address",
        "address_km",
        "tax_id",
        "currency_code",
        "currency_symbol",
        "receipt_header",
        "receipt_footer",
        "receipt_footer_km",
    }
    bool_fields = {"show_khr_on_receipt", "show_tax_id_on_receipt"}

    for field, raw_val in updates.items():
        if field in str_fields:
            clean_val = (raw_val or "").strip()
            if field == "store_name" and not clean_val:
                raise ValidationError({"store_name": ["Store name cannot be blank."]})
            if field == "currency_code":
                clean_val = clean_val.upper()
                if not clean_val:
                    raise ValidationError({"currency_code": ["Currency code cannot be blank."]})
            if field == "currency_symbol" and not clean_val:
                raise ValidationError({"currency_symbol": ["Currency symbol cannot be blank."]})

            old_val = getattr(locked, field)
            if clean_val != old_val:
                setattr(locked, field, clean_val)
                changed_fields.append(field)
                change_summary[field] = {"from": str(old_val), "to": str(clean_val)}

        elif field in bool_fields:
            new_bool = bool(raw_val)
            old_bool = getattr(locked, field)
            if new_bool != old_bool:
                setattr(locked, field, new_bool)
                changed_fields.append(field)
                change_summary[field] = {"from": str(old_bool), "to": str(new_bool)}

        elif field == "exchange_rate_khr":
            val = Decimal(raw_val).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
            if val <= Decimal("0.00"):
                raise ValidationError(
                    {"exchange_rate_khr": ["Exchange rate must be greater than zero."]}
                )
            if val != locked.exchange_rate_khr:
                change_summary[field] = {
                    "from": str(locked.exchange_rate_khr),
                    "to": str(val),
                }
                locked.exchange_rate_khr = val
                changed_fields.append(field)

        elif field == "default_tax_rate":
            val = Decimal(raw_val).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
            if val < Decimal("0.00") or val > Decimal("100.00"):
                raise ValidationError(
                    {"default_tax_rate": ["Default tax rate must be between 0 and 100."]}
                )
            if val != locked.default_tax_rate:
                change_summary[field] = {
                    "from": str(locked.default_tax_rate),
                    "to": str(val),
                }
                locked.default_tax_rate = val
                changed_fields.append(field)

    if changed_fields:
        locked.updated_by = actor
        locked.save(update_fields=[*changed_fields, "updated_by", "updated_at"])
        log_audit_event(
            actor=actor,
            action="settings.updated",
            target_type="StoreSetting",
            target_id=locked.id,
            ip_address=ip_address,
            metadata={"changed_fields": changed_fields, "changes": change_summary},
        )

    return StoreSetting.objects.select_related("updated_by").get(pk=SINGLETON_PK)
