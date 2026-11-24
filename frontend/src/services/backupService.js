import apiClient from "./apiClient";

export async function fetchBackupSettings() {
  const response = await apiClient.get("/settings/backups/");
  return response.data;
}

export async function updateBackupSettings(payload) {
  const response = await apiClient.patch("/settings/backups/", payload);
  return response.data;
}

export async function testTelegramBackup(payload = {}) {
  const response = await apiClient.post("/settings/backups/test-telegram/", payload);
  return response.data;
}

export async function runBackupNow(payload = {}) {
  const response = await apiClient.post("/settings/backups/run/", payload);
  return response.data;
}

export async function fetchBackupRuns(params = {}) {
  const response = await apiClient.get("/settings/backups/runs/", { params });
  return response.data;
}

export async function downloadBackupRun(runId, fallbackFileName = "pos_backup.zip") {
  const response = await apiClient.get(`/settings/backups/runs/${runId}/download/`, {
    responseType: "blob",
  });
  const blob = new Blob([response.data], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", fallbackFileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
