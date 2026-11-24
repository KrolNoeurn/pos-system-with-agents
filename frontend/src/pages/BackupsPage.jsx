import { useCallback, useEffect, useMemo, useState } from "react";
import StatusAlert from "../components/StatusAlert";
import {
  AppCard,
  DataTable,
  ErrorState,
  FormActions,
  FormInput,
  FormSelect,
  LoadingState,
  PageHeader,
  Pagination,
} from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { usePreferences } from "../contexts/PreferencesContext";
import { useToast } from "../contexts/ToastContext";
import {
  downloadBackupRun,
  fetchBackupRuns,
  fetchBackupSettings,
  runBackupNow,
  testTelegramBackup,
  updateBackupSettings,
} from "../services/backupService";
import { extractApiError } from "../utils/apiError";

const PAGE_SIZE = 10;

const TIMEZONE_OPTIONS = [
  { value: "Asia/Phnom_Penh", label: "Asia/Phnom_Penh (UTC+7)" },
  { value: "Asia/Bangkok", label: "Asia/Bangkok (UTC+7)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (UTC+8)" },
  { value: "UTC", label: "UTC (UTC+0)" },
];

function formatBytes(bytes) {
  const num = Number(bytes || 0);
  if (num <= 0) return "0 B";
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(2)} MB`;
}

function splitCron(expr) {
  const parts = String(expr || "0 2 * * *")
    .trim()
    .split(/\s+/);
  return [
    parts[0] || "0",
    parts[1] || "2",
    parts[2] || "*",
    parts[3] || "*",
    parts[4] || "*",
  ];
}

export default function BackupsPage() {
  const { hasPermission } = useAuth();
  const { t } = usePreferences();
  const toast = useToast();

  const canEdit = hasPermission("settings.edit");

  const [config, setConfig] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [runningBackup, setRunningBackup] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

  const [runs, setRuns] = useState([]);
  const [runsCount, setRunsCount] = useState(0);
  const [runsPage, setRunsPage] = useState(1);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState("");

  const syncFormFromConfig = useCallback((data) => {
    setConfig(data);
    setForm({
      is_enabled: Boolean(data.is_enabled),
      cron_expression: data.cron_expression || "0 2 * * *",
      timezone_name: data.timezone_name || "Asia/Phnom_Penh",
      include_database: Boolean(data.include_database),
      include_media: Boolean(data.include_media),
      retention_count: String(data.retention_count ?? 7),
      telegram_enabled: Boolean(data.telegram_enabled),
      telegram_bot_token: "",
      clear_telegram_token: false,
      telegram_chat_id: data.telegram_chat_id || "",
      telegram_message_thread_id: data.telegram_message_thread_id || "",
      telegram_caption_prefix: data.telegram_caption_prefix || "POS Backup",
    });
  }, []);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchBackupSettings();
      syncFormFromConfig(data);
    } catch (err) {
      setError(extractApiError(err, "Unable to load backup settings."));
    } finally {
      setLoading(false);
    }
  }, [syncFormFromConfig]);

  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    setRunsError("");
    try {
      const data = await fetchBackupRuns({ page: runsPage, page_size: PAGE_SIZE });
      const rows = data.results || data || [];
      setRuns(rows);
      setRunsCount(typeof data.count === "number" ? data.count : rows.length);
    } catch (err) {
      setRunsError(extractApiError(err, "Unable to load backup history."));
    } finally {
      setRunsLoading(false);
    }
  }, [runsPage]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  const cronParts = useMemo(
    () => splitCron(form?.cron_expression || "0 2 * * *"),
    [form?.cron_expression]
  );

  const updateCronField = (index, value) => {
    const next = [...cronParts];
    next[index] = value.trim() || "*";
    setForm((prev) => ({ ...prev, cron_expression: next.join(" ") }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!canEdit || saving || !form) return;

    if (!form.include_database && !form.include_media) {
      setFormError("Select at least one target: Database or Media Images.");
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      const payload = {
        is_enabled: form.is_enabled,
        cron_expression: form.cron_expression.trim(),
        timezone_name: form.timezone_name,
        include_database: form.include_database,
        include_media: form.include_media,
        retention_count: Number(form.retention_count) || 7,
        telegram_enabled: form.telegram_enabled,
        telegram_chat_id: form.telegram_chat_id.trim(),
        telegram_message_thread_id: form.telegram_message_thread_id.trim(),
        telegram_caption_prefix: form.telegram_caption_prefix.trim(),
        clear_telegram_token: form.clear_telegram_token,
      };
      if (form.telegram_bot_token.trim()) {
        payload.telegram_bot_token = form.telegram_bot_token.trim();
      }
      const updated = await updateBackupSettings(payload);
      syncFormFromConfig(updated);
      toast.success(t("backups.savedToast"));
    } catch (err) {
      const msg = extractApiError(err, "Unable to save backup configuration.");
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleTestTelegram = async () => {
    if (!canEdit || testingTelegram || !form) return;
    setTestingTelegram(true);
    setFormError("");
    try {
      const payload = {
        telegram_chat_id: form.telegram_chat_id.trim(),
        telegram_message_thread_id: form.telegram_message_thread_id.trim(),
      };
      if (form.telegram_bot_token.trim()) {
        payload.telegram_bot_token = form.telegram_bot_token.trim();
      }
      const result = await testTelegramBackup(payload);
      const botLabel = result?.bot_username ? ` (@${result.bot_username})` : "";
      toast.success(`${t("backups.testTelegramSuccess")}${botLabel}`);
    } catch (err) {
      const msg = extractApiError(err, "Telegram connection test failed.");
      setFormError(msg);
      toast.error(msg);
    } finally {
      setTestingTelegram(false);
    }
  };

  const handleRunNow = async () => {
    if (!canEdit || runningBackup || !form) return;
    setRunningBackup(true);
    setFormError("");
    try {
      await runBackupNow({
        include_database: form.include_database,
        include_media: form.include_media,
        send_to_telegram: form.telegram_enabled,
      });
      toast.success(t("backups.runSuccessToast"));
      await Promise.all([loadConfig(), loadRuns()]);
    } catch (err) {
      const msg = extractApiError(err, "Backup execution failed.");
      setFormError(msg);
      toast.error(msg);
      await loadRuns();
    } finally {
      setRunningBackup(false);
    }
  };

  const handleCopyCommand = async (cmd) => {
    try {
      await navigator.clipboard.writeText(cmd);
      toast.success(t("backups.copiedToast"));
    } catch {
      toast.error("Unable to copy to clipboard.");
    }
  };

  const handleDownload = useCallback(
    async (run) => {
      setDownloadingId(run.id);
      try {
        await downloadBackupRun(run.id, run.file_name || `pos_backup_${run.id}.zip`);
      } catch (err) {
        toast.error(extractApiError(err, "Failed to download backup archive."));
      } finally {
        setDownloadingId(null);
      }
    },
    [toast]
  );

  const runColumns = useMemo(
    () => [
      {
        key: "started_at",
        header: t("backups.colTime"),
        cellClassName: "small pos-tabular text-nowrap",
        render: (r) => new Date(r.started_at).toLocaleString(),
      },
      {
        key: "status",
        header: t("backups.colStatus"),
        render: (r) => (
          <div>
            <span
              className={`badge ${
                r.status === "success"
                  ? "text-bg-success"
                  : r.status === "failed"
                    ? "text-bg-danger"
                    : "text-bg-warning"
              }`}
            >
              {r.status === "success"
                ? t("backups.statusSuccess")
                : r.status === "failed"
                  ? t("backups.statusFailed")
                  : t("backups.statusRunning")}
            </span>
            {r.error_message && (
              <div className="small text-danger mt-1" style={{ maxWidth: "240px" }}>
                {r.error_message}
              </div>
            )}
          </div>
        ),
      },
      {
        key: "trigger_type",
        header: t("backups.colTrigger"),
        render: (r) => (
          <span className="badge text-bg-secondary">
            {r.trigger_type === "scheduled"
              ? t("backups.triggerScheduled")
              : t("backups.triggerManual")}
          </span>
        ),
      },
      {
        key: "scope",
        header: t("backups.colScope"),
        render: (r) => (
          <div className="d-flex flex-wrap gap-1">
            {r.includes_database && <span className="badge text-bg-primary">DB</span>}
            {r.includes_media && (
              <span className="badge text-bg-info">
                Media ({r.media_files_count ?? 0})
              </span>
            )}
          </div>
        ),
      },
      {
        key: "file_size_bytes",
        header: t("backups.colSize"),
        cellClassName: "small pos-tabular text-nowrap",
        render: (r) => formatBytes(r.file_size_bytes),
      },
      {
        key: "telegram_sent",
        header: t("backups.colTelegram"),
        render: (r) =>
          r.telegram_sent ? (
            <span className="badge text-bg-success">
              <i className="bi bi-telegram me-1" aria-hidden="true" />
              {t("backups.telegramSent")}
              {r.telegram_parts_sent > 1 ? ` (${r.telegram_parts_sent})` : ""}
            </span>
          ) : (
            <span className="badge text-bg-light text-dark border">
              {t("backups.telegramNotSent")}
            </span>
          ),
      },
      {
        key: "triggered_by",
        header: t("backups.colActor"),
        cellClassName: "small",
        render: (r) => r.triggered_by_username || "cron",
      },
      {
        key: "download",
        header: t("backups.colActions"),
        headerClassName: "text-end",
        cellClassName: "text-end",
        render: (r) =>
          r.can_download ? (
            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              onClick={() => handleDownload(r)}
              disabled={downloadingId === r.id}
            >
              <i className="bi bi-download me-1" aria-hidden="true" />
              {t("backups.downloadZip")}
            </button>
          ) : (
            <span className="small text-body-secondary">—</span>
          ),
      },
    ],
    [downloadingId, handleDownload, t]
  );

  if (loading) {
    return <LoadingState message={t("status.loading")} />;
  }

  if (error || !form) {
    return <ErrorState message={error || "Unable to load backup settings."} onRetry={loadConfig} />;
  }

  const presetOptions = [
    { value: "", label: "—" },
    { value: "0 2 * * *", label: t("backups.presetDaily") },
    { value: "0 */6 * * *", label: t("backups.presetEvery6h") },
    { value: "0 3 * * 0", label: t("backups.presetWeekly") },
    { value: "0 2 1 * *", label: t("backups.presetMonthly") },
    { value: "*/30 * * * *", label: t("backups.presetEvery30m") },
  ];

  return (
    <div className="d-flex flex-column gap-4">
      <PageHeader
        icon="bi-cloud-arrow-up"
        title={t("backups.title")}
        subtitle={t("backups.subtitle")}
        actions={
          canEdit && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleRunNow}
              disabled={runningBackup || saving}
            >
              <i className="bi bi-play-circle me-1" aria-hidden="true" />
              {runningBackup ? t("backups.runningBackup") : t("backups.runNowButton")}
            </button>
          )
        }
      />

      {!canEdit && <StatusAlert variant="info" message={t("backups.readOnlyNotice")} />}
      {formError && (
        <StatusAlert
          variant="danger"
          message={formError}
          autoHideMs={6000}
          dismissible
          onClose={() => setFormError("")}
        />
      )}

      <form onSubmit={handleSave} className="d-flex flex-column gap-4">
        <div className="row g-4">
          {/* Left column: Crontab Schedule & Server Setup */}
          <div className="col-12 col-xl-6">
            <AppCard title={t("backups.scheduleCardTitle")} icon="bi-clock-history" className="h-100">
              <div className="d-flex flex-column gap-3">
                <div className="form-check form-switch">
                  <input
                    id="backupIsEnabled"
                    type="checkbox"
                    className="form-check-input"
                    checked={form.is_enabled}
                    onChange={(e) => setForm({ ...form, is_enabled: e.target.checked })}
                    disabled={!canEdit || saving}
                  />
                  <label htmlFor="backupIsEnabled" className="form-check-label fw-medium">
                    {t("backups.enableSchedule")}
                  </label>
                </div>

                <div className="row g-3">
                  <div className="col-12 col-sm-6">
                    <FormSelect
                      id="backupCronPreset"
                      label={t("backups.presetLabel")}
                      value={
                        presetOptions.some((o) => o.value === form.cron_expression)
                          ? form.cron_expression
                          : ""
                      }
                      onChange={(e) => {
                        if (e.target.value) {
                          setForm({ ...form, cron_expression: e.target.value });
                        }
                      }}
                      options={presetOptions}
                      disabled={!canEdit || saving}
                    />
                  </div>
                  <div className="col-12 col-sm-6">
                    <FormSelect
                      id="backupTimezone"
                      label={t("backups.timezoneLabel")}
                      value={form.timezone_name}
                      onChange={(e) => setForm({ ...form, timezone_name: e.target.value })}
                      options={TIMEZONE_OPTIONS}
                      disabled={!canEdit || saving}
                    />
                  </div>
                </div>

                <FormInput
                  id="backupCronExpr"
                  label={t("backups.cronExpressionLabel")}
                  value={form.cron_expression}
                  onChange={(e) => setForm({ ...form, cron_expression: e.target.value })}
                  helpText={t("backups.cronHelp")}
                  required
                  disabled={!canEdit || saving}
                />

                {/* 5-field visual crontab editor */}
                <div className="row g-2">
                  {[
                    { idx: 0, label: t("backups.cronMinute"), placeholder: "0" },
                    { idx: 1, label: t("backups.cronHour"), placeholder: "2" },
                    { idx: 2, label: t("backups.cronDom"), placeholder: "*" },
                    { idx: 3, label: t("backups.cronMonth"), placeholder: "*" },
                    { idx: 4, label: t("backups.cronDow"), placeholder: "*" },
                  ].map((field) => (
                    <div key={field.idx} className="col-6 col-sm">
                      <label
                        htmlFor={`cronField${field.idx}`}
                        className="form-label small text-body-secondary mb-1"
                      >
                        {field.label}
                      </label>
                      <input
                        id={`cronField${field.idx}`}
                        type="text"
                        className="form-control form-control-sm font-monospace text-center"
                        value={cronParts[field.idx]}
                        onChange={(e) => updateCronField(field.idx, e.target.value)}
                        placeholder={field.placeholder}
                        disabled={!canEdit || saving}
                      />
                    </div>
                  ))}
                </div>

                {/* Next scheduled runs */}
                {Array.isArray(config?.next_runs) && config.next_runs.length > 0 && (
                  <div className="p-3 rounded border bg-body-tertiary">
                    <div className="small fw-semibold mb-1">{t("backups.nextRunsTitle")}</div>
                    <ul className="mb-0 ps-3 small pos-tabular">
                      {config.next_runs.map((iso) => (
                        <li key={iso}>{new Date(iso).toLocaleString()}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Copyable system crontab command */}
                {config?.crontab_entry && (
                  <div className="p-3 rounded border bg-body-tertiary">
                    <div className="d-flex align-items-center justify-content-between gap-2 mb-1">
                      <span className="small fw-semibold">{t("backups.crontabCommandTitle")}</span>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary py-0 px-2"
                        onClick={() => handleCopyCommand(config.crontab_entry)}
                      >
                        <i className="bi bi-clipboard me-1" aria-hidden="true" />
                        {t("backups.copyCommand")}
                      </button>
                    </div>
                    <p className="small text-body-secondary mb-2">
                      {t("backups.crontabCommandHelp")}
                    </p>
                    <pre className="small mb-2 p-2 rounded border bg-body overflow-auto">
                      <code>{config.crontab_entry}</code>
                    </pre>
                    <pre className="small mb-0 p-2 rounded border bg-body overflow-auto">
                      <code>{config.polling_crontab_entry}</code>
                    </pre>
                  </div>
                )}
              </div>
            </AppCard>
          </div>

          {/* Right column: Scope + Telegram Bot Delivery */}
          <div className="col-12 col-xl-6 d-flex flex-column gap-4">
            <AppCard title={t("backups.scopeCardTitle")} icon="bi-archive">
              <div className="d-flex flex-column gap-3">
                <div className="form-check">
                  <input
                    id="backupIncludeDb"
                    type="checkbox"
                    className="form-check-input"
                    checked={form.include_database}
                    onChange={(e) => setForm({ ...form, include_database: e.target.checked })}
                    disabled={!canEdit || saving}
                  />
                  <label htmlFor="backupIncludeDb" className="form-check-label">
                    {t("backups.includeDatabase")}
                  </label>
                </div>

                <div className="form-check">
                  <input
                    id="backupIncludeMedia"
                    type="checkbox"
                    className="form-check-input"
                    checked={form.include_media}
                    onChange={(e) => setForm({ ...form, include_media: e.target.checked })}
                    disabled={!canEdit || saving}
                  />
                  <label htmlFor="backupIncludeMedia" className="form-check-label">
                    {t("backups.includeMedia")}
                  </label>
                </div>

                <div style={{ maxWidth: "240px" }}>
                  <FormInput
                    id="backupRetention"
                    label={t("backups.retentionLabel")}
                    type="number"
                    min="1"
                    max="50"
                    value={form.retention_count}
                    onChange={(e) => setForm({ ...form, retention_count: e.target.value })}
                    disabled={!canEdit || saving}
                  />
                </div>
              </div>
            </AppCard>

            <AppCard title={t("backups.telegramCardTitle")} icon="bi-telegram">
              <div className="d-flex flex-column gap-3">
                <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
                  <div className="form-check form-switch mb-0">
                    <input
                      id="backupTelegramEnabled"
                      type="checkbox"
                      className="form-check-input"
                      checked={form.telegram_enabled}
                      onChange={(e) => setForm({ ...form, telegram_enabled: e.target.checked })}
                      disabled={!canEdit || saving}
                    />
                    <label htmlFor="backupTelegramEnabled" className="form-check-label fw-medium">
                      {t("backups.enableTelegram")}
                    </label>
                  </div>
                  {config?.has_telegram_token && (
                    <span className="badge text-bg-success">
                      {t("backups.tokenConfiguredBadge")} ({config.telegram_bot_token_masked})
                    </span>
                  )}
                </div>

                <FormInput
                  id="backupTelegramToken"
                  label={t("backups.botTokenLabel")}
                  type="password"
                  autoComplete="new-password"
                  value={form.telegram_bot_token}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      telegram_bot_token: e.target.value,
                      clear_telegram_token: false,
                    })
                  }
                  placeholder={t("backups.botTokenPlaceholder")}
                  disabled={!canEdit || saving}
                />

                {config?.has_telegram_token && canEdit && (
                  <div className="form-check">
                    <input
                      id="backupClearToken"
                      type="checkbox"
                      className="form-check-input"
                      checked={form.clear_telegram_token}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          clear_telegram_token: e.target.checked,
                          telegram_bot_token: e.target.checked ? "" : form.telegram_bot_token,
                        })
                      }
                      disabled={saving}
                    />
                    <label htmlFor="backupClearToken" className="form-check-label small text-danger">
                      {t("backups.clearTokenLabel")}
                    </label>
                  </div>
                )}

                <div className="row g-3">
                  <div className="col-12 col-sm-7">
                    <FormInput
                      id="backupTelegramChatId"
                      label={t("backups.chatIdLabel")}
                      value={form.telegram_chat_id}
                      onChange={(e) => setForm({ ...form, telegram_chat_id: e.target.value })}
                      helpText={t("backups.chatIdHelp")}
                      placeholder="-1001234567890"
                      disabled={!canEdit || saving}
                    />
                  </div>
                  <div className="col-12 col-sm-5">
                    <FormInput
                      id="backupTelegramThreadId"
                      label={t("backups.threadIdLabel")}
                      value={form.telegram_message_thread_id}
                      onChange={(e) =>
                        setForm({ ...form, telegram_message_thread_id: e.target.value })
                      }
                      placeholder="12"
                      disabled={!canEdit || saving}
                    />
                  </div>
                </div>

                <FormInput
                  id="backupCaptionPrefix"
                  label={t("backups.captionPrefixLabel")}
                  value={form.telegram_caption_prefix}
                  onChange={(e) => setForm({ ...form, telegram_caption_prefix: e.target.value })}
                  disabled={!canEdit || saving}
                />

                {canEdit && (
                  <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 pt-2 border-top">
                    <button
                      type="button"
                      className="btn btn-outline-primary"
                      onClick={handleTestTelegram}
                      disabled={testingTelegram || saving}
                    >
                      <i className="bi bi-send-check me-1" aria-hidden="true" />
                      {testingTelegram
                        ? t("backups.testingTelegram")
                        : t("backups.testTelegramButton")}
                    </button>
                    <FormActions
                      submitting={saving}
                      submitLabel={t("backups.saveConfigButton")}
                      submittingLabel={t("controls.saving")}
                    />
                  </div>
                )}
              </div>
            </AppCard>
          </div>
        </div>
      </form>

      {/* Backup Execution History */}
      <AppCard
        title={t("backups.historyCardTitle")}
        icon="bi-journal-text"
        noPadding
        headerActions={
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={loadRuns}
            disabled={runsLoading}
          >
            <i className="bi bi-arrow-clockwise me-1" aria-hidden="true" />
            {t("controls.refresh")}
          </button>
        }
      >
        <DataTable
          columns={runColumns}
          rows={runs}
          loading={runsLoading}
          error={runsError}
          onRetry={loadRuns}
          emptyIcon="bi-cloud-slash"
          emptyTitle={t("backups.emptyHistory")}
        />
        <Pagination
          page={runsPage}
          pageSize={PAGE_SIZE}
          totalCount={runsCount}
          onPageChange={setRunsPage}
          previousLabel={t("controls.previous")}
          nextLabel={t("controls.next")}
        />
      </AppCard>
    </div>
  );
}
