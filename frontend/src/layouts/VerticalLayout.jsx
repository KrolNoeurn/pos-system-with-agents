import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  NAVIGATION_ITEMS,
  filterNavigationByPermission,
  isItemActive,
} from "../config/navigation";
import { THEME_CONFIG } from "../config/themeConfig";
import { useAuth } from "../contexts/AuthContext";
import { usePreferences } from "../contexts/PreferencesContext";
import Breadcrumbs from "./Breadcrumbs";
import HeaderControls from "./HeaderControls";

export default function VerticalLayout() {
  const { hasPermission } = useAuth();
  const { sidebarMode, cycleSidebarMode, t } = usePreferences();
  const location = useLocation();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState(() => ({
    administration: true,
    account: false,
  }));

  const navItems = useMemo(
    () => filterNavigationByPermission(NAVIGATION_ITEMS, hasPermission),
    [hasPermission]
  );

  // Auto-open parent group for active route & close mobile drawer on navigation
  useEffect(() => {
    setMobileOpen(false);
    setOpenGroups((prev) => {
      const next = { ...prev };
      for (const item of navItems) {
        if (item.children && isItemActive(item, location.pathname)) {
          next[item.id] = true;
        }
      }
      return next;
    });
  }, [location.pathname, navItems]);

  const toggleGroup = (groupId) => {
    setOpenGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const isMini = sidebarMode === "mini";
  const isCollapsed = sidebarMode === "collapsed";

  const sidebarClassName = [
    "pos-sidebar",
    isMini ? "is-mini" : "",
    isCollapsed ? "is-collapsed" : "",
    mobileOpen ? "is-mobile-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="pos-vertical-shell" data-layout="vertical">
      {mobileOpen && (
        <div
          className="pos-sidebar-backdrop d-lg-none"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside className={sidebarClassName} aria-label="Sidebar navigation">
        <Link to="/" className="pos-sidebar-brand" title={THEME_CONFIG.appName}>
          <i className="bi bi-shop fs-4 text-primary flex-shrink-0" aria-hidden="true" />
          {!isMini && (
            <div className="min-w-0">
              <div className="text-truncate">{THEME_CONFIG.appName}</div>
            </div>
          )}
        </Link>

        <nav className="pos-sidebar-nav d-flex flex-column gap-1">
          {navItems.map((item) => {
            const label = t(item.labelKey);

            if (item.children) {
              const expanded = Boolean(openGroups[item.id]);
              const activeGroup = isItemActive(item, location.pathname);

              return (
                <div key={item.id}>
                  <button
                    type="button"
                    className={`pos-sidebar-group-btn${activeGroup ? " text-primary" : ""}`}
                    onClick={() => toggleGroup(item.id)}
                    aria-expanded={expanded}
                    title={isMini ? label : undefined}
                  >
                    <i className={`bi ${item.icon} flex-shrink-0`} aria-hidden="true" />
                    {!isMini && (
                      <>
                        <span className="flex-grow-1 text-truncate">{label}</span>
                        <i
                          className={`bi ${
                            expanded ? "bi-chevron-down" : "bi-chevron-right"
                          } small`}
                          aria-hidden="true"
                        />
                      </>
                    )}
                  </button>

                  {expanded && (
                    <div className="pos-sidebar-submenu">
                      {item.children.map((child) => {
                        const childLabel = t(child.labelKey);
                        return (
                          <NavLink
                            key={child.id}
                            to={child.to}
                            className={({ isActive }) =>
                              `pos-sidebar-link${isActive ? " active" : ""}`
                            }
                            title={isMini ? childLabel : undefined}
                          >
                            <i className={`bi ${child.icon} flex-shrink-0`} aria-hidden="true" />
                            {!isMini && <span className="text-truncate">{childLabel}</span>}
                          </NavLink>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <NavLink
                key={item.id}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `pos-sidebar-link${isActive ? " active" : ""}`}
                title={isMini ? label : undefined}
              >
                <i className={`bi ${item.icon} flex-shrink-0`} aria-hidden="true" />
                {!isMini && <span className="text-truncate">{label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {!isMini && (
          <div className="p-3 border-top small text-body-secondary">
            {t("app.subtitle")}
          </div>
        )}
      </aside>

      <div className="pos-vertical-main">
        <header className="pos-topbar">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary d-lg-none"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={t("controls.openMenu")}
            aria-expanded={mobileOpen}
          >
            <i className="bi bi-list fs-5" aria-hidden="true" />
          </button>

          <button
            type="button"
            className="btn btn-sm btn-outline-secondary d-none d-lg-inline-flex align-items-center"
            onClick={cycleSidebarMode}
            aria-label={t("controls.cycleSidebar")}
            title={
              sidebarMode === "expanded"
                ? t("controls.sidebarMini")
                : sidebarMode === "mini"
                  ? t("controls.sidebarCollapsed")
                  : t("controls.sidebarExpanded")
            }
          >
            <i
              className={`bi ${
                sidebarMode === "collapsed"
                  ? "bi-layout-sidebar"
                  : sidebarMode === "mini"
                    ? "bi-layout-sidebar-inset"
                    : "bi-layout-sidebar-reverse"
              }`}
              aria-hidden="true"
            />
          </button>

          <div className="d-none d-sm-block min-w-0">
            <Breadcrumbs />
          </div>

          <HeaderControls />
        </header>

        <main className="flex-grow-1 py-4 px-3 px-md-4">
          <div className="container-fluid px-0">
            <Outlet />
          </div>
        </main>

        <footer className="border-top py-3 px-3 px-md-4 small text-body-secondary bg-body-tertiary">
          <div className="d-flex flex-column flex-sm-row justify-content-between gap-2">
            <span>{THEME_CONFIG.appName}</span>
            <span>{t("app.footerLabel")}</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
