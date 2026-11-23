import apiClient from "./apiClient";

export async function fetchPOSCatalog(params = {}) {
  const response = await apiClient.get("/sales/catalog/", { params });
  return response.data;
}

export async function fetchCustomers(params = {}) {
  const response = await apiClient.get("/customers/", { params });
  return response.data;
}

export async function createCustomer(payload) {
  const response = await apiClient.post("/customers/", payload);
  return response.data;
}

export async function updateCustomer(customerId, payload) {
  const response = await apiClient.patch(`/customers/${customerId}/`, payload);
  return response.data;
}

export async function fetchSales(params = {}) {
  const response = await apiClient.get("/sales/", { params });
  return response.data;
}

export async function fetchSale(saleId) {
  const response = await apiClient.get(`/sales/${saleId}/`);
  return response.data;
}

export async function checkoutSale(payload, idempotencyKey) {
  const config = idempotencyKey
    ? { headers: { "X-Idempotency-Key": idempotencyKey } }
    : undefined;
  const response = await apiClient.post("/sales/", payload, config);
  return response.data;
}

export async function cancelSale(saleId, reason) {
  const response = await apiClient.post(`/sales/${saleId}/cancel/`, { reason });
  return response.data;
}

export async function refundSale(saleId, reason) {
  const response = await apiClient.post(`/sales/${saleId}/refund/`, { reason });
  return response.data;
}
