import { useEffect, useState } from "react";
import CustomerAvatar from "./CustomerAvatar";

const MAX_CUSTOMER_AVATAR_BYTES = 5 * 1024 * 1024;

export default function CustomerAvatarField({
  inputId = "customerAvatarInput",
  customer,
  name = "",
  file = null,
  removeAvatar = false,
  disabled = false,
  onFileSelect,
  onRemove,
  onValidationError,
  t,
}) {
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    if (!(file instanceof File)) {
      setPreviewUrl("");
      return undefined;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  const displaySrc = removeAvatar
    ? ""
    : previewUrl || customer?.avatar_url || customer?.avatar || "";
  const hasCustomImage = Boolean(displaySrc);

  const handleFileChange = (event) => {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;
    if (!picked.type.startsWith("image/")) {
      onValidationError?.(t("profile.avatarInvalidType"));
      return;
    }
    if (picked.size > MAX_CUSTOMER_AVATAR_BYTES) {
      onValidationError?.(t("profile.avatarTooLarge"));
      return;
    }
    onFileSelect?.(picked);
  };

  return (
    <div className="d-flex flex-wrap align-items-center gap-3 p-3 rounded border bg-body-tertiary">
      <CustomerAvatar customer={customer} name={name} src={displaySrc} size="lg" />
      <div className="d-flex flex-column gap-2 flex-grow-1 min-w-0">
        <div>
          <div className="fw-semibold d-flex align-items-center gap-2 flex-wrap">
            <span>{t("sales.customerProfilePhotoTitle")}</span>
            {!hasCustomImage && (
              <span className="badge text-bg-secondary">{t("sales.defaultAvatarBadge")}</span>
            )}
          </div>
          <div className="small text-body-secondary">{t("sales.customerProfilePhotoHint")}</div>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <label
            htmlFor={inputId}
            className={`btn btn-sm btn-outline-primary mb-0${disabled ? " disabled" : ""}`}
          >
            <i className="bi bi-camera me-1" aria-hidden="true" />
            {t("profile.uploadPhoto")}
          </label>
          <input
            id={inputId}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="d-none"
            onChange={handleFileChange}
            disabled={disabled}
            aria-label={t("profile.uploadPhoto")}
          />
          {hasCustomImage && (
            <button
              type="button"
              className="btn btn-sm btn-outline-danger"
              onClick={() => onRemove?.()}
              disabled={disabled}
            >
              <i className="bi bi-arrow-counterclockwise me-1" aria-hidden="true" />
              {t("sales.useDefaultAvatar")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
