import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmProvider } from "../contexts/ConfirmContext";
import { PreferencesProvider } from "../contexts/PreferencesContext";
import { ToastProvider } from "../contexts/ToastContext";
import InventoryPage from "../pages/InventoryPage";
import * as categoriesService from "../services/categoriesService";
import * as inventoryService from "../services/inventoryService";

const mockAuthState = {
  user: {
    id: 1,
    username: "manager",
    is_active: true,
    is_super_admin: false,
    permissions: ["inventory.view", "inventory.adjust"],
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

vi.mock("../services/categoriesService", () => ({
  fetchCategories: vi.fn(),
}));

vi.mock("../services/inventoryService", () => ({
  fetchStockBalances: vi.fn(),
  fetchLowStockAlerts: vi.fn(),
  fetchStockMovements: vi.fn(),
  fetchInventoryReport: vi.fn(),
  submitOpeningStock: vi.fn(),
  submitStockIn: vi.fn(),
  submitStockOut: vi.fn(),
  submitStockAdjustment: vi.fn(),
}));

function renderInventoryPage() {
  return render(
    <MemoryRouter>
      <PreferencesProvider>
        <ToastProvider>
          <ConfirmProvider>
            <InventoryPage />
          </ConfirmProvider>
        </ToastProvider>
      </PreferencesProvider>
    </MemoryRouter>
  );
}

describe("InventoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockAuthState.user.permissions = ["inventory.view", "inventory.adjust"];

    categoriesService.fetchCategories.mockResolvedValue({
      count: 1,
      results: [{ id: 1, name: "Beverages", name_km: "ភេសជ្ជៈ" }],
    });
    inventoryService.fetchStockBalances.mockResolvedValue({
      count: 1,
      results: [
        {
          product_id: 10,
          sku: "DRK-COLA",
          name: "Cola Can",
          name_km: "កូឡា",
          category: 1,
          category_name: "Beverages",
          unit_abbreviation: "pcs",
          purchase_cost: "0.50",
          min_stock_threshold: "10.000",
          quantity_on_hand: "4.000",
          average_unit_cost: "0.50",
          stock_value: "2.00",
          shortage: "6.000",
          stock_status: "low_stock",
        },
      ],
    });
    inventoryService.fetchLowStockAlerts.mockResolvedValue({
      count: 1,
      results: [
        {
          product_id: 10,
          sku: "DRK-COLA",
          name: "Cola Can",
          name_km: "កូឡា",
          category_name: "Beverages",
          unit_abbreviation: "pcs",
          min_stock_threshold: "10.000",
          quantity_on_hand: "4.000",
          shortage: "6.000",
          stock_status: "low_stock",
        },
      ],
    });
    inventoryService.fetchStockMovements.mockResolvedValue({
      count: 1,
      results: [
        {
          id: 50,
          product: 10,
          product_sku: "DRK-COLA",
          product_name: "Cola Can",
          product_name_km: "កូឡា",
          unit_abbreviation: "pcs",
          movement_type: "opening",
          quantity: "4.000",
          quantity_delta: "4.000",
          balance_before: "0.000",
          balance_after: "4.000",
          reference_code: "OPEN-1",
          notes: "Initial stock",
          created_by_username: "manager",
          created_by_full_name: "Store Manager",
          created_at: "2026-11-23T10:00:00Z",
        },
      ],
    });
    inventoryService.fetchInventoryReport.mockResolvedValue({
      valuation_method: "weighted_average_cost",
      summary: {
        total_tracked_products: 1,
        total_quantity_on_hand: "4.000",
        total_stock_valuation: "2.00",
        total_retail_valuation: "4.00",
        low_stock_count: 1,
        out_of_stock_count: 0,
      },
      by_category: [
        {
          category_id: 1,
          category_name: "Beverages",
          category_name_km: "ភេសជ្ជៈ",
          product_count: 1,
          total_quantity: "4.000",
          stock_valuation: "2.00",
          retail_valuation: "4.00",
        },
      ],
      movements_by_type: [],
    });
  });

  it("renders balances, switches to Movement History, Low-Stock Alerts, and Valuation Report", async () => {
    renderInventoryPage();

    await waitFor(() => {
      expect(screen.getByText("Cola Can")).toBeInTheDocument();
      expect(screen.getByText("$2.00")).toBeInTheDocument();
    });

    // Switch to Movement History
    fireEvent.click(screen.getByRole("tab", { name: /Movement History/i }));
    await waitFor(() => {
      expect(screen.getByText("OPEN-1")).toBeInTheDocument();
      expect(screen.getByText("0 → 4")).toBeInTheDocument();
    });

    // Switch to Valuation Report
    fireEvent.click(screen.getByRole("tab", { name: /Valuation Report/i }));
    await waitFor(() => {
      expect(screen.getByText("Valuation by Category")).toBeInTheDocument();
      expect(screen.getAllByText("$2.00").length).toBeGreaterThan(0);
    });
  });

  it("validates stock adjustment reason and submits adjustment via inventoryService", async () => {
    inventoryService.submitStockAdjustment.mockResolvedValue({ id: 51 });
    renderInventoryPage();

    await waitFor(() => expect(screen.getByText("Cola Can")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Adjust" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText(/Direct stock balance editing is disabled/i)).toBeInTheDocument();

    fireEvent.change(dialog.getByLabelText(/Quantity/i), { target: { value: "2" } });
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));
    expect(dialog.getByText("A reason is required for stock adjustments.")).toBeInTheDocument();
    expect(inventoryService.submitStockAdjustment).not.toHaveBeenCalled();

    fireEvent.change(dialog.getByLabelText(/Notes \/ Reason/i), {
      target: { value: "Damaged cans" },
    });
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(inventoryService.submitStockAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({
          product: 10,
          direction: "increase",
          quantity: "2",
          notes: "Damaged cans",
        })
      );
    });
  });

  it("hides stock adjustment controls for view-only users and renders Khmer labels", async () => {
    mockAuthState.user.permissions = ["inventory.view"];
    window.localStorage.setItem("pos_ui_language", "km");

    renderInventoryPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "ការគ្រប់គ្រងស្តុកទំនិញ" })).toBeInTheDocument();
      expect(screen.getByText("កូឡា")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /នាំចូលស្តុក/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /កែសម្រួលស្តុក/ })).not.toBeInTheDocument();
  });
});
