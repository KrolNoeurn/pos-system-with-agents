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
  const navRef = useRef(null);

  const navItems = useMemo(
    () => filterNavigationByPermission(NAVIGATION_ITEMS, hasPermission),
    [hasPermission]
  );

  useEffect(() => {
    setMobileMenuOpen(false);
    setOpenDropdownId(null);
  }, [location.pathname]);

  useEffect(() => {
    if (!openDropdownId) return undefined;
    const handleOutsideClick = (event) => {
      if (navRef.current && !navRef.current.contains(event.target)) {
        setOpenDropdownId(null);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpenDropdownId(null);
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openDropdownId]);

  return (
    <div className="pos-horizontal-shell" data-layout="horizontal">
      <header className="pos-horizontal-header">
        <nav className="navbar navbar-expand-lg py-2" aria-label="Horizontal navigation" ref={navRef}>
          <div className="container-fluid px-3 px-md-4">
            <Link className="navbar-brand fw-semibold d-flex align-items-center gap-2 me-4" to="/">
              <i className="bi bi-shop text-primary fs-4" aria-hidden="true" />
              <span>{THEME_CONFIG.appName}</span>
            </Link>

            <div className="d-flex align-items-center gap-2 d-lg-none">
              <HeaderControls />
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                aria-label={t("controls.openMenu")}
                aria-expanded={mobileMenuOpen}
              >
                <i className="bi bi-list fs-5" aria-hidden="true" />
              </button>
            </div>

            <div className={`collapse navbar-collapse${mobileMenuOpen ? " show" : ""}`}>
              <ul className="navbar-nav me-auto gap-lg-1 mt-2 mt-lg-0">
                {navItems.map((item) => {
                  const label = t(item.labelKey);

                  if (item.children) {
                    const isOpen = openDropdownId === item.id;
                    const active = isItemActive(item, location.pathname);

                    return (
                      <li key={item.id} className="nav-item dropdown position-relative">
                        <button
                          type="button"
                          className={`nav-link dropdown-toggle border-0 bg-transparent d-flex align-items-center gap-1${
                            active ? " active fw-semibold text-primary" : ""
                          }`}
                          onClick={() =>
                            setOpenDropdownId((prev) => (prev === item.id ? null : item.id))
                          }
                          aria-expanded={isOpen}
                        >
                          <i className={`bi ${item.icon}`} aria-hidden="true" />
                          <span>{label}</span>
                        </button>

                        {isOpen && (
                          <ul className="dropdown-menu show pos-nav-dropdown-menu py-1">
                            {item.children.map((child) => (
                              <li key={child.id}>
                                <NavLink
                                  to={child.to}
                                  className={({ isActive }) =>
                                    `dropdown-item py-2 d-flex align-items-center gap-2${
                                      isActive ? " active" : ""
                                    }`
                                  }
                                  onClick={() => setOpenDropdownId(null)}
                                >
                                  <i className={`bi ${child.icon}`} aria-hidden="true" />
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
                    <li key={item.id} className="nav-item">
                      <NavLink
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) =>
                          `nav-link d-flex align-items-center gap-1${
                            isActive ? " active fw-semibold text-primary" : ""
                          }`
                        }
                      >
                        <i className={`bi ${item.icon}`} aria-hidden="true" />
                        <span>{label}</span>
                      </NavLink>
                    </li>
                  );
                })}
              </ul>

              <div className="d-none d-lg-flex align-items-center">
                <HeaderControls />
              </div>
            </div>
          </div>
        </nav>

        <div className="pos-horizontal-subbar py-2 px-3 px-md-4">
          <Breadcrumbs />
        </div>
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
  );
}
