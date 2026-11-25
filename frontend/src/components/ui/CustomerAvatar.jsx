import { useEffect, useState } from "react";

const SIZE_MAP = {
  sm: 28,
  md: 38,
  lg: 84,
};

const FONT_SIZE_MAP = {
  sm: "0.72rem",
  md: "0.85rem",
  lg: "1.65rem",
};

const AVATAR_TONES = [
  "bg-primary-subtle text-primary",
  "bg-success-subtle text-success",
  "bg-info-subtle text-info",
  "bg-warning-subtle text-warning",
  "bg-secondary-subtle text-secondary",
];

function getCustomerInitials(name) {
  const clean = (name || "").trim();
  if (!clean) return "";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${Array.from(parts[0])[0] || ""}${Array.from(parts[1])[0] || ""}`.toUpperCase();
  }
  return Array.from(clean).slice(0, 2).join("").toUpperCase();
}

function getToneClass(name) {
  const clean = (name || "").trim();
  if (!clean) return AVATAR_TONES[0];
  let hash = 0;
  for (let i = 0; i < clean.length; i += 1) {
    hash = (hash * 31 + clean.charCodeAt(i)) % AVATAR_TONES.length;
  }
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}

export default function CustomerAvatar({ customer, name, src, size = "md", className = "" }) {
  const [imgError, setImgError] = useState(false);
  const px = SIZE_MAP[size] || SIZE_MAP.md;
  const resolvedName = (name ?? customer?.name ?? "").trim();
  const resolvedSrc = src !== undefined ? src : customer?.avatar_url || customer?.avatar || "";

  useEffect(() => {
    setImgError(false);
  }, [resolvedSrc]);

  const showImage = Boolean(resolvedSrc) && !imgError;

  if (showImage) {
    return (
      <img
        src={resolvedSrc}
        alt={resolvedName || "Customer avatar"}
        width={px}
        height={px}
        onError={() => setImgError(true)}
        className={`rounded-circle border object-fit-cover flex-shrink-0 ${className}`.trim()}
        style={{ width: `${px}px`, height: `${px}px`, objectFit: "cover" }}
      />
    );
  }

  const initials = getCustomerInitials(resolvedName);
  const toneClass = getToneClass(resolvedName);

  return (
    <span
      role="img"
      aria-label={resolvedName ? `${resolvedName} avatar` : "Default customer avatar"}
      className={`rounded-circle d-inline-flex align-items-center justify-content-center fw-semibold flex-shrink-0 border ${toneClass} ${className}`.trim()}
      style={{
        width: `${px}px`,
        height: `${px}px`,
        fontSize: FONT_SIZE_MAP[size] || FONT_SIZE_MAP.md,
      }}
    >
      {initials || <i className="bi bi-person" aria-hidden="true" />}
    </span>
  );
}
