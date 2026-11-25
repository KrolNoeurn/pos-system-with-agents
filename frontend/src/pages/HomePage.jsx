import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppCard, DataTable, ErrorState, LoadingState, PageHeader } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { usePreferences } from "../contexts/PreferencesContext";
import { API_BASE_URL } from "../services/apiClient";
import { fetchBackendHealth } from "../services/healthService";
import { fetchDashboardSummary } from "../services/reportsService";

function formatMoney(value) {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return "$0.00";
  return `$${num.toFixed(2)}`;
}

function formatQty(value) {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return "0";
  return Number.isInteger(num) ? String(num) : num.toFixed(3).replace(/\.?0+$/, "");
}

export default function HomePage() {
  const { user, hasPermission } = useAuth();
  const { layout, theme, language, sidebarMode, t } = usePreferences();

  const canViewDashboard = hasPermission("dashboard.view");
  const canCreateSale = hasPermission("sales.create");
  const canViewSales = hasPermission("sales.view");
  const canViewInventory = hasPermission("inventory.view");
  const canViewReports = hasPermission("reports.view");

  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState(null);

  const [dashboard, setDashboard] = useState(null);
  const [dashLoading, setDashLoading] = useState(canViewDashboard);

  const loadHealth = useCallback(async (signal) => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      const data = await fetchBackendHealth(signal);
      setHealth(data);
    } catch (err) {
      if (err?.message === "canceled") return;
      setHealth(null);
      setHealthError(err?.message || "Failed to connect to the backend health endpoint.");
    } finally {
      if (!signal?.aborted) setHealthLoading(false);
    }
  }, []);

  const loadDashboard = useCallback(async () => {
    if (!canViewDashboard) return;
    setDashLoading(true);
    try {
      const data = await fetchDashboardSummary();
      setDashboard(data);
    } catch {
      setDashboard(null);
    } finally {
      setDashLoading(false);
    }
  }, [canViewDashboard]);

  useEffect(() => {
    const controller = new AbortController();
    loadHealth(controller.signal);
    loadDashboard();
    return () => controller.abort();
  }, [loadHealth, loadDashboard]);

  const isHealthy = health?.status === "ok";

  return (
    <div className="d-flex flex-column gap-4">
      <PageHeader
        icon="bi-speedometer2"
        title={canViewDashboard ? t("dashboard.title") : t("pages.systemStatusTitle")}
        subtitle={canViewDashboard ? t("dashboard.subtitle") : t("pages.systemStatusSubtitle")}
        actions={
          <div className="d-flex flex-wrap gap-2">
            {canCreateSale ? (
              <Link to="/pos" className="btn btn-primary">
                <i className="bi bi-cash-register me-2" aria-hidden="true" />
                {t("dashboard.openPos")}
              </Link>
            ) : null}
            {canViewReports ? (
              <Link to="/reports" className="btn btn-outline-secondary">
                <i className="bi bi-bar-chart-line me-2" aria-hidden="true" />
                {t("dashboard.openReports")}
              </Link>
            ) : null}
            <button
              type="button"
              className="btn btn-outline-primary"
              onClick={() => {
                loadHealth();
                loadDashboard();
              }}
              disabled={healthLoading}
            >
              <i className="bi bi-arrow-clockwise me-2" aria-hidden="true" />
              {healthLoading ? t("controls.checking") : t("controls.recheckApi")}
            </button>
          </div>
        }
      />

      {/* Live Operational KPIs (permission-gated by dashboard.view) */}
      {canViewDashboard ? (
        dashLoading && !dashboard ? (
          <LoadingState compact message={t("status.loading")} />
        ) : dashboard ? (
          <>
            <div className="row g-3 g-md-4">
              <div className="col-12 col-sm-6 col-xl-3">
                <div className="card pos-surface vuexy-kpi-card p-3 p-md-4 h-100">
                  <div className="d-flex justify-content-between align-items-start gap-2">
                    <div className="min-w-0">
                      <div className="small text-body-secondary mb-1">{t("dashboard.todaySales")}</div>
                      <div className="fs-3 fw-bold text-primary pos-tabular">
                        {formatMoney(dashboard.kpis.today_sales_total)}
                      </div>
                      <div className="small text-body-secondary pos-tabular mt-1">
                        {dashboard.kpis.today_sales_count} orders · avg{" "}
                        {formatMoney(dashboard.kpis.today_avg_ticket)}
                      </div>
                    </div>
                    <span className="vuexy-kpi-icon is-primary" aria-hidden="true">
                      <i className="bi bi-cash-coin" />
                    </span>
                  </div>
                </div>
              </div>
              <div className="col-12 col-sm-6 col-xl-3">
                <div className="card pos-surface vuexy-kpi-card p-3 p-md-4 h-100">
                  <div className="d-flex justify-content-between align-items-start gap-2">
                    <div className="min-w-0">
                      <div className="small text-body-secondary mb-1">{t("dashboard.mtdSales")}</div>
                      <div className="fs-3 fw-bold text-success pos-tabular">
                        {formatMoney(dashboard.kpis.mtd_sales_total)}
                      </div>
                      <div className="small text-body-secondary pos-tabular mt-1">
                        {dashboard.kpis.mtd_sales_count} orders
                      </div>
                    </div>
                    <span className="vuexy-kpi-icon is-success" aria-hidden="true">
                      <i className="bi bi-graph-up-arrow" />
                    </span>
                  </div>
                </div>
              </div>
              <div className="col-12 col-sm-6 col-xl-3">
                <div className="card pos-surface vuexy-kpi-card p-3 p-md-4 h-100">
                  <div className="d-flex justify-content-between align-items-start gap-2">
                    <div className="min-w-0">
                      <div className="small text-body-secondary mb-1">{t("dashboard.mtdExpenses")}</div>
                      <div className="fs-3 fw-bold text-danger pos-tabular">
                        {formatMoney(dashboard.kpis.mtd_expenses_total)}
                      </div>
                      <div className="small text-body-secondary pos-tabular mt-1">
                        {t("dashboard.pendingPurchases")}: {dashboard.kpis.pending_purchases_count}
                      </div>
                    </div>
                    <span className="vuexy-kpi-icon is-danger" aria-hidden="true">
                      <i className="bi bi-wallet2" />
                    </span>
                  </div>
                </div>
              </div>
              <div className="col-12 col-sm-6 col-xl-3">
                <div className="card pos-surface vuexy-kpi-card p-3 p-md-4 h-100">
                  <div className="d-flex justify-content-between align-items-start gap-2">
                    <div className="min-w-0">
                      <div className="small text-body-secondary mb-1">{t("dashboard.lowStockAlerts")}</div>
                      <div
                        className={`fs-3 fw-bold pos-tabular ${
                          dashboard.kpis.low_stock_count > 0 ? "text-warning" : "text-success"
                        }`}
                      >
                        {dashboard.kpis.low_stock_count}
                      </div>
                      <div className="small text-body-secondary pos-tabular mt-1">
                        {dashboard.kpis.out_of_stock_count} out of stock /{" "}
                        {dashboard.kpis.tracked_products_count} tracked
                      </div>
                    </div>
                    <span
                      className={`vuexy-kpi-icon ${
                        dashboard.kpis.low_stock_count > 0 ? "is-warning" : "is-success"
                      }`}
                      aria-hidden="true"
                    >
                      <i className="bi bi-box-seam" />
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="row g-4">
              <div className="col-12 col-xl-7">
                <AppCard
                  title={t("dashboard.recentSalesTitle")}
                  icon="bi-receipt"
                  bodyClassName="p-0"
                  headerActions={
                    canViewSales ? (
                      <Link to="/sales" className="btn btn-sm btn-outline-secondary">
                        {t("dashboard.viewAllSales")}
                      </Link>
                    ) : null
                  }
                >
                  <DataTable
                    columns={[
                      {
                        key: "sale_number",
                        header: t("sales.colReceipt"),
                        render: (row) => <code className="fw-semibold">{row.sale_number}</code>,
                      },
                      { key: "customer_name_snapshot", header: t("sales.colCustomer") },
                      {
                        key: "total_amount",
                        header: t("sales.colTotal"),
                        headerClassName: "text-end",
                        cellClassName: "text-end pos-tabular fw-semibold",
                        render: (row) => formatMoney(row.total_amount),
                      },
                      {
                        key: "status",
                        header: t("sales.colStatus"),
                        render: (row) => (
                          <span
                            className={`badge ${
                              row.status === "completed"
                                ? "text-bg-success"
                                : row.status === "refunded"
                                  ? "text-bg-warning"
                                  : "text-bg-danger"
                            }`}
                          >
                            {row.status}
                          </span>
                        ),
                      },
                    ]}
                    rows={dashboard.recent_sales || []}
                    rowKey="id"
                    emptyTitle={t("dashboard.noRecentSales")}
                  />
                </AppCard>
              </div>

              <div className="col-12 col-xl-5">
                <AppCard
                  title={t("dashboard.lowStockTitle")}
                  icon="bi-exclamation-triangle"
                  bodyClassName="p-0"
                  headerActions={
                    canViewInventory ? (
                      <Link to="/inventory" className="btn btn-sm btn-outline-secondary">
                        {t("dashboard.viewInventory")}
                      </Link>
                    ) : null
                  }
                >
                  <DataTable
                    columns={[
                      {
                        key: "name",
                        header: t("reports.colProduct"),
                        render: (row) => (
                          <div>
                            <div className="fw-medium small">
                              {language === "km" && row.name_km ? row.name_km : row.name}
                            </div>
                            <code className="small text-body-secondary">{row.sku}</code>
                          </div>
                        ),
                      },
                      {
                        key: "quantity_on_hand",
                        header: t("sales.inStock"),
                        headerClassName: "text-end",
                        cellClassName: "text-end pos-tabular",
                        render: (row) => (
                          <span
                            className={`badge ${
                              Number(row.quantity_on_hand) <= 0
                                ? "text-bg-danger"
                                : "text-bg-warning"
                            }`}
                          >
                            {formatQty(row.quantity_on_hand)} / {formatQty(row.min_stock_threshold)}{" "}
                            {row.unit_abbreviation}
                          </span>
                        ),
                      },
                    ]}
                    rows={dashboard.low_stock_items || []}
                    rowKey="product_id"
                    emptyTitle={t("dashboard.allStockHealthy")}
                  />
                </AppCard>
              </div>
            </div>
          </>
        ) : null
      ) : null}

      <AppCard
        title="Backend Health Check"
        icon="bi-hdd-network"
        headerActions={
          healthLoading ? (
            <span className="badge text-bg-secondary">{t("controls.checking")}</span>
          ) : isHealthy ? (
            <span className="badge text-bg-success">{t("status.connected")}</span>
          ) : (
            <span className="badge text-bg-danger">{t("status.unavailable")}</span>
          )
        }
      >
        {healthLoading ? (
          <LoadingState compact message={`Contacting ${API_BASE_URL}/health/ ...`} />
        ) : healthError ? (
          <ErrorState
            title="Backend Connection Error"
            message={healthError}
            onRetry={() => loadHealth()}
            retryLabel={t("controls.retry")}
          />
        ) : (
          health && (
            <div className="row g-3">
              <div className="col-12 col-sm-6 col-xl-3">
                <div className="p-3 rounded border bg-body-tertiary h-100">
                  <div className="small text-body-secondary mb-1">Status</div>
                  <div className="fw-semibold text-uppercase text-success">{health.status}</div>
                </div>
              </div>
              <div className="col-12 col-sm-6 col-xl-3">
                <div className="p-3 rounded border bg-body-tertiary h-100">
                  <div className="small text-body-secondary mb-1">Service</div>
                  <div className="fw-semibold">{health.service}</div>
                </div>
              </div>
              <div className="col-12 col-sm-6 col-xl-3">
                <div className="p-3 rounded border bg-body-tertiary h-100">
                  <div className="small text-body-secondary mb-1">API Version</div>
                  <div className="fw-semibold">{health.api_version}</div>
                </div>
              </div>
              <div className="col-12 col-sm-6 col-xl-3">
                <div className="p-3 rounded border bg-body-tertiary h-100">
                  <div className="small text-body-secondary mb-1">Database</div>
                  <div className="fw-semibold text-capitalize">{health.database}</div>
                </div>
              </div>
              <div className="col-12 small text-body-secondary pos-tabular">
                <strong>Endpoint:</strong> <code>{API_BASE_URL}/health/</code>
                {" · "}
                <strong>Timestamp:</strong> {health.timestamp}
              </div>
            </div>
          )
        )}
      </AppCard>

      <div className="row g-4">
        <div className="col-12 col-lg-7">
          <AppCard title="Active Session & Access Scope" icon="bi-shield-lock" className="h-100">
            <div className="mb-3 small text-body-secondary">
              Signed in as{" "}
              <strong className="text-body">{user?.full_name || user?.username}</strong> (@
              {user?.username})
            </div>

            <div className="mb-3">
              <div className="small text-body-secondary mb-1">Assigned Roles</div>
              <div className="d-flex flex-wrap gap-2">
                {(user?.roles || []).length === 0 ? (
                  <span className="text-body-secondary small">No roles assigned</span>
                ) : (
                  user.roles.map((r) => (
                    <span key={r.id} className="badge text-bg-primary">
                      {r.name}
                    </span>
                  ))
                )}
              </div>
            </div>

            <div className="d-flex flex-wrap gap-2">
              <Link to="/profile" className="btn btn-sm btn-outline-secondary">
                <i className="bi bi-sliders me-1" aria-hidden="true" />
                {t("nav.profile")}
              </Link>
              {hasPermission("users.view") && (
                <Link to="/users" className="btn btn-sm btn-outline-primary">
                  <i className="bi bi-people me-1" aria-hidden="true" />
                  {t("nav.users")}
                </Link>
              )}
              {hasPermission("roles.view") && (
                <Link to="/roles" className="btn btn-sm btn-outline-primary">
                  <i className="bi bi-key me-1" aria-hidden="true" />
                  {t("nav.roles")}
                </Link>
              )}
            </div>
          </AppCard>
        </div>

        <div className="col-12 col-lg-5">
          <AppCard title="Active UI Preferences" icon="bi-palette" className="h-100">
            <dl className="row mb-0 small">
              <dt className="col-5 text-body-secondary">Layout</dt>
              <dd className="col-7 text-capitalize fw-medium">{layout}</dd>
              <dt className="col-5 text-body-secondary">Theme</dt>
              <dd className="col-7 text-capitalize fw-medium">{theme}</dd>
              <dt className="col-5 text-body-secondary">Sidebar</dt>
              <dd className="col-7 text-capitalize fw-medium">{sidebarMode}</dd>
              <dt className="col-5 text-body-secondary mb-0">Language</dt>
              <dd className="col-7 fw-medium mb-0">
                {language === "km" ? "ភាសាខ្មែរ (km)" : "English (en)"}
              </dd>
            </dl>
          </AppCard>
        </div>
      </div>
    </div>
  );
}
