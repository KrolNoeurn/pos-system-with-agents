export default function AppCard({
  title,
  subtitle,
  icon,
  headerActions,
  footer,
  noPadding = false,
  bodyClassName,
  className = "",
  children,
}) {
  const hasTitleBlock = Boolean(title || icon || subtitle);
  const hasHeader = hasTitleBlock || Boolean(headerActions);
  const resolvedBodyClass = bodyClassName ?? (noPadding ? "p-0" : "p-3 p-md-4");

  return (
    <div className={`card pos-surface ${className}`.trim()}>
      {hasHeader && (
        <div className="card-header pos-surface-header py-3 px-3 px-md-4 d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2">
          {hasTitleBlock && (
            <div className="min-w-0">
              <div className="fw-semibold d-flex align-items-center gap-2">
                {icon && <i className={`bi ${icon} text-primary flex-shrink-0`} aria-hidden="true" />}
                <span className="text-truncate">{title}</span>
              </div>
              {subtitle && <div className="small text-body-secondary mt-1">{subtitle}</div>}
            </div>
          )}
          {headerActions && (
            <div
              className={`d-flex flex-wrap align-items-center gap-2 mw-100 ${
                hasTitleBlock ? "flex-shrink-0" : "w-100"
              }`}
            >
              {headerActions}
            </div>
          )}
        </div>
      )}

      <div className={`card-body ${resolvedBodyClass}`.trim()}>{children}</div>

      {footer && (
        <div className="card-footer bg-transparent border-top py-3 px-3 px-md-4">{footer}</div>
      )}
    </div>
  );
}
