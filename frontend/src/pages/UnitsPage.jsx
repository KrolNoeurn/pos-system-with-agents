import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppCard,
  AppModal,
  DataTable,
  FormActions,
  FormInput,
  FormSelect,
  PageHeader,
  Pagination,
} from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { useConfirm } from "../contexts/ConfirmContext";
import { usePreferences } from "../contexts/PreferencesContext";
import { useToast } from "../contexts/ToastContext";
import {
  activateUnit,
  createUnit,
  deactivateUnit,
  deleteUnit,
  fetchUnits,
  updateUnit,
} from "../services/unitsService";

const PAGE_SIZE = 10;

const UNIT_TYPE_KEYS = [
  { value: "count", labelKey: "units.typeCount" },
  { value: "weight", labelKey: "units.typeWeight" },
  { value: "volume", labelKey: "units.typeVolume" },
  { value: "length", labelKey: "units.typeLength" },
  { value: "other", labelKey: "units.typeOther" },
];

const EMPTY_FORM = {
  name: "",
  name_km: "",
  abbreviation: "",
  unit_type: "count",
  allow_decimal: false,
  base_unit: "",
  conversion_factor: "1",
  is_active: true,
};

function formatFactor(raw) {
  const num = Number(raw);
  if (Number.isNaN(num)) return String(raw ?? "1");
  return num.toString();
}

