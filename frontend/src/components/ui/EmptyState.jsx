export default function EmptyState({
  icon = "bi-inbox",
  title = "No records found",
  description = "",
  action = null,
}) {
  return (
    <div className="text-center py-5 px-3">
      <div className="text-body-secondary mb-2">
        <i className={`bi ${icon} fs-2`} aria-hidden="true" />
      </div>
      <h2 className="h6 fw-semibold mb-1">{title}</h2>
      {description && <p className="text-body-secondary small mb-3">{description}</p>}
      {action}
    </div>
  );
}
