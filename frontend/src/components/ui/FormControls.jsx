export function FormInput({
  id,
  label,
  error,
  helpText,
  required = false,
  className = "",
  ...inputProps
}) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="form-label fw-medium">
          {label}
          {required && <span className="text-danger ms-1">*</span>}
        </label>
      )}
      <input
        id={id}
        required={required}
        className={`form-control${error ? " is-invalid" : ""}`}
        aria-invalid={Boolean(error)}
        {...inputProps}
      />
      {error && <div className="invalid-feedback">{error}</div>}
      {!error && helpText && <div className="form-text">{helpText}</div>}
    </div>
  );
}

export function FormSelect({
  id,
  label,
  options = [],
  error,
  helpText,
  required = false,
  className = "",
  ...selectProps
}) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="form-label fw-medium">
          {label}
          {required && <span className="text-danger ms-1">*</span>}
        </label>
      )}
      <select
        id={id}
        required={required}
        className={`form-select${error ? " is-invalid" : ""}`}
        aria-invalid={Boolean(error)}
        {...selectProps}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <div className="invalid-feedback">{error}</div>}
      {!error && helpText && <div className="form-text">{helpText}</div>}
    </div>
  );
}

export function FormTextarea({
  id,
  label,
  error,
  helpText,
  required = false,
  className = "",
  rows = 3,
  ...textareaProps
}) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="form-label fw-medium">
          {label}
          {required && <span className="text-danger ms-1">*</span>}
        </label>
      )}
      <textarea
        id={id}
        rows={rows}
        required={required}
        className={`form-control${error ? " is-invalid" : ""}`}
        aria-invalid={Boolean(error)}
        {...textareaProps}
      />
      {error && <div className="invalid-feedback">{error}</div>}
      {!error && helpText && <div className="form-text">{helpText}</div>}
    </div>
  );
}

export function FormActions({
  submitting = false,
  submitLabel = "Save",
  submittingLabel = "Saving...",
  cancelLabel = "Cancel",
  onCancel,
}) {
  return (
    <div className="d-flex flex-wrap justify-content-end gap-2">
      {onCancel && (
        <button
          type="button"
          className="btn btn-outline-secondary"
          onClick={onCancel}
          disabled={submitting}
        >
          {cancelLabel}
        </button>
      )}
      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting ? (
          <>
            <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
            {submittingLabel}
          </>
        ) : (
          submitLabel
        )}
      </button>
    </div>
  );
}
