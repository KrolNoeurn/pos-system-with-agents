import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppCard,
  AppModal,
  DataTable,
  FormActions,
  FormInput,
  FormSelect,
  FormTextarea,
  PageHeader,
  Pagination,
} from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { useConfirm } from "../contexts/ConfirmContext";
import { usePreferences } from "../contexts/PreferencesContext";
import { useToast } from "../contexts/ToastContext";
import {
  activateCategory,
  createCategory,
  deactivateCategory,
  deleteCategory,
  fetchCategories,
  updateCategory,
} from "../services/categoriesService";

const PAGE_SIZE = 10;

const EMPTY_FORM = {
  name: "",
  name_km: "",
  slug: "",
  parent: "",
  description: "",
  is_active: true,
};

export default function CategoriesPage() {
  const { hasPermission } = useAuth();
  const { language, t } = usePreferences();
  const toast = useToast();
  const confirm = useConfirm();

  const canCreate = hasPermission("products.create");
  const canEdit = hasPermission("products.edit");
  const canDelete = hasPermission("products.delete");

  const [categories, setCategories] = useState([]);
  const [parentOptions, setParentOptions] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = { page, page_size: PAGE_SIZE };
      if (search.trim()) params.search = search.trim();
      if (statusFilter) params.is_active = statusFilter;

      const data = await fetchCategories(params);
      const rows = data.results || data;
      setCategories(rows);
      setTotalCount(typeof data.count === "number" ? data.count : rows.length);
    } catch (err) {
      setError(err?.message || "Failed to load categories.");
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  const loadParentOptions = useCallback(async () => {
    try {
      const data = await fetchCategories({ page: 1, page_size: 100 });
      setParentOptions(data.results || data);
    } catch {
      // Non-blocking: parent list falls back to current page rows
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const openCreateModal = () => {
    setEditingCategory(null);
    setFormData(EMPTY_FORM);
    setFieldErrors({});
    setModalOpen(true);
    loadParentOptions();
  };

  const openEditModal = useCallback(
    (category) => {
      setEditingCategory(category);
      setFormData({
        name: category.name || "",
        name_km: category.name_km || "",
        slug: category.slug || "",
        parent: category.parent ? String(category.parent) : "",
        description: category.description || "",
        is_active: Boolean(category.is_active),
      });
      setFieldErrors({});
      setModalOpen(true);
      loadParentOptions();
    },
    [loadParentOptions]
  );

  const handleSearchChange = (value) => {
    setSearch(value);
    setPage(1);
  };

  const handleStatusFilterChange = (value) => {
    setStatusFilter(value);
    setPage(1);
  };

  const extractFieldErrors = (err) => {
    if (!err?.errors || typeof err.errors !== "object") return {};
    const mapped = {};
    for (const [key, val] of Object.entries(err.errors)) {
      mapped[key] = Array.isArray(val) ? val[0] : String(val);
    }
    return mapped;
  };

  const handleSave = async (event) => {
    event.preventDefault();
    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      setFieldErrors({ name: t("categories.nameRequired") });
      return;
    }

    setSaving(true);
    setFieldErrors({});
    try {
      const payload = {
        name: trimmedName,
        name_km: formData.name_km.trim(),
        description: formData.description.trim(),
        parent: formData.parent ? Number(formData.parent) : null,
        is_active: formData.is_active,
      };
      if (formData.slug.trim()) {
        payload.slug = formData.slug.trim();
      }

      if (editingCategory) {
        await updateCategory(editingCategory.id, payload);
        toast.success(t("categories.updatedToast"));
      } else {
        await createCategory(payload);
        toast.success(t("categories.createdToast"));
      }
      setModalOpen(false);
      await loadCategories();
    } catch (err) {
      const mapped = extractFieldErrors(err);
      if (Object.keys(mapped).length > 0) {
        setFieldErrors(mapped);
      }
      toast.error(err?.message || "Failed to save category.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = useCallback(
    async (category) => {
      const approved = await confirm({
        title: category.is_active
          ? t("categories.confirmDeactivateTitle")
          : t("categories.confirmActivateTitle"),
        message: category.is_active
          ? t("categories.confirmDeactivateMessage")
          : t("categories.confirmActivateMessage"),
        confirmLabel: category.is_active
          ? t("controls.deactivate")
          : t("controls.activate"),
        cancelLabel: t("controls.cancel"),
        variant: category.is_active ? "warning" : "success",
      });
      if (!approved) return;

      setBusyId(category.id);
      try {
        if (category.is_active) {
          await deactivateCategory(category.id);
          toast.success(t("categories.deactivatedToast"));
        } else {
          await activateCategory(category.id);
          toast.success(t("categories.activatedToast"));
        }
        await loadCategories();
      } catch (err) {
        toast.error(err?.message || "Failed to update status.");
      } finally {
        setBusyId(null);
      }
    },
    [confirm, loadCategories, t, toast]
  );

  const handleDelete = useCallback(
    async (category) => {
      const approved = await confirm({
        title: t("categories.confirmDeleteTitle"),
        message: `${t("categories.confirmDeleteMessage")} (${category.name})`,
        confirmLabel: t("controls.delete"),
        cancelLabel: t("controls.cancel"),
        variant: "danger",
      });
      if (!approved) return;

      setBusyId(category.id);
      try {
        await deleteCategory(category.id);
        toast.success(t("categories.deletedToast"));
        // Step back one page if deleting the final item on a non-first page
        if (categories.length === 1 && page > 1) {
          setPage((prev) => prev - 1);
        } else {
          await loadCategories();
        }
      } catch (err) {
        toast.error(err?.message || "Cannot delete category.");
      } finally {
        setBusyId(null);
      }
    },
    [categories.length, confirm, loadCategories, page, t, toast]
  );

  const selectableParents = useMemo(() => {
    const source = parentOptions.length > 0 ? parentOptions : categories;
    return [
      { value: "", label: t("categories.noParent") },
      ...source
        .filter((item) => !editingCategory || item.id !== editingCategory.id)
        .map((item) => ({
          value: String(item.id),
          label:
            language === "km" && item.name_km
              ? `${item.name_km} (${item.name})`
              : item.name,
        })),
    ];
  }, [categories, editingCategory, language, parentOptions, t]);

  const columns = useMemo(
    () => [
      {
        key: "name",
        header: t("categories.colCategory"),
        render: (cat) => (
          <div>
            <div className="fw-semibold d-flex flex-wrap align-items-center gap-2">
              <span>{language === "km" && cat.name_km ? cat.name_km : cat.name}</span>
              {cat.is_in_use && (
                <span className="badge text-bg-info">{t("categories.inUseBadge")}</span>
              )}
            </div>
            <div className="small text-body-secondary">
              {language === "km" && cat.name_km ? `${cat.name} · ` : cat.name_km ? `${cat.name_km} · ` : ""}
              <code>{cat.slug}</code>
            </div>
            {cat.description && (
              <div className="small text-body-secondary text-truncate" style={{ maxWidth: "320px" }}>
                {cat.description}
              </div>
            )}
          </div>
        ),
      },
      {
        key: "parent_name",
        header: t("categories.colParent"),
        render: (cat) =>
          cat.parent_name ? (
            <span className="badge text-bg-secondary">{cat.parent_name}</span>
          ) : (
            <span className="text-body-secondary small">—</span>
          ),
      },
      {
        key: "children_count",
        header: t("categories.colSubcategories"),
        cellClassName: "pos-tabular",
        render: (cat) => <span>{cat.children_count || 0}</span>,
      },
      {
        key: "is_active",
        header: t("categories.colStatus"),
        render: (cat) => (
          <span className={`badge ${cat.is_active ? "text-bg-success" : "text-bg-danger"}`}>
            {cat.is_active ? t("status.active") : t("status.inactive")}
          </span>
        ),
      },
      {
        key: "actions",
        header: t("categories.colActions"),
        headerClassName: "text-end",
        cellClassName: "text-end",
        render: (cat) => {
          const isBusy = busyId === cat.id;
          return (
            <div className="btn-group btn-group-sm">
              {canEdit && (
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  onClick={() => openEditModal(cat)}
                  disabled={isBusy}
                >
                  {t("controls.edit")}
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  className={`btn ${
                    cat.is_active ? "btn-outline-warning" : "btn-outline-success"
                  }`}
                  onClick={() => handleToggleStatus(cat)}
                  disabled={isBusy}
                >
                  {cat.is_active ? t("controls.deactivate") : t("controls.activate")}
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  className="btn btn-outline-danger"
                  onClick={() => handleDelete(cat)}
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
    [busyId, canDelete, canEdit, handleDelete, handleToggleStatus, language, openEditModal, t]
  );

  return (
    <div className="d-flex flex-column gap-4">
      <PageHeader
        icon="bi-diagram-3"
        title={t("categories.title")}
        subtitle={t("categories.subtitle")}
        actions={
          canCreate && (
            <button type="button" className="btn btn-primary" onClick={openCreateModal}>
              <i className="bi bi-plus-lg me-2" aria-hidden="true" />
              {t("categories.newCategory")}
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
              style={{ minWidth: "240px", flex: "1 1 240px" }}
              placeholder={t("categories.searchPlaceholder")}
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
            <select
              className="form-select form-select-sm"
              style={{ width: "160px" }}
              value={statusFilter}
              onChange={(e) => handleStatusFilterChange(e.target.value)}
              aria-label="Filter category status"
            >
              <option value="">{t("controls.allStatuses")}</option>
              <option value="true">{t("status.active")}</option>
              <option value="false">{t("status.inactive")}</option>
            </select>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={loadCategories}
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
          rows={categories}
          loading={loading}
          loadingMessage={t("categories.loading")}
          error={error}
          onRetry={loadCategories}
          emptyIcon="bi-diagram-3"
          emptyTitle={t("categories.emptyTitle")}
          emptyDescription={t("categories.emptyDescription")}
        />
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          totalCount={totalCount}
          onPageChange={setPage}
          previousLabel={t("controls.previous")}
          nextLabel={t("controls.next")}
        />
      </AppCard>

      <AppModal
        isOpen={modalOpen}
        title={
          editingCategory
            ? `${t("categories.editTitle")}: ${editingCategory.name}`
            : t("categories.createTitle")
        }
        size="md"
        onClose={() => setModalOpen(false)}
        disableClose={saving}
      >
        <form onSubmit={handleSave} noValidate className="d-flex flex-column gap-3">
          <FormInput
            id="categoryName"
            label={t("categories.nameLabel")}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            error={fieldErrors.name}
            required
            disabled={saving}
          />

          <FormInput
            id="categoryNameKm"
            label={t("categories.nameKmLabel")}
            value={formData.name_km}
            onChange={(e) => setFormData({ ...formData, name_km: e.target.value })}
            error={fieldErrors.name_km}
            disabled={saving}
          />

          <FormInput
            id="categorySlug"
            label={t("categories.slugLabel")}
            value={formData.slug}
            onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
            error={fieldErrors.slug}
            helpText={t("categories.slugHelp")}
            disabled={saving}
          />

          <FormSelect
            id="categoryParent"
            label={t("categories.parentLabel")}
            value={formData.parent}
            onChange={(e) => setFormData({ ...formData, parent: e.target.value })}
            options={selectableParents}
            error={fieldErrors.parent}
            disabled={saving}
          />

          <FormTextarea
            id="categoryDescription"
            label={t("categories.descriptionLabel")}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            error={fieldErrors.description}
            disabled={saving}
          />

          <div className="form-check form-switch">
            <input
              id="categoryActive"
              type="checkbox"
              className="form-check-input"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              disabled={saving}
            />
            <label htmlFor="categoryActive" className="form-check-label">
              {t("categories.activeLabel")}
            </label>
          </div>

          <div className="pt-2 border-top">
            <FormActions
              submitting={saving}
              submitLabel={t("controls.save")}
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
