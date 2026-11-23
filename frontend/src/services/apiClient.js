import axios from "axios";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000/api/v1";

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
).replace(/\/+$/, "");

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

export function normalizeApiError(error) {
  if (axios.isAxiosError(error)) {
    if (error.response) {
      const { status, data } = error.response;
      const detail =
        (typeof data === "object" && data !== null && (data.detail || data.message)) ||
        `Request failed with status ${status}.`;
      return {
        status,
        message: detail,
        errors: typeof data === "object" && data !== null ? data.errors || null : null,
        isNetworkError: false,
      };
    }

    if (error.request) {
      return {
        status: null,
        message: "Unable to reach the backend API. Verify that the Django server is running and CORS is configured.",
        errors: null,
        isNetworkError: true,
      };
    }
  }

  return {
    status: null,
    message: error?.message || "An unexpected client error occurred.",
    errors: null,
    isNetworkError: false,
  };
}

apiClient.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(normalizeApiError(error))
);

export default apiClient;
