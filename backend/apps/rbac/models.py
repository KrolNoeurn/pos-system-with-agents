"""RBAC Permission and Role models."""

from django.db import models


class Permission(models.Model):
    code = models.CharField(max_length=100, unique=True, db_index=True)
    module = models.CharField(max_length=50, db_index=True)
    action = models.CharField(max_length=50, db_index=True)
    description = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "rbac_permissions"
        ordering = ["module", "action"]
        constraints = [
            models.UniqueConstraint(fields=["module", "action"], name="uq_rbac_perm_module_action"),
        ]

    def __str__(self) -> str:
        return self.code


class Role(models.Model):
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True, db_index=True)
    description = models.TextField(blank=True, default="")
    is_system = models.BooleanField(default=False)
    is_super_admin = models.BooleanField(default=False)
    permissions = models.ManyToManyField(
        Permission,
        related_name="roles",
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "rbac_roles"
        ordering = ["-is_super_admin", "-is_system", "name"]

    def __str__(self) -> str:
        return self.name
