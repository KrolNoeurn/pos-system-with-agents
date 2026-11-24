"""Database & media backup engine, crontab parser/evaluator, and Telegram Bot delivery."""

from __future__ import annotations

from datetime import datetime, timedelta
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
import uuid
import zipfile
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.conf import settings
from django.db import IntegrityError, connection, transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.audit.services import log_audit_event
from apps.store_settings.models import BackupRun, BackupSetting

SINGLETON_PK = 1
TELEGRAM_MAX_CHUNK_BYTES = 45 * 1024 * 1024  # 45 MB (Telegram Bot API limit is 50 MB)
TELEGRAM_TIMEOUT_SECONDS = 60


# ---------------------------------------------------------------------------
# Crontab 5-field parser, validator, matcher & next-run calculator
# ---------------------------------------------------------------------------

def _parse_cron_field(field: str, min_val: int, max_val: int, field_name: str, is_dow: bool = False) -> set[int]:
    values: set[int] = set()
    parts = field.split(",")
    for raw_part in parts:
        part = raw_part.strip()
        if not part:
            raise ValidationError({"cron_expression": [f"Empty segment in {field_name} field."]})

        step = 1
        if "/" in part:
            pieces = part.split("/")
            if len(pieces) != 2 or not pieces[1].isdigit() or int(pieces[1]) <= 0:
                raise ValidationError({"cron_expression": [f"Invalid step '{part}' in {field_name} field."]})
            base, step = pieces[0], int(pieces[1])
        else:
            base = part

        if base == "*":
            start, end = min_val, max_val
        elif "-" in base:
            bounds = base.split("-")
            if len(bounds) != 2 or not bounds[0].isdigit() or not bounds[1].isdigit():
                raise ValidationError({"cron_expression": [f"Invalid range '{part}' in {field_name} field."]})
            start, end = int(bounds[0]), int(bounds[1])
            if start > end:
                raise ValidationError({"cron_expression": [f"Range start > end in {field_name} field ('{part}')."]})
        elif base.isdigit():
            val = int(base)
            start = val
            end = max_val if "/" in part else val
        else:
            raise ValidationError({"cron_expression": [f"Invalid token '{part}' in {field_name} field."]})

        if start < min_val or end > max_val:
            raise ValidationError(
                {"cron_expression": [f"Value out of range ({min_val}-{max_val}) in {field_name} field ('{part}')."]}
            )

        for v in range(start, end + 1, step):
            if is_dow and v == 7:
                values.add(0)
            else:
                values.add(v)

    if not values:
        raise ValidationError({"cron_expression": [f"No values resolved for {field_name} field."]})
    return values


def parse_cron_expression(expression: str) -> tuple[set[int], set[int], set[int], set[int], set[int], bool, bool]:
    """Validate and parse a standard 5-field crontab expression (min hour dom month dow)."""
    clean = " ".join((expression or "").strip().split())
    fields = clean.split(" ")
    if len(fields) != 5:
        raise ValidationError(
            {
                "cron_expression": [
                    "Crontab expression must have exactly 5 fields: minute hour day_of_month month day_of_week (e.g. '0 2 * * *')."
                ]
            }
        )

    minutes = _parse_cron_field(fields[0], 0, 59, "minute")
    hours = _parse_cron_field(fields[1], 0, 23, "hour")
    doms = _parse_cron_field(fields[2], 1, 31, "day_of_month")
    months = _parse_cron_field(fields[3], 1, 12, "month")
    dows = _parse_cron_field(fields[4], 0, 7, "day_of_week", is_dow=True)

    dom_is_wild = fields[2] == "*"
    dow_is_wild = fields[4] == "*"
    return minutes, hours, doms, months, dows, dom_is_wild, dow_is_wild


def validate_cron_expression(expression: str) -> str:
    clean = " ".join((expression or "").strip().split())
    parse_cron_expression(clean)
    return clean


