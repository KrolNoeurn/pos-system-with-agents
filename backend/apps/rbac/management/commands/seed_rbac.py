"""Management command to seed default RBAC permissions and system roles."""

from django.core.management.base import BaseCommand

from apps.rbac.services import sync_default_rbac


class Command(BaseCommand):
    help = "Idempotently seed canonical POS RBAC permissions and default system roles."

    def handle(self, *args, **options) -> None:
        summary = sync_default_rbac()
        self.stdout.write(
            self.style.SUCCESS(
                f"RBAC sync complete: {summary['permissions_total']} permissions "
                f"({summary['permissions_created']} created), "
                f"{summary['roles_created']} system roles created."
            )
        )
