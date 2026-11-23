import apiClient from "./apiClient";

export async function fetchUsers(params = {}) {
  const response = await apiClient.get("/users/", { params });
  return response.data;
}

export async function createUser(payload) {
  const response = await apiClient.post("/users/", payload);
  return response.data;
}

export async function updateUser(userId, payload) {
  const response = await apiClient.patch(`/users/${userId}/`, payload);
  return response.data;
}

export async function deleteUser(userId) {
  await apiClient.delete(`/users/${userId}/`);
}

export async function activateUser(userId) {
  const response = await apiClient.post(`/users/${userId}/activate/`);
  return response.data;
}

export async function deactivateUser(userId) {
  const response = await apiClient.post(`/users/${userId}/deactivate/`);
  return response.data;
}

export async function assignUserRoles(userId, roleIds) {
  const response = await apiClient.put(`/users/${userId}/roles/`, {
    role_ids: roleIds,
  });
  return response.data;
}
