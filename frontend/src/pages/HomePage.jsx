import { useCallback, useEffect, useState } from "react";
import StatusAlert from "../components/StatusAlert";
import { API_BASE_URL } from "../services/apiClient";
import { fetchBackendHealth } from "../services/healthService";

export default function HomePage() {
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
      if (err?.message === "canceled") {
        return;
      }
      setHealth(null);
      setError(err?.message || "Failed to connect to the backend health endpoint.");
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadHealth(controller.signal);
    return () => controller.abort();
  }, [loadHealth]);

  const handleRefresh = () => {
    loadHealth();
  };

  const isHealthy = health?.status === "ok";

  return (
    <div className="row justify-content-center">
      <div className="col-12 col-lg-9 col-xl-8">
        <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-3 mb-4">
          <div>
            <h1 className="h3 mb-1">POS System Foundation</h1>
            <p className="text-body-secondary mb-0">
              Development environment initialized and ready for core module implementation.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-outline-primary align-self-start align-self-sm-center"
            onClick={handleRefresh}
            disabled={loading}
          >
            <i className="bi bi-arrow-clockwise me-2" aria-hidden="true" />
            {loading ? "Checking..." : "Recheck API"}
          </button>
        </div>

        <div className="card pos-surface shadow-sm mb-4">
          <div className="card-header bg-transparent d-flex align-items-center justify-content-between py-3">
            <span className="fw-semibold d-flex align-items-center gap-2">
              <i className="bi bi-hdd-network text-primary" aria-hidden="true" />
              Backend Health Check
            </span>
            {loading ? (
              <span className="badge text-bg-secondary">Checking</span>
            ) : isHealthy ? (
              <span className="badge text-bg-success">Connected</span>
            ) : (
              <span className="badge text-bg-danger">Unavailable</span>
            )}
          </div>

          <div className="card-body p-4">
            {loading && (
              <div className="d-flex align-items-center gap-3 text-body-secondary" role="status">
                <div className="spinner-border spinner-border-sm text-primary" aria-hidden="true" />
                <span>Contacting {API_BASE_URL}/health/ ...</span>
              </div>
            )}

            {!loading && error && (
              <StatusAlert
                variant="danger"
                title="Backend Connection Error"
                message={error}
                onRetry={handleRefresh}
              />
            )}

            {!loading && !error && health && (
              <div className="row g-3">
                <div className="col-12 col-sm-6 col-md-3">
                  <div className="p-3 rounded border bg-body-tertiary h-100">
                    <div className="small text-body-secondary mb-1">Status</div>
                    <div className="fw-semibold text-uppercase text-success">
                      {health.status}
                    </div>
                  </div>
                </div>
                <div className="col-12 col-sm-6 col-md-3">
                  <div className="p-3 rounded border bg-body-tertiary h-100">
                    <div className="small text-body-secondary mb-1">Service</div>
                    <div className="fw-semibold">{health.service}</div>
                  </div>
                </div>
                <div className="col-12 col-sm-6 col-md-3">
                  <div className="p-3 rounded border bg-body-tertiary h-100">
                    <div className="small text-body-secondary mb-1">API Version</div>
                    <div className="fw-semibold">{health.api_version}</div>
                  </div>
                </div>
                <div className="col-12 col-sm-6 col-md-3">
                  <div className="p-3 rounded border bg-body-tertiary h-100">
                    <div className="small text-body-secondary mb-1">Database</div>
                    <div className="fw-semibold text-capitalize">{health.database}</div>
                  </div>
                </div>
                <div className="col-12">
                  <div className="small text-body-secondary pos-tabular">
                    <strong>Endpoint:</strong> <code>{API_BASE_URL}/health/</code>
                    {" · "}
                    <strong>Timestamp:</strong> {health.timestamp}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card pos-surface shadow-sm">
          <div className="card-body p-4">
            <h2 className="h6 text-uppercase text-body-secondary mb-3">
              Initialized Stack
            </h2>
            <div className="row g-3 small">
              <div className="col-12 col-md-6">
                <div className="d-flex align-items-start gap-2">
                  <i className="bi bi-window-sidebar text-primary mt-1" aria-hidden="true" />
                  <div>
                    <div className="fw-semibold">Frontend</div>
                    <div className="text-body-secondary">
                      React, Vite, Bootstrap 5, Bootstrap Icons, React Router, Axios
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-12 col-md-6">
                <div className="d-flex align-items-start gap-2">
                  <i className="bi bi-server text-primary mt-1" aria-hidden="true" />
                  <div>
                    <div className="fw-semibold">Backend</div>
                    <div className="text-body-secondary">
                      Python, Django, Django REST Framework, CORS, SQLite
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