def validate_timezone_name(tz_name: str) -> str:
    clean = (tz_name or "").strip() or "UTC"
    try:
        ZoneInfo(clean)
    except ZoneInfoNotFoundError as exc:
        raise ValidationError({"timezone_name": [f"Unknown timezone '{clean}'."]}) from exc
    return clean


def cron_matches_datetime(expression: str, dt: datetime) -> bool:
    """Return True if local datetime `dt` matches the 5-field cron expression."""
    minutes, hours, doms, months, dows, dom_wild, dow_wild = parse_cron_expression(expression)
    if dt.minute not in minutes or dt.hour not in hours or dt.month not in months:
        return False

    # Python weekday(): Monday=0..Sunday=6 -> Cron dow: Sunday=0, Monday=1..Saturday=6
    cron_dow = (dt.weekday() + 1) % 7
    dom_match = dt.day in doms
    dow_match = cron_dow in dows

    if not dom_wild and not dow_wild:
        return dom_match or dow_match
    return dom_match and dow_match


def get_next_cron_runs(
    expression: str,
    tz_name: str = "Asia/Phnom_Penh",
    count: int = 3,
    after: datetime | None = None,
) -> list[str]:
    """Compute the next `count` ISO-8601 run timestamps matching `expression` in `tz_name`."""
    try:
        minutes, hours, doms, months, dows, dom_wild, dow_wild = parse_cron_expression(expression)
        tz = ZoneInfo(validate_timezone_name(tz_name))
    except ValidationError:
        return []

    base = (after or timezone.now()).astimezone(tz).replace(second=0, microsecond=0) + timedelta(minutes=1)
    candidate = base
    limit = base + timedelta(days=366)
    results: list[str] = []

    while candidate <= limit and len(results) < count:
        if candidate.month not in months:
            # Jump to first day of next month
            if candidate.month == 12:
                candidate = candidate.replace(year=candidate.year + 1, month=1, day=1, hour=0, minute=0)
            else:
                candidate = candidate.replace(month=candidate.month + 1, day=1, hour=0, minute=0)
            continue

        cron_dow = (candidate.weekday() + 1) % 7
        dom_match = candidate.day in doms
        dow_match = cron_dow in dows
        day_ok = (dom_match or dow_match) if (not dom_wild and not dow_wild) else (dom_match and dow_match)
        if not day_ok:
            candidate = (candidate + timedelta(days=1)).replace(hour=0, minute=0)
            continue

        if candidate.hour not in hours:
            candidate = (candidate + timedelta(hours=1)).replace(minute=0)
            continue

        if candidate.minute not in minutes:
            candidate = candidate + timedelta(minutes=1)
            continue

        results.append(candidate.isoformat())
        candidate = candidate + timedelta(minutes=1)

    return results


def mask_bot_token(token: str) -> str:
    """Return a safe masked representation of a Telegram Bot token (never expose full secret)."""
    clean = (token or "").strip()
    if not clean:
        return ""
    if len(clean) <= 10:
        return "••••••••"
    prefix = clean.split(":")[0] if ":" in clean else clean[:4]
    return f"{prefix}:••••••{clean[-4:]}"


def get_backup_root() -> Path:
    root = Path(getattr(settings, "BACKUP_ROOT", Path(settings.BASE_DIR) / "backups"))
    root.mkdir(parents=True, exist_ok=True)
    return root


def build_crontab_lines(config: BackupSetting) -> dict[str, str]:
    """Generate copyable system crontab lines matching this server's Python and manage.py paths."""
    manage_py = Path(settings.BASE_DIR) / "manage.py"
    python_bin = sys.executable or "python3"
    direct_line = f"{config.cron_expression} {python_bin} {manage_py} run_scheduled_backup --force"
    polling_line = f"* * * * * {python_bin} {manage_py} run_scheduled_backup"
    return {
        "direct": direct_line,
        "polling": polling_line,
    }


# ---------------------------------------------------------------------------
# Singleton BackupSetting service
# ---------------------------------------------------------------------------

