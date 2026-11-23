import { Link, NavLink, Outlet } from "react-router-dom";

const APP_NAME = import.meta.env.VITE_APP_NAME || "POS System";

export default function MainLayout() {
  return (
    <div className="pos-app-shell">
      <header className="pos-navbar sticky-top">
        <nav className="navbar navbar-expand-md" aria-label="Primary navigation">
          <div className="container">
            <Link className="navbar-brand fw-semibold d-flex align-items-center gap-2" to="/">
              <i className="bi bi-shop text-primary" aria-hidden="true" />
              <span>{APP_NAME}</span>
            </Link>

            <button
              className="navbar-toggler"
              type="button"
              data-bs-toggle="collapse"
              data-bs-target="#posMainNav"
              aria-controls="posMainNav"
              aria-expanded="false"
              aria-label="Toggle navigation"
            >
              <span className="navbar-toggler-icon" />
            </button>

            <div className="collapse navbar-collapse" id="posMainNav">
              <ul className="navbar-nav ms-auto align-items-md-center gap-md-2">
                <li className="nav-item">
                  <NavLink
                    to="/"
                    end
                    className={({ isActive }) =>
                      `nav-link${isActive ? " active fw-medium" : ""}`
                    }
                  >
                    <i className="bi bi-activity me-1" aria-hidden="true" />
                    System Status
                  </NavLink>
                </li>
              </ul>
            </div>
          </div>
        </nav>
      </header>

      <main className="flex-grow-1 py-4 py-md-5">
        <div className="container">
          <Outlet />
        </div>
      </main>

      <footer className="border-top py-3 mt-auto bg-body-tertiary">
        <div className="container d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2 small text-body-secondary">
          <span>{APP_NAME} — Application Foundation</span>
          <span>React + Vite + Bootstrap 5 · Django + DRF</span>
        </div>
      </footer>
    </div>
  );
}
