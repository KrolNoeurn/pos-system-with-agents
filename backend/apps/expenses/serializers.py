"""DRF serializers for Expense Categories and Expenses."""

from decimal import Decimal

from rest_framework import serializers

from apps.expenses.models import Expense, ExpenseCategory


class ExpenseCategorySerializer(serializers.ModelSerializer):
    expenses_count = serializers.IntegerField(read_only=True, default=0)
    is_in_use = serializers.SerializerMethodField()

    class Meta:
        model = ExpenseCategory
        fields = [
            "id",
            "name",
            "name_km",
            "description",
            "is_active",
            "expenses_count",
            "is_in_use",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_is_in_use(self, obj) -> bool:
        count = getattr(obj, "expenses_count", None)
        if count is not None:
            return count > 0
        return obj.expenses.exists()


class ExpenseCategoryWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    name_km = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    description = serializers.CharField(required=False, allow_blank=True, default="")
    is_active = serializers.BooleanField(required=False, default=True)

    def validate_name(self, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise serializers.ValidationError("Expense category name cannot be blank.")
        return clean


class ExpenseCategoryUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120, required=False)
    name_km = serializers.CharField(max_length=150, required=False, allow_blank=True)
    description = serializers.CharField(required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)

    def validate_name(self, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise serializers.ValidationError("Expense category name cannot be blank.")
        return clean


class ExpenseSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    category_name_km = serializers.CharField(source="category.name_km", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)
    updated_by_username = serializers.CharField(
        source="updated_by.username", read_only=True, default=None
    )

    class Meta:
        model = Expense
        fields = [
            "id",
            "expense_number",
            "category",
            "category_name",
            "category_name_km",
            "title",
            "amount",
            "expense_date",
            "payment_method",
            "reference_code",
            "vendor_name",
            "notes",
            "created_by",
            "created_by_username",
            "updated_by",
            "updated_by_username",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ExpenseWriteSerializer(serializers.Serializer):
    category = serializers.PrimaryKeyRelatedField(queryset=ExpenseCategory.objects.all())
    title = serializers.CharField(max_length=180)
    amount = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        min_value=Decimal("0.01"),
    )
    expense_date = serializers.DateField()
    payment_method = serializers.ChoiceField(
        choices=Expense.PaymentMethod.choices,
        required=False,
        default=Expense.PaymentMethod.CASH,
    )
    reference_code = serializers.CharField(
        max_length=80, required=False, allow_blank=True, default=""
    )
    vendor_name = serializers.CharField(
        max_length=160, required=False, allow_blank=True, default=""
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_title(self, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise serializers.ValidationError("Expense title cannot be blank.")
        return clean


class ExpenseUpdateSerializer(serializers.Serializer):
    category = serializers.PrimaryKeyRelatedField(
        queryset=ExpenseCategory.objects.all(), required=False
    )
    title = serializers.CharField(max_length=180, required=False)
    amount = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        min_value=Decimal("0.01"),
        required=False,
    )
    expense_date = serializers.DateField(required=False)
    payment_method = serializers.ChoiceField(
        choices=Expense.PaymentMethod.choices, required=False
    )
    reference_code = serializers.CharField(max_length=80, required=False, allow_blank=True)
    vendor_name = serializers.CharField(max_length=160, required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate_title(self, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise serializers.ValidationError("Expense title cannot be blank.")
        return clean