def get_backup_settings() -> BackupSetting:
    instance = BackupSetting.objects.select_related("updated_by").filter(pk=SINGLETON_PK).first()
    if instance is not None:
        return instance

    try:
        with transaction.atomic():
            instance, _ = BackupSetting.objects.get_or_create(pk=SINGLETON_PK)
            return instance
    except IntegrityError:
        return BackupSetting.objects.select_related("updated_by").get(pk=SINGLETON_PK)


@transaction.atomic
def update_backup_settings(
    *,
    actor,
    ip_address: str | None = None,
    **updates,
) -> BackupSetting:
    """Validate and atomically update backup & Telegram settings without leaking secrets to AuditLog."""
    get_backup_settings()
    locked = BackupSetting.objects.select_for_update().get(pk=SINGLETON_PK)

    changed_fields: list[str] = []
    audit_changes: dict[str, dict[str, str]] = {}

    clear_token = bool(updates.pop("clear_telegram_token", False))
    new_token = updates.pop("telegram_bot_token", None)

    if clear_token:
        if locked.telegram_bot_token:
            locked.telegram_bot_token = ""
            changed_fields.append("telegram_bot_token")
            audit_changes["telegram_bot_token"] = {"from": "[configured]", "to": "[cleared]"}
    elif new_token is not None and str(new_token).strip() != "":
        clean_token = str(new_token).strip()
        if clean_token != locked.telegram_bot_token:
            locked.telegram_bot_token = clean_token
            changed_fields.append("telegram_bot_token")
            audit_changes["telegram_bot_token"] = {
                "from": "[configured]" if locked.telegram_bot_token else "[empty]",
                "to": "[updated]",
            }

    if "cron_expression" in updates:
        clean_cron = validate_cron_expression(updates["cron_expression"])
        if clean_cron != locked.cron_expression:
            audit_changes["cron_expression"] = {"from": locked.cron_expression, "to": clean_cron}
            locked.cron_expression = clean_cron
            changed_fields.append("cron_expression")

    if "timezone_name" in updates:
        clean_tz = validate_timezone_name(updates["timezone_name"])
        if clean_tz != locked.timezone_name:
            audit_changes["timezone_name"] = {"from": locked.timezone_name, "to": clean_tz}
            locked.timezone_name = clean_tz
            changed_fields.append("timezone_name")

    if "retention_count" in updates:
        retention = int(updates["retention_count"])
        if retention < 1 or retention > 50:
            raise ValidationError({"retention_count": ["Retention count must be between 1 and 50."]})
        if retention != locked.retention_count:
            audit_changes["retention_count"] = {"from": str(locked.retention_count), "to": str(retention)}
            locked.retention_count = retention
            changed_fields.append("retention_count")

    for bool_field in ("is_enabled", "include_database", "include_media", "telegram_enabled"):
        if bool_field in updates:
            val = bool(updates[bool_field])
            old_val = getattr(locked, bool_field)
            if val != old_val:
                audit_changes[bool_field] = {"from": str(old_val), "to": str(val)}
                setattr(locked, bool_field, val)
                changed_fields.append(bool_field)

    for str_field in ("telegram_chat_id", "telegram_message_thread_id", "telegram_caption_prefix"):
        if str_field in updates:
            val = (updates[str_field] or "").strip()
            old_val = getattr(locked, str_field)
            if val != old_val:
                audit_changes[str_field] = {"from": old_val, "to": val}
                setattr(locked, str_field, val)
                changed_fields.append(str_field)

    if not locked.include_database and not locked.include_media:
        raise ValidationError(
            {"include_database": ["Select at least one backup target: database or media images."]}
        )

    if locked.telegram_enabled and (not locked.telegram_bot_token or not locked.telegram_chat_id):
        raise ValidationError(
            {
                "telegram_enabled": [
                    "Telegram Bot Token and Chat ID are required when Telegram upload is enabled."
                ]
            }
        )

    if changed_fields:
        locked.updated_by = actor
        locked.save(update_fields=[*changed_fields, "updated_by", "updated_at"])
        log_audit_event(
            actor=actor,
            action="backup.config_updated",
            target_type="BackupSetting",
            target_id=locked.id,
            ip_address=ip_address,
            metadata={"changed_fields": changed_fields, "changes": audit_changes},
        )

    return BackupSetting.objects.select_related("updated_by").get(pk=SINGLETON_PK)


