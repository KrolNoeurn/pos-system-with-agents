"""Catalog domain models — Categories (with hierarchical parent support)."""

from django.db import models


class Category(models.Model):
    name = models.CharField(max_length=120, unique=True, db_index=True)
    name_km = models.CharField(max_length=150, blank=True, default="")
    slug = models.SlugField(max_length=140, unique=True, db_index=True)
    parent = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="children",
    )
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "catalog_categories"
        ordering = ["name"]
        verbose_name_plural = "Categories"

    def __str__(self) -> str:
        return self.name
