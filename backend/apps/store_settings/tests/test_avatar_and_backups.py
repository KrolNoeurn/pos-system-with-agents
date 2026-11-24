"""Tests for User Profile Image (avatar) and Database/Media Backup to Telegram with Crontab."""

from datetime import datetime
from io import BytesIO
import json
from pathlib import Path
import tempfile
from unittest.mock import patch
import zipfile
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import override_settings
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from apps.audit.models import AuditLog
from apps.rbac.models import Permission, Role
from apps.rbac.services import sync_default_rbac
from apps.store_settings.backup_services import (
    cron_matches_datetime,
    get_next_cron_runs,
    run_due_scheduled_backup,
)
from apps.store_settings.models import BackupRun, BackupSetting

User = get_user_model()


def _make_test_png(name: str = "avatar.png", color=(40, 120, 220)) -> SimpleUploadedFile:
    buf = BytesIO()
    img = Image.new("RGB", (64, 64), color=color)
    img.save(buf, format="PNG")
    return SimpleUploadedFile(name, buf.getvalue(), content_type="image/png")


class _MockHTTPResponse:
    def __init__(self, payload: dict):
        self._raw = json.dumps(payload).encode("utf-8")

    def read(self):
        return self._raw

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class ProfileAvatarAndTelegramBackupTests(APITestCase):
    def setUp(self):
        self.tmp_media = tempfile.TemporaryDirectory(prefix="pos_test_media_")
        self.tmp_backup = tempfile.TemporaryDirectory(prefix="pos_test_backup_")
        self.addCleanup(self.tmp_media.cleanup)
        self.addCleanup(self.tmp_backup.cleanup)

        sync_default_rbac()

        self.admin_role = Role.objects.get(slug="super_admin")
        self.viewer_role = Role.objects.create(name="Settings Viewer", slug="settings-viewer")
        self.viewer_role.permissions.set(Permission.objects.filter(code__in=["settings.view"]))

        self.admin = User.objects.create_superuser(
            username="backup_admin",
            email="backup_admin@example.com",
            password="StrongPassword123!",
        )
        self.admin.roles.add(self.admin_role)

        self.viewer = User.objects.create_user(
            username="backup_viewer",
            email="backup_viewer@example.com",
            password="StrongPassword123!",
            full_name="Viewer User",
        )
        self.viewer.roles.add(self.viewer_role)

    def test_profile_avatar_upload_replace_and_remove(self):
        with override_settings(MEDIA_ROOT=Path(self.tmp_media.name)):
            self.client.force_authenticate(user=self.viewer)

            # Upload profile photo via PATCH /api/v1/auth/me/
            res = self.client.patch(
                "/api/v1/auth/me/",
                {
                    "full_name": "Viewer Updated",
                    "phone": "012345678",
                    "avatar": _make_test_png("me.png"),
                },
                format="multipart",
            )
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            self.assertEqual(res.data["full_name"], "Viewer Updated")
            self.assertTrue(res.data["avatar"])
            self.assertIn("/media/avatars/", res.data["avatar_url"])

            # Verify GET /api/v1/auth/me/ returns avatar_url
            me_res = self.client.get("/api/v1/auth/me/")
            self.assertEqual(me_res.status_code, status.HTTP_200_OK)
            self.assertEqual(me_res.data["avatar_url"], res.data["avatar_url"])

            # Remove avatar explicitly
            remove_res = self.client.patch(
                "/api/v1/auth/me/",
                {"remove_avatar": True},
                format="json",
            )
            self.assertEqual(remove_res.status_code, status.HTTP_200_OK)
            self.assertIsNone(remove_res.data["avatar"])
            self.assertIsNone(remove_res.data["avatar_url"])

            # Audit trail recorded avatar updates
            self.assertTrue(
                AuditLog.objects.filter(actor=self.viewer, action="auth.profile_updated").exists()
            )

    def test_backup_settings_crontab_validation_token_masking_and_rbac(self):
        with override_settings(
            MEDIA_ROOT=Path(self.tmp_media.name),
            BACKUP_ROOT=Path(self.tmp_backup.name),
        ):
            # Viewer can read settings but cannot modify or run backup
            self.client.force_authenticate(user=self.viewer)
            get_res = self.client.get("/api/v1/settings/backups/")
            self.assertEqual(get_res.status_code, status.HTTP_200_OK)
            self.assertEqual(get_res.data["cron_expression"], "0 2 * * *")
            self.assertEqual(len(get_res.data["next_runs"]), 3)
            self.assertIn("run_scheduled_backup", get_res.data["crontab_entry"])

            forbidden_patch = self.client.patch(
                "/api/v1/settings/backups/", {"cron_expression": "*/15 * * * *"}, format="json"
            )
            self.assertEqual(forbidden_patch.status_code, status.HTTP_403_FORBIDDEN)

            forbidden_run = self.client.post("/api/v1/settings/backups/run/", {}, format="json")
            self.assertEqual(forbidden_run.status_code, status.HTTP_403_FORBIDDEN)

            # Admin updates config with invalid cron -> 400
            self.client.force_authenticate(user=self.admin)
            bad_cron = self.client.patch(
                "/api/v1/settings/backups/", {"cron_expression": "99 25 * * *"}, format="json"
            )
            self.assertEqual(bad_cron.status_code, status.HTTP_400_BAD_REQUEST)

            # Admin configures valid crontab + Telegram credentials; raw token must NEVER leak
            raw_token = "123456789:AAFakeSecretTelegramTokenValueXYZ9"
            ok_patch = self.client.patch(
                "/api/v1/settings/backups/",
                {
                    "is_enabled": True,
                    "cron_expression": "30 3 * * 1-5",
                    "timezone_name": "Asia/Phnom_Penh",
                    "include_database": True,
                    "include_media": True,
                    "retention_count": 3,
                    "telegram_enabled": True,
                    "telegram_bot_token": raw_token,
                    "telegram_chat_id": "-10099887766",
                    "telegram_caption_prefix": "Main POS",
                },
                format="json",
            )
            self.assertEqual(ok_patch.status_code, status.HTTP_200_OK)
            self.assertTrue(ok_patch.data["has_telegram_token"])
            self.assertNotIn("telegram_bot_token", ok_patch.data)
            self.assertNotIn(raw_token, json.dumps(ok_patch.data))
            self.assertTrue(ok_patch.data["telegram_bot_token_masked"].endswith("XYZ9"))

            # Verify AuditLog never contains the raw Telegram bot token
            audit = AuditLog.objects.filter(action="backup.config_updated").first()
            self.assertIsNotNone(audit)
            self.assertNotIn(raw_token, json.dumps(audit.metadata))

    @patch("apps.store_settings.backup_services.urllib.request.urlopen")
    def test_telegram_test_backup_archive_contents_download_and_cron_runner(self, mock_urlopen):
        def fake_urlopen(req, timeout=60):
            url = req.full_url
            if url.endswith("/getMe"):
                return _MockHTTPResponse({"ok": True, "result": {"username": "pos_backup_bot"}})
            if url.endswith("/sendMessage"):
                return _MockHTTPResponse({"ok": True, "result": {"message_id": 101}})
            if url.endswith("/sendDocument"):
                return _MockHTTPResponse({"ok": True, "result": {"message_id": 202}})
            raise AssertionError(f"Unexpected Telegram URL: {url}")

        mock_urlopen.side_effect = fake_urlopen

        with override_settings(
            MEDIA_ROOT=Path(self.tmp_media.name),
            BACKUP_ROOT=Path(self.tmp_backup.name),
        ):
            self.client.force_authenticate(user=self.admin)

            # Upload an avatar so media folder has a real image to archive
            self.client.patch(
                "/api/v1/auth/me/",
                {"avatar": _make_test_png("admin_photo.png")},
                format="multipart",
            )

            # Configure backup + Telegram
            cfg_res = self.client.patch(
                "/api/v1/settings/backups/",
                {
                    "is_enabled": True,
                    "cron_expression": "15 4 * * *",
                    "timezone_name": "Asia/Phnom_Penh",
                    "include_database": True,
                    "include_media": True,
                    "retention_count": 2,
                    "telegram_enabled": True,
                    "telegram_bot_token": "999999:AAValidTokenForTesting1234",
                    "telegram_chat_id": "-100123456",
                },
                format="json",
            )
            self.assertEqual(cfg_res.status_code, status.HTTP_200_OK)

            # Test Telegram connection endpoint
            test_res = self.client.post("/api/v1/settings/backups/test-telegram/", {}, format="json")
            self.assertEqual(test_res.status_code, status.HTTP_200_OK)
            self.assertTrue(test_res.data["ok"])
            self.assertEqual(test_res.data["bot_username"], "pos_backup_bot")

            # Run manual backup now -> builds DB + Media zip & sends to Telegram
            run_res = self.client.post("/api/v1/settings/backups/run/", {}, format="json")
            self.assertEqual(run_res.status_code, status.HTTP_201_CREATED)
            self.assertEqual(run_res.data["status"], "success")
            self.assertTrue(run_res.data["includes_database"])
            self.assertTrue(run_res.data["includes_media"])
            self.assertGreaterEqual(run_res.data["media_files_count"], 1)
            self.assertTrue(run_res.data["telegram_sent"])
            self.assertEqual(run_res.data["telegram_message_id"], "202")
            self.assertTrue(run_res.data["can_download"])

            # Verify actual zip contents include DB snapshot, avatar image, and manifest.json
            run_obj = BackupRun.objects.get(pk=run_res.data["id"])
            with zipfile.ZipFile(run_obj.file_path, "r") as zf:
                names = zf.namelist()
                self.assertIn("database/db.sqlite3", names)
                self.assertIn("manifest.json", names)
                self.assertTrue(any(n.startswith("media/avatars/") for n in names))

            # Download endpoint returns zip bytes
            dl_res = self.client.get(f"/api/v1/settings/backups/runs/{run_obj.id}/download/")
            self.assertEqual(dl_res.status_code, status.HTTP_200_OK)
            self.assertIn("application/zip", dl_res["Content-Type"])
            dl_res.close()

            # Verify cron matching & scheduled runner (matching vs non-matching minute + deduplication)
            tz = ZoneInfo("Asia/Phnom_Penh")
            non_match_dt = datetime(2026, 11, 24, 4, 14, tzinfo=tz)
            match_dt = datetime(2026, 11, 24, 4, 15, tzinfo=tz)
            self.assertFalse(cron_matches_datetime("15 4 * * *", non_match_dt))
            self.assertTrue(cron_matches_datetime("15 4 * * *", match_dt))
            self.assertEqual(len(get_next_cron_runs("15 4 * * *", "Asia/Phnom_Penh", 3, non_match_dt)), 3)

            # Clear last_run_at so scheduled run executes at match_dt
            BackupSetting.objects.filter(pk=1).update(last_run_at=None)
            self.assertIsNone(run_due_scheduled_backup(now=non_match_dt))

            sched_run = run_due_scheduled_backup(now=match_dt)
            self.assertIsNotNone(sched_run)
            self.assertEqual(sched_run.trigger_type, BackupRun.TriggerType.SCHEDULED)
            self.assertEqual(sched_run.status, BackupRun.Status.SUCCESS)

            # Management command with --force runs cleanly and enforces retention_count=2
            call_command("run_scheduled_backup", "--force")
            remaining_zips = list(Path(self.tmp_backup.name).glob("pos_backup_*.zip"))
            self.assertEqual(len(remaining_zips), 2)
