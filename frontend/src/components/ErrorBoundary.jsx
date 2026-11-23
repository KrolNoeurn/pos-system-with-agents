import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error?.message || "An unexpected application error occurred.",
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Unhandled UI error:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="container py-5">
          <div className="row justify-content-center">
            <div className="col-lg-6">
              <div className="card pos-surface shadow-sm border-danger">
                <div className="card-body p-4">
                  <div className="d-flex align-items-center gap-2 text-danger mb-3">
                    <i className="bi bi-exclamation-triangle-fill fs-4" aria-hidden="true" />
                    <h1 className="h5 mb-0">Application Error</h1>
                  </div>
                  <p className="text-body-secondary mb-3">
                    {this.state.errorMessage}
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={this.handleReload}
                  >
                    <i className="bi bi-arrow-clockwise me-2" aria-hidden="true" />
                    Reload Application
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