# ---------------------------------------------------------------------------
# Telegram Bot API helpers (stdlib urllib only — zero extra dependencies)
# ---------------------------------------------------------------------------

def _telegram_api_json(token: str, method: str, payload: dict | None = None) -> dict:
    url = f"https://api.telegram.org/bot{token}/{method}"
    data = json.dumps(payload or {}).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"} if data is not None else {},
        method="POST" if data is not None else "GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=TELEGRAM_TIMEOUT_SECONDS) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            err_json = json.loads(raw)
            desc = err_json.get("description") or raw
        except Exception:
            desc = raw
        raise RuntimeError(f"Telegram API error ({exc.code}): {desc}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Network error contacting Telegram API: {exc.reason}") from exc

    if not body.get("ok"):
        raise RuntimeError(f"Telegram API rejected request: {body.get('description', 'Unknown error')}")
    return body


def _encode_multipart_formdata(fields: dict[str, str], file_field: str, filename: str, file_bytes: bytes) -> tuple[bytes, str]:
    boundary = f"----POSBackupBoundary{uuid.uuid4().hex}"
    chunks: list[bytes] = []
    for key, value in fields.items():
        chunks.append(f"--{boundary}\r\n".encode("utf-8"))
        chunks.append(f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode("utf-8"))
        chunks.append(f"{value}\r\n".encode("utf-8"))

    chunks.append(f"--{boundary}\r\n".encode("utf-8"))
    chunks.append(
        f'Content-Disposition: form-data; name="{file_field}"; filename="{filename}"\r\n'
        f"Content-Type: application/octet-stream\r\n\r\n".encode("utf-8")
    )
    chunks.append(file_bytes)
    chunks.append(f"\r\n--{boundary}--\r\n".encode("utf-8"))
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def _telegram_send_document(
    *,
    token: str,
    chat_id: str,
    filename: str,
    file_bytes: bytes,
    caption: str = "",
    thread_id: str = "",
) -> dict:
    fields: dict[str, str] = {"chat_id": chat_id}
    if caption:
        fields["caption"] = caption[:1024]
    if thread_id:
        fields["message_thread_id"] = thread_id

    body, content_type = _encode_multipart_formdata(fields, "document", filename, file_bytes)
    url = f"https://api.telegram.org/bot{token}/sendDocument"
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": content_type},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=TELEGRAM_TIMEOUT_SECONDS) as resp:
            parsed = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            err_json = json.loads(raw)
            desc = err_json.get("description") or raw
        except Exception:
            desc = raw
        raise RuntimeError(f"Telegram sendDocument failed ({exc.code}): {desc}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Network error uploading backup to Telegram: {exc.reason}") from exc

    if not parsed.get("ok"):
        raise RuntimeError(f"Telegram sendDocument rejected: {parsed.get('description', 'Unknown error')}")
    return parsed


