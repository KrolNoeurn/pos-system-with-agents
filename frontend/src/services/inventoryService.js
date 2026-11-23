import apiClient from "./apiClient";

export async function fetchStockBalances(params = {}) {
  const response = await apiClient.get("/inventory/balances/", { params });
  return response.data;
}

export async function fetchLowStockAlerts(params = {}) {
  const response = await apiClient.get("/inventory/low-stock/", { params });
  return response.data;
}

export async function fetchStockMovements(params = {}) {
  const response = await apiClient.get("/inventory/movements/", { params });
  return response.data;
}

export async function fetchInventoryReport(params = {}) {
  const response = await apiClient.get("/inventory/report/", { params });
  return response.data;
}

export async function submitOpeningStock(payload) {
  const response = await apiClient.post("/inventory/opening-stock/", payload);
  return response.data;
}

export async function submitStockIn(payload) {
  const response = await apiClient.post("/inventory/stock-in/", payload);
  return response.data;
}

export async function submitStockOut(payload) {
  const response = await apiClient.post("/inventory/stock-out/", payload);
  return response.data;
}

export async function submitStockAdjustment(payload) {
  const response = await apiClient.post("/inventory/adjustments/", payload);
  return response.data;
}
