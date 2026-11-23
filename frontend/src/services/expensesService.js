import apiClient from "./apiClient";

export async function fetchExpenseCategories(params = {}) {
  const response = await apiClient.get("/expense-categories/", { params });
  return response.data;
}

export async function createExpenseCategory(payload) {
  const response = await apiClient.post("/expense-categories/", payload);
  return response.data;
}

export async function updateExpenseCategory(categoryId, payload) {
  const response = await apiClient.patch(`/expense-categories/${categoryId}/`, payload);
  return response.data;
}

export async function deleteExpenseCategory(categoryId) {
  await apiClient.delete(`/expense-categories/${categoryId}/`);
}

export async function fetchExpenses(params = {}) {
  const response = await apiClient.get("/expenses/", { params });
  return response.data;
}

export async function createExpense(payload) {
  const response = await apiClient.post("/expenses/", payload);
  return response.data;
}

export async function updateExpense(expenseId, payload) {
  const response = await apiClient.patch(`/expenses/${expenseId}/`, payload);
  return response.data;
}

export async function deleteExpense(expenseId) {
  await apiClient.delete(`/expenses/${expenseId}/`);
}

export async function fetchCashFlowSummary(params = {}) {
  const response = await apiClient.get("/expenses/summary/", { params });
  return response.data;
}
