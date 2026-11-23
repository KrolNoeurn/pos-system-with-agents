"""Custom User model with RBAC role integration and UI preferences."""

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models

from apps.rbac.models import Permission, Role


class UserManager(BaseUserManager):
    def create_user(
        self,
        username: str,
        email: str,
        password: str | None = None,
        **extra_fields,
    ):
        if not username or not username.strip():
            raise ValueError("Username is required.")
        if not email or not email.strip():
            raise ValueError("Email is required.")

        email = self.normalize_email(email.strip().lower())
        username = username.strip()
        extra_fields.setdefault("is_active", True)
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)

        user = self.model(username=username, email=email, **extra_fields)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(
        self,
        username: str,
        email: str,
        password: str | None = None,
        **extra_fields,
    ):
        extra_fields.setdefault("is_active", True)
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_system_account", True)
        extra_fields.setdefault("full_name", "Super Administrator")

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        return self.create_user(username=username, email=email, password=password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    LANGUAGE_CHOICES = [("en", "English"), ("km", "Khmer")]
    THEME_CHOICES = [("light", "Light"), ("dark", "Dark")]
    LAYOUT_CHOICES = [("vertical", "Vertical"), ("horizontal", "Horizontal")]

    username = models.CharField(max_length=150, unique=True, db_index=True)
    email = models.EmailField(unique=True, db_index=True)
    full_name = models.CharField(max_length=255, blank=True, default="")
    phone = models.CharField(max_length=32, blank=True, default="")

    is_active = models.BooleanField(default=True, db_index=True)
    is_staff = models.BooleanField(default=False)
    is_system_account = models.BooleanField(default=False)

    roles = models.ManyToManyField(
        Role,
        related_name="users",
        blank=True,
    )

    preferred_language = models.CharField(max_length=5, choices=LANGUAGE_CHOICES, default="en")
    preferred_theme = models.CharField(max_length=10, choices=THEME_CHOICES, default="light")
    preferred_layout = models.CharField(max_length=12, choices=LAYOUT_CHOICES, default="vertical")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = ["email"]

    class Meta:
        db_table = "accounts_users"
        ordering = ["-is_superuser", "username"]

    def __str__(self) -> str:
        return self.username

    @property
    def is_super_admin_user(self) -> bool:
        if self.is_superuser:
            return True
        # Use prefetched cache when available to avoid extra queries.
        prefetched = getattr(self, "_prefetched_objects_cache", {})
        if "roles" in prefetched:
            return any(role.is_super_admin for role in prefetched["roles"])
        return self.roles.filter(is_super_admin=True).exists()

    def get_permission_codes(self) -> set[str]:
        if not self.is_active:
            return set()
        if self.is_super_admin_user:
            return set(Permission.objects.values_list("code", flat=True))

        prefetched = getattr(self, "_prefetched_objects_cache", {})
        if "roles" in prefetched:
            codes: set[str] = set()
            for role in prefetched["roles"]:
                role_prefetched = getattr(role, "_prefetched_objects_cache", {})
                if "permissions" in role_prefetched:
                    codes.update(p.code for p in role_prefetched["permissions"])
                else:
                    codes.update(role.permissions.values_list("code", flat=True))
            return codes

        return set(
            Permission.objects.filter(roles__users=self).values_list("code", flat=True).distinct()
        )

    def has_rbac_permission(self, code: str) -> bool:
        if not self.is_active:
            return False
        if self.is_super_admin_user:
            return True
        return code in self.get_permission_codes()
