import apiClient from "./apiClient";

export async function fetchSuppliers(params = {}) {
  const response = await apiClient.get("/suppliers/", { params });
  return response.data;
}

function buildSupplierPayload(payload) {
  if (payload?.avatar instanceof File) {
    const formData = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (typeof value === "boolean") {
        formData.append(key, value ? "true" : "false");
      } else {
        formData.append(key, value);
      }
    });
    return {
      body: formData,
      config: { headers: { "Content-Type": "multipart/form-data" } },
    };
  }
  return { body: payload, config: undefined };
}

export async function createSupplier(payload) {
  const { body, config } = buildSupplierPayload(payload);
  const response = await apiClient.post("/suppliers/", body, config);
  return response.data;
}

export async function updateSupplier(supplierId, payload) {
  const { body, config } = buildSupplierPayload(payload);
  const response = await apiClient.patch(`/suppliers/${supplierId}/`, body, config);
  return response.data;
}

export async function activateSupplier(supplierId) {
  const response = await apiClient.post(`/suppliers/${supplierId}/activate/`);
  return response.data;
}

export async function deactivateSupplier(supplierId) {
  const response = await apiClient.post(`/suppliers/${supplierId}/deactivate/`);
  return response.data;
}

export async function importSuppliersCsv(fileOrText) {
  if (fileOrText instanceof File) {
    const formData = new FormData();
    formData.append("file", fileOrText);
    const response = await apiClient.post("/suppliers/import-csv/", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  }
  const response = await apiClient.post("/suppliers/import-csv/", { csv_text: fileOrText });
  return response.data;
}

export async function fetchPurchases(params = {}) {
  const response = await apiClient.get("/purchases/", { params });
  return response.data;
}

export async function fetchPurchase(purchaseId) {
  const response = await apiClient.get(`/purchases/${purchaseId}/`);
  return response.data;
}

export async function createPurchase(payload) {
  const response = await apiClient.post("/purchases/", payload);
  return response.data;
}

export async function updatePurchase(purchaseId, payload) {
  const response = await apiClient.patch(`/purchases/${purchaseId}/`, payload);
  return response.data;
}

export async function receivePurchase(purchaseId, payload = {}) {
  const response = await apiClient.post(`/purchases/${purchaseId}/receive/`, payload);
  return response.data;
}

export async function cancelPurchase(purchaseId, payload = {}) {
  const response = await apiClient.post(`/purchases/${purchaseId}/cancel/`, payload);
  return response.data;
}
