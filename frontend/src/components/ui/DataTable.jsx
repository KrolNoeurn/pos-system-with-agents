import EmptyState from "./EmptyState";
import ErrorState from "./ErrorState";
import LoadingState from "./LoadingState";

export default function DataTable({
  columns,
  rows = [],
  rowKey = "id",
  loading = false,
  loadingMessage = "Loading records...",
  error = "",
  onRetry,
  emptyTitle = "No records found",
  emptyDescription = "",
  emptyIcon = "bi-table",
  emptyAction = null,
}) {
  if (loading) {
    return <LoadingState message={loadingMessage} />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={onRetry} />;
  }

  if (!rows || rows.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  return (
    <div className="table-responsive">
      <table className="table table-hover align-middle mb-0">
        <thead>
          <tr className="border-bottom">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`text-body-secondary small text-uppercase fw-semibold py-3 ${
                  col.headerClassName || ""
                }`.trim()}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const key = typeof rowKey === "function" ? rowKey(row, idx) : row[rowKey] ?? idx;
            return (
              <tr key={key}>
                {columns.map((col) => (
                  <td key={col.key} className={col.cellClassName || ""}>
                    {col.render ? col.render(row, idx) : row[col.key]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
