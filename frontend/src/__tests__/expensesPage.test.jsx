import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmProvider } from "../contexts/ConfirmContext";
import { PreferencesProvider } from "../contexts/PreferencesContext";
import { ToastProvider } from "../contexts/ToastContext";
import ExpensesPage from "../pages/ExpensesPage";
import * as expensesService from "../services/expensesService";

const mockAuthState = {
  user: {
    id: 1,
    username: "manager",
    is_active: true,
    is_super_admin: false,
    permissions: ["expenses.view", "expenses.create", "expenses.edit", "expenses.delete"],
  },
  isAuthenticated: true,
  hasPermission: (code) => mockAuthState.user.permissions.includes(code),
};

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => mockAuthState,
}));

vi.mock("../services/authService", () => ({
  updateCurrentUserProfile: vi.fn().mockResolvedValue({}),
}));

vi.mock("../services/expensesService", () => ({
  fetchExpenseCategories: vi.fn(),
  createExpenseCategory: vi.fn(),
  updateExpenseCategory: vi.fn(),
  deleteExpenseCategory: vi.fn(),
  fetchExpenses: vi.fn(),
  createExpense: vi.fn(),
  updateExpense: vi.fn(),
  deleteExpense: vi.fn(),
  fetchCashFlowSummary: vi.fn(),
}));

function renderExpensesPage() {
  return render(
    <MemoryRouter>
      <PreferencesProvider>
        <ToastProvider>
          <ConfirmProvider>
            <ExpensesPage />
          </ConfirmProvider>
        </ToastProvider>
      </PreferencesProvider>
    </MemoryRouter>
  );
}

describe("ExpensesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockAuthState.user.permissions = [
      "expenses.view",
      "expenses.create",
      "expenses.edit",
      "expenses.delete",
    ];

    expensesService.fetchExpenseCategories.mockResolvedValue({
      count: 1,
      results: [
        {
          id: 1,
          name: "Utilities",
          name_km: "ទឹក និងភ្លើង",
          description: "Store utilities",
          is_active: true,
          expenses_count: 1,
          is_in_use: true,
        },
      ],
    });
    expensesService.fetchExpenses.mockResolvedValue({
      count: 1,
      results: [
        {
          id: 10,
          expense_number: "EXP-20261123-0001",
          category: 1,
          category_name: "Utilities",
          category_name_km: "ទឹក និងភ្លើង",
          title: "Electricity Bill",
          amount: "120.50",
          expense_date: "2026-11-23",
          payment_method: "bank_transfer",
          reference_code: "EDC-01",
          vendor_name: "EDC",
          notes: "November bill",
          created_by_username: "manager",
        },
      ],
    });
    expensesService.fetchCashFlowSummary.mockResolvedValue({
      filters: { date_from: null, date_to: null },
      cash_flow: {
        sales_inflow: "500.00",
        sales_count: 12,
        purchasing_outflow: "200.00",
        purchases_count: 2,
        expense_outflow: "120.50",
        expenses_count: 1,
        total_outflow: "320.50",
        net_cash_flow: "179.50",
      },
      by_category: [
        {
          category_id: 1,
          category_name: "Utilities",
          category_name_km: "ទឹក និងភ្លើង",
          count: 1,
          total_amount: "120.50",
        },
      ],
      by_payment_method: [{ payment_method: "bank_transfer", count: 1, total_amount: "120.50" }],
    });
  });

  it("renders expenses list, creates an expense, and confirms deletion", async () => {
    expensesService.createExpense.mockResolvedValue({ id: 11, expense_number: "EXP-20261123-0002" });
    expensesService.deleteExpense.mockResolvedValue(undefined);

    renderExpensesPage();

    await waitFor(() => {
      const table = within(screen.getByRole("table"));
      expect(table.getByText("EXP-20261123-0001")).toBeInTheDocument();
      expect(table.getByText("Electricity Bill")).toBeInTheDocument();
    });

    // Create new expense
    fireEvent.click(screen.getByRole("button", { name: /Record Expense/i }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByLabelText(/^Category/i), { target: { value: "1" } });
    fireEvent.change(dialog.getByLabelText(/Expense Title/i), { target: { value: "Water Bill" } });
    fireEvent.change(dialog.getByLabelText(/Amount/i), { target: { value: "35.25" } });
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(expensesService.createExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 1,
          title: "Water Bill",
          amount: "35.25",
        })
      );
    });

    // Trigger delete confirmation
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const confirmDialog = within(screen.getByRole("dialog"));
    expect(expensesService.deleteExpense).not.toHaveBeenCalled();
    fireEvent.click(confirmDialog.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(expensesService.deleteExpense).toHaveBeenCalledWith(10);
    });
  });

  it("switches to Cash Flow Summary and Expense Categories tabs", async () => {
    renderExpensesPage();

    await waitFor(() => expect(screen.getByText("Electricity Bill")).toBeInTheDocument());

    // Switch to Cash Flow Summary
    fireEvent.click(screen.getByRole("tab", { name: /Cash Flow Summary/i }));
    await waitFor(() => {
      expect(screen.getByText("$500.00")).toBeInTheDocument();
      expect(screen.getByText("$179.50")).toBeInTheDocument();
    });

    // Switch to Categories tab and verify in-use delete button is disabled
    fireEvent.click(screen.getByRole("tab", { name: /Expense Categories/i }));
    await waitFor(() => {
      const table = within(screen.getByRole("table"));
      expect(table.getByText("Utilities")).toBeInTheDocument();
      expect(table.getByRole("button", { name: "Delete" })).toBeDisabled();
    });
  });

  it("hides mutation controls for view-only users and renders Khmer localization", async () => {
    mockAuthState.user.permissions = ["expenses.view"];
    window.localStorage.setItem("pos_ui_language", "km");

    renderExpensesPage();

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "ចំណាយ និងលំហូរសាច់ប្រាក់" })
      ).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /កត់ត្រាចំណាយថ្មី/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "លុប" })).not.toBeInTheDocument();
  });
});
