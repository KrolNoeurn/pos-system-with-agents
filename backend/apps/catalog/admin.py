from django.contrib import admin

from apps.catalog.models import Category


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "name_km", "slug", "parent", "is_active", "updated_at")
    list_filter = ("is_active",)
    search_fields = ("name", "name_km", "slug")
    ordering = ("name",)
