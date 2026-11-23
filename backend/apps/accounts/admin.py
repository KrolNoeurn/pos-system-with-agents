from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from apps.accounts.models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ("username", "email", "full_name", "is_active", "is_superuser", "is_system_account")
    list_filter = ("is_active", "is_superuser", "is_system_account", "roles")
    search_fields = ("username", "email", "full_name")
    ordering = ("username",)
    filter_horizontal = ("roles", "groups", "user_permissions")
    fieldsets = (
        (None, {"fields": ("username", "password")}),
        ("Personal info", {"fields": ("full_name", "email", "phone")}),
        ("Preferences", {"fields": ("preferred_language", "preferred_theme", "preferred_layout")}),
        (
            "Permissions & RBAC",
            {"fields": ("is_active", "is_staff", "is_superuser", "is_system_account", "roles")},
        ),
        ("Important dates", {"fields": ("last_login",)}),
    )
