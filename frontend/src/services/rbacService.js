import apiClient from "./apiClient";

export async function fetchRoles(params = {}) {
  const response = await apiClient.get("/roles/", { params });
  return response.data;
}

export async function createRole(payload) {
  const response = await apiClient.post("/roles/", payload);
  return response.data;
}

export async function updateRole(roleId, payload) {
  const response = await apiClient.patch(`/roles/${roleId}/`, payload);
  return response.data;
}

export async function deleteRole(roleId) {
  await apiClient.delete(`/roles/${roleId}/`);
}

export async function assignRolePermissions(roleId, permissionIds) {
  const response = await apiClient.put(`/roles/${roleId}/permissions/`, {
    permission_ids: permissionIds,
  });
  return response.data;
}

export async function fetchPermissions(params = {}) {
  const response = await apiClient.get("/permissions/", { params });
  return response.data;
}
