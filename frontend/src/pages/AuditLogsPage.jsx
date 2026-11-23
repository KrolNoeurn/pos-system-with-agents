import { useCallback, useEffect, useState } from "react";
import {
  AppCard,
  AppModal,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Pagination,
} from "../components/ui";
import { usePreferences } from "../contexts/PreferencesContext";
import { fetchAuditLogs } from "../services/auditService";
import { extractApiError } from "../utils/apiError";

const PAGE_SIZE = 20;

const TARGET_TYPES = [
  "User",
  "Role",
  "Category",
  "Unit",
  "Product",
  "Supplier",
  "Purchase",
  "Customer",
  "Sale",
  "ExpenseCategory",
  "Expense",
  "StoreSetting",
];

function formatDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function AuditLogsPage() {
  const { t } = usePreferences();

  const [logs, setLogs] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [targetType, setTargetType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedEntry, setSelectedEntry] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = { page, page_size: PAGE_SIZE };
      if (debouncedSearch) params.search = debouncedSearch;
      if (targetType) params.target_type = targetType;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const data = await fetchAuditLogs(params);
      setLogs(data.results || []);
      setTotalCount(data.count ?? 0);
    } catch (err) {
      setError(extractApiError(err, "Unable to load audit logs."));
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, targetType, dateFrom, dateTo]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const columns = [
    {
      key: "created_at",
      header: t("audit.colTimestamp"),
      cellClassName: "small pos-tabular text-nowrap",
      render: (row) => formatDateTime(row.created_at),
    },
    {
      key: "actor_username",
      header: t("audit.colActor"),
      render: (row) => (
        <span className="fw-medium">{row.actor_username || t("audit.systemActor")}</span>
      ),
    },
    {
      key: "action",
      header: t("audit.colAction"),
      render: (row) => <code className="fw-semibold">{row.action}</code>,
    },
    {
      key: "target_type",
      header: t("audit.colTarget"),
      render: (row) =>
        row.target_type ? (
          <span>
            <span className="badge text-bg-light border text-body me-1">{row.target_type}</span>
            {row.target_id ? <code className="small">#{row.target_id}</code> : null}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "ip_address",
      header: t("audit.colIp"),
      cellClassName: "small pos-tabular text-body-secondary",
      render: (row) => row.ip_address || "—",
    },
    {
      key: "actions",
      header: t("audit.colDetails"),
      headerClassName: "text-end",
      cellClassName: "text-end",
      render: (row) => (
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={() => setSelectedEntry(row)}
        >
          {t("audit.inspect")}
        </button>
      ),
    },
  ];

  return (
    <div className="d-flex flex-column gap-4">
      <PageHeader
        title={t("audit.title")}
        subtitle={t("audit.subtitle")}
        icon="bi-journal-check"
        actions={
          <span className="badge text-bg-secondary py-2 px-3">
            <i className="bi bi-lock-fill me-1" aria-hidden="true" />
            {t("audit.readOnlyBadge")}
          </span>
        }
      />

      <AppCard
        bodyClassName="p-0"
        headerActions={
          <div className="d-flex flex-wrap gap-2 w-100">
            <input
              type="search"
              className="form-control form-control-sm"
              style={{ minWidth: "220px", flex: "1 1 220px" }}
              placeholder={t("audit.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              aria-label="Filter audit target type"
              className="form-select form-select-sm"
              style={{ width: "160px" }}
              value={targetType}
              onChange={(e) => {
                setTargetType(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t("audit.allTargets")}</option>
              {TARGET_TYPES.map((tt) => (
                <option key={tt} value={tt}>
                  {tt}
                </option>
              ))}
            </select>
            <input
              type="date"
              aria-label="Audit date from"
              className="form-control form-control-sm"
              style={{ width: "145px" }}
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
            />
            <input
              type="date"
              aria-label="Audit date to"
              className="form-control form-control-sm"
              style={{ width: "145px" }}
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
            />
          </div>
        }
      >
        {error ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={loadLogs} />
          </div>
        ) : loading ? (
          <LoadingState message={t("status.loading")} />
        ) : logs.length === 0 ? (
          <EmptyState icon="bi-journal-check" title={t("audit.emptyLogs")} />
        ) : (
          <>
            <DataTable columns={columns} rows={logs} rowKey="id" />
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              totalCount={totalCount}
              onPageChange={setPage}
              previousLabel={t("controls.previous")}
              nextLabel={t("controls.next")}
            />
          </>
        )}
      </AppCard>

      <AppModal
        isOpen={Boolean(selectedEntry)}
        onClose={() => setSelectedEntry(null)}
        title={`${t("audit.detailModalTitle")} #${selectedEntry?.id || ""}`}
        size="lg"
        footer={
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setSelectedEntry(null)}
          >
            {t("controls.close")}
          </button>
        }
      >
        {selectedEntry ? (
          <div className="d-flex flex-column gap-3">
            <div className="row g-2 small">
              <div className="col-6 col-md-4">
                <div className="text-body-secondary">{t("audit.colAction")}</div>
                <code className="fw-semibold">{selectedEntry.action}</code>
              </div>
              <div className="col-6 col-md-4">
                <div className="text-body-secondary">{t("audit.colActor")}</div>
                <div className="fw-medium">
                  {selectedEntry.actor_username || t("audit.systemActor")}
                </div>
              </div>
              <div className="col-6 col-md-4">
                <div className="text-body-secondary">{t("audit.colTimestamp")}</div>
                <div className="pos-tabular">{formatDateTime(selectedEntry.created_at)}</div>
              </div>
              <div className="col-6 col-md-4">
                <div className="text-body-secondary">{t("audit.colTarget")}</div>
                <div>
                  {selectedEntry.target_type || "—"}
                  {selectedEntry.target_id ? ` #${selectedEntry.target_id}` : ""}
                </div>
              </div>
              <div className="col-6 col-md-4">
                <div className="text-body-secondary">{t("audit.colIp")}</div>
                <div className="pos-tabular">{selectedEntry.ip_address || "—"}</div>
              </div>
            </div>
            <div>
              <div className="small fw-semibold text-body-secondary mb-1">
                {t("audit.metadataLabel")}
              </div>
              <pre
                className="p-3 rounded border bg-body-tertiary small mb-0"
                style={{ maxHeight: "320px", overflow: "auto" }}
              >
                {JSON.stringify(selectedEntry.metadata || {}, null, 2)}
              </pre>
            </div>
          </div>
        ) : null}
      </AppModal>
    </div>
  );
}
