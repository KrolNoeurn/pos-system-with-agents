import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmProvider } from "../contexts/ConfirmContext";
import { PreferencesProvider } from "../contexts/PreferencesContext";
import { ToastProvider } from "../contexts/ToastContext";
import POSCheckoutPage from "../pages/POSCheckoutPage";
import SalesPage from "../pages/SalesPage";
import * as categoriesService from "../services/categoriesService";
import * as salesService from "../services/salesService";

const mockAuthState = {
  user: {
    id: 1,
    username: "cashier1",
    is_active: true,
    is_super_admin: false,
    permissions: [
      "sales.view",
      "sales.create",
      "sales.discount",
      "sales.cancel",
      "sales.refund",
      "customers.view",
      "customers.create",
      "customers.edit",
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

vi.mock("../services/categoriesService", () => ({
  fetchCategories: vi.fn(),
}));

vi.mock("../services/salesService", () => ({
  fetchPOSCatalog: vi.fn(),
  fetchCustomers: vi.fn(),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  fetchSales: vi.fn(),
  fetchSale: vi.fn(),
  checkoutSale: vi.fn(),
  cancelSale: vi.fn(),
  refundSale: vi.fn(),
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

describe("POS Checkout & Sales History", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockAuthState.user.permissions = [
      "sales.view",
      "sales.create",
      "sales.discount",
      "sales.cancel",
      "sales.refund",
      "customers.view",
      "customers.create",
      "customers.edit",
    ];

    categoriesService.fetchCategories.mockResolvedValue({
      count: 1,
      results: [{ id: 1, name: "Beverages", name_km: "ភេសជ្ជៈ", is_active: true }],
    });
    salesService.fetchCustomers.mockResolvedValue({
      count: 1,
      results: [{ id: 5, name: "Dara Sok", phone: "012333444", sales_count: 1, is_active: true }],
    });
    salesService.fetchPOSCatalog.mockResolvedValue({
      count: 1,
      results: [
        {
          id: 10,
          sku: "COF-01",
          barcode: "8850001",
          name: "Iced Coffee",
          name_km: "កាហ្វេទឹកកក",
          category: 1,
          unit_abbreviation: "pcs",
          unit_allow_decimal: false,
          selling_price: "3.50",
          tax_rate: "0.00",
          track_inventory: true,
          stock_quantity: "10.000",
        },
      ],
    });
    salesService.fetchSales.mockResolvedValue({
      count: 1,
      results: [
        {
          id: 200,
          sale_number: "INV-20261123-0001",
          customer: 5,
          customer_name_snapshot: "Dara Sok",
          status: "completed",
          subtotal: "7.00",
          discount_amount: "0.00",
          tax_amount: "0.00",
          total_amount: "7.00",
          paid_amount: "10.00",
          change_amount: "3.00",
          payment_method: "cash",
          items_count: 1,
          cashier_username: "cashier1",
          created_at: "2026-11-23T15:00:00Z",
        },
      ],
    });
    salesService.fetchSale.mockResolvedValue({
      id: 200,
      sale_number: "INV-20261123-0001",
      customer_name_snapshot: "Dara Sok",
      status: "completed",
      subtotal: "7.00",
      discount_amount: "0.00",
      tax_amount: "0.00",
      total_amount: "7.00",
      paid_amount: "10.00",
      change_amount: "3.00",
      payment_method: "cash",
      cashier_username: "cashier1",
      created_at: "2026-11-23T15:00:00Z",
      items: [
        {
          id: 1,
          product_sku_snapshot: "COF-01",
          product_name_snapshot: "Iced Coffee",
          unit_abbreviation_snapshot: "pcs",
          quantity: "2.000",
          unit_price: "3.50",
          line_tax: "0.00",
          line_total: "7.00",
        },
      ],
      payments: [{ id: 1, payment_method: "cash", amount: "10.00", reference_code: "" }],
    });
  });

  it("adds items to cart, validates payment, completes checkout, and opens receipt modal", async () => {
    salesService.checkoutSale.mockResolvedValue({
      id: 201,
      sale_number: "INV-20261123-0002",
      customer_name_snapshot: "Walk-in Customer",
      status: "completed",
      subtotal: "3.50",
      discount_amount: "0.00",
      tax_amount: "0.00",
      total_amount: "3.50",
      paid_amount: "5.00",
      change_amount: "1.50",
      payment_method: "cash",
      cashier_username: "cashier1",
      created_at: "2026-11-23T15:10:00Z",
      items: [
        {
          id: 2,
          product_sku_snapshot: "COF-01",
          product_name_snapshot: "Iced Coffee",
          unit_abbreviation_snapshot: "pcs",
          quantity: "1.000",
          unit_price: "3.50",
          line_tax: "0.00",
          line_total: "3.50",
        },
      ],
      payments: [{ id: 2, payment_method: "cash", amount: "5.00", reference_code: "" }],
    });

    renderWithProviders(<POSCheckoutPage />);

    await waitFor(() => expect(screen.getByText("Iced Coffee")).toBeInTheDocument());

    // Click product tile to add to cart
    fireEvent.click(screen.getByRole("button", { name: /Iced Coffee/i }));
    expect(screen.getByRole("button", { name: /Charge & Pay/i })).toBeEnabled();

    // Open payment modal
    fireEvent.click(screen.getByRole("button", { name: /Charge & Pay/i }));
    const dialog = within(screen.getByRole("dialog"));

    // Test underpayment validation
    fireEvent.change(dialog.getByLabelText(/Amount Tendered/i), { target: { value: "1.00" } });
    fireEvent.click(dialog.getByRole("button", { name: /Complete Sale/i }));
    expect(dialog.getByText(/must be at least the grand total/i)).toBeInTheDocument();
    expect(salesService.checkoutSale).not.toHaveBeenCalled();

    // Pay $5.00 cash and submit
    fireEvent.change(dialog.getByLabelText(/Amount Tendered/i), { target: { value: "5.00" } });
    fireEvent.click(dialog.getByRole("button", { name: /Complete Sale/i }));

    await waitFor(() => {
      expect(salesService.checkoutSale).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [{ product: 10, quantity: "1" }],
          payment_method: "cash",
          paid_amount: "5.00",
        }),
        expect.stringMatching(/^pos-/)
      );
    });

    // Receipt modal opens with receipt number
    await waitFor(() => {
      const receiptDialog = within(screen.getByRole("dialog"));
      expect(
        receiptDialog.getByRole("heading", { name: /INV-20261123-0002/ })
      ).toBeInTheDocument();
    });
  });

  it("renders sales history, opens receipt, and processes authorized sale cancellation", async () => {
    salesService.cancelSale.mockResolvedValue({ id: 200, status: "cancelled" });
    renderWithProviders(<SalesPage />);

    await waitFor(() => {
      const table = within(screen.getByRole("table"));
      expect(table.getByText("INV-20261123-0001")).toBeInTheDocument();
      expect(table.getByText("Dara Sok")).toBeInTheDocument();
    });

    // Open receipt modal
    fireEvent.click(screen.getByRole("button", { name: "Receipt" }));
    await waitFor(() => expect(screen.getByText("Iced Coffee")).toBeInTheDocument());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));

    // Trigger Void / Cancel modal and submit reason
    fireEvent.click(screen.getByRole("button", { name: "Void / Cancel" }));
    const cancelDialog = within(screen.getByRole("dialog"));
    fireEvent.change(cancelDialog.getByLabelText(/Reason/i), {
      target: { value: "Wrong order" },
    });
    fireEvent.click(cancelDialog.getByRole("button", { name: "Void / Cancel" }));

    await waitFor(() => {
      expect(salesService.cancelSale).toHaveBeenCalledWith(200, "Wrong order");
    });
  });

  it("hides void/refund controls for view-only users and renders Khmer UI", async () => {
    mockAuthState.user.permissions = ["sales.view"];
    window.localStorage.setItem("pos_ui_language", "km");

    renderWithProviders(<SalesPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "ប្រវត្តិលក់ និងអតិថិជន" })).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: "បោះបង់" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "សងប្រាក់វិញ" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /បើកបញ្ជរលក់ POS/ })).not.toBeInTheDocument();
  });

  it("applies per-item percentage discount and all-items percentage discount on POSCheckoutPage", async () => {
    salesService.fetchPOSCatalog.mockResolvedValue({
      count: 2,
      results: [
        {
          id: 10,
          sku: "COF-01",
          name: "Iced Coffee",
          category: 1,
          unit_abbreviation: "pcs",
          unit_allow_decimal: false,
          selling_price: "10.00",
          tax_rate: "0.00",
          track_inventory: true,
          stock_quantity: "20.000",
        },
        {
          id: 11,
          sku: "CAK-01",
          name: "Butter Cake",
          category: 1,
          unit_abbreviation: "pcs",
          unit_allow_decimal: false,
          selling_price: "20.00",
          tax_rate: "0.00",
          track_inventory: true,
          stock_quantity: "20.000",
        },
      ],
    });
    salesService.checkoutSale.mockResolvedValue({
      id: 205,
      sale_number: "INV-20261124-0005",
      customer_name_snapshot: "Walk-in Customer",
      status: "completed",
      subtotal: "30.00",
      item_discount_total: "6.00",
      order_discount_type: "percent",
      order_discount_value: "10.00",
      order_discount_amount: "2.40",
      discount_amount: "8.40",
      tax_amount: "0.00",
      total_amount: "21.60",
      paid_amount: "21.60",
      change_amount: "0.00",
      payment_method: "cash",
      cashier_username: "cashier1",
      created_at: "2026-11-24T15:00:00Z",
      items: [],
      payments: [],
    });

    renderWithProviders(<POSCheckoutPage />);

    await waitFor(() => expect(screen.getByText("Iced Coffee")).toBeInTheDocument());

    // Add both products ($10 + $20 = $30 subtotal)
    fireEvent.click(screen.getByRole("button", { name: /Iced Coffee/i }));
    fireEvent.click(screen.getByRole("button", { name: /Butter Cake/i }));

    // Item 1 (Iced Coffee): 20% discount -> -$2.00 ($8.00 net)
    fireEvent.click(screen.getByRole("button", { name: "Percent discount for Iced Coffee" }));
    fireEvent.change(screen.getByLabelText("Discount for Iced Coffee"), {
      target: { value: "20" },
    });

    // Item 2 (Butter Cake): $4.00 cash discount -> -$4.00 ($16.00 net)
    fireEvent.change(screen.getByLabelText("Discount for Butter Cake"), {
      target: { value: "4" },
    });

    // All-Items discount: switch to Percent (%) and tap 10% -> 10% of $24.00 = $2.40 -> Grand total = $21.60
    fireEvent.click(screen.getByRole("button", { name: "Percent (%)" }));
    fireEvent.click(screen.getByRole("button", { name: "10%" }));

    expect(screen.getByRole("button", { name: /Charge & Pay \(\$21\.60\)/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Charge & Pay/i }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.click(dialog.getByRole("button", { name: /Complete Sale/i }));

    await waitFor(() => {
      expect(salesService.checkoutSale).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            { product: 10, quantity: "1", discount_type: "percent", discount_value: "20.00" },
            { product: 11, quantity: "1", discount_type: "fixed", discount_value: "4.00" },
          ],
          discount_type: "percent",
          discount_value: "10.00",
          discount_amount: "2.40",
          paid_amount: "21.60",
        }),
        expect.stringMatching(/^pos-/)
      );
    });
  });
});
