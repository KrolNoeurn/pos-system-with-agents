"""DRF serializers for Category API."""

from rest_framework import serializers

from apps.catalog.models import Category


class CategorySerializer(serializers.ModelSerializer):
    parent_name = serializers.CharField(source="parent.name", read_only=True, default=None)
    children_count = serializers.IntegerField(read_only=True, default=0)
    is_in_use = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = [
            "id",
            "name",
            "name_km",
            "slug",
            "parent",
            "parent_name",
            "description",
            "is_active",
            "children_count",
            "is_in_use",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "parent_name", "children_count", "is_in_use", "created_at", "updated_at"]
        extra_kwargs = {
            "slug": {"required": False, "allow_blank": True},
        }

    def get_is_in_use(self, obj) -> bool:
        children_count = getattr(obj, "children_count", None)
        if children_count is not None:
            return children_count > 0
        return obj.children.exists()


class CategoryWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    name_km = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    slug = serializers.CharField(max_length=140, required=False, allow_blank=True)
    parent = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(),
        required=False,
        allow_null=True,
    )
    description = serializers.CharField(required=False, allow_blank=True, default="")
    is_active = serializers.BooleanField(required=False, default=True)

    def validate_name(self, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise serializers.ValidationError("Category name cannot be blank.")
        return clean


class CategoryUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120, required=False)
    name_km = serializers.CharField(max_length=150, required=False, allow_blank=True)
    slug = serializers.CharField(max_length=140, required=False, allow_blank=True)
    parent = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(),
        required=False,
        allow_null=True,
    )
    description = serializers.CharField(required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)

    def validate_name(self, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise serializers.ValidationError("Category name cannot be blank.")
        return clean
