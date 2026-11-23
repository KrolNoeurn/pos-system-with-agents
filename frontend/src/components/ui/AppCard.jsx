export default function AppCard({
  title,
  subtitle,
  icon,
  headerActions,
  footer,
  noPadding = false,
  className = "",
  children,
}) {
  const hasHeader = title || icon || headerActions || subtitle;

  return (
    <div className={`card pos-surface ${className}`.trim()}>
      {hasHeader && (
        <div className="card-header pos-surface-header py-3 px-4 d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2">
          <div className="min-w-0">
            <div className="fw-semibold d-flex align-items-center gap-2">
              {icon && <i className={`bi ${icon} text-primary`} aria-hidden="true" />}
              <span>{title}</span>
            </div>
            {subtitle && <div className="small text-body-secondary mt-1">{subtitle}</div>}
          </div>
          {headerActions && (
            <div className="d-flex flex-wrap align-items-center gap-2 flex-shrink-0">
              {headerActions}
            </div>
          )}
        </div>
      )}

      <div className={noPadding ? "card-body p-0" : "card-body p-4"}>{children}</div>

      {footer && (
        <div className="card-footer bg-transparent border-top py-3 px-4">{footer}</div>
      )}
    </div>
  );
}
