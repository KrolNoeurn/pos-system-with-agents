import { useEffect, useState } from "react";
import {
  AppCard,
  FormActions,
  FormInput,
  FormSelect,
  PageHeader,
  UserAvatar,
} from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { usePreferences } from "../contexts/PreferencesContext";
import { useToast } from "../contexts/ToastContext";
import { changePassword, updateCurrentUserProfile } from "../services/authService";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export default function ProfilePage() {
  const { user, refreshProfile } = useAuth();
  const {
    theme,
    setTheme,
    layout,
    setLayout,
    sidebarMode,
    setSidebarMode,
    language,
    setLanguage,
    t,
  } = usePreferences();
  const toast = useToast();

  const [fullName, setFullName] = useState(user?.full_name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    setFullName(user?.full_name || "");
    setPhone(user?.phone || "");
  }, [user?.full_name, user?.phone]);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(t("profile.avatarInvalidType"));
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error(t("profile.avatarTooLarge"));
      return;
    }
    if (avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl);
    }
    setAvatarFile(file);
    setAvatarPreviewUrl(URL.createObjectURL(file));
    setRemoveAvatar(false);
  };

  const handleRemoveAvatar = () => {
    if (avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl);
    }
    setAvatarFile(null);
    setAvatarPreviewUrl("");
    setRemoveAvatar(true);
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileSaving(true);
    try {
      const payload = {
        full_name: fullName,
        phone,
        preferred_language: language,
        preferred_theme: theme,
        preferred_layout: layout,
      };
      if (avatarFile) {
        payload.avatar = avatarFile;
      } else if (removeAvatar) {
        payload.remove_avatar = true;
      }
      await updateCurrentUserProfile(payload);
      await refreshProfile();
      setAvatarFile(null);
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
        setAvatarPreviewUrl("");
      }
      setRemoveAvatar(false);
      toast.success(t("profile.savedToast"));
    } catch (err) {
      toast.error(err?.message || "Failed to update profile.");
    } finally {
      setProfileSaving(false);
    }
  };

  const displayAvatarSrc = removeAvatar
    ? ""
    : avatarPreviewUrl || user?.avatar_url || user?.avatar || "";
  const hasVisibleAvatar = Boolean(displayAvatarSrc);

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }

    setPasswordSaving(true);
    try {
      await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed successfully.");
    } catch (err) {
      toast.error(err?.message || "Failed to change password.");
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="d-flex flex-column gap-4">
      <PageHeader
        icon="bi-sliders"
        title={t("pages.profileTitle")}
        subtitle={t("pages.profileSubtitle")}
      />

      <div className="row g-4">
        <div className="col-12 col-lg-6">
          <AppCard title={t("profile.cardTitle")} icon="bi-person-badge" className="h-100">
            <form onSubmit={handleProfileSubmit} className="d-flex flex-column gap-3">
              <div className="d-flex flex-wrap align-items-center gap-3 p-3 rounded border bg-body-tertiary">
                <UserAvatar user={user} src={displayAvatarSrc} size="lg" />
                <div className="d-flex flex-column gap-2 flex-grow-1 min-w-0">
                  <div>
                    <div className="fw-semibold">{t("profile.photoTitle")}</div>
                    <div className="small text-body-secondary">{t("profile.photoHint")}</div>
                  </div>
                  <div className="d-flex flex-wrap gap-2">
                    <label
                      htmlFor="profileAvatarInput"
                      className={`btn btn-sm btn-outline-primary mb-0${profileSaving ? " disabled" : ""}`}
                    >
                      <i className="bi bi-camera me-1" aria-hidden="true" />
                      {t("profile.uploadPhoto")}
                    </label>
                    <input
                      id="profileAvatarInput"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="d-none"
                      onChange={handleAvatarChange}
                      disabled={profileSaving}
                      aria-label={t("profile.uploadPhoto")}
                    />
                    {hasVisibleAvatar && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        onClick={handleRemoveAvatar}
                        disabled={profileSaving}
                      >
                        <i className="bi bi-trash me-1" aria-hidden="true" />
                        {t("profile.removePhoto")}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <FormInput
                id="profileUsername"
                label="Username"
                value={user?.username || ""}
                disabled
              />
              <FormInput
                id="profileEmail"
                label="Email"
                type="email"
                value={user?.email || ""}
                disabled
              />
              <FormInput
                id="profileFullName"
                label="Full Name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={profileSaving}
              />
              <FormInput
                id="profilePhone"
                label="Phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={profileSaving}
              />

              <div className="row g-3">
                <div className="col-12 col-sm-6">
                  <FormSelect
                    id="prefLayout"
                    label="Navigation Layout"
                    value={layout}
                    onChange={(e) => setLayout(e.target.value)}
                    options={[
                      { value: "vertical", label: t("controls.layoutVertical") },
                      { value: "horizontal", label: t("controls.layoutHorizontal") },
                    ]}
                  />
                </div>
                <div className="col-12 col-sm-6">
                  <FormSelect
                    id="prefTheme"
                    label="Theme"
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                    options={[
                      { value: "light", label: t("controls.themeLight") },
                      { value: "dark", label: t("controls.themeDark") },
                    ]}
                  />
                </div>
                <div className="col-12 col-sm-6">
                  <FormSelect
                    id="prefSidebar"
                    label="Sidebar Mode (Vertical)"
                    value={sidebarMode}
                    onChange={(e) => setSidebarMode(e.target.value)}
                    options={[
                      { value: "expanded", label: t("controls.sidebarExpanded") },
                      { value: "mini", label: t("controls.sidebarMini") },
                      { value: "collapsed", label: t("controls.sidebarCollapsed") },
                    ]}
                  />
                </div>
                <div className="col-12 col-sm-6">
                  <FormSelect
                    id="prefLanguage"
                    label="Language"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    options={[
                      { value: "en", label: "English (EN)" },
                      { value: "km", label: "ភាសាខ្មែរ (KM)" },
                    ]}
                  />
                </div>
              </div>

              <div className="pt-2">
                <FormActions
                  submitting={profileSaving}
                  submitLabel={t("controls.save")}
                  submittingLabel={t("controls.saving")}
                />
              </div>
            </form>
          </AppCard>
        </div>

        <div className="col-12 col-lg-6">
          <AppCard title="Change Password" icon="bi-shield-lock" className="h-100">
            <form onSubmit={handlePasswordSubmit} className="d-flex flex-column gap-3">
              <FormInput
                id="currentPassword"
                label="Current Password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
                disabled={passwordSaving}
              />
              <FormInput
                id="newPassword"
                label="New Password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                helpText="Minimum 8 characters; avoid common passwords."
                required
                disabled={passwordSaving}
              />
              <FormInput
                id="confirmPassword"
                label="Confirm New Password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                disabled={passwordSaving}
              />

              <div className="pt-2">
                <FormActions
                  submitting={passwordSaving}
                  submitLabel="Update Password"
                  submittingLabel="Updating..."
                />
              </div>
            </form>
          </AppCard>
        </div>
      </div>

      <AppCard
        title={`Assigned Roles & Active Permissions (${user?.permissions?.length || 0})`}
        icon="bi-key"
      >
        <div className="mb-3 d-flex flex-wrap gap-2">
          {(user?.roles || []).length === 0 ? (
            <span className="text-body-secondary small">No roles assigned.</span>
          ) : (
            user.roles.map((role) => (
              <span key={role.id} className="badge text-bg-primary">
                {role.name}
              </span>
            ))
          )}
        </div>
        <div className="d-flex flex-wrap gap-1">
          {(user?.permissions || []).map((code) => (
            <code key={code} className="px-2 py-1 rounded border bg-body-tertiary small">
              {code}
            </code>
          ))}
        </div>
      </AppCard>
    </div>
  );
}
