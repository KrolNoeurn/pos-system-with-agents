import apiClient from "./apiClient";

export async function fetchDashboardSummary() {
  const response = await apiClient.get("/reports/dashboard/");
  return response.data;
}

export async function fetchSalesReport(params = {}) {
  const response = await apiClient.get("/reports/sales/", { params });
  return response.data;
}

export async function fetchProfitLossReport(params = {}) {
  const response = await apiClient.get("/reports/profit-loss/", { params });
  return response.data;
}

export async function fetchPurchasingReport(params = {}) {
  const response = await apiClient.get("/reports/purchasing/", { params });
  return response.data;
}

export async function exportReportCsv(reportType, params = {}) {
  const response = await apiClient.get("/reports/export/", {
    params: { ...params, type: reportType },
    responseType: "blob",
  });

  const disposition = response.headers?.["content-disposition"] || "";
  const match = disposition.match(/filename="?([^"]+)"?/i);
  const filename = match ? match[1] : `pos_${reportType}_report.csv`;

  const blob = new Blob([response.data], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);

  return filename;
}
