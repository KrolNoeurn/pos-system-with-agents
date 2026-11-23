import apiClient from "./apiClient";

export async function fetchCategories(params = {}) {
  const response = await apiClient.get("/categories/", { params });
  return response.data;
}

export async function createCategory(payload) {
  const response = await apiClient.post("/categories/", payload);
  return response.data;
}

export async function updateCategory(categoryId, payload) {
  const response = await apiClient.patch(`/categories/${categoryId}/`, payload);
  return response.data;
}

export async function deleteCategory(categoryId) {
  await apiClient.delete(`/categories/${categoryId}/`);
}

export async function activateCategory(categoryId) {
  const response = await apiClient.post(`/categories/${categoryId}/activate/`);
  return response.data;
}

export async function deactivateCategory(categoryId) {
  const response = await apiClient.post(`/categories/${categoryId}/deactivate/`);
  return response.data;
}
