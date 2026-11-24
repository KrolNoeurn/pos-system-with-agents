import { useState } from "react";

const SIZE_MAP = {
  sm: 24,
  md: 36,
  lg: 84,
};

function getInitials(user) {
  const label = (user?.full_name || user?.username || "?").trim();
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return label.slice(0, 2).toUpperCase();
}

export default function UserAvatar({ user, src, size = "md", className = "" }) {
  const [imgError, setImgError] = useState(false);
  const px = SIZE_MAP[size] || SIZE_MAP.md;
  const resolvedSrc = src !== undefined ? src : user?.avatar_url || user?.avatar || "";
  const showImage = Boolean(resolvedSrc) && !imgError;

  if (showImage) {
    return (
      <img
        src={resolvedSrc}
        alt={user?.full_name || user?.username || "Profile avatar"}
        width={px}
        height={px}
        onError={() => setImgError(true)}
        className={`rounded-circle border object-fit-cover flex-shrink-0 ${className}`.trim()}
        style={{ width: `${px}px`, height: `${px}px`, objectFit: "cover" }}
      />
    );
  }

  return (
    <span
      className={`rounded-circle d-inline-flex align-items-center justify-content-center fw-semibold flex-shrink-0 bg-primary-subtle text-primary border ${className}`.trim()}
      style={{
        width: `${px}px`,
        height: `${px}px`,
        fontSize: size === "lg" ? "1.5rem" : size === "sm" ? "0.68rem" : "0.85rem",
      }}
      aria-hidden="true"
    >
      {getInitials(user)}
    </span>
  );
}
