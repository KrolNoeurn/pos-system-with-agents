import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreferencesProvider } from "../contexts/PreferencesContext";
import { ToastProvider } from "../contexts/ToastContext";
import BackupsPage from "../pages/BackupsPage";
import ProfilePage from "../pages/ProfilePage";
import * as authService from "../services/authService";
import * as backupService from "../services/backupService";

const mockRefreshProfile = vi.fn().mockResolvedValue({});
const mockAuthState = {
  user: {
    id: 1,
    username: "admin",
    email: "admin@example.com",
    full_name: "Store Admin",
    phone: "012345678",
    avatar_url: "http://127.0.0.1:8000/media/avatars/existing.png",
    is_active: true,
    is_super_admin: true,
    roles: [{ id: 1, name: "Super Administrator" }],
    permissions: ["settings.view", "settings.edit"],
  },
  isAuthenticated: true,
  refreshProfile: mockRefreshProfile,
  hasPermission: (code) => mockAuthState.user.permissions.includes(code),
};

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => mockAuthState,
}));

vi.mock("../services/authService", () => ({
  updateCurrentUserProfile: vi.fn(),
  changePassword: vi.fn(),
}));

vi.mock("../services/backupService", () => ({
  fetchBackupSettings: vi.fn(),
  updateBackupSettings: vi.fn(),
  testTelegramBackup: vi.fn(),
  runBackupNow: vi.fn(),
  fetchBackupRuns: vi.fn(),
  downloadBackupRun: vi.fn(),
}));

function renderWithProviders(ui) {
  return render(
    <MemoryRouter>
      <PreferencesProvider>
        <ToastProvider>{ui}</ToastProvider>
      </PreferencesProvider>
    </MemoryRouter>
  );
}

describe("User Profile Image & Telegram Crontab Backup Control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    if (!URL.createObjectURL) {
      URL.createObjectURL = vi.fn(() => "blob:preview-avatar");
    }
    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = vi.fn();
    }

    authService.updateCurrentUserProfile.mockResolvedValue({
      ...mockAuthState.user,
      avatar_url: "http://127.0.0.1:8000/media/avatars/new.png",
    });

    backupService.fetchBackupSettings.mockResolvedValue({
      id: 1,
      is_enabled: true,
      cron_expression: "0 2 * * *",
      timezone_name: "Asia/Phnom_Penh",
      include_database: true,
      include_media: true,
      retention_count: 7,
      telegram_enabled: true,
      has_telegram_token: true,
      telegram_bot_token_masked: "12345:••••••9999",
      telegram_chat_id: "-100123456",
      telegram_message_thread_id: "",
      telegram_caption_prefix: "POS Backup",
      next_runs: ["2026-11-25T02:00:00+07:00"],
      crontab_entry: "0 2 * * * python manage.py run_scheduled_backup --force",
      polling_crontab_entry: "* * * * * python manage.py run_scheduled_backup",
    });
    backupService.fetchBackupRuns.mockResolvedValue({
      count: 1,
      results: [
        {
          id: 9,
          status: "success",
          trigger_type: "manual",
          includes_database: true,
          includes_media: true,
          file_name: "pos_backup_20261124_r9.zip",
          file_size_bytes: 20480,
          media_files_count: 4,
          telegram_sent: true,
          telegram_parts_sent: 1,
          can_download: true,
          started_at: "2026-11-24T00:10:00Z",
          triggered_by_username: "admin",
        },
      ],
    });
  });

  it("uploads and removes profile image on ProfilePage", async () => {
    renderWithProviders(<ProfilePage />);

    const fileInput = screen.getByLabelText(/Upload Photo/i);
    const file = new File(["fake-image"], "avatar.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));

    await waitFor(() => {
      expect(authService.updateCurrentUserProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          avatar: file,
          full_name: "Store Admin",
        })
      );
      expect(mockRefreshProfile).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole("button", { name: /Remove Photo/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));

    await waitFor(() => {
      expect(authService.updateCurrentUserProfile).toHaveBeenCalledWith(
        expect.objectContaining({ remove_avatar: true })
      );
    });
  });

  it("configures crontab schedule, tests Telegram, and runs manual backup on BackupsPage", async () => {
    backupService.updateBackupSettings.mockResolvedValue({
      id: 1,
      is_enabled: true,
      cron_expression: "0 */6 * * *",
      timezone_name: "Asia/Phnom_Penh",
      include_database: true,
      include_media: true,
      retention_count: 7,
      telegram_enabled: true,
      has_telegram_token: true,
      telegram_bot_token_masked: "12345:••••••9999",
      telegram_chat_id: "-100999888",
      telegram_message_thread_id: "",
      telegram_caption_prefix: "POS Backup",
      next_runs: ["2026-11-24T06:00:00+07:00"],
      crontab_entry: "0 */6 * * * python manage.py run_scheduled_backup --force",
      polling_crontab_entry: "* * * * * python manage.py run_scheduled_backup",
    });
    backupService.testTelegramBackup.mockResolvedValue({
      ok: true,
      bot_username: "pos_backup_bot",
    });
    backupService.runBackupNow.mockResolvedValue({ id: 10, status: "success" });

    renderWithProviders(<BackupsPage />);

    await waitFor(() => expect(screen.getByText("Backups & Telegram Control")).toBeInTheDocument());
    expect(screen.getByText(/Media \(4\)/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Quick Schedule Preset/i), {
      target: { value: "0 */6 * * *" },
    });
    fireEvent.change(screen.getByLabelText(/Telegram Chat \/ Channel ID/i), {
      target: { value: "-100999888" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Save Backup Config/i }));
    await waitFor(() => {
      expect(backupService.updateBackupSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          cron_expression: "0 */6 * * *",
          telegram_chat_id: "-100999888",
          include_database: true,
          include_media: true,
        })
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /Test Telegram/i }));
    await waitFor(() => expect(backupService.testTelegramBackup).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /Run Backup Now/i }));
    await waitFor(() => {
      expect(backupService.runBackupNow).toHaveBeenCalledWith(
        expect.objectContaining({
          include_database: true,
          include_media: true,
          send_to_telegram: true,
        })
      );
    });
  });
});
