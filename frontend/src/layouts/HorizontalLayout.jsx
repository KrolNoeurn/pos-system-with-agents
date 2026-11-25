import { useEffect, useMemo, useRef, useState } from "react";
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

export default function HorizontalLayout() {
  const { hasPermission } = useAuth();
  const { t } = usePreferences();
  const location = useLocation();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState(null);
  const headerRef = useRef(null);

  const navItems = useMemo(
    () => filterNavigationByPermission(NAVIGATION_ITEMS, hasPermission),
    [hasPermission]
  );

  useEffect(() => {
    setMobileMenuOpen(false);
    setOpenDropdownId(null);
  }, [location.pathname]);

  useEffect(() => {
    if (!openDropdownId && !mobileMenuOpen) return undefined;
    const handleOutsideClick = (event) => {
      if (headerRef.current && !headerRef.current.contains(event.target)) {
        setOpenDropdownId(null);
        setMobileMenuOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpenDropdownId(null);
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openDropdownId, mobileMenuOpen]);

  return (
    <div className="pos-horizontal-shell" data-layout="horizontal">
      <header className="pos-horizontal-header" ref={headerRef}>
        {/* Tier 1: Brand + single HeaderControls + mobile menu button */}
        <div className="pos-horizontal-topbar d-flex align-items-center px-3 px-md-4 py-2 gap-2">
          <Link
            className="navbar-brand fw-bold d-flex align-items-center gap-2 text-decoration-none text-reset min-w-0 me-2"
            to="/"
          >
            <span className="vuexy-brand-mark" aria-hidden="true">
              <i className="bi bi-shop fs-5" />
            </span>
            <span className="text-truncate">{THEME_CONFIG.appName}</span>
          </Link>

          <HeaderControls />

          <button
            type="button"
            className="btn btn-sm btn-outline-secondary d-lg-none flex-shrink-0"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={t("controls.openMenu")}
            aria-expanded={mobileMenuOpen}
          >
            <i className={`bi ${mobileMenuOpen ? "bi-x-lg" : "bi-list"} fs-5`} aria-hidden="true" />
          </button>
        </div>

        {/* Tier 2: Full-width responsive horizontal menu (wraps cleanly on lg+, collapses on < lg) */}
        <nav
          className={`pos-horizontal-menubar px-3 px-md-4 ${
            mobileMenuOpen ? "d-block" : "d-none d-lg-block"
          }`}
          aria-label="Horizontal navigation"
        >
          <ul className="pos-horizontal-nav-list">
            {navItems.map((item, idx) => {
              const label = t(item.labelKey);

              if (item.children) {
                const isOpen = openDropdownId === item.id;
                const active = isItemActive(item, location.pathname);
                const alignEnd = idx >= Math.max(2, navItems.length - 2);

                return (
                  <li key={item.id} className="position-relative">
                    <button
                      type="button"
                      className={`pos-horizontal-nav-link dropdown-toggle${
                        active ? " active" : ""
                      }`}
                      onClick={() =>
                        setOpenDropdownId((prev) => (prev === item.id ? null : item.id))
                      }
                      aria-expanded={isOpen}
                    >
                      <i className={`bi ${item.icon} flex-shrink-0`} aria-hidden="true" />
                      <span>{label}</span>
                    </button>

                    {isOpen && (
                      <ul
                        className={`dropdown-menu show pos-nav-dropdown-menu py-1${
                          alignEnd ? " dropdown-menu-end" : ""
                        }`}
                      >
                        {item.children.map((child) => (
                          <li key={child.id}>
                            <NavLink
                              to={child.to}
                              className={({ isActive }) =>
                                `dropdown-item py-2 d-flex align-items-center gap-2${
                                  isActive ? " active" : ""
                                }`
                              }
                              onClick={() => {
                                setOpenDropdownId(null);
                                setMobileMenuOpen(false);
                              }}
                            >
                              <i className={`bi ${child.icon} flex-shrink-0`} aria-hidden="true" />
                              <span>{t(child.labelKey)}</span>
                            </NavLink>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              }

              return (
                <li key={item.id}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `pos-horizontal-nav-link${isActive ? " active" : ""}`
                    }
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <i className={`bi ${item.icon} flex-shrink-0`} aria-hidden="true" />
                    <span>{label}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="pos-horizontal-subbar py-2 px-3 px-md-4">
          <Breadcrumbs />
        </div>
      </header>

      <main className="flex-grow-1 py-3 py-md-4 px-3 px-md-4">
        <div className="container-fluid px-0">
          <Outlet />
        </div>
      </main>

      <footer className="py-3 px-3 px-md-4 small text-body-secondary">
        <div className="d-flex flex-column flex-sm-row justify-content-between gap-2">
          <span>{THEME_CONFIG.appName}</span>
          <span>{t("app.footerLabel")}</span>
        </div>
      </footer>
    </div>
  );
}
