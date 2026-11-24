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

export async function importAndAdjustStockCsv({ file, csvText, partnerType = "", partnerName = "" }) {
  if (file instanceof File) {
    const formData = new FormData();
    formData.append("file", file);
    if (partnerType) formData.append("partner_type", partnerType);
    if (partnerName) formData.append("partner_name", partnerName);
    const response = await apiClient.post("/inventory/import-adjust/", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  }
  const response = await apiClient.post("/inventory/import-adjust/", {
    csv_text: csvText,
    partner_type: partnerType,
    partner_name: partnerName,
  });
  return response.data;
}
