export default function StatusAlert({
  variant = "danger",
  title,
  message,
  onRetry,
  retryLabel = "Retry",
}) {
  const iconByVariant = {
    danger: "bi-exclamation-octagon-fill",
    warning: "bi-exclamation-triangle-fill",
    success: "bi-check-circle-fill",
    info: "bi-info-circle-fill",
  };

  return (
    <div
      className={`alert alert-${variant} d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3 mb-0`}
      role="alert"
    >
      <div className="d-flex align-items-start gap-2">
        <i
          className={`bi ${iconByVariant[variant] || iconByVariant.info} mt-1`}
          aria-hidden="true"
        />
        <div>
          {title && <div className="fw-semibold">{title}</div>}
          <div>{message}</div>
        </div>
      </div>
      {onRetry && (
        <button
          type="button"
          className={`btn btn-sm btn-outline-${variant} flex-shrink-0`}
          onClick={onRetry}
        >
          <i className="bi bi-arrow-clockwise me-1" aria-hidden="true" />
          {retryLabel}
        </button>
      )}
    </div>
  );
}
