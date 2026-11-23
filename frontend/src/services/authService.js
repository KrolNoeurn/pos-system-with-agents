import apiClient from "./apiClient";
import { clearTokens, getRefreshToken, setTokens } from "./tokenStorage";

export async function login(credentials) {
  const response = await apiClient.post("/auth/login/", credentials, {
    skipAuth: true,
  });
  setTokens({
    access: response.data.access,
    refresh: response.data.refresh,
  });
  return response.data;
}

export async function logout() {
  const refresh = getRefreshToken();
  try {
    await apiClient.post("/auth/logout/", { refresh: refresh || "" });
  } finally {
    clearTokens();
  }
}

export async function fetchCurrentUser() {
  const response = await apiClient.get("/auth/me/");
  return response.data;
}

export async function updateCurrentUserProfile(payload) {
  const response = await apiClient.patch("/auth/me/", payload);
  return response.data;
}

export async function changePassword(payload) {
  const response = await apiClient.post("/auth/change-password/", payload);
  return response.data;
}
