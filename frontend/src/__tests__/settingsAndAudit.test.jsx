import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmProvider } from "../contexts/ConfirmContext";
import { PreferencesProvider } from "../contexts/PreferencesContext";
import { ToastProvider } from "../contexts/ToastContext";
import AuditLogsPage from "../pages/AuditLogsPage";
import SettingsPage from "../pages/SettingsPage";
import * as auditService from "../services/auditService";
import * as settingsService from "../services/settingsService";

const mockAuthState = {
  user: {
    id: 1,
    username: "superadmin",
    is_active: true,
    is_super_admin: true,
    permissions: ["settings.view", "settings.edit", "audit.view"],
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

vi.mock("../services/settingsService", () => ({
  fetchStoreSettings: vi.fn(),
  updateStoreSettings: vi.fn(),
  fetchReceiptProfile: vi.fn(),
}));

vi.mock("../services/auditService", () => ({
  fetchAuditLogs: vi.fn(),
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

describe("SettingsPage & AuditLogsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockAuthState.user.permissions = ["settings.view", "settings.edit", "audit.view"];

    settingsService.fetchStoreSettings.mockResolvedValue({
      id: 1,
      store_name: "POS Store",
      store_name_km: "ហាង POS",
      tagline: "Fast & Reliable",
      phone: "023-111-222",
      email: "store@example.com",
      address: "Phnom Penh",
      address_km: "ភ្នំពេញ",
      tax_id: "K001-12345",
      currency_code: "USD",
      currency_symbol: "$",
      exchange_rate_khr: "4100.00",
      default_tax_rate: "10.00",
      receipt_header: "Welcome!",
      receipt_footer: "Thank you!",
      receipt_footer_km: "សូមអរគុណ!",
      show_khr_on_receipt: true,
      show_tax_id_on_receipt: false,
      updated_by_username: "superadmin",
      updated_at: "2026-11-23T16:00:00Z",
    });

    auditService.fetchAuditLogs.mockResolvedValue({
      count: 1,
      results: [
        {
          id: 42,
          actor: 1,
          actor_username: "superadmin",
          action: "settings.updated",
          target_type: "StoreSetting",
          target_id: "1",
          ip_address: "127.0.0.1",
          metadata: { changed_fields: ["store_name"] },
          created_at: "2026-11-23T16:05:00Z",
        },
      ],
    });
  });

  it("loads store settings, updates live receipt preview, and saves changes", async () => {
    settingsService.updateStoreSettings.mockResolvedValue({
      store_name: "Angkor Mart",
      updated_by_username: "superadmin",
      updated_at: "2026-11-23T16:10:00Z",
    });

    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("POS Store")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Store Name \(English\)/i), {
      target: { value: "Angkor Mart" },
    });
    expect(screen.getByText("Angkor Mart")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(settingsService.updateStoreSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          store_name: "Angkor Mart",
          exchange_rate_khr: "4100.00",
        })
      );
    });
  });

  it("enforces read-only mode on SettingsPage when settings.edit is missing", async () => {
    mockAuthState.user.permissions = ["settings.view"];
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText(/read-only access/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/Store Name \(English\)/i)).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("renders read-only audit logs, opens metadata inspect modal, and supports Khmer", async () => {
    renderWithProviders(<AuditLogsPage />);

    await waitFor(() => {
      const table = within(screen.getByRole("table"));
      expect(table.getByText("settings.updated")).toBeInTheDocument();
      expect(table.getByText("superadmin")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Inspect" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText(/changed_fields/)).toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "Close" }));

    // Khmer rendering check
    window.localStorage.setItem("pos_ui_language", "km");
    renderWithProviders(<AuditLogsPage />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "កំណត់ហេតុសវនកម្ម" })).toBeInTheDocument();
    });
  });
});
