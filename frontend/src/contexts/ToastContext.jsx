import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

const ToastContext = createContext(null);

const VARIANT_META = {
  success: { icon: "bi-check-circle-fill", accent: "text-success" },
  danger: { icon: "bi-exclamation-octagon-fill", accent: "text-danger" },
  warning: { icon: "bi-exclamation-triangle-fill", accent: "text-warning" },
  info: { icon: "bi-info-circle-fill", accent: "text-primary" },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idCounterRef = useRef(1);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ variant = "info", title = "", message, duration = 4500 }) => {
      const id = idCounterRef.current++;
      setToasts((prev) => [...prev, { id, variant, title, message }]);
      if (duration > 0) {
        window.setTimeout(() => dismissToast(id), duration);
      }
      return id;
    },
    [dismissToast]
  );

  const api = useMemo(
    () => ({
      showToast,
      dismissToast,
      success: (message, title = "Success") => showToast({ variant: "success", title, message }),
      error: (message, title = "Error") => showToast({ variant: "danger", title, message }),
      warning: (message, title = "Warning") => showToast({ variant: "warning", title, message }),
      info: (message, title = "Info") => showToast({ variant: "info", title, message }),
    }),
    [showToast, dismissToast]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pos-toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => {
          const meta = VARIANT_META[toast.variant] || VARIANT_META.info;
          return (
            <div key={toast.id} className="pos-toast-item p-3" role="status">
              <div className="d-flex align-items-start gap-2">
                <i className={`bi ${meta.icon} ${meta.accent} mt-1`} aria-hidden="true" />
                <div className="flex-grow-1 small">
                  {toast.title && <div className="fw-semibold mb-1">{toast.title}</div>}
                  <div className="text-body-secondary">{toast.message}</div>
                </div>
                <button
                  type="button"
                  className="btn-close btn-sm"
                  aria-label="Close notification"
                  onClick={() => dismissToast(toast.id)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside ToastProvider.");
  }
  return ctx;
}
