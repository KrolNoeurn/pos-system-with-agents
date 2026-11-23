import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmProvider } from "../contexts/ConfirmContext";
import { PreferencesProvider } from "../contexts/PreferencesContext";
import { ToastProvider } from "../contexts/ToastContext";
import UnitsPage from "../pages/UnitsPage";
import * as unitsService from "../services/unitsService";

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

vi.mock("../services/unitsService", () => ({
  fetchUnits: vi.fn(),
  createUnit: vi.fn(),
  updateUnit: vi.fn(),
  deleteUnit: vi.fn(),
  activateUnit: vi.fn(),
  deactivateUnit: vi.fn(),
}));

function renderUnitsPage() {
  return render(
    <MemoryRouter>
      <PreferencesProvider>
        <ToastProvider>
          <ConfirmProvider>
            <UnitsPage />
          </ConfirmProvider>
        </ToastProvider>
      </PreferencesProvider>
    </MemoryRouter>
  );
}

describe("UnitsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockAuthState.user.permissions = [
      "products.view",
      "products.create",
      "products.edit",
      "products.delete",
    ];
    unitsService.fetchUnits.mockResolvedValue({
      count: 11,
      results: [
        {
          id: 1,
          name: "Piece",
          name_km: "ដុំ",
          abbreviation: "pcs",
          unit_type: "count",
          allow_decimal: false,
          base_unit: null,
          base_unit_name: null,
          base_unit_abbreviation: null,
          conversion_factor: "1.000000",
          is_active: true,
          derived_count: 1,
          is_in_use: true,
        },
        {
          id: 2,
          name: "Box",
          name_km: "កេស",
          abbreviation: "box",
          unit_type: "count",
          allow_decimal: false,
          base_unit: 1,
          base_unit_name: "Piece",
          base_unit_abbreviation: "pcs",
          conversion_factor: "12.000000",
          is_active: true,
          derived_count: 0,
          is_in_use: false,
        },
      ],
    });
  });

  it("renders paginated units list with base/factor readout, search, and unit type filter", async () => {
    renderUnitsPage();

    await waitFor(() => {
      expect(screen.getByText("Piece")).toBeInTheDocument();
      expect(screen.getByText("1 box = 12 pcs")).toBeInTheDocument();
    });

    // Pagination Next button
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => {
      expect(unitsService.fetchUnits).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2, page_size: 10 })
      );
    });

    // Filter by unit type resets to page 1
    fireEvent.change(screen.getByLabelText("Filter unit type"), {
      target: { value: "weight" },
    });
    await waitFor(() => {
      expect(unitsService.fetchUnits).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, unit_type: "weight" })
      );
    });
  });

  it("validates required name and abbreviation before creating unit", async () => {
    unitsService.createUnit.mockResolvedValue({ id: 3, name: "Kilogram", abbreviation: "kg" });
    renderUnitsPage();

    await waitFor(() => expect(screen.getByText("Piece")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /New Unit/i }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));
    expect(dialog.getByText("Unit name is required.")).toBeInTheDocument();
    expect(dialog.getByText("Abbreviation is required.")).toBeInTheDocument();
    expect(unitsService.createUnit).not.toHaveBeenCalled();

    fireEvent.change(dialog.getByLabelText(/Unit Name \(English\)/i), {
      target: { value: "Kilogram" },
    });
    fireEvent.change(dialog.getByLabelText(/Abbreviation/i), {
      target: { value: "kg" },
    });
    fireEvent.change(dialog.getByLabelText(/Unit Type/i), {
      target: { value: "weight" },
    });
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(unitsService.createUnit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Kilogram",
          abbreviation: "kg",
          unit_type: "weight",
          is_active: true,
        })
      );
    });
  });

  it("requires confirmation before deleting and shows error toast when unit is in use", async () => {
    unitsService.deleteUnit.mockRejectedValue({
      status: 409,
      message: "Cannot delete unit 'Piece' because 1 derived unit(s) reference it.",
    });
    renderUnitsPage();

    await waitFor(() => expect(screen.getByText("Piece")).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(unitsService.deleteUnit).not.toHaveBeenCalled();

    const deleteBtns = screen.getAllByRole("button", { name: "Delete" });
    fireEvent.click(deleteBtns[deleteBtns.length - 1]);

    await waitFor(() => {
      expect(unitsService.deleteUnit).toHaveBeenCalledWith(1);
      expect(
        screen.getByText("Cannot delete unit 'Piece' because 1 derived unit(s) reference it.")
      ).toBeInTheDocument();
    });
  });

  it("hides mutation buttons for read-only users and renders Khmer translations", async () => {
    mockAuthState.user.permissions = ["products.view"];
    window.localStorage.setItem("pos_ui_language", "km");

    renderUnitsPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "ឯកតាវាស់វែង" })).toBeInTheDocument();
      expect(screen.getByText("ដុំ")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /បង្កើតឯកតាថ្មី/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "កែប្រែ" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "លុប" })).not.toBeInTheDocument();
  });
});
