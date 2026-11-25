import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmProvider } from "../contexts/ConfirmContext";
import { PreferencesProvider } from "../contexts/PreferencesContext";
import { ToastProvider } from "../contexts/ToastContext";
import CustomersPage from "../pages/CustomersPage";
import InventoryPage from "../pages/InventoryPage";
import SuppliersPage from "../pages/SuppliersPage";
import * as categoriesService from "../services/categoriesService";
import * as inventoryService from "../services/inventoryService";
import * as purchasingService from "../services/purchasingService";
import * as salesService from "../services/salesService";

const mockAuthState = {
  user: {
    id: 1,
    username: "manager",
    is_active: true,
    is_super_admin: false,
    permissions: [
      "customers.view",
      "customers.create",
      "customers.edit",
      "suppliers.view",
      "suppliers.create",
      "suppliers.edit",
      "inventory.view",
      "inventory.adjust",
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
  fetchCustomers: vi.fn(),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  activateCustomer: vi.fn(),
  deactivateCustomer: vi.fn(),
  importCustomersCsv: vi.fn(),
}));

vi.mock("../services/purchasingService", () => ({
  fetchSuppliers: vi.fn(),
  createSupplier: vi.fn(),
  updateSupplier: vi.fn(),
  activateSupplier: vi.fn(),
  deactivateSupplier: vi.fn(),
  importSuppliersCsv: vi.fn(),
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
  importAndAdjustStockCsv: vi.fn(),
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

describe("Customer Control, Supplier Control, and Bulk Stock Import/Adjust", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();

    categoriesService.fetchCategories.mockResolvedValue({ count: 0, results: [] });
    salesService.fetchCustomers.mockResolvedValue({
      count: 1,
      results: [
        {
          id: 1,
          name: "Sokha Chan",
          phone: "012111222",
          email: "sokha@example.com",
          address: "Phnom Penh",
          sales_count: 2,
          is_active: true,
        },
      ],
    });
    purchasingService.fetchSuppliers.mockResolvedValue({
      count: 1,
      results: [
        {
          id: 2,
          name: "Mekong Wholesale",
          contact_name: "Dara",
          phone: "023555666",
          email: "sales@mekong.com",
          purchases_count: 3,
          is_active: true,
        },
      ],
    });
    inventoryService.fetchStockBalances.mockResolvedValue({
      count: 1,
      results: [
        {
          product_id: 10,
          sku: "COF-01",
          name: "Coffee",
          category_name: "Drinks",
          unit_abbreviation: "pcs",
          quantity_on_hand: "10.000",
          min_stock_threshold: "5.000",
          average_unit_cost: "2.00",
          stock_value: "20.00",
          stock_status: "in_stock",
        },
      ],
    });
    inventoryService.fetchLowStockAlerts.mockResolvedValue({ count: 0, results: [] });
    inventoryService.fetchStockMovements.mockResolvedValue({ count: 0, results: [] });
    inventoryService.fetchInventoryReport.mockResolvedValue({
      summary: { total_tracked_products: 1, total_stock_valuation: "20.00" },
      by_category: [],
      movements_by_type: [],
    });
  });

  it("supports Customer deactivate control and CSV import on CustomersPage", async () => {
    salesService.deactivateCustomer.mockResolvedValue({ id: 1, is_active: false });
    salesService.importCustomersCsv.mockResolvedValue({ created_count: 2, updated_count: 0 });

    renderWithProviders(<CustomersPage />);

    await waitFor(() => expect(screen.getByText("Sokha Chan")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    await waitFor(() => expect(salesService.deactivateCustomer).toHaveBeenCalledWith(1));

    fireEvent.click(screen.getByRole("button", { name: /Import CSV/i }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByLabelText(/Or Paste CSV Data/i), {
      target: { value: "name,phone\nNew Client,012999888\n" },
    });
    fireEvent.click(dialog.getByRole("button", { name: "Import CSV" }));

    await waitFor(() => {
      expect(salesService.importCustomersCsv).toHaveBeenCalledWith(
        "name,phone\nNew Client,012999888\n"
      );
    });
  });

  it("renders default customer avatar, opens Customer Profile modal, and supports avatar upload/reset", async () => {
    salesService.createCustomer.mockResolvedValue({
      id: 11,
      name: "Dara Visal",
      avatar_url: "http://localhost:8000/media/customers/avatars/dara.png",
      is_active: true,
    });

    renderWithProviders(<CustomersPage />);

    // Default avatar initials ("SC") rendered when customer has no avatar_url
    await waitFor(() => expect(screen.getByText("Sokha Chan")).toBeInTheDocument());
    expect(screen.getByRole("img", { name: "Sokha Chan avatar" })).toHaveTextContent("SC");

    // Open Customer Profile modal
    fireEvent.click(screen.getByRole("button", { name: "Profile" }));
    const profileDialog = within(screen.getByRole("dialog"));
    expect(profileDialog.getByText("Customer Profile")).toBeInTheDocument();
    expect(profileDialog.getByText("012111222")).toBeInTheDocument();
    expect(profileDialog.getByRole("img", { name: "Sokha Chan avatar" })).toBeInTheDocument();
    fireEvent.click(profileDialog.getByRole("button", { name: "Close" }));

    // Open Create Customer modal -> shows Default Avatar badge and uploads image
    fireEvent.click(screen.getByRole("button", { name: /New Customer/i }));
    const createDialog = within(screen.getByRole("dialog"));
    expect(createDialog.getByText("Default Avatar")).toBeInTheDocument();

    fireEvent.change(createDialog.getByLabelText(/Customer Name/i), {
      target: { value: "Dara Visal" },
    });
    const fakeFile = new File(["pngbytes"], "dara.png", { type: "image/png" });
    fireEvent.change(createDialog.getByLabelText("Upload Photo"), {
      target: { files: [fakeFile] },
    });

    expect(createDialog.getByRole("button", { name: /Use Default Avatar/i })).toBeInTheDocument();

    fireEvent.click(createDialog.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(salesService.createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Dara Visal",
          avatar: fakeFile,
        })
      );
    });
  });

  it("supports Supplier deactivate control and CSV import on SuppliersPage", async () => {
    purchasingService.deactivateSupplier.mockResolvedValue({ id: 2, is_active: false });
    purchasingService.importSuppliersCsv.mockResolvedValue({ created_count: 1, updated_count: 0 });

    renderWithProviders(<SuppliersPage />);

    await waitFor(() => expect(screen.getByText("Mekong Wholesale")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    await waitFor(() => expect(purchasingService.deactivateSupplier).toHaveBeenCalledWith(2));

    fireEvent.click(screen.getByRole("button", { name: /Import CSV/i }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByLabelText(/Or Paste CSV Data/i), {
      target: { value: "name,phone\nAngkor Supply,023111222\n" },
    });
    fireEvent.click(dialog.getByRole("button", { name: "Import CSV" }));

    await waitFor(() => {
      expect(purchasingService.importSuppliersCsv).toHaveBeenCalledWith(
        "name,phone\nAngkor Supply,023111222\n"
      );
    });
  });

  it("renders default supplier avatar, opens Supplier Profile modal, and supports avatar upload/reset", async () => {
    purchasingService.createSupplier.mockResolvedValue({
      id: 9,
      name: "Bayon Traders",
      avatar_url: "http://localhost:8000/media/suppliers/avatars/bayon.png",
      is_active: true,
    });

    renderWithProviders(<SuppliersPage />);

    // Default avatar initials ("MW") rendered when supplier has no avatar_url
    await waitFor(() => expect(screen.getByText("Mekong Wholesale")).toBeInTheDocument());
    expect(screen.getByRole("img", { name: "Mekong Wholesale avatar" })).toHaveTextContent("MW");

    // Open Supplier Profile modal
    fireEvent.click(screen.getByRole("button", { name: "Profile" }));
    const profileDialog = within(screen.getByRole("dialog"));
    expect(profileDialog.getByText("Supplier Profile")).toBeInTheDocument();
    expect(profileDialog.getByText("023555666")).toBeInTheDocument();
    expect(profileDialog.getByRole("img", { name: "Mekong Wholesale avatar" })).toBeInTheDocument();
    fireEvent.click(profileDialog.getByRole("button", { name: "Close" }));

    // Open Create Supplier modal -> shows Default Avatar badge and uploads image
    fireEvent.click(screen.getByRole("button", { name: /New Supplier/i }));
    const createDialog = within(screen.getByRole("dialog"));
    expect(createDialog.getByText("Default Avatar")).toBeInTheDocument();

    fireEvent.change(createDialog.getByLabelText(/Supplier Name/i), {
      target: { value: "Bayon Traders" },
    });
    const fakeFile = new File(["pngbytes"], "bayon.png", { type: "image/png" });
    fireEvent.change(createDialog.getByLabelText("Upload Photo"), {
      target: { files: [fakeFile] },
    });

    // Reset button appears once a custom file is chosen
    expect(createDialog.getByRole("button", { name: /Use Default Avatar/i })).toBeInTheDocument();

    fireEvent.click(createDialog.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(purchasingService.createSupplier).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Bayon Traders",
          avatar: fakeFile,
        })
      );
    });
  });

  it("submits atomic Bulk Stock Import & Adjust CSV with Supplier link on InventoryPage", async () => {
    inventoryService.importAndAdjustStockCsv.mockResolvedValue({ processed_count: 2 });

    renderWithProviders(<InventoryPage />);

    await waitFor(() => expect(screen.getByText("Coffee")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Import \/ Adjust CSV/i }));
    const dialog = within(screen.getByRole("dialog"));

    fireEvent.change(dialog.getByLabelText(/Link to Supplier \/ Customer/i), {
      target: { value: "supplier" },
    });
    fireEvent.change(dialog.getByLabelText(/Select partner/i), {
      target: { value: "Mekong Wholesale" },
    });
    fireEvent.change(dialog.getByLabelText(/Or Paste CSV Data/i), {
      target: { value: "sku,operation,quantity,unit_cost,notes\nCOF-01,stock_in,5,2.00,Restock\n" },
    });
    fireEvent.click(dialog.getByRole("button", { name: /Import & Apply Stock/i }));

    await waitFor(() => {
      expect(inventoryService.importAndAdjustStockCsv).toHaveBeenCalledWith(
        expect.objectContaining({
          csvText: "sku,operation,quantity,unit_cost,notes\nCOF-01,stock_in,5,2.00,Restock\n",
          partnerType: "supplier",
          partnerName: "Mekong Wholesale",
        })
      );
    });
  });
});
