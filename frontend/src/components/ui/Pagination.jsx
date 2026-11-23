export default function Pagination({
  page,
  pageSize,
  totalCount,
  onPageChange,
  previousLabel = "Previous",
  nextLabel = "Next",
  summaryLabel,
}) {
  const totalPages = Math.max(1, Math.ceil((totalCount || 0) / pageSize));

  if (!totalCount || totalCount <= pageSize) {
    return null;
  }

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);

  const pages = [];
  const startPage = Math.max(1, page - 2);
  const endPage = Math.min(totalPages, page + 2);
  for (let p = startPage; p <= endPage; p += 1) {
    pages.push(p);
  }

  return (
    <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2 px-4 py-3 border-top">
      <div className="small text-body-secondary pos-tabular">
        {summaryLabel
          ? summaryLabel(start, end, totalCount)
          : `Showing ${start}–${end} of ${totalCount}`}
      </div>

      <nav aria-label="Pagination">
        <ul className="pagination pagination-sm mb-0">
          <li className={`page-item${page <= 1 ? " disabled" : ""}`}>
            <button
              type="button"
              className="page-link"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
            >
              {previousLabel}
            </button>
          </li>

          {pages.map((p) => (
            <li key={p} className={`page-item${p === page ? " active" : ""}`}>
              <button
                type="button"
                className="page-link pos-tabular"
                onClick={() => onPageChange(p)}
                aria-current={p === page ? "page" : undefined}
              >
                {p}
              </button>
            </li>
          ))}

          <li className={`page-item${page >= totalPages ? " disabled" : ""}`}>
            <button
              type="button"
              className="page-link"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
            >
              {nextLabel}
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}
