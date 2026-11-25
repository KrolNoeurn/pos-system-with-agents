import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmProvider } from "../contexts/ConfirmContext";
import { PreferencesProvider } from "../contexts/PreferencesContext";
import { ToastProvider } from "../contexts/ToastContext";
import ProductsPage from "../pages/ProductsPage";
import * as categoriesService from "../services/categoriesService";
import * as productsService from "../services/productsService";
import * as unitsService from "../services/unitsService";

const mockAuthState = {
  user: {
    id: 1,
    username: "manager",
    is_active: true,
    is_super_admin: false,
    permissions: [
      "products.view",
      "products.create",
      "products.edit",
      "products.edit_price",
      "products.delete",
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

vi.mock("../services/unitsService", () => ({
  fetchUnits: vi.fn(),
}));

vi.mock("../services/productsService", () => ({
  fetchProducts: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
  activateProduct: vi.fn(),
  deactivateProduct: vi.fn(),
}));

function renderProductsPage() {
  return render(
    <MemoryRouter>
      <PreferencesProvider>
        <ToastProvider>
          <ConfirmProvider>
            <ProductsPage />
          </ConfirmProvider>
        </ToastProvider>
      </PreferencesProvider>
    </MemoryRouter>
  );
}

describe("ProductsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockAuthState.user.permissions = [
      "products.view",
      "products.create",
      "products.edit",
      "products.edit_price",
      "products.delete",
    ];
    categoriesService.fetchCategories.mockResolvedValue({
      count: 1,
      results: [{ id: 10, name: "Beverages", name_km: "ភេសជ្ជៈ", is_active: true }],
    });
    unitsService.fetchUnits.mockResolvedValue({
      count: 1,
      results: [{ id: 20, name: "Bottle", name_km: "ដប", abbreviation: "btl", is_active: true }],
    });
    productsService.fetchProducts.mockResolvedValue({
      count: 12,
      results: [
        {
          id: 1,
          sku: "DRK-100",
          barcode: "885000123456",
          name: "Green Tea",
          name_km: "តែបៃតង",
          description: "500ml unsweetened",
          image_url: null,
          category: 10,
          category_name: "Beverages",
          category_name_km: "ភេសជ្ជៈ",
          unit: 20,
          unit_name: "Bottle",
          unit_abbreviation: "btl",
          purchase_cost: "0.55",
          selling_price: "1.20",
          wholesale_price: "0.95",
          tax_rate: "0.00",
          min_stock_threshold: "10.000",
          track_inventory: true,
          is_active: true,
        },
      ],
    });
  });

  it("renders product list, supports search, sorting, pagination, and Product Details modal", async () => {
    renderProductsPage();

    await waitFor(() => {
      expect(screen.getByText("Green Tea")).toBeInTheDocument();
      expect(screen.getByText("DRK-100")).toBeInTheDocument();
      expect(screen.getByText("$1.20")).toBeInTheDocument();
    });

    // Open Product Details modal
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    const detailDialog = within(screen.getByRole("dialog"));
    expect(detailDialog.getByText("Product Details")).toBeInTheDocument();
    expect(detailDialog.getByText(/Stock on hand is controlled strictly/)).toBeInTheDocument();
    fireEvent.click(detailDialog.getByRole("button", { name: "Close" }));

    // Sorting changes ordering query param
    fireEvent.change(screen.getByLabelText("Sort products"), {
      target: { value: "-selling_price" },
    });
    await waitFor(() => {
      expect(productsService.fetchProducts).toHaveBeenCalledWith(
        expect.objectContaining({ ordering: "-selling_price", page: 1 })
      );
    });

    // Pagination Next
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => {
      expect(productsService.fetchProducts).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2, page_size: 10 })
      );
    });
  });

  it("validates required & monetary fields before creating a product (with no direct stock field)", async () => {
    productsService.createProduct.mockResolvedValue({ id: 2, sku: "SNK-200", name: "Peanuts" });
    renderProductsPage();

    await waitFor(() => expect(screen.getByText("Green Tea")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /New Product/i }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));
    expect(dialog.getByText("SKU is required.")).toBeInTheDocument();
    expect(dialog.getByText("Product name is required.")).toBeInTheDocument();
    expect(productsService.createProduct).not.toHaveBeenCalled();

    fireEvent.change(dialog.getByLabelText(/^SKU/i), { target: { value: "SNK-200" } });
    fireEvent.change(dialog.getByLabelText(/Product Name \(English\)/i), {
      target: { value: "Peanuts" },
    });
    fireEvent.change(dialog.getByLabelText(/^Category/i), { target: { value: "10" } });
    fireEvent.change(dialog.getByLabelText(/^Unit/i), { target: { value: "20" } });
    fireEvent.change(dialog.getByLabelText(/Purchase Cost/i), { target: { value: "0.80" } });
    fireEvent.change(dialog.getByLabelText(/Selling Price/i), { target: { value: "1.50" } });
    fireEvent.change(dialog.getByLabelText(/Wholesale Price/i), { target: { value: "1.20" } });
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(productsService.createProduct).toHaveBeenCalledWith(
        expect.objectContaining({
          sku: "SNK-200",
          name: "Peanuts",
          category: 10,
          unit: 20,
          purchase_cost: "0.80",
          selling_price: "1.50",
          wholesale_price: "1.20",
        })
      );
    });
  });

  it("requires confirmation on delete and surfaces 409 historical transaction protection error", async () => {
    productsService.deleteProduct.mockRejectedValue({
      status: 409,
      message: "Cannot delete product 'Green Tea' (DRK-100) because it is referenced in historical transactions.",
    });
    renderProductsPage();

    await waitFor(() => expect(screen.getByText("Green Tea")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(productsService.deleteProduct).not.toHaveBeenCalled();

    const delButtons = screen.getAllByRole("button", { name: "Delete" });
    fireEvent.click(delButtons[delButtons.length - 1]);

    await waitFor(() => {
      expect(productsService.deleteProduct).toHaveBeenCalledWith(1);
      expect(
        screen.getByText(
          "Cannot delete product 'Green Tea' (DRK-100) because it is referenced in historical transactions."
        )
      ).toBeInTheDocument();
    });
  });

  it("hides mutation controls for read-only users and renders Khmer UI", async () => {
    mockAuthState.user.permissions = ["products.view"];
    window.localStorage.setItem("pos_ui_language", "km");

    renderProductsPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "ផលិតផល" })).toBeInTheDocument();
      expect(screen.getByText("តែបៃតង")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /បង្កើតផលិតផលថ្មី/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "កែប្រែ" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "លុប" })).not.toBeInTheDocument();
  });

  it("supports uploading multiple images, viewing product gallery, setting primary, and removing images", async () => {
    if (!URL.createObjectURL) {
      URL.createObjectURL = vi.fn(() => "blob:mock-product-img");
    }
    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = vi.fn();
    }

    productsService.fetchProducts.mockResolvedValue({
      count: 1,
      results: [
        {
          id: 1,
          sku: "DRK-100",
          barcode: "885000123456",
          name: "Green Tea",
          name_km: "តែបៃតង",
          description: "500ml unsweetened",
          image_url: "http://127.0.0.1:8000/media/products/front.png",
          images_count: 2,
          images: [
            {
              id: 101,
              image_url: "http://127.0.0.1:8000/media/products/front.png",
              is_primary: true,
              sort_order: 0,
            },
            {
              id: 102,
              image_url: "http://127.0.0.1:8000/media/products/side.png",
              is_primary: false,
              sort_order: 1,
            },
          ],
          category: 10,
          category_name: "Beverages",
          category_name_km: "ភេសជ្ជៈ",
          unit: 20,
          unit_name: "Bottle",
          unit_abbreviation: "btl",
          purchase_cost: "0.55",
          selling_price: "1.20",
          wholesale_price: "0.95",
          tax_rate: "0.00",
          min_stock_threshold: "10.000",
          track_inventory: true,
          is_active: true,
        },
      ],
    });
    productsService.updateProduct.mockResolvedValue({ id: 1 });

    renderProductsPage();

    await waitFor(() => expect(screen.getByText("+1")).toBeInTheDocument());

    // Product Details modal renders multi-image switcher thumbnails
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    const detailDialog = within(screen.getByRole("dialog"));
    expect(detailDialog.getByRole("button", { name: "View image 2" })).toBeInTheDocument();
    fireEvent.click(detailDialog.getByRole("button", { name: "Close" }));

    // Edit Product modal: promote image #102 to primary, remove image #101, and queue 2 new images
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const editDialog = within(screen.getByRole("dialog"));
    fireEvent.click(editDialog.getByRole("button", { name: "Set Primary" }));
    fireEvent.click(editDialog.getByRole("button", { name: "Remove image 101" }));

    const file1 = new File(["img1"], "angle1.png", { type: "image/png" });
    const file2 = new File(["img2"], "angle2.png", { type: "image/png" });
    fireEvent.change(editDialog.getByLabelText(/Product Images/i), {
      target: { files: [file1, file2] },
    });

    fireEvent.click(editDialog.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(productsService.updateProduct).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          images: [file1, file2],
          delete_image_ids: [101],
          primary_image_id: 102,
        })
      );
    });
  });
});
