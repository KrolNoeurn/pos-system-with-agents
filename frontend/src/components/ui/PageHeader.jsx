export default function PageHeader({ title, subtitle, icon, badge, actions }) {
  return (
    <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-2">
      <div className="d-flex align-items-start gap-3 min-w-0">
        {icon && (
          <span className="vuexy-page-icon mt-1" aria-hidden="true">
            <i className={`bi ${icon} fs-5`} />
          </span>
        )}
        <div className="min-w-0">
          <div className="d-flex flex-wrap align-items-center gap-2">
            <h1 className="h4 mb-0 fw-semibold">{title}</h1>
            {badge}
          </div>
          {subtitle && <p className="text-body-secondary small mb-0 mt-1">{subtitle}</p>}
        </div>
      </div>
      {actions && (
        <div className="d-flex flex-wrap align-items-center gap-2 flex-shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
