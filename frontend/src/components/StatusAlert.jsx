import { useEffect, useRef, useState } from "react";

export default function StatusAlert({
  variant = "danger",
  title,
  message,
  onRetry,
  retryLabel = "Retry",
  autoHideMs = 0,
  dismissible = false,
  onClose,
  className = "",
}) {
  const [visible, setVisible] = useState(Boolean(message));
  const timerRef = useRef({ timeoutId: null, remainingMs: autoHideMs, startedAt: null });
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const clearTimer = () => {
    if (timerRef.current.timeoutId) {
      window.clearTimeout(timerRef.current.timeoutId);
      timerRef.current.timeoutId = null;
    }
  };

  const handleClose = () => {
    clearTimer();
    setVisible(false);
    onCloseRef.current?.();
  };

  const startTimer = (ms) => {
    clearTimer();
    if (!ms || ms <= 0) return;
    timerRef.current.remainingMs = ms;
    timerRef.current.startedAt = Date.now();
    timerRef.current.timeoutId = window.setTimeout(() => {
      timerRef.current.timeoutId = null;
      setVisible(false);
      onCloseRef.current?.();
    }, ms);
  };

  useEffect(() => {
    if (!message) {
      clearTimer();
      setVisible(false);
      return undefined;
    }
    setVisible(true);
    if (autoHideMs > 0) {
      startTimer(autoHideMs);
    }
    return () => clearTimer();
  }, [message, autoHideMs]);

  const handleMouseEnter = () => {
    if (!timerRef.current.timeoutId) return;
    window.clearTimeout(timerRef.current.timeoutId);
    timerRef.current.timeoutId = null;
    const elapsed = Date.now() - (timerRef.current.startedAt || Date.now());
    timerRef.current.remainingMs = Math.max(250, timerRef.current.remainingMs - elapsed);
  };

  const handleMouseLeave = () => {
    if (autoHideMs > 0 && visible && !timerRef.current.timeoutId) {
      startTimer(timerRef.current.remainingMs);
    }
  };

  if (!message || !visible) {
    return null;
  }

  const iconByVariant = {
    danger: "bi-exclamation-octagon-fill",
    warning: "bi-exclamation-triangle-fill",
    success: "bi-check-circle-fill",
    info: "bi-info-circle-fill",
  };

  return (
    <div
      className={`alert alert-${variant} d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-2 mb-0 ${className}`.trim()}
      role="alert"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="d-flex align-items-start gap-2">
        <i
          className={`bi ${iconByVariant[variant] || iconByVariant.info} mt-1`}
          aria-hidden="true"
        />
        <div>
          {title && <div className="fw-semibold">{title}</div>}
          <div>{message}</div>
        </div>
      </div>
      {(onRetry || dismissible || onClose) && (
        <div className="d-flex align-items-center gap-2 flex-shrink-0">
          {onRetry && (
            <button
              type="button"
              className={`btn btn-sm btn-outline-${variant}`}
              onClick={onRetry}
            >
              <i className="bi bi-arrow-clockwise me-1" aria-hidden="true" />
              {retryLabel}
            </button>
          )}
          {(dismissible || onClose) && (
            <button
              type="button"
              className="btn-close btn-sm"
              aria-label="Dismiss alert"
              onClick={handleClose}
            />
          )}
        </div>
      )}
    </div>
  );
}
