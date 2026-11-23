import axios from "axios";
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "./tokenStorage";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000/api/v1";

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
).replace(/\/+$/, "");

let onSessionExpiredCallback = null;
let refreshPromise = null;

export function registerSessionExpiredHandler(handler) {
  onSessionExpiredCallback = handler;
}

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
      let detail = `Request failed with status ${status}.`;
      let fieldErrors = null;

      if (typeof data === "object" && data !== null) {
        if (typeof data.detail === "string") {
          detail = data.detail;
        } else if (typeof data.message === "string") {
          detail = data.message;
        } else {
          fieldErrors = data;
          const firstKey = Object.keys(data)[0];
          const firstVal = firstKey ? data[firstKey] : null;
          if (Array.isArray(firstVal) && firstVal.length > 0) {
            detail = `${firstKey}: ${firstVal[0]}`;
          } else if (typeof firstVal === "string") {
            detail = `${firstKey}: ${firstVal}`;
          }
        }
        if (data.errors) {
          fieldErrors = data.errors;
        }
      }

      return {
        status,
        message: detail,
        errors: fieldErrors,
        isNetworkError: false,
      };
    }

    if (error.request) {
      return {
        status: null,
        message:
          "Unable to reach the backend API. Verify that the Django server is running and CORS is configured.",
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

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token && !config.skipAuth) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

async function refreshAccessToken() {
  const refresh = getRefreshToken();
  if (!refresh) {
    throw new Error("No refresh token available.");
  }

  const response = await axios.post(
    `${API_BASE_URL}/auth/refresh/`,
    { refresh },
    {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      timeout: 10000,
    }
  );
  setTokens(response.data);
  return response.data.access;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config;
    const status = error?.response?.status;
    const isAuthEndpoint =
      originalRequest?.url?.includes("/auth/login/") ||
      originalRequest?.url?.includes("/auth/refresh/");

    if (
      status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.skipAuth &&
      !isAuthEndpoint &&
      getRefreshToken()
    ) {
      originalRequest._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = refreshAccessToken().finally(() => {
            refreshPromise = null;
          });
        }
        const newAccessToken = await refreshPromise;
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        clearTokens();
        if (onSessionExpiredCallback) {
          onSessionExpiredCallback();
        }
        return Promise.reject(normalizeApiError(refreshError));
      }
    }

    if (status === 401 && !isAuthEndpoint && !originalRequest?.skipAuth) {
      clearTokens();
      if (onSessionExpiredCallback) {
        onSessionExpiredCallback();
      }
    }

    return Promise.reject(normalizeApiError(error));
  }
);

export default apiClient;
