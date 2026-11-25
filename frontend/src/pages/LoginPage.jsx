import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import StatusAlert from "../components/StatusAlert";
import { useAuth } from "../contexts/AuthContext";

const APP_NAME = import.meta.env.VITE_APP_NAME || "POS System";

export default function LoginPage() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectPath = location.state?.from?.pathname || "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (isLoading) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center">
        <div className="spinner-border text-primary" role="status" aria-label="Loading" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to={redirectPath} replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!username.trim() || !password) {
      setError("Please enter both username and password.");
      return;
    }

    setSubmitting(true);
    try {
      await login({ username: username.trim(), password });
      navigate(redirectPath, { replace: true });
    } catch (err) {
      setError(err?.message || "Sign-in failed. Please verify your credentials.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-vh-100 vuexy-auth-wrapper d-flex align-items-center justify-content-center py-5 px-3">
      <div className="w-100" style={{ maxWidth: "440px" }}>
        <div className="card pos-surface">
          <div className="card-body p-4 p-sm-5">
            <div className="d-flex align-items-center justify-content-center gap-2 mb-4">
              <span className="vuexy-brand-mark" style={{ width: "40px", height: "40px" }} aria-hidden="true">
                <i className="bi bi-shop fs-4" />
              </span>
              <span className="h4 fw-bold mb-0">{APP_NAME}</span>
            </div>
            <div className="mb-4">
              <h1 className="h5 fw-semibold mb-1">Welcome back</h1>
              <p className="text-body-secondary small mb-0">
                Sign in with your assigned POS account to continue
              </p>
            </div>
            {error && (
              <div className="mb-3">
                <StatusAlert
                  variant="danger"
                  message={error}
                  autoHideMs={6000}
                  dismissible
                  onClose={() => setError("")}
                />
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <div className="mb-3">
                <label htmlFor="loginUsername" className="form-label fw-medium">
                  Username or Email
                </label>
                <input
                  id="loginUsername"
                  type="text"
                  className="form-control"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  required
                  disabled={submitting}
                />
              </div>

              <div className="mb-4">
                <label htmlFor="loginPassword" className="form-label fw-medium">
                  Password
                </label>
                <div className="input-group">
                  <input
                    id="loginPassword"
                    type={showPassword ? "text" : "password"}
                    className="form-control"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    disabled={submitting}
                  >
                    <i className={`bi ${showPassword ? "bi-eye-slash" : "bi-eye"}`} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary w-100"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
                    Signing in...
                  </>
                ) : (
                  <>
                    <i className="bi bi-box-arrow-in-right me-2" aria-hidden="true" />
                    Sign In
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
