import apiClient from "./apiClient";

export async function fetchBackendHealth(signal) {
  const response = await apiClient.get("/health/", { signal });
  return response.data;
}
