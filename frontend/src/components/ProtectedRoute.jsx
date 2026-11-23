import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function ProtectedRoute({
  children,
  requiredPermission,
  requiredAnyPermissions,
}) {
  const { isAuthenticated, isLoading, hasPermission, hasAnyPermission } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="d-flex align-items-center justify-content-center py-5" role="status">
        <div className="spinner-border text-primary me-3" aria-hidden="true" />
        <span className="text-body-secondary">Verifying session...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <Navigate to="/unauthorized" replace />;
  }

  if (requiredAnyPermissions && !hasAnyPermission(requiredAnyPermissions)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}
