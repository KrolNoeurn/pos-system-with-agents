"""Management command to bootstrap an initial Super Administrator account."""

import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from apps.rbac.models import Role
from apps.rbac.services import sync_default_rbac

User = get_user_model()


class Command(BaseCommand):
    help = "Seed RBAC and create an initial Super Administrator from CLI arguments or env vars."

    def add_arguments(self, parser) -> None:
        parser.add_argument("--username", default=os.environ.get("POS_ADMIN_USERNAME"))
        parser.add_argument("--email", default=os.environ.get("POS_ADMIN_EMAIL"))
        parser.add_argument("--password", default=os.environ.get("POS_ADMIN_PASSWORD"))
        parser.add_argument("--full-name", default=os.environ.get("POS_ADMIN_FULL_NAME", "Super Administrator"))

    def handle(self, *args, **options) -> None:
        username = (options["username"] or "").strip()
        email = (options["email"] or "").strip().lower()
        password = options["password"] or ""
        full_name = (options["full_name"] or "Super Administrator").strip()

        if not username or not email or not password:
            raise CommandError(
                "Provide --username, --email, and --password (or set POS_ADMIN_USERNAME, POS_ADMIN_EMAIL, POS_ADMIN_PASSWORD)."
            )

        sync_default_rbac()
        super_admin_role = Role.objects.get(slug="super_admin")

        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                "email": email,
                "full_name": full_name,
                "is_active": True,
                "is_staff": True,
                "is_superuser": True,
                "is_system_account": True,
            },
        )
        if created:
            user.set_password(password)
            user.save(update_fields=["password"])
            user.roles.add(super_admin_role)
            self.stdout.write(self.style.SUCCESS(f"Created Super Administrator '{username}'."))
        else:
            user.roles.add(super_admin_role)
            self.stdout.write(self.style.WARNING(f"User '{username}' already exists; ensured super_admin role."))
