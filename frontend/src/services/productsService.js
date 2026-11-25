import apiClient from "./apiClient";

function buildRequestBody(payload) {
  const galleryFiles = Array.isArray(payload.images)
    ? payload.images.filter((item) => item instanceof File)
    : [];
  const hasFile = payload.image instanceof File || galleryFiles.length > 0;

  if (!hasFile) {
    const clean = { ...payload };
    delete clean.image;
    delete clean.images;
    return { data: clean, config: {} };
  }

  const formData = new FormData();
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    if (key === "images" && Array.isArray(value)) {
      value.forEach((file) => {
        if (file instanceof File) {
          formData.append("images", file);
        }
      });
    } else if (Array.isArray(value)) {
      value.forEach((item) => formData.append(key, String(item)));
    } else if (value === null) {
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

export async function uploadProductImages(productId, files) {
  const formData = new FormData();
  (files || []).forEach((file) => {
    if (file instanceof File) formData.append("images", file);
  });
  const response = await apiClient.post(`/products/${productId}/images/`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export async function deleteProductImage(productId, imageId) {
  const response = await apiClient.delete(`/products/${productId}/images/${imageId}/`);
  return response.data;
}

export async function setPrimaryProductImage(productId, imageId) {
  const response = await apiClient.post(`/products/${productId}/images/${imageId}/set-primary/`);
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
