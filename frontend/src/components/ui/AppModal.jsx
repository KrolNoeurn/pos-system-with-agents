import { useEffect } from "react";

export default function AppModal({
  isOpen,
  title,
  size = "md",
  onClose,
  disableClose = false,
  footer = null,
  children,
}) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !disableClose && onClose) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, disableClose, onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = (event) => {
    if (event.target === event.currentTarget && !disableClose && onClose) {
      onClose();
    }
  };

  return (
    <div
      className="pos-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pos-modal-title"
      onClick={handleBackdropClick}
    >
      <div className={`pos-modal-dialog size-${size}`}>
        <div className="d-flex justify-content-between align-items-center px-4 py-3 border-bottom">
          <h2 id="pos-modal-title" className="h5 mb-0">
            {title}
          </h2>
          {onClose && (
            <button
              type="button"
              className="btn-close"
              aria-label="Close dialog"
              onClick={onClose}
              disabled={disableClose}
            />
          )}
        </div>
        <div className="p-4 overflow-auto">{children}</div>
        {footer && <div className="px-4 py-3 border-top">{footer}</div>}
      </div>
    </div>
  );
}
