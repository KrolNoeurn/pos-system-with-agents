import { Link, useLocation } from "react-router-dom";
import { resolveBreadcrumbs } from "../config/navigation";
import { usePreferences } from "../contexts/PreferencesContext";

export default function Breadcrumbs() {
  const location = useLocation();
  const { t } = usePreferences();
  const crumbs = resolveBreadcrumbs(location.pathname);

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="breadcrumb mb-0 small flex-nowrap overflow-hidden">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          const label = t(crumb.labelKey);
          return (
            <li
              key={`${crumb.labelKey}-${index}`}
              className={`breadcrumb-item text-truncate${isLast ? " active fw-medium" : ""}`}
              aria-current={isLast ? "page" : undefined}
            >
              {isLast || !crumb.to ? (
                <span>{label}</span>
              ) : (
                <Link to={crumb.to} className="text-decoration-none">
                  {label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
