"""DRF serializers for authentication, profile, password change, and user administration."""

from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.rbac.serializers import RoleSummarySerializer

User = get_user_model()


class UserReadSerializer(serializers.ModelSerializer):
    roles = RoleSummarySerializer(many=True, read_only=True)
    permissions = serializers.SerializerMethodField()
    is_super_admin = serializers.BooleanField(source="is_super_admin_user", read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "full_name",
            "phone",
            "is_active",
            "is_system_account",
            "is_super_admin",
            "roles",
            "permissions",
            "preferred_language",
            "preferred_theme",
            "preferred_layout",
            "last_login",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_permissions(self, obj) -> list[str]:
        return sorted(obj.get_permission_codes())


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, trim_whitespace=False)


class TokenRefreshInputSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField(required=False, allow_blank=True)


class ProfileUpdateSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
    preferred_language = serializers.ChoiceField(choices=["en", "km"], required=False)
    preferred_theme = serializers.ChoiceField(choices=["light", "dark"], required=False)
    preferred_layout = serializers.ChoiceField(choices=["vertical", "horizontal"], required=False)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)
    confirm_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": ["Passwords do not match."]})
        return attrs


class UserCreateSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    full_name = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")
    is_active = serializers.BooleanField(required=False, default=True)
    role_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=False,
        default=list,
    )


class UserUpdateSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False)
    full_name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
    password = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        trim_whitespace=False,
    )
    role_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=False,
    )


class UserRolesAssignSerializer(serializers.Serializer):
    role_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=True,
    )
