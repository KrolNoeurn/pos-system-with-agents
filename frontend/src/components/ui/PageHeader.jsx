export default function PageHeader({ title, subtitle, icon, badge, actions }) {
  return (
    <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4">
      <div className="min-w-0">
        <div className="d-flex flex-wrap align-items-center gap-2">
          {icon && <i className={`bi ${icon} fs-4 text-primary`} aria-hidden="true" />}
          <h1 className="h3 mb-0">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="text-body-secondary mb-0 mt-1">{subtitle}</p>}
      </div>
      {actions && (
        <div className="d-flex flex-wrap align-items-center gap-2 flex-shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
