"""Serializers for RBAC permissions and roles."""

from rest_framework import serializers

from apps.rbac.models import Permission, Role


class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = ["id", "code", "module", "action", "description"]
        read_only_fields = fields


class RoleSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = ["id", "name", "slug", "is_system", "is_super_admin"]
        read_only_fields = fields


class RoleSerializer(serializers.ModelSerializer):
    permissions = PermissionSerializer(many=True, read_only=True)
    permission_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        write_only=True,
        required=False,
    )
    user_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Role
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "is_system",
            "is_super_admin",
            "permissions",
            "permission_ids",
            "user_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "is_system", "is_super_admin", "created_at", "updated_at"]
        extra_kwargs = {
            "slug": {"required": False},
        }


class RolePermissionAssignSerializer(serializers.Serializer):
    permission_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=True,
    )
