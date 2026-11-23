import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmProvider } from "../contexts/ConfirmContext";
import { PreferencesProvider } from "../contexts/PreferencesContext";
import { ToastProvider } from "../contexts/ToastContext";
import PurchasingPage from "../pages/PurchasingPage";
import * as productsService from "../services/productsService";
import * as purchasingService from "../services/purchasingService";

const mockAuthState = {
  user: {
    id: 1,
    username: "manager",
    is_active: true,
    is_super_admin: false,
    permissions: [
      "purchases.view",
      "purchases.create",
      "purchases.receive",
      "purchases.cancel",
      "suppliers.view",
      "suppliers.create",
      "suppliers.edit",
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

vi.mock("../services/productsService", () => ({
  fetchProducts: vi.fn(),
}));

vi.mock("../services/purchasingService", () => ({
  fetchSuppliers: vi.fn(),
  createSupplier: vi.fn(),
  updateSupplier: vi.fn(),
  fetchPurchases: vi.fn(),
  fetchPurchase: vi.fn(),
  createPurchase: vi.fn(),
  updatePurchase: vi.fn(),
  receivePurchase: vi.fn(),
  cancelPurchase: vi.fn(),
}));

function renderPurchasingPage() {
  return render(
    <MemoryRouter>
      <PreferencesProvider>
        <ToastProvider>
          <ConfirmProvider>
            <PurchasingPage />
          </ConfirmProvider>
        </ToastProvider>
      </PreferencesProvider>
    </MemoryRouter>
  );
}

describe("PurchasingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockAuthState.user.permissions = [
      "purchases.view",
      "purchases.create",
      "purchases.receive",
      "purchases.cancel",
      "suppliers.view",
      "suppliers.create",
      "suppliers.edit",
    ];

    purchasingService.fetchSuppliers.mockResolvedValue({
      count: 1,
      results: [{ id: 1, name: "Mekong Wholesale", phone: "012345678", is_active: true }],
    });
    productsService.fetchProducts.mockResolvedValue({
      count: 1,
      results: [
        {
          id: 10,
          sku: "COF-1",
          name: "Coffee Pack",
          unit_abbreviation: "pcs",
          purchase_cost: "4.50",
          is_active: true,
        },
      ],
    });
    purchasingService.fetchPurchases.mockResolvedValue({
      count: 1,
      results: [
        {
          id: 100,
          purchase_number: "PO-20261123-0001",
          supplier: 1,
          supplier_name: "Mekong Wholesale",
          status: "draft",
          purchase_date: "2026-11-23",
          subtotal: "45.00",
          discount_amount: "0.00",
          total_amount: "45.00",
          items_count: 1,
          created_by_username: "manager",
        },
      ],
    });
    purchasingService.fetchPurchase.mockResolvedValue({
      id: 100,
      purchase_number: "PO-20261123-0001",
      supplier: 1,
      supplier_name: "Mekong Wholesale",
      status: "draft",
      purchase_date: "2026-11-23",
      subtotal: "45.00",
      discount_amount: "0.00",
      total_amount: "45.00",
      created_by_username: "manager",
      notes: "Initial order",
      items: [
        {
          id: 1,
          product: 10,
          product_sku_snapshot: "COF-1",
          product_name_snapshot: "Coffee Pack",
          unit_abbreviation_snapshot: "pcs",
          quantity: "10.000",
          unit_cost: "4.50",
          line_total: "45.00",
        },
      ],
    });
  });

  it("renders purchase history, opens details modal, and confirms goods receiving", async () => {
    purchasingService.receivePurchase.mockResolvedValue({
      id: 100,
      purchase_number: "PO-20261123-0001",
      status: "received",
    });

    renderPurchasingPage();

    await waitFor(() => {
      const table = within(screen.getByRole("table"));
      expect(table.getByText("PO-20261123-0001")).toBeInTheDocument();
      expect(table.getByText("Mekong Wholesale")).toBeInTheDocument();
    });

    // Open details
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    await waitFor(() => {
      expect(screen.getByText("Coffee Pack")).toBeInTheDocument();
    });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));

    // Trigger Receive Goods -> requires confirmation
    fireEvent.click(screen.getByRole("button", { name: "Receive Goods" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(purchasingService.receivePurchase).not.toHaveBeenCalled();

    const confirmButtons = screen.getAllByRole("button", { name: "Receive Goods" });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(purchasingService.receivePurchase).toHaveBeenCalledWith(100, {});
    });
  });

  it("validates and creates a draft purchase order with supplier and item lines", async () => {
    purchasingService.createPurchase.mockResolvedValue({ id: 101, purchase_number: "PO-20261123-0002" });
    renderPurchasingPage();

    await waitFor(() => expect(screen.getByText("PO-20261123-0001")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /New Purchase/i }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText(/does not increase stock/i)).toBeInTheDocument();

    fireEvent.change(dialog.getByLabelText(/^Supplier/i), { target: { value: "1" } });
    fireEvent.change(dialog.getByLabelText("Product row 1"), { target: { value: "10" } });
    fireEvent.change(dialog.getByLabelText("Quantity row 1"), { target: { value: "5" } });
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(purchasingService.createPurchase).toHaveBeenCalledWith(
        expect.objectContaining({
          supplier: 1,
          status: "draft",
          items: [{ product: 10, quantity: "5", unit_cost: "4.50" }],
        })
      );
    });
  });

  it("hides receive, cancel, and create controls for view-only users and renders Khmer", async () => {
    mockAuthState.user.permissions = ["purchases.view"];
    window.localStorage.setItem("pos_ui_language", "km");

    renderPurchasingPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "ការបញ្ជាទិញ និងទទួលទំនិញ" })).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /បង្កើតការបញ្ជាទិញថ្មី/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ទទួលទំនិញ" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "បោះបង់" })).not.toBeInTheDocument();
  });
});
