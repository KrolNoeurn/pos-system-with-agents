import { Link } from "react-router-dom";

export default function UnauthorizedPage() {
  return (
    <div className="row justify-content-center py-5">
      <div className="col-12 col-md-8 col-lg-6 text-center">
        <div className="display-5 fw-bold text-danger mb-2">403</div>
        <h1 className="h4 mb-2">Access Denied</h1>
        <p className="text-body-secondary mb-4">
          Your account does not have the required permissions to view this page or perform this action.
        </p>
        <Link to="/" className="btn btn-primary">
          <i className="bi bi-house-door me-2" aria-hidden="true" />
          Return to System Status
        </Link>
      </div>
    </div>
  );
}
