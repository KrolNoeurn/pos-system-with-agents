import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { usePreferences } from "../contexts/PreferencesContext";

export default function HeaderControls() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme, layout, toggleLayout, language, toggleLanguage, t } =
    usePreferences();
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      setMenuOpen(false);
      navigate("/login", { replace: true });
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="d-flex align-items-center gap-2 ms-auto">
      <button
        type="button"
        className="btn btn-sm btn-outline-secondary"
        onClick={toggleLanguage}
        aria-label="Toggle language"
        title={language === "en" ? "Switch to Khmer" : "Switch to English"}
      >
        <i className="bi bi-translate me-1" aria-hidden="true" />
        <span>{language === "en" ? "EN" : "ខ្មែរ"}</span>
      </button>

      <button
        type="button"
        className="btn btn-sm btn-outline-secondary"
        onClick={toggleLayout}
        aria-label={t("controls.switchLayout")}
        title={
          layout === "vertical"
            ? t("controls.layoutHorizontal")
            : t("controls.layoutVertical")
        }
      >
        <i
          className={`bi ${
            layout === "vertical" ? "bi-layout-three-columns" : "bi-layout-sidebar"
          }`}
          aria-hidden="true"
        />
        <span className="d-none d-xl-inline ms-1">
          {layout === "vertical"
            ? t("controls.layoutVertical")
            : t("controls.layoutHorizontal")}
        </span>
      </button>

      <button
        type="button"
        className="btn btn-sm btn-outline-secondary"
        onClick={toggleTheme}
        aria-label={t("controls.switchTheme")}
        title={theme === "light" ? t("controls.themeDark") : t("controls.themeLight")}
      >
        <i
          className={`bi ${theme === "light" ? "bi-moon-stars" : "bi-sun"}`}
          aria-hidden="true"
        />
      </button>

      {user && (
        <div className="position-relative" ref={dropdownRef}>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-2"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label="User menu"
          >
            <i className="bi bi-person-circle" aria-hidden="true" />
            <span className="d-none d-sm-inline text-truncate" style={{ maxWidth: "140px" }}>
              {user.full_name || user.username}
            </span>
            <i className="bi bi-chevron-down small" aria-hidden="true" />
          </button>

          {menuOpen && (
            <div
              className="dropdown-menu dropdown-menu-end show pos-nav-dropdown-menu position-absolute end-0 mt-2 py-2"
              role="menu"
            >
              <div className="px-3 py-2 border-bottom">
                <div className="fw-semibold small">{user.full_name || user.username}</div>
                <div className="text-body-secondary small">@{user.username}</div>
              </div>
              <Link
                className="dropdown-item py-2"
                to="/profile"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
              >
                <i className="bi bi-sliders me-2" aria-hidden="true" />
                {t("nav.profile")}
              </Link>
              <div className="dropdown-divider my-1" />
              <button
                type="button"
                className="dropdown-item py-2 text-danger"
                role="menuitem"
                onClick={handleLogout}
                disabled={loggingOut}
              >
                <i className="bi bi-box-arrow-right me-2" aria-hidden="true" />
                {loggingOut ? t("controls.signingOut") : t("controls.signOut")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