def send_archive_to_telegram(*, archive_path: Path, config: BackupSetting, caption: str) -> tuple[int, str]:
    """Upload archive to Telegram, splitting automatically into <=45MB chunks when needed."""
    token = (config.telegram_bot_token or "").strip()
    chat_id = (config.telegram_chat_id or "").strip()
    thread_id = (config.telegram_message_thread_id or "").strip()

    if not token or not chat_id:
        raise RuntimeError("Telegram Bot Token and Chat ID must be configured before sending backups.")

    file_size = archive_path.stat().st_size
    message_ids: list[str] = []

    if file_size <= TELEGRAM_MAX_CHUNK_BYTES:
        resp = _telegram_send_document(
            token=token,
            chat_id=chat_id,
            filename=archive_path.name,
            file_bytes=archive_path.read_bytes(),
            caption=caption,
            thread_id=thread_id,
        )
        msg_id = resp.get("result", {}).get("message_id")
        if msg_id is not None:
            message_ids.append(str(msg_id))
        return 1, ",".join(message_ids)

    total_parts = (file_size + TELEGRAM_MAX_CHUNK_BYTES - 1) // TELEGRAM_MAX_CHUNK_BYTES
    with archive_path.open("rb") as fh:
        for idx in range(1, total_parts + 1):
            chunk = fh.read(TELEGRAM_MAX_CHUNK_BYTES)
            part_name = f"{archive_path.name}.part{idx:02d}"
            part_caption = f"{caption} (Part {idx}/{total_parts})"
            resp = _telegram_send_document(
                token=token,
                chat_id=chat_id,
                filename=part_name,
                file_bytes=chunk,
                caption=part_caption,
                thread_id=thread_id,
            )
            msg_id = resp.get("result", {}).get("message_id")
            if msg_id is not None:
                message_ids.append(str(msg_id))

    return total_parts, ",".join(message_ids)


def test_telegram_connection(
    *,
    actor,
    bot_token: str | None = None,
    chat_id: str | None = None,
    message_thread_id: str | None = None,
    ip_address: str | None = None,
) -> dict:
    """Verify Telegram bot token and send a test notification to the configured chat."""
    config = get_backup_settings()
    token = (bot_token or "").strip() or config.telegram_bot_token
    target_chat = (chat_id or "").strip() or config.telegram_chat_id
    thread_id = (
        message_thread_id.strip()
        if message_thread_id is not None
        else config.telegram_message_thread_id
    )

    if not token:
        raise ValidationError({"telegram_bot_token": ["Telegram Bot Token is required."]})
    if not target_chat:
        raise ValidationError({"telegram_chat_id": ["Telegram Chat ID is required."]})

    try:
        me = _telegram_api_json(token, "getMe")
        bot_username = me.get("result", {}).get("username", "")
        payload = {
            "chat_id": target_chat,
            "text": (
                f"{config.telegram_caption_prefix or 'POS Backup'}: "
                f"Telegram backup connection verified at {timezone.now().strftime('%Y-%m-%d %H:%M:%S UTC')}."
            ),
        }
        if thread_id:
            payload["message_thread_id"] = thread_id
        msg_resp = _telegram_api_json(token, "sendMessage", payload=payload)
        message_id = str(msg_resp.get("result", {}).get("message_id", ""))
    except RuntimeError as exc:
        log_audit_event(
            actor=actor,
            action="backup.telegram_test_failed",
            target_type="BackupSetting",
            target_id=config.id,
            ip_address=ip_address,
            metadata={"chat_id": target_chat, "error": str(exc)[:300]},
        )
        raise ValidationError({"detail": str(exc)}) from exc

    log_audit_event(
        actor=actor,
        action="backup.telegram_tested",
        target_type="BackupSetting",
        target_id=config.id,
        ip_address=ip_address,
        metadata={"chat_id": target_chat, "bot_username": bot_username, "message_id": message_id},
    )
    return {
        "ok": True,
        "bot_username": bot_username,
        "chat_id": target_chat,
        "message_id": message_id,
    }


# ---------------------------------------------------------------------------
# Archive creation (SQLite / PostgreSQL + Media Images) & Retention pruning
# ---------------------------------------------------------------------------

