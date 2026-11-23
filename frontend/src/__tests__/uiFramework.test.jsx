import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppModal, DataTable, PageHeader } from "../components/ui";
import { ConfirmProvider, useConfirm } from "../contexts/ConfirmContext";
import { PreferencesProvider } from "../contexts/PreferencesContext";
import { ToastProvider, useToast } from "../contexts/ToastContext";
import AppShell from "../layouts/AppShell";

// Controlled Auth mock for testing permission-aware navigation & layout shells
const mockAuthState = {
  user: {
    id: 1,
    username: "admin",
    full_name: "System Admin",
    is_active: true,
    is_super_admin: true,
    roles: [{ id: 1, name: "Super Administrator", slug: "super_admin", is_super_admin: true }],
    permissions: ["users.view", "roles.view", "roles.manage"],
  },
  isAuthenticated: true,
  isLoading: false,
  hasPermission: (code) =>
    mockAuthState.user.is_super_admin || mockAuthState.user.permissions.includes(code),
  logout: vi.fn().mockResolvedValue(undefined),
};

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => mockAuthState,
}));

vi.mock("../services/authService", () => ({
  updateCurrentUserProfile: vi.fn().mockResolvedValue({}),
}));

function SampleSharedPage({ marker }) {
  const toast = useToast();
  const confirm = useConfirm();
  return (
    <div>
      <PageHeader title={marker} subtitle="Shared across Vertical and Horizontal layouts" />
      <button type="button" onClick={() => toast.success("Toast verified")}>
        Trigger Toast
      </button>
      <button
        type="button"
        onClick={() =>
          confirm({ title: "Confirm Test", message: "Proceed with test action?" })
        }
      >
        Trigger Confirm
      </button>
    </div>
  );
}

function renderShell(initialEntries = ["/"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <PreferencesProvider>
        <ToastProvider>
          <ConfirmProvider>
            <Routes>
              <Route path="/" element={<AppShell />}>
                <Route index element={<SampleSharedPage marker="Shared Home Content" />} />
                <Route path="users" element={<SampleSharedPage marker="Shared Users Content" />} />
                <Route path="roles" element={<SampleSharedPage marker="Shared Roles Content" />} />
                <Route path="profile" element={<SampleSharedPage marker="Shared Profile Content" />} />
              </Route>
            </Routes>
          </ConfirmProvider>
        </ToastProvider>
      </PreferencesProvider>
    </MemoryRouter>
  );
}

