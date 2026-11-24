import apiClient from "./apiClient";

export async function fetchUsers(params = {}) {
  const response = await apiClient.get("/users/", { params });
  return response.data;
}

function buildUserPayload(payload) {
  if (payload?.avatar instanceof File) {
    const formData = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (Array.isArray(value)) {
        value.forEach((item) => formData.append(key, String(item)));
      } else {
        formData.append(key, value);
      }
    });
    return { body: formData, config: { headers: { "Content-Type": "multipart/form-data" } } };
  }
  return { body: payload, config: undefined };
}

export async function createUser(payload) {
  const { body, config } = buildUserPayload(payload);
  const response = await apiClient.post("/users/", body, config);
  return response.data;
}

export async function updateUser(userId, payload) {
  const { body, config } = buildUserPayload(payload);
  const response = await apiClient.patch(`/users/${userId}/`, body, config);
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