export default function UnitsPage() {
  const { hasPermission } = useAuth();
  const { language, t } = usePreferences();
  const toast = useToast();
  const confirm = useConfirm();

  const canCreate = hasPermission("products.create");
  const canEdit = hasPermission("products.edit");
  const canDelete = hasPermission("products.delete");

  const [units, setUnits] = useState([]);
  const [allUnits, setAllUnits] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const unitTypeLabel = useCallback(
    (typeValue) => {
      const match = UNIT_TYPE_KEYS.find((item) => item.value === typeValue);
      return match ? t(match.labelKey) : typeValue;
    },
    [t]
  );

  const loadUnits = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = { page, page_size: PAGE_SIZE };
      if (search.trim()) params.search = search.trim();
      if (typeFilter) params.unit_type = typeFilter;
      if (statusFilter) params.is_active = statusFilter;

      const data = await fetchUnits(params);
      const rows = data.results || data;
      setUnits(rows);
      setTotalCount(typeof data.count === "number" ? data.count : rows.length);
    } catch (err) {
      setError(err?.message || "Failed to load units.");
    } finally {
      setLoading(false);
    }
  }, [page, search, typeFilter, statusFilter]);

  const loadBaseUnitOptions = useCallback(async () => {
    try {
      const data = await fetchUnits({ page: 1, page_size: 100 });
      setAllUnits(data.results || data);
    } catch {
      // Fall back to current page rows
    }
  }, []);

  useEffect(() => {
    loadUnits();
  }, [loadUnits]);

  const openCreateModal = () => {
    setEditingUnit(null);
    setFormData(EMPTY_FORM);
    setFieldErrors({});
    setModalOpen(true);
    loadBaseUnitOptions();
  };

  const openEditModal = useCallback(
    (unit) => {
      setEditingUnit(unit);
      setFormData({
        name: unit.name || "",
        name_km: unit.name_km || "",
        abbreviation: unit.abbreviation || "",
        unit_type: unit.unit_type || "count",
        allow_decimal: Boolean(unit.allow_decimal),
        base_unit: unit.base_unit ? String(unit.base_unit) : "",
        conversion_factor: formatFactor(unit.conversion_factor || "1"),
        is_active: Boolean(unit.is_active),
      });
      setFieldErrors({});
      setModalOpen(true);
      loadBaseUnitOptions();
    },
    [loadBaseUnitOptions]
  );

  const extractFieldErrors = (err) => {
    if (!err?.errors || typeof err.errors !== "object") return {};
    const mapped = {};
    for (const [key, val] of Object.entries(err.errors)) {
      mapped[key] = Array.isArray(val) ? val[0] : String(val);
    }
    return mapped;
  };

  const handleUnitTypeChange = (nextType) => {
    setFormData((prev) => ({
      ...prev,
      unit_type: nextType,
      base_unit: "",
      conversion_factor: "1",
    }));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    const errors = {};
    const cleanName = formData.name.trim();
    const cleanAbbr = formData.abbreviation.trim();
    const factorNum = Number(formData.conversion_factor);

    if (!cleanName) errors.name = t("units.nameRequired");
    if (!cleanAbbr) errors.abbreviation = t("units.abbreviationRequired");
    if (formData.base_unit && (!Number.isFinite(factorNum) || factorNum <= 0)) {
      errors.conversion_factor = t("units.factorInvalid");
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSaving(true);
    setFieldErrors({});
    try {
      const payload = {
        name: cleanName,
        name_km: formData.name_km.trim(),
        abbreviation: cleanAbbr,
        unit_type: formData.unit_type,
        allow_decimal: formData.allow_decimal,
        base_unit: formData.base_unit ? Number(formData.base_unit) : null,
        conversion_factor: formData.base_unit ? String(formData.conversion_factor).trim() : "1",
        is_active: formData.is_active,
      };

      if (editingUnit) {
        await updateUnit(editingUnit.id, payload);
        toast.success(t("units.updatedToast"));
      } else {
        await createUnit(payload);
        toast.success(t("units.createdToast"));
      }
      setModalOpen(false);
      await loadUnits();
    } catch (err) {
      const mapped = extractFieldErrors(err);
      if (Object.keys(mapped).length > 0) setFieldErrors(mapped);
      toast.error(err?.message || "Failed to save unit.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = useCallback(
    async (unit) => {
      const approved = await confirm({
        title: unit.is_active
          ? t("units.confirmDeactivateTitle")
          : t("units.confirmActivateTitle"),
        message: unit.is_active
          ? t("units.confirmDeactivateMessage")
          : t("units.confirmActivateMessage"),
        confirmLabel: unit.is_active ? t("controls.deactivate") : t("controls.activate"),
        cancelLabel: t("controls.cancel"),
        variant: unit.is_active ? "warning" : "success",
      });
      if (!approved) return;

      setBusyId(unit.id);
      try {
        if (unit.is_active) {
          await deactivateUnit(unit.id);
          toast.success(t("units.deactivatedToast"));
        } else {
          await activateUnit(unit.id);
          toast.success(t("units.activatedToast"));
        }
        await loadUnits();
      } catch (err) {
        toast.error(err?.message || "Failed to update unit status.");
      } finally {
        setBusyId(null);
      }
    },
    [confirm, loadUnits, t, toast]
  );

  const handleDelete = useCallback(
    async (unit) => {
      const approved = await confirm({
        title: t("units.confirmDeleteTitle"),
        message: `${t("units.confirmDeleteMessage")} (${unit.name} · ${unit.abbreviation})`,
        confirmLabel: t("controls.delete"),
        cancelLabel: t("controls.cancel"),
        variant: "danger",
      });
      if (!approved) return;

      setBusyId(unit.id);
      try {
        await deleteUnit(unit.id);
        toast.success(t("units.deletedToast"));
        if (units.length === 1 && page > 1) {
          setPage((prev) => prev - 1);
        } else {
          await loadUnits();
        }
      } catch (err) {
        toast.error(err?.message || "Cannot delete unit.");
      } finally {
        setBusyId(null);
      }
    },
    [confirm, loadUnits, page, t, toast, units.length]
  );

  const unitTypeOptions = useMemo(
    () => UNIT_TYPE_KEYS.map((item) => ({ value: item.value, label: t(item.labelKey) })),
    [t]
  );

  const compatibleBaseUnits = useMemo(() => {
    const source = allUnits.length > 0 ? allUnits : units;
    return [
      { value: "", label: t("units.noBaseUnit") },
      ...source
        .filter(
          (item) =>
            item.unit_type === formData.unit_type &&
            (!editingUnit || item.id !== editingUnit.id)
        )
        .map((item) => ({
          value: String(item.id),
          label: `${language === "km" && item.name_km ? item.name_km : item.name} (${item.abbreviation})`,
        })),
    ];
  }, [allUnits, editingUnit, formData.unit_type, language, t, units]);

  const columns = useMemo(
    () => [
      {
        key: "name",
        header: t("units.colUnit"),
        render: (u) => (
          <div>
            <div className="fw-semibold d-flex flex-wrap align-items-center gap-2">
              <span>{language === "km" && u.name_km ? u.name_km : u.name}</span>
              {u.is_in_use && (
                <span className="badge text-bg-info">{t("units.inUseBadge")}</span>
              )}
            </div>
            {(language === "km" ? u.name : u.name_km) && (
              <div className="small text-body-secondary">
                {language === "km" ? u.name : u.name_km}
              </div>
            )}
          </div>
        ),
      },
      {
        key: "abbreviation",
        header: t("units.colAbbreviation"),
        render: (u) => <code className="px-2 py-1 rounded border bg-body-tertiary">{u.abbreviation}</code>,
      },
      {
        key: "unit_type",
        header: t("units.colType"),
        render: (u) => (
          <span className="badge text-bg-secondary">{unitTypeLabel(u.unit_type)}</span>
        ),
      },
      {
        key: "conversion",
        header: t("units.colConversion"),
        cellClassName: "pos-tabular small",
        render: (u) =>
          u.base_unit_abbreviation ? (
            <span>
              1 {u.abbreviation} = {formatFactor(u.conversion_factor)} {u.base_unit_abbreviation}
            </span>
          ) : (
            <span className="text-body-secondary">{t("units.baseBadge")}</span>
          ),
      },
      {
        key: "is_active",
        header: t("units.colStatus"),
        render: (u) => (
          <span className={`badge ${u.is_active ? "text-bg-success" : "text-bg-danger"}`}>
            {u.is_active ? t("status.active") : t("status.inactive")}
          </span>
        ),
      },
      {
        key: "actions",
        header: t("units.colActions"),
        headerClassName: "text-end",
        cellClassName: "text-end",
        render: (u) => {
          const isBusy = busyId === u.id;
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
              {canEdit && (
                <button
                  type="button"
                  className={`btn ${
                    u.is_active ? "btn-outline-warning" : "btn-outline-success"
                  }`}
                  onClick={() => handleToggleStatus(u)}
                  disabled={isBusy}
                >
                  {u.is_active ? t("controls.deactivate") : t("controls.activate")}
                </button>
              )}
              {canDelete && (
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
    [busyId, canDelete, canEdit, handleDelete, handleToggleStatus, language, openEditModal, t, unitTypeLabel]
  );

  return (
    <div className="d-flex flex-column gap-4">
      <PageHeader
        icon="bi-rulers"
        title={t("units.title")}
        subtitle={t("units.subtitle")}
        actions={
          canCreate && (
            <button type="button" className="btn btn-primary" onClick={openCreateModal}>
              <i className="bi bi-plus-lg me-2" aria-hidden="true" />
              {t("units.newUnit")}
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
              placeholder={t("units.searchPlaceholder")}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            <select
              className="form-select form-select-sm"
              style={{ width: "150px" }}
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter unit type"
            >
              <option value="">{t("units.allTypes")}</option>
              {unitTypeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              className="form-select form-select-sm"
              style={{ width: "150px" }}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter unit status"
            >
              <option value="">{t("controls.allStatuses")}</option>
              <option value="true">{t("status.active")}</option>
              <option value="false">{t("status.inactive")}</option>
            </select>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={loadUnits}
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
          rows={units}
          loading={loading}
          loadingMessage={t("units.loading")}
          error={error}
          onRetry={loadUnits}
          emptyIcon="bi-rulers"
          emptyTitle={t("units.emptyTitle")}
          emptyDescription={t("units.emptyDescription")}
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
          editingUnit
            ? `${t("units.editTitle")}: ${editingUnit.name}`
            : t("units.createTitle")
        }
        size="md"
        onClose={() => setModalOpen(false)}
        disableClose={saving}
      >
        <form onSubmit={handleSave} noValidate className="d-flex flex-column gap-3">
          <div className="row g-3">
            <div className="col-12 col-md-7">
              <FormInput
                id="unitName"
                label={t("units.nameLabel")}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                error={fieldErrors.name}
                required
                disabled={saving}
              />
            </div>
            <div className="col-12 col-md-5">
              <FormInput
                id="unitAbbreviation"
                label={t("units.abbreviationLabel")}
                value={formData.abbreviation}
                onChange={(e) => setFormData({ ...formData, abbreviation: e.target.value })}
                error={fieldErrors.abbreviation}
                helpText={t("units.abbreviationHelp")}
                required
                disabled={saving}
              />
            </div>
          </div>

          <FormInput
            id="unitNameKm"
            label={t("units.nameKmLabel")}
            value={formData.name_km}
            onChange={(e) => setFormData({ ...formData, name_km: e.target.value })}
            error={fieldErrors.name_km}
            disabled={saving}
          />

          <FormSelect
            id="unitType"
            label={t("units.typeLabel")}
            value={formData.unit_type}
            onChange={(e) => handleUnitTypeChange(e.target.value)}
            options={unitTypeOptions}
            error={fieldErrors.unit_type}
            required
            disabled={saving}
          />

          <div className="row g-3">
            <div className="col-12 col-md-7">
              <FormSelect
                id="unitBaseUnit"
                label={t("units.baseUnitLabel")}
                value={formData.base_unit}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    base_unit: e.target.value,
                    conversion_factor: e.target.value ? formData.conversion_factor : "1",
                  })
                }
                options={compatibleBaseUnits}
                error={fieldErrors.base_unit}
                disabled={saving}
              />
            </div>
            <div className="col-12 col-md-5">
              <FormInput
                id="unitConversionFactor"
                label={t("units.conversionFactorLabel")}
                type="number"
                step="any"
                min="0.000001"
                value={formData.conversion_factor}
                onChange={(e) => setFormData({ ...formData, conversion_factor: e.target.value })}
                error={fieldErrors.conversion_factor}
                helpText={formData.base_unit ? t("units.conversionFactorHelp") : undefined}
                disabled={saving || !formData.base_unit}
              />
            </div>
          </div>

          <div className="d-flex flex-column gap-2">
            <div className="form-check form-switch">
              <input
                id="unitAllowDecimal"
                type="checkbox"
                className="form-check-input"
                checked={formData.allow_decimal}
                onChange={(e) => setFormData({ ...formData, allow_decimal: e.target.checked })}
                disabled={saving}
              />
              <label htmlFor="unitAllowDecimal" className="form-check-label">
                {t("units.allowDecimalLabel")}
              </label>
            </div>

            <div className="form-check form-switch">
              <input
                id="unitActive"
                type="checkbox"
                className="form-check-input"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                disabled={saving}
              />
              <label htmlFor="unitActive" className="form-check-label">
                {t("units.activeLabel")}
              </label>
            </div>
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