def _snapshot_database(temp_dir: Path) -> tuple[Path, str]:
    db_cfg = connection.settings_dict
    engine = db_cfg.get("ENGINE", "")

    if "sqlite3" in engine:
        db_name = str(db_cfg.get("NAME", ""))
        out_path = temp_dir / "db.sqlite3"
        is_memory = db_name == ":memory:" or db_name.startswith("file:memorydb")
        if is_memory or connection.in_atomic_block:
            # Safe snapshot when running against an in-memory DB or inside an active transaction
            connection.ensure_connection()
            raw_conn = connection.connection
            dst = sqlite3.connect(str(out_path))
            try:
                dump_sql = "\n".join(raw_conn.iterdump())
                dst.executescript(dump_sql)
                dst.commit()
            finally:
                dst.close()
        else:
            src = sqlite3.connect(db_name, timeout=30.0)
            dst = sqlite3.connect(str(out_path))
            try:
                src.backup(dst)
            finally:
                dst.close()
                src.close()
        return out_path, "sqlite3"

    if "postgresql" in engine or "postgis" in engine:
        out_path = temp_dir / "db.sql"
        env = os.environ.copy()
        if db_cfg.get("PASSWORD"):
            env["PGPASSWORD"] = str(db_cfg["PASSWORD"])
        cmd = ["pg_dump", "--no-owner", "--no-acl", "-f", str(out_path)]
        if db_cfg.get("HOST"):
            cmd.extend(["-h", str(db_cfg["HOST"])])
        if db_cfg.get("PORT"):
            cmd.extend(["-p", str(db_cfg["PORT"])])
        if db_cfg.get("USER"):
            cmd.extend(["-U", str(db_cfg["USER"])])
        cmd.append(str(db_cfg["NAME"]))
        try:
            subprocess.run(cmd, env=env, check=True, capture_output=True, text=True)
        except FileNotFoundError as exc:
            raise RuntimeError("pg_dump binary was not found on this server.") from exc
        except subprocess.CalledProcessError as exc:
            raise RuntimeError(f"pg_dump failed: {(exc.stderr or '').strip()}") from exc
        return out_path, "postgresql"

    raise RuntimeError(f"Unsupported database engine for backup: {engine}")


