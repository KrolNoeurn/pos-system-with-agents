import apiClient from "./apiClient";

export async function fetchAuditLogs(params = {}) {
  const response = await apiClient.get("/audit-logs/", { params });
  return response.data;
}
