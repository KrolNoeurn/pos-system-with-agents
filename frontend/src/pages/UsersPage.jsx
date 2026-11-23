import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppCard,
  AppModal,
  DataTable,
  FormActions,
  FormInput,
  PageHeader,
} from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { useConfirm } from "../contexts/ConfirmContext";
import { usePreferences } from "../contexts/PreferencesContext";
import { useToast } from "../contexts/ToastContext";
import { fetchRoles } from "../services/rbacService";
import {
  activateUser,
  assignUserRoles,
  createUser,
  deactivateUser,
  deleteUser,
  fetchUsers,
  updateUser,
} from "../services/usersService";

const EMPTY_FORM = {
  username: "",
  email: "",
  full_name: "",
  phone: "",
  password: "",
  role_ids: [],
};

export default function UsersPage() {
  const { user: currentUser, hasPermission } = useAuth();
  const { t } = usePreferences();
  const toast = useToast();
  const confirm = useConfirm();

  const canCreate = hasPermission("users.create");
  const canEdit = hasPermission("users.edit");
  const canDeactivate = hasPermission("users.deactivate") || canEdit;
  const canDelete = hasPermission("users.delete");

  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editingUser, setEditingUser] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyUserId, setBusyUserId] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (statusFilter) params.is_active = statusFilter;

      const [usersResp, rolesResp] = await Promise.all([
        fetchUsers(params),
        fetchRoles(),
      ]);
      setUsers(usersResp.results || usersResp);
      setRoles(rolesResp.results || rolesResp);
    } catch (err) {
      setError(err?.message || "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreateModal = () => {
    setEditingUser(null);
    setFormData(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEditModal = useCallback((target) => {
    setEditingUser(target);
    setFormData({
      username: target.username,
      email: target.email,
      full_name: target.full_name || "",
      phone: target.phone || "",
      password: "",
      role_ids: (target.roles || []).map((r) => r.id),
    });
    setModalOpen(true);
  }, []);

  const toggleRoleInForm = (roleId) => {
    setFormData((prev) => {
      const exists = prev.role_ids.includes(roleId);
      return {
        ...prev,
        role_ids: exists
          ? prev.role_ids.filter((id) => id !== roleId)
          : [...prev.role_ids, roleId],
      };
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingUser) {
        const payload = {
          email: formData.email,
          full_name: formData.full_name,
          phone: formData.phone,
        };
        if (formData.password) payload.password = formData.password;
        await updateUser(editingUser.id, payload);
        await assignUserRoles(editingUser.id, formData.role_ids);
        toast.success(`Updated user '${editingUser.username}'.`);
      } else {
        await createUser({
          username: formData.username,
          email: formData.email,
          full_name: formData.full_name,
          phone: formData.phone,
          password: formData.password,
          role_ids: formData.role_ids,
        });
        toast.success(`Created user '${formData.username}'.`);
      }
      setModalOpen(false);
      await loadData();
    } catch (err) {
      toast.error(err?.message || "Failed to save user.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = useCallback(
    async (target) => {
      const nextAction = target.is_active ? "deactivate" : "activate";
      const approved = await confirm({
        title: target.is_active ? "Deactivate User" : "Activate User",
        message: `Are you sure you want to ${nextAction} '${target.username}'?`,
        confirmLabel: target.is_active ? t("controls.deactivate") : t("controls.activate"),
        cancelLabel: t("controls.cancel"),
        variant: target.is_active ? "warning" : "success",
      });
      if (!approved) return;

      setBusyUserId(target.id);
      try {
        if (target.is_active) {
          await deactivateUser(target.id);
          toast.success(`Deactivated '${target.username}'.`);
        } else {
          await activateUser(target.id);
          toast.success(`Activated '${target.username}'.`);
        }
        await loadData();
      } catch (err) {
        toast.error(err?.message || "Action failed.");
      } finally {
        setBusyUserId(null);
      }
    },
    [confirm, loadData, t, toast]
  );

  const handleDelete = useCallback(
    async (target) => {
      const approved = await confirm({
        title: "Delete User",
        message: `Delete user '${target.username}' permanently? This action cannot be undone.`,
        confirmLabel: t("controls.delete"),
        cancelLabel: t("controls.cancel"),
        variant: "danger",
      });
      if (!approved) return;

      setBusyUserId(target.id);
      try {
        await deleteUser(target.id);
        toast.success(`Deleted user '${target.username}'.`);
        await loadData();
      } catch (err) {
        toast.error(err?.message || "Failed to delete user.");
      } finally {
        setBusyUserId(null);
      }
    },
    [confirm, loadData, t, toast]
  );

  const columns = useMemo(
    () => [
      {
        key: "user",
        header: "User",
        render: (u) => (
          <div>
            <div className="fw-semibold">
              {u.full_name || u.username}
              {u.is_system_account && (
                <span className="badge text-bg-dark ms-2">System</span>
              )}
            </div>
            <div className="small text-body-secondary">
              @{u.username} · {u.email}
            </div>
          </div>
        ),
      },
      {
        key: "roles",
        header: "Roles",
        render: (u) => (
          <div className="d-flex flex-wrap gap-1">
            {(u.roles || []).length === 0 ? (
              <span className="text-body-secondary small">Unassigned</span>
            ) : (
              u.roles.map((r) => (
                <span
                  key={r.id}
                  className={`badge ${r.is_super_admin ? "text-bg-primary" : "text-bg-secondary"}`}
                >
                  {r.name}
                </span>
              ))
            )}
          </div>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (u) => (
          <span className={`badge ${u.is_active ? "text-bg-success" : "text-bg-danger"}`}>
            {u.is_active ? t("status.active") : t("status.inactive")}
          </span>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        headerClassName: "text-end",
        cellClassName: "text-end",
        render: (u) => {
          const isSelf = currentUser?.id === u.id;
          const isBusy = busyUserId === u.id;
          return (
            <div className="btn-group btn-group-sm">
              {canEdit && (
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  onClick={() => openEditModal(u)}
                  disabled={isBusy}
                >
                  {t("controls.edit")}
                </button>
              )}
              {canDeactivate && !isSelf && (
                <button
                  type="button"
                  className={`btn ${u.is_active ? "btn-outline-warning" : "btn-outline-success"}`}
                  onClick={() => handleToggleActive(u)}
                  disabled={isBusy}
                >
                  {u.is_active ? t("controls.deactivate") : t("controls.activate")}
                </button>
              )}
              {canDelete && !isSelf && !u.is_system_account && (
                <button
                  type="button"
                  className="btn btn-outline-danger"
                  onClick={() => handleDelete(u)}
                  disabled={isBusy}
                >
                  {t("controls.delete")}
                </button>
              )}
            </div>
          );
        },
      },
    ],
    [
      busyUserId,
      canDeactivate,
      canDelete,
      canEdit,
      currentUser,
      handleDelete,
      handleToggleActive,
      openEditModal,
      t,
    ]
  );

  return (
    <div className="d-flex flex-column gap-4">
      <PageHeader
        icon="bi-people"
        title={t("pages.usersTitle")}
        subtitle={t("pages.usersSubtitle")}
        actions={
          canCreate && (
            <button type="button" className="btn btn-primary" onClick={openCreateModal}>
              <i className="bi bi-person-plus me-2" aria-hidden="true" />
              {t("pages.newUser")}
            </button>
          )
        }
      />

      <AppCard
        noPadding
        headerActions={
          <div className="d-flex flex-wrap gap-2 w-100">
            <input
              type="search"
              className="form-control form-control-sm"
              style={{ minWidth: "220px", flex: "1 1 220px" }}
              placeholder="Search username, name, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="form-select form-select-sm"
              style={{ width: "150px" }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="">All Statuses</option>
              <option value="true">{t("status.active")}</option>
              <option value="false">{t("status.inactive")}</option>
            </select>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={loadData}
              disabled={loading}
            >
              <i className="bi bi-arrow-clockwise me-1" aria-hidden="true" />
              {t("controls.refresh")}
            </button>
          </div>
        }
      >
        <DataTable
          columns={columns}
          rows={users}
          loading={loading}
          loadingMessage="Loading users..."
          error={error}
          onRetry={loadData}
          emptyIcon="bi-people"
          emptyTitle="No users found"
          emptyDescription="Try adjusting your search filter or create a new user."
        />
      </AppCard>

      <AppModal
        isOpen={modalOpen}
        title={editingUser ? `Edit User: ${editingUser.username}` : "Create User Account"}
        size="lg"
        onClose={() => setModalOpen(false)}
        disableClose={saving}
      >
        <form onSubmit={handleSave} className="d-flex flex-column gap-3">
          <div className="row g-3">
            <div className="col-12 col-md-6">
              <FormInput
                id="userUsername"
                label="Username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                required
                disabled={Boolean(editingUser) || saving}
              />
            </div>
            <div className="col-12 col-md-6">
              <FormInput
                id="userEmail"
                label="Email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                disabled={saving}
              />
            </div>
            <div className="col-12 col-md-6">
              <FormInput
                id="userFullName"
                label="Full Name"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                disabled={saving}
              />
            </div>
            <div className="col-12 col-md-6">
              <FormInput
                id="userPhone"
                label="Phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                disabled={saving}
              />
            </div>
            <div className="col-12">
              <FormInput
                id="userPassword"
                label={editingUser ? "Reset Password (optional)" : "Initial Password"}
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required={!editingUser}
                minLength={editingUser ? undefined : 8}
                placeholder={
                  editingUser ? "Leave blank to keep current password" : "Minimum 8 characters"
                }
                disabled={saving}
              />
            </div>
            <div className="col-12">
              <label className="form-label fw-medium">Assigned Roles</label>
              <div className="d-flex flex-wrap gap-2">
                {roles.map((role) => {
                  const checked = formData.role_ids.includes(role.id);
                  return (
                    <label
                      key={role.id}
                      className={`btn btn-sm ${checked ? "btn-primary" : "btn-outline-secondary"}`}
                    >
                      <input
                        type="checkbox"
                        className="form-check-input me-2"
                        checked={checked}
                        onChange={() => toggleRoleInForm(role.id)}
                        disabled={saving}
                      />
                      {role.name}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="pt-2 border-top">
            <FormActions
              submitting={saving}
              submitLabel={editingUser ? t("controls.save") : "Create User"}
              submittingLabel={t("controls.saving")}
              cancelLabel={t("controls.cancel")}
              onCancel={() => setModalOpen(false)}
            />
          </div>
        </form>
      </AppModal>
    </div>
  );
}
