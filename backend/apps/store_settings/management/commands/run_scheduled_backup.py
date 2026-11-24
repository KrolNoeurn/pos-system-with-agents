"""Management command to execute scheduled POS database & media backups per crontab config."""

from django.core.management.base import BaseCommand

from apps.store_settings.backup_services import run_due_scheduled_backup
from apps.store_settings.models import BackupRun


class Command(BaseCommand):
    help = (
        "Run POS database & media backup if enabled and matching the configured crontab schedule "
        "(or immediately when --force is passed)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Bypass enabled/schedule check and run backup immediately.",
        )

    def handle(self, *args, **options):
        force = bool(options.get("force"))
        run = run_due_scheduled_backup(force=force)
        if run is None:
            self.stdout.write("No scheduled backup due at this minute.")
            return

        if run.status == BackupRun.Status.SUCCESS:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Backup #{run.id} completed: {run.file_name} ({run.file_size_bytes} bytes, "
                    f"media={run.media_files_count}, telegram_sent={run.telegram_sent})."
                )
            )
        else:
            self.stderr.write(
                self.style.ERROR(f"Backup #{run.id} failed: {run.error_message}")
            )
            raise SystemExit(1)