def _build_backup_zip(*, include_database: bool, include_media: bool, target_zip: Path) -> dict:
    media_count = 0
    db_engine_label = ""

    with tempfile.TemporaryDirectory(prefix="pos_backup_") as tmp:
        temp_dir = Path(tmp)
        with zipfile.ZipFile(target_zip, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            if include_database:
                db_file, db_engine_label = _snapshot_database(temp_dir)
                zf.write(db_file, arcname=f"database/{db_file.name}")

            if include_media:
                media_root = Path(settings.MEDIA_ROOT)
                if media_root.exists() and media_root.is_dir():
                    for path in sorted(media_root.rglob("*")):
                        if path.is_file():
                            rel = path.relative_to(media_root)
                            zf.write(path, arcname=f"media/{rel.as_posix()}")
                            media_count += 1

            manifest = {
                "created_at": timezone.now().isoformat(),
                "includes_database": include_database,
                "includes_media": include_media,
                "database_engine": db_engine_label,
                "media_files_count": media_count,
            }
            zf.writestr("manifest.json", json.dumps(manifest, indent=2))

    return {
        "file_size_bytes": target_zip.stat().st_size,
        "media_files_count": media_count,
        "database_engine": db_engine_label,
    }


def _prune_old_backups(retention_count: int) -> None:
    backup_root = get_backup_root()
    archives = sorted(
        backup_root.glob("pos_backup_*.zip"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    stale = archives[retention_count:]
    stale_paths = [str(p) for p in stale]
    for path in stale:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass
    if stale_paths:
        BackupRun.objects.filter(file_path__in=stale_paths).update(file_path="")


def execute_backup(
    *,
    actor=None,
    trigger_type: str = BackupRun.TriggerType.MANUAL,
    include_database: bool | None = None,
    include_media: bool | None = None,
    send_to_telegram: bool | None = None,
    ip_address: str | None = None,
) -> BackupRun:
    """Create a database/media zip archive, optionally upload to Telegram, prune old archives, and log audit."""
    config = get_backup_settings()
    do_db = config.include_database if include_database is None else bool(include_database)
    do_media = config.include_media if include_media is None else bool(include_media)
    do_telegram = config.telegram_enabled if send_to_telegram is None else bool(send_to_telegram)

    if not do_db and not do_media:
        raise ValidationError({"include_database": ["Select database and/or media images to back up."]})

    run = BackupRun.objects.create(
        status=BackupRun.Status.RUNNING,
        trigger_type=trigger_type,
        includes_database=do_db,
        includes_media=do_media,
        triggered_by=actor,
    )

    timestamp_slug = timezone.now().strftime("%Y%m%d_%H%M%S")
    archive_name = f"pos_backup_{timestamp_slug}_r{run.id}.zip"
    archive_path = get_backup_root() / archive_name

    try:
        stats = _build_backup_zip(
            include_database=do_db,
            include_media=do_media,
            target_zip=archive_path,
        )
        run.file_name = archive_name
        run.file_path = str(archive_path)
        run.file_size_bytes = stats["file_size_bytes"]
        run.media_files_count = stats["media_files_count"]

        if do_telegram:
            scope_parts = []
            if do_db:
                scope_parts.append("DB")
            if do_media:
                scope_parts.append(f"Media ({stats['media_files_count']} files)")
            size_mb = stats["file_size_bytes"] / (1024 * 1024)
            caption = (
                f"{config.telegram_caption_prefix or 'POS Backup'} | "
                f"{'+'.join(scope_parts)} | {size_mb:.2f} MB | "
                f"{timezone.now().strftime('%Y-%m-%d %H:%M UTC')}"
            )
            parts_sent, msg_ids = send_archive_to_telegram(
                archive_path=archive_path,
                config=config,
                caption=caption,
            )
            run.telegram_sent = True
            run.telegram_parts_sent = parts_sent
            run.telegram_message_id = msg_ids

        run.status = BackupRun.Status.SUCCESS
        run.completed_at = timezone.now()
        run.save()

        BackupSetting.objects.filter(pk=SINGLETON_PK).update(
            last_run_at=run.completed_at,
            last_status=BackupRun.Status.SUCCESS,
            updated_at=timezone.now(),
        )
        _prune_old_backups(config.retention_count)

        log_audit_event(
            actor=actor,
            action="backup.run_succeeded",
            target_type="BackupRun",
            target_id=run.id,
            ip_address=ip_address,
            metadata={
                "trigger_type": trigger_type,
                "file_name": run.file_name,
                "file_size_bytes": run.file_size_bytes,
                "includes_database": do_db,
                "includes_media": do_media,
                "media_files_count": run.media_files_count,
                "telegram_sent": run.telegram_sent,
                "telegram_parts_sent": run.telegram_parts_sent,
            },
        )
        return run

    except Exception as exc:
        run.status = BackupRun.Status.FAILED
        run.error_message = str(exc)[:2000]
        run.completed_at = timezone.now()
        run.save()

        BackupSetting.objects.filter(pk=SINGLETON_PK).update(
            last_run_at=run.completed_at,
            last_status=BackupRun.Status.FAILED,
            updated_at=timezone.now(),
        )
        log_audit_event(
            actor=actor,
            action="backup.run_failed",
            target_type="BackupRun",
            target_id=run.id,
            ip_address=ip_address,
            metadata={
                "trigger_type": trigger_type,
                "error": run.error_message[:300],
            },
        )
        return run


def run_due_scheduled_backup(*, now: datetime | None = None, force: bool = False) -> BackupRun | None:
    """
    Evaluate BackupSetting crontab schedule and execute backup if due (or forced).

    Designed to be triggered by system cron (`* * * * * ... run_scheduled_backup` or
    at the exact configured cron expression with `--force`).
    """
    config = get_backup_settings()
    if not force:
        if not config.is_enabled:
            return None
        tz = ZoneInfo(validate_timezone_name(config.timezone_name))
        current_dt = (now or timezone.now()).astimezone(tz)
        if not cron_matches_datetime(config.cron_expression, current_dt):
            return None
        if config.last_run_at is not None:
            last_local = config.last_run_at.astimezone(tz)
            if (
                last_local.year == current_dt.year
                and last_local.month == current_dt.month
                and last_local.day == current_dt.day
                and last_local.hour == current_dt.hour
                and last_local.minute == current_dt.minute
            ):
                return None

    return execute_backup(actor=None, trigger_type=BackupRun.TriggerType.SCHEDULED)
