import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const ToastContext = createContext(null);

const VARIANT_META = {
  success: { icon: "bi-check-circle-fill", accent: "text-success", defaultDuration: 4000 },
  danger: { icon: "bi-exclamation-octagon-fill", accent: "text-danger", defaultDuration: 6000 },
  warning: { icon: "bi-exclamation-triangle-fill", accent: "text-warning", defaultDuration: 5000 },
  info: { icon: "bi-info-circle-fill", accent: "text-primary", defaultDuration: 4500 },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idCounterRef = useRef(1);
  const timersRef = useRef(new Map());

  const clearTimer = useCallback((id) => {
    const entry = timersRef.current.get(id);
    if (entry?.timeoutId) {
      window.clearTimeout(entry.timeoutId);
    }
    timersRef.current.delete(id);
  }, []);

  const dismissToast = useCallback(
    (id) => {
      clearTimer(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    },
    [clearTimer]
  );

  const startTimer = useCallback(
    (id, durationMs) => {
      if (!durationMs || durationMs <= 0) return;
      clearTimer(id);
      const startedAt = Date.now();
      const timeoutId = window.setTimeout(() => {
        timersRef.current.delete(id);
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, durationMs);
      timersRef.current.set(id, { timeoutId, remainingMs: durationMs, startedAt });
    },
    [clearTimer]
  );

  const pauseToast = useCallback((id) => {
    const entry = timersRef.current.get(id);
    if (!entry || !entry.timeoutId) return;
    window.clearTimeout(entry.timeoutId);
    const elapsed = Date.now() - entry.startedAt;
    const remainingMs = Math.max(250, entry.remainingMs - elapsed);
    timersRef.current.set(id, { timeoutId: null, remainingMs, startedAt: null });
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, paused: true } : t)));
  }, []);

  const resumeToast = useCallback(
    (id) => {
      const entry = timersRef.current.get(id);
      if (!entry || entry.timeoutId) return;
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, paused: false } : t)));
      startTimer(id, entry.remainingMs);
    },
    [startTimer]
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((entry) => {
        if (entry?.timeoutId) {
          window.clearTimeout(entry.timeoutId);
        }
      });
      timers.clear();
    };
  }, []);

  const showToast = useCallback(
    ({ variant = "info", title = "", message, duration }) => {
      const meta = VARIANT_META[variant] || VARIANT_META.info;
      const resolvedDuration = duration === undefined ? meta.defaultDuration : duration;
      const id = idCounterRef.current++;
      setToasts((prev) => [
        ...prev,
        { id, variant, title, message, duration: resolvedDuration, paused: false },
      ]);
      if (resolvedDuration > 0) {
        startTimer(id, resolvedDuration);
      }
      return id;
    },
    [startTimer]
  );

  const api = useMemo(
    () => ({
      showToast,
      dismissToast,
      success: (message, title = "Success", duration) =>
        showToast({ variant: "success", title, message, duration }),
      error: (message, title = "Error", duration) =>
        showToast({ variant: "danger", title, message, duration }),
      warning: (message, title = "Warning", duration) =>
        showToast({ variant: "warning", title, message, duration }),
      info: (message, title = "Info", duration) =>
        showToast({ variant: "info", title, message, duration }),
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
            <div
              key={toast.id}
              className="pos-toast-item p-3 position-relative overflow-hidden"
              role="status"
              onMouseEnter={() => pauseToast(toast.id)}
              onMouseLeave={() => resumeToast(toast.id)}
              onFocus={() => pauseToast(toast.id)}
              onBlur={() => resumeToast(toast.id)}
            >
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
              {toast.duration > 0 && (
                <span
                  className={`pos-toast-progress bg-${toast.variant === "danger" ? "danger" : toast.variant === "warning" ? "warning" : toast.variant === "success" ? "success" : "primary"}`}
                  style={{
                    animationDuration: `${toast.duration}ms`,
                    animationPlayState: toast.paused ? "paused" : "running",
                  }}
                  aria-hidden="true"
                />
              )}
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
