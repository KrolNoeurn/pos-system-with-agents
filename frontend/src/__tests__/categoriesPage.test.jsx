import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmProvider } from "../contexts/ConfirmContext";
import { PreferencesProvider } from "../contexts/PreferencesContext";
import { ToastProvider } from "../contexts/ToastContext";
import CategoriesPage from "../pages/CategoriesPage";
import * as categoriesService from "../services/categoriesService";

const mockAuthState = {
  user: {
    id: 1,
    username: "manager",
    is_active: true,
    is_super_admin: false,
    permissions: ["products.view", "products.create", "products.edit", "products.delete"],
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
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
  activateCategory: vi.fn(),
  deactivateCategory: vi.fn(),
}));

function renderCategoriesPage() {
  return render(
    <MemoryRouter>
      <PreferencesProvider>
        <ToastProvider>
          <ConfirmProvider>
            <CategoriesPage />
          </ConfirmProvider>
        </ToastProvider>
      </PreferencesProvider>
    </MemoryRouter>
  );
}

describe("CategoriesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockAuthState.user.permissions = [
      "products.view",
      "products.create",
      "products.edit",
      "products.delete",
    ];
    categoriesService.fetchCategories.mockResolvedValue({
      count: 12,
      results: [
        {
          id: 1,
          name: "Beverages",
          name_km: "ភេសជ្ជៈ",
          slug: "beverages",
          parent: null,
          parent_name: null,
          description: "Drinks",
          is_active: true,
          children_count: 1,
          is_in_use: true,
        },
        {
          id: 2,
          name: "Snacks",
          name_km: "អាហារសម្រន់",
          slug: "snacks",
          parent: null,
          parent_name: null,
          description: "",
          is_active: false,
          children_count: 0,
          is_in_use: false,
        },
      ],
    });
  });

  it("loads categories, supports pagination, search, and Khmer localization", async () => {
    renderCategoriesPage();

    await waitFor(() => {
      expect(screen.getByText("Beverages")).toBeInTheDocument();
      expect(screen.getByText("Snacks")).toBeInTheDocument();
    });

    // Pagination renders when count > PAGE_SIZE (12 > 10)
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(categoriesService.fetchCategories).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2, page_size: 10 })
      );
    });

    // Search resets to page 1
    fireEvent.change(screen.getByPlaceholderText(/Search category/i), {
      target: { value: "Bev" },
    });
    await waitFor(() => {
      expect(categoriesService.fetchCategories).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, search: "Bev" })
      );
    });
  });

  it("validates required name and submits create category form", async () => {
    categoriesService.createCategory.mockResolvedValue({ id: 3, name: "Bakery" });
    renderCategoriesPage();

    await waitFor(() => expect(screen.getByText("Beverages")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /New Category/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Category name is required.")).toBeInTheDocument();
    expect(categoriesService.createCategory).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Category Name \(English\)/i), {
      target: { value: "Bakery" },
    });
    fireEvent.change(screen.getByLabelText(/Category Name \(Khmer\)/i), {
      target: { value: "នំប៉័ង" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(categoriesService.createCategory).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Bakery", name_km: "នំប៉័ង", is_active: true })
      );
    });
  });

  it("requires confirmation before deleting and shows error toast if category is in use", async () => {
    categoriesService.deleteCategory.mockRejectedValue({
      status: 409,
      message: "Cannot delete category 'Beverages' because it has 1 subcategory(ies).",
    });
    renderCategoriesPage();

    await waitFor(() => expect(screen.getByText("Beverages")).toBeInTheDocument());

    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    fireEvent.click(deleteButtons[0]);

    // Confirmation modal must appear before API call
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(categoriesService.deleteCategory).not.toHaveBeenCalled();

    // Confirm deletion inside modal
    const modalButtons = screen.getAllByRole("button", { name: "Delete" });
    fireEvent.click(modalButtons[modalButtons.length - 1]);

    await waitFor(() => {
      expect(categoriesService.deleteCategory).toHaveBeenCalledWith(1);
      expect(
        screen.getByText("Cannot delete category 'Beverages' because it has 1 subcategory(ies).")
      ).toBeInTheDocument();
    });
  });

  it("hides mutation controls for read-only users and renders Khmer labels when lang=km", async () => {
    mockAuthState.user.permissions = ["products.view"];
    window.localStorage.setItem("pos_ui_language", "km");

    renderCategoriesPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "ប្រភេទទំនិញ" })).toBeInTheDocument();
      expect(screen.getByText("ភេសជ្ជៈ")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /បង្កើតប្រភេទថ្មី/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "កែប្រែ" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "លុប" })).not.toBeInTheDocument();
  });
});
