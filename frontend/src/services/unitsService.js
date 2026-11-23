import apiClient from "./apiClient";

export async function fetchUnits(params = {}) {
  const response = await apiClient.get("/units/", { params });
  return response.data;
}

export async function createUnit(payload) {
  const response = await apiClient.post("/units/", payload);
  return response.data;
}

export async function updateUnit(unitId, payload) {
  const response = await apiClient.patch(`/units/${unitId}/`, payload);
  return response.data;
}

export async function deleteUnit(unitId) {
  await apiClient.delete(`/units/${unitId}/`);
}

export async function activateUnit(unitId) {
  const response = await apiClient.post(`/units/${unitId}/activate/`);
  return response.data;
}

export async function deactivateUnit(unitId) {
  const response = await apiClient.post(`/units/${unitId}/deactivate/`);
  return response.data;
}
