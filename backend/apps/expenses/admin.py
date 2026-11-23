from django.contrib import admin

from apps.expenses.models import Expense, ExpenseCategory


@admin.register(ExpenseCategory)
class ExpenseCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "name_km", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name", "name_km")


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = (
        "expense_number",
        "title",
        "category",
        "amount",
        "expense_date",
        "payment_method",
        "created_by",
    )
    list_filter = ("category", "payment_method", "expense_date")
    search_fields = ("expense_number", "title", "vendor_name", "reference_code")
