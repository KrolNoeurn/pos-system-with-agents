import apiClient from "./apiClient";

function buildRequestBody(payload) {
  const hasFile = payload.image instanceof File;
  if (!hasFile) {
    const clean = { ...payload };
    delete clean.image;
    return { data: clean, config: {} };
  }

  const formData = new FormData();
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    if (value === null) {
      formData.append(key, "");
    } else if (value instanceof File) {
      formData.append(key, value);
    } else {
      formData.append(key, String(value));
    }
  }
  return {
    data: formData,
    config: {
      headers: { "Content-Type": "multipart/form-data" },
    },
  };
}

export async function fetchProducts(params = {}) {
  const response = await apiClient.get("/products/", { params });
  return response.data;
}

export async function fetchProduct(productId) {
  const response = await apiClient.get(`/products/${productId}/`);
  return response.data;
}

export async function createProduct(payload) {
  const { data, config } = buildRequestBody(payload);
  const response = await apiClient.post("/products/", data, config);
  return response.data;
}

export async function updateProduct(productId, payload) {
  const { data, config } = buildRequestBody(payload);
  const response = await apiClient.patch(`/products/${productId}/`, data, config);
  return response.data;
}

export async function deleteProduct(productId) {
  await apiClient.delete(`/products/${productId}/`);
}

export async function activateProduct(productId) {
  const response = await apiClient.post(`/products/${productId}/activate/`);
  return response.data;
}

export async function deactivateProduct(productId) {
  const response = await apiClient.post(`/products/${productId}/deactivate/`);
  return response.data;
}
