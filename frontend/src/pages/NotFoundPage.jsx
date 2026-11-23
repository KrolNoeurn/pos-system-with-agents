import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="row justify-content-center py-5">
      <div className="col-12 col-md-8 col-lg-6 text-center">
        <div className="display-5 fw-bold text-body-secondary mb-2">404</div>
        <h1 className="h4 mb-2">Page Not Found</h1>
        <p className="text-body-secondary mb-4">
          The page you requested does not exist in this workspace shell.
        </p>
        <Link to="/" className="btn btn-primary">
          <i className="bi bi-house-door me-2" aria-hidden="true" />
          Return to System Status
        </Link>
      </div>
    </div>
  );
}