describe("POS UI Framework", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.setAttribute("data-bs-theme", "light");
    document.documentElement.setAttribute("lang", "en");
    mockAuthState.user = {
      id: 1,
      username: "admin",
      full_name: "System Admin",
      is_active: true,
      is_super_admin: true,
      roles: [{ id: 1, name: "Super Administrator", slug: "super_admin", is_super_admin: true }],
      permissions: ["users.view", "roles.view", "roles.manage"],
    };
  });

  it("switches between Vertical and Horizontal layouts while preserving active route and shared page", () => {
    const { container } = renderShell(["/users"]);

    // Starts in Vertical layout on /users
    expect(container.querySelector('[data-layout="vertical"]')).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Shared Users Content" })).toBeInTheDocument();

    // Switch to Horizontal layout
    fireEvent.click(screen.getByRole("button", { name: "Switch layout" }));
    expect(container.querySelector('[data-layout="horizontal"]')).toBeInTheDocument();
    // Exact same shared page remains active without route loss
    expect(screen.getByRole("heading", { name: "Shared Users Content" })).toBeInTheDocument();

    // Switch back to Vertical
    fireEvent.click(screen.getAllByRole("button", { name: "Switch layout" })[0]);
    expect(container.querySelector('[data-layout="vertical"]')).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Shared Users Content" })).toBeInTheDocument();
  });

  it("toggles Light and Dark theme and updates html[data-bs-theme]", () => {
    renderShell(["/"]);
    expect(document.documentElement.getAttribute("data-bs-theme")).toBe("light");

    fireEvent.click(screen.getByRole("button", { name: "Toggle theme" }));
    expect(document.documentElement.getAttribute("data-bs-theme")).toBe("dark");
    expect(window.localStorage.getItem("pos_ui_theme")).toBe("dark");

    fireEvent.click(screen.getByRole("button", { name: "Toggle theme" }));
    expect(document.documentElement.getAttribute("data-bs-theme")).toBe("light");
  });

  it("cycles sidebar through Expanded -> Mini -> Collapsed and supports mobile drawer toggle", () => {
    const { container } = renderShell(["/"]);
    const sidebar = container.querySelector(".pos-sidebar");
    expect(sidebar).not.toHaveClass("is-mini");
    expect(sidebar).not.toHaveClass("is-collapsed");

    const cycleBtn = screen.getByRole("button", { name: "Cycle sidebar mode" });
    fireEvent.click(cycleBtn);
    expect(sidebar).toHaveClass("is-mini");

    fireEvent.click(cycleBtn);
    expect(sidebar).toHaveClass("is-collapsed");

    fireEvent.click(cycleBtn);
    expect(sidebar).not.toHaveClass("is-mini");
    expect(sidebar).not.toHaveClass("is-collapsed");

    // Mobile drawer toggle
    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
    expect(sidebar).toHaveClass("is-mobile-open");
  });

  it("enforces permission-based navigation menus (hides Administration when user lacks permissions)", () => {
    mockAuthState.user = {
      id: 2,
      username: "cashier1",
      full_name: "Front Cashier",
      is_active: true,
      is_super_admin: false,
      roles: [{ id: 3, name: "Cashier", slug: "cashier", is_super_admin: false }],
      permissions: ["sales.create", "products.view"],
    };

    renderShell(["/"]);
    expect(screen.queryByText("Administration")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Roles & Permissions" })).not.toBeInTheDocument();
    expect(screen.getByText("Account")).toBeInTheDocument();
  });

  it("supports Horizontal dropdown nested navigation and Khmer language switching", async () => {
    window.localStorage.setItem("pos_ui_layout", "horizontal");
    renderShell(["/"]);

    // Open Administration dropdown in Horizontal top menu
    fireEvent.click(screen.getByRole("button", { name: /Administration/i }));
    const rolesLink = screen.getByRole("link", { name: "Roles & Permissions" });
    expect(rolesLink).toBeInTheDocument();

    // Navigate via dropdown
    fireEvent.click(rolesLink);
    expect(screen.getByRole("heading", { name: "Shared Roles Content" })).toBeInTheDocument();

    // Switch language to Khmer
    fireEvent.click(screen.getAllByRole("button", { name: "Toggle language" })[0]);
    expect(document.documentElement.getAttribute("lang")).toBe("km");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /ការគ្រប់គ្រង/ })).toBeInTheDocument();
    });
  });

  it("renders Toast notifications, Confirm dialogs, AppModal, and DataTable states", () => {
    renderShell(["/"]);

    // Toast
    fireEvent.click(screen.getByRole("button", { name: "Trigger Toast" }));
    expect(screen.getByText("Toast verified")).toBeInTheDocument();

    // Confirm modal
    fireEvent.click(screen.getByRole("button", { name: "Trigger Confirm" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Proceed with test action?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders DataTable loading, error, empty, and populated states plus AppModal", () => {
    const columns = [{ key: "name", header: "Name" }];
    const onRetry = vi.fn();

    const { rerender } = render(<DataTable columns={columns} rows={[]} loading />);
    expect(screen.getByRole("status")).toBeInTheDocument();

    rerender(<DataTable columns={columns} rows={[]} error="Network failure" onRetry={onRetry} />);
    expect(screen.getByText("Network failure")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(<DataTable columns={columns} rows={[]} emptyTitle="Nothing here yet" />);
    expect(screen.getByText("Nothing here yet")).toBeInTheDocument();

    rerender(<DataTable columns={columns} rows={[{ id: 1, name: "Item Alpha" }]} />);
    expect(screen.getByText("Item Alpha")).toBeInTheDocument();

    rerender(
      <AppModal isOpen title="Modal Header" onClose={() => {}}>
        <p>Modal Body</p>
      </AppModal>
    );
    expect(screen.getByText("Modal Header")).toBeInTheDocument();
    expect(screen.getByText("Modal Body")).toBeInTheDocument();
  });
});
