/**
 * Extract a user-friendly error message from an Axios/DRF error response.
 */
export function extractApiError(error, fallback = "An unexpected error occurred.") {
  const data = error?.response?.data;
  if (!data) {
    return error?.message || fallback;
  }
  if (typeof data === "string") {
    return data;
  }
  if (typeof data.detail === "string" && data.detail.trim()) {
    return data.detail;
  }
  for (const [, value] of Object.entries(data)) {
    if (Array.isArray(value) && value.length > 0) {
      return String(value[0]);
    }
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return fallback;
}
