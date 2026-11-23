import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmProvider } from "../contexts/ConfirmContext";
import { PreferencesProvider } from "../contexts/PreferencesContext";
import { ToastProvider } from "../contexts/ToastContext";
import HomePage from "../pages/HomePage";
import ReportsPage from "../pages/ReportsPage";
import * as healthService from "../services/healthService";
import * as inventoryService from "../services/inventoryService";
import * as reportsService from "../services/reportsService";

const mockAuthState = {
  user: {
    id: 1,
    username: "manager",
    full_name: "Store Manager",
    is_active: true,
    is_super_admin: false,
    roles: [{ id: 2, name: "Store Manager" }],
    permissions: [
      "dashboard.view",
      "reports.view",
      "reports.export",
      "sales.create",
      "sales.view",
      "inventory.view",
    ],
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

vi.mock("../services/healthService", () => ({
  fetchBackendHealth: vi.fn(),
}));

vi.mock("../services/inventoryService", () => ({
  fetchInventoryReport: vi.fn(),
}));

vi.mock("../services/reportsService", () => ({
  fetchDashboardSummary: vi.fn(),
  fetchSalesReport: vi.fn(),
  fetchProfitLossReport: vi.fn(),
  fetchPurchasingReport: vi.fn(),
  exportReportCsv: vi.fn(),
}));

function renderWithProviders(ui) {
  return render(
    <MemoryRouter>
      <PreferencesProvider>
        <ToastProvider>
          <ConfirmProvider>{ui}</ConfirmProvider>
        </ToastProvider>
      </PreferencesProvider>
    </MemoryRouter>
  );
}

describe("Dashboard KPIs & ReportsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockAuthState.user.permissions = [
      "dashboard.view",
      "reports.view",
      "reports.export",
      "sales.create",
      "sales.view",
      "inventory.view",
    ];

    healthService.fetchBackendHealth.mockResolvedValue({
      status: "ok",
      service: "pos-backend",
      api_version: "v1",
      database: "connected",
      timestamp: "2026-11-23T16:30:00Z",
    });

    reportsService.fetchDashboardSummary.mockResolvedValue({
      as_of_date: "2026-11-23",
      kpis: {
        today_sales_total: "245.50",
        today_sales_count: 8,
        today_avg_ticket: "30.69",
        mtd_sales_total: "1250.00",
        mtd_sales_count: 42,
        mtd_expenses_total: "180.00",
        tracked_products_count: 20,
        low_stock_count: 2,
        out_of_stock_count: 1,
        pending_purchases_count: 3,
      },
      recent_sales: [
        {
          id: 1,
          sale_number: "INV-20261123-0008",
          customer_name_snapshot: "Walk-in Customer",
          total_amount: "35.00",
          payment_method: "cash",
          status: "completed",
          cashier_username: "cashier1",
        },
      ],
      low_stock_items: [
        {
          product_id: 5,
          sku: "COF-01",
          name: "Iced Coffee",
          quantity_on_hand: "2.000",
          min_stock_threshold: "5.000",
          unit_abbreviation: "pcs",
        },
      ],
    });

    reportsService.fetchProfitLossReport.mockResolvedValue({
      statement: {
        gross_sales: "550.00",
        discounts: "50.00",
        net_sales: "500.00",
        tax_collected: "50.00",
        total_sales_collected: "550.00",
        cost_of_goods_sold: "220.00",
        gross_profit: "280.00",
        gross_margin_pct: "56.00",
        operating_expenses: "80.00",
        net_profit: "200.00",
        net_margin_pct: "40.00",
        purchasing_received_total: "300.00",
      },
      expense_breakdown: [
        { category_id: 1, category_name: "Rent", count: 1, total_amount: "80.00" },
      ],
    });

    reportsService.fetchSalesReport.mockResolvedValue({
      summary: {
        completed_count: 10,
        cancelled_count: 1,
        refunded_count: 0,
        gross_subtotal: "550.00",
        total_discount: "50.00",
        total_tax: "50.00",
        net_revenue: "550.00",
        average_order_value: "55.00",
      },
      daily_breakdown: [
        { date: "2026-11-23", sales_count: 10, revenue: "550.00", discounts: "50.00", tax: "50.00" },
      ],
      payment_breakdown: [{ payment_method: "cash", count: 10, total_amount: "550.00" }],
      top_products: [
        {
          product_id: 1,
          sku: "TEA-01",
          name: "Green Tea",
          unit: "cup",
          quantity_sold: "11.000",
          revenue: "55.00",
          cogs: "22.00",
          gross_profit: "33.00",
        },
      ],
    });

    inventoryService.fetchInventoryReport.mockResolvedValue({
      summary: {
        total_tracked_products: 20,
        total_stock_valuation: "950.00",
        total_retail_valuation: "1900.00",
        low_stock_count: 2,
      },
      by_category: [
        {
          category_id: 1,
          category_name: "Drinks",
          product_count: 5,
          total_quantity: "50.000",
          stock_valuation: "100.00",
          retail_valuation: "250.00",
        },
      ],
    });

    reportsService.fetchPurchasingReport.mockResolvedValue({
      summary: { total_orders: 4, received_orders: 3, received_total: "300.00" },
      by_status: [{ status: "received", count: 3, total_amount: "300.00" }],
      by_supplier: [
        { supplier_id: 1, supplier_name: "Mekong Wholesale", received_count: 3, received_total: "300.00" },
      ],
    });
  });

  it("renders live Dashboard KPIs, recent sales, and low-stock alerts on HomePage", async () => {
    renderWithProviders(<HomePage />);

    await waitFor(() => {
      expect(screen.getByText("$245.50")).toBeInTheDocument();
      expect(screen.getByText("INV-20261123-0008")).toBeInTheDocument();
      expect(screen.getByText("Iced Coffee")).toBeInTheDocument();
    });
  });

  it("renders Profit & Loss, switches across Sales/Inventory/Purchasing tabs, and exports CSV", async () => {
    reportsService.exportReportCsv.mockResolvedValue("pos_pnl_report_20261123.csv");
    renderWithProviders(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("$280.00").length).toBeGreaterThan(0);
      expect(screen.getAllByText("$200.00").length).toBeGreaterThan(0);
    });

    // Export CSV
    fireEvent.click(screen.getByRole("button", { name: /Export CSV/i }));
    await waitFor(() => {
      expect(reportsService.exportReportCsv).toHaveBeenCalledWith("pnl", expect.any(Object));
    });

    // Switch to Sales tab
    fireEvent.click(screen.getByRole("tab", { name: /Sales Report/i }));
    await waitFor(() => expect(screen.getByText("Green Tea")).toBeInTheDocument());

    // Switch to Inventory tab
    fireEvent.click(screen.getByRole("tab", { name: /Inventory Valuation/i }));
    await waitFor(() => expect(screen.getByText("$950.00")).toBeInTheDocument());

    // Switch to Purchasing tab
    fireEvent.click(screen.getByRole("tab", { name: /Purchasing Report/i }));
    await waitFor(() => expect(screen.getByText("Mekong Wholesale")).toBeInTheDocument());
  });

  it("hides Export CSV when reports.export is missing and renders Khmer labels", async () => {
    mockAuthState.user.permissions = ["reports.view"];
    window.localStorage.setItem("pos_ui_language", "km");

    renderWithProviders(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "របាយការណ៍ និងការវិភាគ" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /នាំចេញ CSV/ })).not.toBeInTheDocument();
  });
});
