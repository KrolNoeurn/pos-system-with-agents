import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import StatusAlert from "../components/StatusAlert";
import {
  AppCard,
  AppModal,
  DataTable,
  EmptyState,
  ErrorState,
  FormActions,
  FormInput,
  FormTextarea,
  LoadingState,
  PageHeader,
  Pagination,
} from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { usePreferences } from "../contexts/PreferencesContext";
import { useToast } from "../contexts/ToastContext";
import {
  activateSupplier,
  createSupplier,
  deactivateSupplier,
  fetchSuppliers,
  importSuppliersCsv,
  updateSupplier,
} from "../services/purchasingService";
import { extractApiError } from "../utils/apiError";

const PAGE_SIZE = 10;

const SUPPLIER_CSV_TEMPLATE =
  "name,contact_name,phone,email,address,is_active\n" +
  "Mekong Wholesale,Dara Sok,023555666,sales@mekong.com,Phnom Penh,true\n" +
  "Tonle Beverage Co,Bopha Lim,023777888,,Kandal,true\n";

const EMPTY_FORM = {
  name: "",
  contact_name: "",
  phone: "",
  email: "",
  address: "",
  is_active: true,
};

function downloadTemplate(filename, content) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export default function SuppliersPage() {
  const { hasPermission } = useAuth();
  const { t } = usePreferences();
  const { showToast } = useToast();

  const canCreate = hasPermission("suppliers.create");
  const canEdit = hasPermission("suppliers.edit");
  const canAdjustInventory = hasPermission("inventory.adjust");

  const [suppliers, setSuppliers] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create / Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // Import CSV modal
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importText, setImportText] = useState("");
  const [importErrors, setImportErrors] = useState([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = { page, page_size: PAGE_SIZE };
      if (debouncedSearch) params.search = debouncedSearch;
      if (statusFilter) params.is_active = statusFilter;
      const data = await fetchSuppliers(params);
      setSuppliers(data.results || []);
      setTotalCount(data.count ?? 0);
    } catch (err) {
      setError(extractApiError(err, "Unable to load suppliers."));
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      name: row.name || "",
      contact_name: row.contact_name || "",
      phone: row.phone || "",
      email: row.email || "",
      address: row.address || "",
      is_active: Boolean(row.is_active),
    });
    setFormError("");
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!form.name.trim()) {
      setFormError("Supplier name is required.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const payload = {
        name: form.name.trim(),
        contact_name: form.contact_name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        is_active: form.is_active,
      };
      if (editing) {
        await updateSupplier(editing.id, payload);
      } else {
        await createSupplier(payload);
      }
      setModalOpen(false);
      showToast({ variant: "success", message: t("purchasing.supplierSavedToast") });
      await loadSuppliers();
    } catch (err) {
      setFormError(extractApiError(err, "Unable to save supplier."));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (row) => {
    try {
      if (row.is_active) {
        await deactivateSupplier(row.id);
      } else {
        await activateSupplier(row.id);
      }
      showToast({ variant: "success", message: t("partners.statusUpdatedToast") });
      await loadSuppliers();
    } catch (err) {
      showToast({ variant: "danger", message: extractApiError(err, "Unable to update status.") });
    }
  };

  const handleImportSubmit = async (e) => {
    e.preventDefault();
    if (importing) return;
    if (!importFile && !importText.trim()) {
      setImportErrors(["Please choose a CSV file or paste CSV data."]);
      return;
    }
    setImporting(true);
    setImportErrors([]);
    try {
      const result = await importSuppliersCsv(importFile || importText);
      setImportOpen(false);
      setImportFile(null);
      setImportText("");
      showToast({
        variant: "success",
        message: `${t("partners.importCompletedToast")} (${result.created_count} created, ${result.updated_count} updated)`,
      });
      await loadSuppliers();
    } catch (err) {
      const rows = err?.response?.data?.rows;
      if (Array.isArray(rows) && rows.length > 0) {
        setImportErrors(rows);
      } else {
        setImportErrors([extractApiError(err, "CSV import failed.")]);
      }
    } finally {
      setImporting(false);
    }
  };

  const columns = [
    { key: "name", header: t("purchasing.supplierNameLabel"), cellClassName: "fw-semibold" },
    {
      key: "contact_name",
      header: t("purchasing.contactNameLabel"),
      render: (row) => row.contact_name || "—",
    },
    { key: "phone", header: t("purchasing.phoneLabel"), render: (row) => row.phone || "—" },
    { key: "email", header: t("purchasing.emailLabel"), render: (row) => row.email || "—" },
    {
      key: "purchases_count",
      header: t("purchasing.tabPurchases"),
      cellClassName: "pos-tabular",
    },
    {
      key: "is_active",
      header: t("purchasing.colStatus"),
      render: (row) => (
        <span className={`badge ${row.is_active ? "text-bg-success" : "text-bg-secondary"}`}>
          {row.is_active ? t("status.active") : t("status.inactive")}
        </span>
      ),
    },
    {
      key: "actions",
      header: t("purchasing.colActions"),
      headerClassName: "text-end",
      cellClassName: "text-end",
      render: (row) =>
        canEdit ? (
          <div className="btn-group btn-group-sm">
            <button
              type="button"
              className="btn btn-outline-primary"
              onClick={() => openEdit(row)}
            >
              {t("controls.edit")}
            </button>
            <button
              type="button"
              className={`btn ${row.is_active ? "btn-outline-warning" : "btn-outline-success"}`}
              onClick={() => handleToggleActive(row)}
            >
              {row.is_active ? t("controls.deactivate") : t("controls.activate")}
            </button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="d-flex flex-column gap-4">
      <PageHeader
        title={t("partners.suppliersTitle")}
        subtitle={t("partners.suppliersSubtitle")}
        icon="bi-building"
        actions={
          <div className="d-flex flex-wrap gap-2">
            {canAdjustInventory ? (
              <Link to="/inventory" className="btn btn-outline-secondary">
                <i className="bi bi-boxes me-2" aria-hidden="true" />
                {t("partners.goToInventoryImport")}
              </Link>
            ) : null}
            {canCreate ? (
              <>
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  onClick={() => {
                    setImportFile(null);
                    setImportText("");
                    setImportErrors([]);
                    setImportOpen(true);
                  }}
                >
                  <i className="bi bi-upload me-2" aria-hidden="true" />
                  {t("partners.importCsv")}
                </button>
                <button type="button" className="btn btn-primary" onClick={openCreate}>
                  <i className="bi bi-building-add me-2" aria-hidden="true" />
                  {t("purchasing.newSupplier")}
                </button>
              </>
            ) : null}
          </div>
        }
      />

      <AppCard
        bodyClassName="p-0"
        headerActions={
          <div className="d-flex flex-wrap gap-2 w-100">
            <input
              type="search"
              className="form-control form-control-sm"
              style={{ minWidth: "220px", flex: "1 1 220px" }}
              placeholder={t("partners.searchSuppliersPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              aria-label="Filter supplier status"
              className="form-select form-select-sm"
              style={{ width: "150px" }}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t("controls.allStatuses")}</option>
              <option value="true">{t("status.active")}</option>
              <option value="false">{t("status.inactive")}</option>
            </select>
          </div>
        }
      >
        {error ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={loadSuppliers} />
          </div>
        ) : loading ? (
          <LoadingState message={t("status.loading")} />
        ) : suppliers.length === 0 ? (
          <EmptyState icon="bi-building" title={t("purchasing.emptySuppliers")} />
        ) : (
          <>
            <DataTable columns={columns} rows={suppliers} rowKey="id" />
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              totalCount={totalCount}
              onPageChange={setPage}
              previousLabel={t("controls.previous")}
              nextLabel={t("controls.next")}
            />
          </>
        )}
      </AppCard>

      {/* Create / Edit Modal */}
      <AppModal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? t("purchasing.editSupplierTitle") : t("purchasing.createSupplierTitle")}
        size="md"
      >
        <form onSubmit={handleSave}>
          {formError ? (
            <StatusAlert
              variant="danger"
              message={formError}
              autoHideMs={6000}
              dismissible
              onClose={() => setFormError("")}
              className="py-2 small mb-3"
            />
          ) : null}
          <FormInput
            id="sup-ctrl-name"
            className="mb-3"
            label={t("purchasing.supplierNameLabel")}
            required
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          />
          <FormInput
            id="sup-ctrl-contact"
            className="mb-3"
            label={t("purchasing.contactNameLabel")}
            value={form.contact_name}
            onChange={(e) => setForm((p) => ({ ...p, contact_name: e.target.value }))}
          />
          <FormInput
            id="sup-ctrl-phone"
            className="mb-3"
            label={t("purchasing.phoneLabel")}
            value={form.phone}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
          />
          <FormInput
            id="sup-ctrl-email"
            className="mb-3"
            type="email"
            label={t("purchasing.emailLabel")}
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
          />
          <FormTextarea
            id="sup-ctrl-address"
            className="mb-3"
            label={t("purchasing.addressLabel")}
            rows={2}
            value={form.address}
            onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
          />
          <div className="form-check mb-3">
            <input
              id="sup-ctrl-active"
              type="checkbox"
              className="form-check-input"
              checked={form.is_active}
              onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
            />
            <label htmlFor="sup-ctrl-active" className="form-check-label">
              {t("purchasing.supplierActiveLabel")}
            </label>
          </div>
          <FormActions
            submitLabel={t("controls.save")}
            submittingLabel={t("controls.saving")}
            cancelLabel={t("controls.cancel")}
            onCancel={() => setModalOpen(false)}
            submitting={saving}
          />
        </form>
      </AppModal>

      {/* Import Suppliers CSV Modal */}
      <AppModal
        isOpen={importOpen}
        onClose={() => !importing && setImportOpen(false)}
        title={t("partners.importSuppliersTitle")}
        size="md"
      >
        <form onSubmit={handleImportSubmit}>
          <div className="alert alert-info py-2 small">{t("partners.importSuppliersHelp")}</div>
          {importErrors.length > 0 ? (
            <div className="alert alert-danger py-2 small">
              <ul className="mb-0 ps-3">
                {importErrors.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mb-3">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => downloadTemplate("suppliers_template.csv", SUPPLIER_CSV_TEMPLATE)}
            >
              <i className="bi bi-download me-1" aria-hidden="true" />
              {t("inventory.downloadTemplate")}
            </button>
          </div>

          <div className="mb-3">
            <label htmlFor="sup-csv-file" className="form-label fw-medium">
              {t("inventory.importFileLabel")}
            </label>
            <input
              id="sup-csv-file"
              type="file"
              accept=".csv,text/csv"
              className="form-control"
              onChange={(e) => setImportFile(e.target.files?.[0] || null)}
            />
          </div>

          <FormTextarea
            id="sup-csv-text"
            className="mb-3"
            label={t("inventory.importPasteLabel")}
            rows={5}
            placeholder={SUPPLIER_CSV_TEMPLATE}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />

          <FormActions
            submitLabel={t("partners.importCsv")}
            submittingLabel={t("inventory.importing")}
            cancelLabel={t("controls.cancel")}
            onCancel={() => setImportOpen(false)}
            submitting={importing}
          />
        </form>
      </AppModal>
    </div>
  );
}
