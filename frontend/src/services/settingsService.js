import apiClient from "./apiClient";

export async function fetchStoreSettings() {
  const response = await apiClient.get("/settings/");
  return response.data;
}

export async function updateStoreSettings(payload) {
  const response = await apiClient.patch("/settings/", payload);
  return response.data;
}

export async function fetchReceiptProfile() {
  const response = await apiClient.get("/settings/receipt-profile/");
  return response.data;
}
