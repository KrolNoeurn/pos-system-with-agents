import { createContext, useCallback, useContext, useRef, useState } from "react";
import AppModal from "../components/ui/AppModal";

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useCallback(
    ({
      title = "Confirm Action",
      message = "Are you sure you want to proceed?",
      confirmLabel = "Confirm",
      cancelLabel = "Cancel",
      variant = "danger",
    }) =>
      new Promise((resolve) => {
        resolverRef.current = resolve;
        setDialog({ title, message, confirmLabel, cancelLabel, variant });
      }),
    []
  );

  const handleClose = useCallback((result) => {
    setDialog(null);
    if (resolverRef.current) {
      resolverRef.current(result);
      resolverRef.current = null;
    }
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AppModal
        isOpen={Boolean(dialog)}
        title={dialog?.title || ""}
        size="sm"
        onClose={() => handleClose(false)}
        footer={
          <div className="d-flex justify-content-end gap-2">
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => handleClose(false)}
            >
              {dialog?.cancelLabel || "Cancel"}
            </button>
            <button
              type="button"
              className={`btn btn-${dialog?.variant || "danger"}`}
              onClick={() => handleClose(true)}
            >
              {dialog?.confirmLabel || "Confirm"}
            </button>
          </div>
        }
      >
        <p className="mb-0 text-body-secondary">{dialog?.message}</p>
      </AppModal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used inside ConfirmProvider.");
  }
  return ctx;
}
