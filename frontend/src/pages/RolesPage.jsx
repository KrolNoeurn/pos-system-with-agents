import { useCallback, useEffect, useMemo, useState } from "react";
import StatusAlert from "../components/StatusAlert";
import {
  AppCard,
  AppModal,
  EmptyState,
  ErrorState,
  FormActions,
  FormInput,
  FormTextarea,
  LoadingState,
  PageHeader,
} from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { useConfirm } from "../contexts/ConfirmContext";
import { usePreferences } from "../contexts/PreferencesContext";
import { useToast } from "../contexts/ToastContext";
import {
  assignRolePermissions,
  createRole,
  deleteRole,
  fetchPermissions,
  fetchRoles,
  updateRole,
} from "../services/rbacService";

export default function RolesPage() {
  const { hasPermission } = useAuth();
  const { t } = usePreferences();
  const toast = useToast();
  const confirm = useConfirm();
  const canManage = hasPermission("roles.manage");

  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [selectedPermIds, setSelectedPermIds] = useState([]);
  const [permSearch, setPermSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingPerms, setSavingPerms] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [savingRole, setSavingRole] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [rolesResp, permsResp] = await Promise.all([
        fetchRoles(),
        fetchPermissions(),
      ]);
      const roleList = rolesResp.results || rolesResp;
      const permList = permsResp.results || permsResp;
      setRoles(roleList);
      setPermissions(permList);
      setSelectedRoleId((prev) => {
        if (prev && roleList.some((r) => r.id === prev)) return prev;
        return roleList[0]?.id || null;
      });
    } catch (err) {
      setError(err?.message || "Failed to load roles and permissions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedRole = useMemo(
    () => roles.find((r) => r.id === selectedRoleId) || null,
    [roles, selectedRoleId]
  );

  useEffect(() => {
    if (selectedRole) {
      setSelectedPermIds((selectedRole.permissions || []).map((p) => p.id));
    } else {
      setSelectedPermIds([]);
    }
  }, [selectedRole]);

  const groupedPermissions = useMemo(() => {
    const query = permSearch.trim().toLowerCase();
    const groups = new Map();
    for (const perm of permissions) {
      if (
        query &&
        !perm.code.toLowerCase().includes(query) &&
        !(perm.description || "").toLowerCase().includes(query)
      ) {
        continue;
      }
      if (!groups.has(perm.module)) groups.set(perm.module, []);
      groups.get(perm.module).push(perm);
    }
    return Array.from(groups.entries());
  }, [permissions, permSearch]);

  const togglePermission = (permId) => {
    setSelectedPermIds((prev) =>
      prev.includes(permId) ? prev.filter((id) => id !== permId) : [...prev, permId]
    );
  };

  const toggleModuleAll = (modulePerms) => {
    const moduleIds = modulePerms.map((p) => p.id);
    const allSelected = moduleIds.every((id) => selectedPermIds.includes(id));
    setSelectedPermIds((prev) =>
      allSelected
        ? prev.filter((id) => !moduleIds.includes(id))
        : Array.from(new Set([...prev, ...moduleIds]))
    );
  };

  const handleSavePermissions = async () => {
    if (!selectedRole) return;
    setSavingPerms(true);
    try {
      await assignRolePermissions(selectedRole.id, selectedPermIds);
      toast.success(`Saved permissions for '${selectedRole.name}'.`);
      await loadData();
    } catch (err) {
      toast.error(err?.message || "Failed to assign permissions.");
    } finally {
      setSavingPerms(false);
    }
  };

  const openCreateRole = () => {
    setEditingRole(null);
    setRoleName("");
    setRoleDescription("");
    setModalOpen(true);
  };

  const openEditRole = (role) => {
    setEditingRole(role);
    setRoleName(role.name);
    setRoleDescription(role.description || "");
    setModalOpen(true);
  };

  const handleSaveRole = async (e) => {
    e.preventDefault();
    setSavingRole(true);
    try {
      if (editingRole) {
        await updateRole(editingRole.id, {
          name: roleName,
          description: roleDescription,
        });
        toast.success(`Updated role '${roleName}'.`);
      } else {
        const created = await createRole({
          name: roleName,
          description: roleDescription,
          permission_ids: [],
        });
        setSelectedRoleId(created.id);
        toast.success(`Created role '${created.name}'.`);
      }
      setModalOpen(false);
      await loadData();
    } catch (err) {
      toast.error(err?.message || "Failed to save role.");
    } finally {
      setSavingRole(false);
    }
  };

  const handleDeleteRole = async (role) => {
    const approved = await confirm({
      title: "Delete Custom Role",
      message: `Delete role '${role.name}'? Users assigned only to this role will lose its permissions.`,
      confirmLabel: t("controls.delete"),
      cancelLabel: t("controls.cancel"),
      variant: "danger",
    });
    if (!approved) return;

    try {
      await deleteRole(role.id);
      toast.success(`Deleted role '${role.name}'.`);
      setSelectedRoleId(null);
      await loadData();
    } catch (err) {
      toast.error(err?.message || "Failed to delete role.");
    }
  };

  const isRoleLocked = !canManage || selectedRole?.is_super_admin;

  return (
    <div className="d-flex flex-column gap-4">
      <PageHeader
        icon="bi-key"
        title={t("pages.rolesTitle")}
        subtitle={t("pages.rolesSubtitle")}
        actions={
          canManage && (
            <button type="button" className="btn btn-primary" onClick={openCreateRole}>
              <i className="bi bi-shield-plus me-2" aria-hidden="true" />
              {t("pages.newRole")}
            </button>
          )
        }
      />

      {loading ? (
        <AppCard>
          <LoadingState message="Loading roles and permissions..." />
        </AppCard>
      ) : error ? (
        <AppCard noPadding>
          <ErrorState message={error} onRetry={loadData} />
        </AppCard>
      ) : (
        <div className="row g-4">
          <div className="col-12 col-lg-4">
            <AppCard title={`Roles (${roles.length})`} icon="bi-shield" noPadding>
              <div className="list-group list-group-flush">
                {roles.map((role) => {
                  const isActive = role.id === selectedRoleId;
                  return (
                    <button
                      key={role.id}
                      type="button"
                      className={`list-group-item list-group-item-action text-start${
                        isActive ? " active" : ""
                      }`}
                      onClick={() => setSelectedRoleId(role.id)}
                    >
                      <div className="d-flex justify-content-between align-items-center gap-2">
                        <span className="fw-semibold">{role.name}</span>
                        <span
                          className={`badge ${
                            isActive ? "text-bg-light text-dark" : "text-bg-secondary"
                          }`}
                        >
                          {role.permissions?.length || 0}
                        </span>
                      </div>
                      <div
                        className={`small mt-1 ${
                          isActive ? "text-white-50" : "text-body-secondary"
                        }`}
                      >
                        {role.is_super_admin
                          ? "Protected Super Admin"
                          : role.is_system
                            ? "System Role"
                            : "Custom Role"}
                        {typeof role.user_count === "number" && ` · ${role.user_count} user(s)`}
                      </div>
                    </button>
                  );
                })}
              </div>
            </AppCard>
          </div>

          <div className="col-12 col-lg-8">
            <AppCard
              title={selectedRole ? `Permissions for ${selectedRole.name}` : "Select a Role"}
              subtitle={selectedRole?.description || ""}
              headerActions={
                selectedRole &&
                canManage && (
                  <>
                    {!selectedRole.is_super_admin && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() => openEditRole(selectedRole)}
                      >
                        {t("controls.edit")}
                      </button>
                    )}
                    {!selectedRole.is_system && !selectedRole.is_super_admin && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => handleDeleteRole(selectedRole)}
                      >
                        {t("controls.delete")}
                      </button>
                    )}
                    {!selectedRole.is_super_admin && (
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={handleSavePermissions}
                        disabled={savingPerms}
                      >
                        {savingPerms ? t("controls.saving") : "Save Permissions"}
                      </button>
                    )}
                  </>
                )
              }
            >
              {!selectedRole ? (
                <EmptyState
                  icon="bi-shield"
                  title="No role selected"
                  description="Choose a role on the left to inspect or update its permissions."
                />
              ) : (
                <>
                  {selectedRole.is_super_admin && (
                    <div className="mb-3">
                      <StatusAlert
                        variant="info"
                        message="Super Administrator always holds all canonical permissions and cannot be restricted."
                      />
                    </div>
                  )}

                  <div className="mb-3">
                    <input
                      type="search"
                      className="form-control"
                      placeholder="Filter permissions by module, action, or description..."
                      value={permSearch}
                      onChange={(e) => setPermSearch(e.target.value)}
                    />
                  </div>

                  {groupedPermissions.length === 0 ? (
                    <EmptyState
                      icon="bi-search"
                      title="No matching permissions"
                      description="Clear the filter to view all permissions."
                    />
                  ) : (
                    <div className="d-flex flex-column gap-3">
                      {groupedPermissions.map(([moduleName, modulePerms]) => {
                        const allChecked = modulePerms.every((p) =>
                          selectedPermIds.includes(p.id)
                        );
                        return (
                          <div key={moduleName} className="border rounded p-3">
                            <div className="d-flex justify-content-between align-items-center mb-2">
                              <span className="fw-semibold text-uppercase small text-primary">
                                {moduleName}
                              </span>
                              {!isRoleLocked && (
                                <button
                                  type="button"
                                  className="btn btn-link btn-sm p-0 text-decoration-none"
                                  onClick={() => toggleModuleAll(modulePerms)}
                                >
                                  {allChecked ? "Clear module" : "Select all"}
                                </button>
                              )}
                            </div>

                            <div className="row g-2">
                              {modulePerms.map((perm) => (
                                <div key={perm.id} className="col-12 col-md-6">
                                  <div className="form-check">
                                    <input
                                      id={`perm-${perm.id}`}
                                      type="checkbox"
                                      className="form-check-input"
                                      checked={selectedPermIds.includes(perm.id)}
                                      onChange={() => togglePermission(perm.id)}
                                      disabled={isRoleLocked || savingPerms}
                                    />
                                    <label
                                      htmlFor={`perm-${perm.id}`}
                                      className="form-check-label small"
                                    >
                                      <code className="me-1">{perm.code}</code>
                                      {perm.description && (
                                        <span className="text-body-secondary d-block">
                                          {perm.description}
                                        </span>
                                      )}
                                    </label>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </AppCard>
          </div>
        </div>
      )}

      <AppModal
        isOpen={modalOpen}
        title={editingRole ? `Edit Role: ${editingRole.name}` : "Create Custom Role"}
        size="md"
        onClose={() => setModalOpen(false)}
        disableClose={savingRole}
      >
        <form onSubmit={handleSaveRole} className="d-flex flex-column gap-3">
          <FormInput
            id="roleName"
            label="Role Name"
            value={roleName}
            onChange={(e) => setRoleName(e.target.value)}
            required
            disabled={savingRole}
          />
          <FormTextarea
            id="roleDescription"
            label="Description"
            value={roleDescription}
            onChange={(e) => setRoleDescription(e.target.value)}
            disabled={savingRole}
          />
          <div className="pt-2 border-top">
            <FormActions
              submitting={savingRole}
              submitLabel={editingRole ? t("controls.save") : "Create Role"}
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
