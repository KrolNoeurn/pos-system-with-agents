import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppCard, ErrorState, LoadingState, PageHeader } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { usePreferences } from "../contexts/PreferencesContext";
import { API_BASE_URL } from "../services/apiClient";
import { fetchBackendHealth } from "../services/healthService";

export default function HomePage() {
  const { user, hasPermission } = useAuth();
  const { layout, theme, language, sidebarMode, t } = usePreferences();

  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadHealth = useCallback(async (signal) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchBackendHealth(signal);
      setHealth(data);
    } catch (err) {
      if (err?.message === "canceled") return;
      setHealth(null);
      setError(err?.message || "Failed to connect to the backend health endpoint.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadHealth(controller.signal);
    return () => controller.abort();
  }, [loadHealth]);

  const isHealthy = health?.status === "ok";

  return (
    <div className="d-flex flex-column gap-4">
      <PageHeader
        icon="bi-activity"
        title={t("pages.systemStatusTitle")}
        subtitle={t("pages.systemStatusSubtitle")}
        actions={
          <button
            type="button"
            className="btn btn-outline-primary"
            onClick={() => loadHealth()}
            disabled={loading}
          >
            <i className="bi bi-arrow-clockwise me-2" aria-hidden="true" />
            {loading ? t("controls.checking") : t("controls.recheckApi")}
          </button>
        }
      />

      <AppCard
        title="Backend Health Check"
        icon="bi-hdd-network"
        headerActions={
          loading ? (
            <span className="badge text-bg-secondary">{t("controls.checking")}</span>
          ) : isHealthy ? (
            <span className="badge text-bg-success">{t("status.connected")}</span>
          ) : (
            <span className="badge text-bg-danger">{t("status.unavailable")}</span>
          )
        }
      >
        {loading ? (
          <LoadingState compact message={`Contacting ${API_BASE_URL}/health/ ...`} />
        ) : error ? (
          <ErrorState
            title="Backend Connection Error"
            message={error}
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
          <AppCard
            title="Active Session & Access Scope"
            icon="bi-shield-lock"
            className="h-100"
          >
            <div className="mb-3 small text-body-secondary">
              Signed in as <strong className="text-body">{user?.full_name || user?.username}</strong>{" "}
              (@{user?.username})
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
