import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import StatusAlert from "../components/StatusAlert";
import ReceiptModal from "../components/sales/ReceiptModal";
import {
  AppCard,
  AppModal,
  CustomerAvatar,
  CustomerAvatarField,
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
  cancelSale,
  createCustomer,
  fetchCustomers,
  fetchSale,
  fetchSales,
  refundSale,
  updateCustomer,
} from "../services/salesService";
import { extractApiError } from "../utils/apiError";

const PAGE_SIZE = 10;

function formatMoney(value) {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return "$0.00";
  return `$${num.toFixed(2)}`;
}

function formatDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const EMPTY_CUSTOMER_FORM = {
  name: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
  is_active: true,
  avatar: null,
  remove_avatar: false,
};

export default function SalesPage() {
  const { hasPermission } = useAuth();
  const { t } = usePreferences();
  const { showToast } = useToast();

  const canCreateSale = hasPermission("sales.create");
  const canCancelSale = hasPermission("sales.cancel");
  const canRefundSale = hasPermission("sales.refund");
  const canCreateCustomer = hasPermission("customers.create");
  const canEditCustomer = hasPermission("customers.edit");

  const [activeTab, setActiveTab] = useState("sales");

  // Sales History state
  const [sales, setSales] = useState([]);
  const [salesCount, setSalesCount] = useState(0);
  const [salesPage, setSalesPage] = useState(1);
  const [salesSearch, setSalesSearch] = useState("");
  const [debouncedSalesSearch, setDebouncedSalesSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [salesLoading, setSalesLoading] = useState(true);
  const [salesError, setSalesError] = useState("");

  // Receipt / Detail state
  const [selectedSale, setSelectedSale] = useState(null);

  // Void / Refund action modal state
  const [actionModal, setActionModal] = useState(null); // { type: 'cancel'|'refund', sale }
  const [actionReason, setActionReason] = useState("");
  const [actionError, setActionError] = useState("");
  const [submittingAction, setSubmittingAction] = useState(false);

  // Customers tab state
  const [customers, setCustomers] = useState([]);
  const [customersCount, setCustomersCount] = useState(0);
  const [customersPage, setCustomersPage] = useState(1);
  const [customersSearch, setCustomersSearch] = useState("");
  const [debouncedCustomersSearch, setDebouncedCustomersSearch] = useState("");
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState("");

  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [customerForm, setCustomerForm] = useState(EMPTY_CUSTOMER_FORM);
  const [customerFormError, setCustomerFormError] = useState("");
  const [savingCustomer, setSavingCustomer] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSalesSearch(salesSearch.trim());
      setSalesPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [salesSearch]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCustomersSearch(customersSearch.trim());
      setCustomersPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [customersSearch]);

  const loadSales = useCallback(async () => {
    setSalesLoading(true);
    setSalesError("");
    try {
      const params = { page: salesPage, page_size: PAGE_SIZE };
      if (debouncedSalesSearch) params.search = debouncedSalesSearch;
      if (statusFilter) params.status = statusFilter;
      if (paymentFilter) params.payment_method = paymentFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const data = await fetchSales(params);
      setSales(data.results || []);
      setSalesCount(data.count ?? 0);
    } catch (err) {
      setSalesError(extractApiError(err, "Unable to load sales history."));
    } finally {
      setSalesLoading(false);
    }
  }, [salesPage, debouncedSalesSearch, statusFilter, paymentFilter, dateFrom, dateTo]);

  const loadCustomers = useCallback(async () => {
    setCustomersLoading(true);
    setCustomersError("");
    try {
      const params = { page: customersPage, page_size: PAGE_SIZE };
      if (debouncedCustomersSearch) params.search = debouncedCustomersSearch;
      const data = await fetchCustomers(params);
      setCustomers(data.results || []);
      setCustomersCount(data.count ?? 0);
    } catch (err) {
      setCustomersError(extractApiError(err, "Unable to load customers."));
    } finally {
      setCustomersLoading(false);
    }
  }, [customersPage, debouncedCustomersSearch]);

  useEffect(() => {
    if (activeTab === "sales") {
      loadSales();
    } else {
      loadCustomers();
    }
  }, [activeTab, loadSales, loadCustomers]);

  const handleOpenReceipt = async (saleRow) => {
    try {
      const fullSale = await fetchSale(saleRow.id);
      setSelectedSale(fullSale);
    } catch (err) {
      showToast({
        variant: "danger",
        message: extractApiError(err, "Unable to load sale details."),
      });
    }
  };

  const openActionModal = (type, saleRow) => {
    setActionModal({ type, sale: saleRow });
    setActionReason("");
    setActionError("");
  };

  const handleSubmitAction = async (e) => {
    e.preventDefault();
    if (!actionModal || submittingAction) return;
    if (!actionReason.trim()) {
      setActionError(t("sales.reasonRequired"));
      return;
    }

    setSubmittingAction(true);
    setActionError("");
    try {
      if (actionModal.type === "cancel") {
        await cancelSale(actionModal.sale.id, actionReason.trim());
        showToast({ variant: "success", message: t("sales.saleCancelledToast") });
      } else {
        await refundSale(actionModal.sale.id, actionReason.trim());
        showToast({ variant: "success", message: t("sales.saleRefundedToast") });
      }
      setActionModal(null);
      await loadSales();
    } catch (err) {
      setActionError(extractApiError(err, "Unable to complete action."));
    } finally {
      setSubmittingAction(false);
    }
  };

  const openCreateCustomer = () => {
    setEditingCustomer(null);
    setCustomerForm(EMPTY_CUSTOMER_FORM);
    setCustomerFormError("");
    setCustomerModalOpen(true);
  };

  const openEditCustomer = (cust) => {
    setEditingCustomer(cust);
    setCustomerForm({
      name: cust.name || "",
      phone: cust.phone || "",
      email: cust.email || "",
      address: cust.address || "",
      notes: cust.notes || "",
      is_active: Boolean(cust.is_active),
      avatar: null,
      remove_avatar: false,
    });
    setCustomerFormError("");
    setCustomerModalOpen(true);
  };

  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    if (!customerForm.name.trim()) {
      setCustomerFormError("Customer name is required.");
      return;
    }
    setSavingCustomer(true);
    setCustomerFormError("");
    try {
      const payload = {
        name: customerForm.name.trim(),
        phone: customerForm.phone.trim(),
        email: customerForm.email.trim(),
        address: customerForm.address.trim(),
        notes: customerForm.notes.trim(),
        is_active: customerForm.is_active,
      };
      if (customerForm.avatar instanceof File) {
        payload.avatar = customerForm.avatar;
      } else if (editingCustomer && customerForm.remove_avatar) {
        payload.remove_avatar = true;
      }
      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, payload);
      } else {
        await createCustomer(payload);
      }
      setCustomerModalOpen(false);
      showToast({ variant: "success", message: t("sales.customerSavedToast") });
      await loadCustomers();
    } catch (err) {
      setCustomerFormError(extractApiError(err, "Unable to save customer."));
    } finally {
      setSavingCustomer(false);
    }
  };

  const statusBadge = (status) => {
    if (status === "completed") {
      return <span className="badge text-bg-success">{t("sales.statusCompleted")}</span>;
    }
    if (status === "refunded") {
      return <span className="badge text-bg-warning">{t("sales.statusRefunded")}</span>;
    }
    return <span className="badge text-bg-danger">{t("sales.statusCancelled")}</span>;
  };

  const paymentBadge = (method) => {
    if (method === "card") return t("sales.methodCard");
    if (method === "qr") return t("sales.methodQr");
    if (method === "split") return t("sales.methodSplit");
    return t("sales.methodCash");
  };

  const salesColumns = [
    {
      key: "sale_number",
      header: t("sales.colReceipt"),
      render: (row) => (
        <div>
          <code className="fw-semibold">{row.sale_number}</code>
          <div className="small text-body-secondary">{row.cashier_username}</div>
        </div>
      ),
    },
    {
      key: "customer_name_snapshot",
      header: t("sales.colCustomer"),
      render: (row) => {
        const displayName = row.customer_name_snapshot || t("sales.walkInCustomer");
        return (
          <div className="d-flex align-items-center gap-2">
            <CustomerAvatar
              name={row.customer ? displayName : ""}
              src={row.customer_avatar_url || ""}
              size="sm"
            />
            <span>{displayName}</span>
          </div>
        );
      },
    },
    {
      key: "created_at",
      header: t("sales.colDate"),
      cellClassName: "small pos-tabular",
      render: (row) => formatDateTime(row.created_at),
    },
    {
      key: "items_count",
      header: t("sales.colItems"),
      cellClassName: "pos-tabular",
    },
    {
      key: "payment_method",
      header: t("sales.colPayment"),
      render: (row) => <span className="badge text-bg-light border text-body">{paymentBadge(row.payment_method)}</span>,
    },
    {
      key: "total_amount",
      header: t("sales.colTotal"),
      cellClassName: "pos-tabular fw-semibold",
      render: (row) => formatMoney(row.total_amount),
    },
    {
      key: "status",
      header: t("sales.colStatus"),
      render: (row) => statusBadge(row.status),
    },
    {
      key: "actions",
      header: t("sales.colActions"),
      headerClassName: "text-end",
      cellClassName: "text-end",
      render: (row) => (
        <div className="btn-group btn-group-sm">
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => handleOpenReceipt(row)}
          >
            {t("sales.viewReceipt")}
          </button>
          {row.status === "completed" && canCancelSale ? (
            <button
              type="button"
              className="btn btn-outline-danger"
              onClick={() => openActionModal("cancel", row)}
            >
              {t("sales.cancelSale")}
            </button>
          ) : null}
          {row.status === "completed" && canRefundSale ? (
            <button
              type="button"
              className="btn btn-outline-warning"
              onClick={() => openActionModal("refund", row)}
            >
              {t("sales.refundSale")}
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  const customerColumns = [
    {
      key: "name",
      header: t("sales.customerNameLabel"),
      render: (row) => (
        <div className="d-flex align-items-center gap-2">
          <CustomerAvatar customer={row} size="md" />
          <span className="fw-semibold">{row.name}</span>
        </div>
      ),
    },
    { key: "phone", header: t("sales.phoneLabel"), render: (row) => row.phone || "—" },
    { key: "email", header: t("sales.emailLabel"), render: (row) => row.email || "—" },
    { key: "sales_count", header: t("sales.tabSales"), cellClassName: "pos-tabular" },
    {
      key: "is_active",
      header: t("sales.colStatus"),
      render: (row) => (
        <span className={`badge ${row.is_active ? "text-bg-success" : "text-bg-secondary"}`}>
          {row.is_active ? t("status.active") : t("status.inactive")}
        </span>
      ),
    },
    {
      key: "actions",
      header: t("sales.colActions"),
      headerClassName: "text-end",
      cellClassName: "text-end",
      render: (row) =>
        canEditCustomer ? (
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            onClick={() => openEditCustomer(row)}
          >
            {t("controls.edit")}
          </button>
        ) : null,
    },
  ];

  return (
    <div className="d-flex flex-column gap-4">
      <PageHeader
        title={t("sales.historyTitle")}
        subtitle={t("sales.historySubtitle")}
        icon="bi-receipt"
        actions={
          <div className="d-flex flex-wrap gap-2">
            {canCreateCustomer ? (
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={openCreateCustomer}
              >
                <i className="bi bi-person-plus me-2" aria-hidden="true" />
                {t("sales.newCustomer")}
              </button>
            ) : null}
            {canCreateSale ? (
              <Link to="/pos" className="btn btn-primary">
                <i className="bi bi-cash-register me-2" aria-hidden="true" />
                {t("sales.goToPos")}
              </Link>
            ) : null}
          </div>
        }
      />

      <ul className="nav nav-tabs" role="tablist">
        <li className="nav-item" role="presentation">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "sales"}
            className={`nav-link ${activeTab === "sales" ? "active fw-semibold" : ""}`}
            onClick={() => setActiveTab("sales")}
          >
            <i className="bi bi-receipt me-1" aria-hidden="true" />
            {t("sales.tabSales")}
          </button>
        </li>
        <li className="nav-item" role="presentation">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "customers"}
            className={`nav-link ${activeTab === "customers" ? "active fw-semibold" : ""}`}
            onClick={() => setActiveTab("customers")}
          >
            <i className="bi bi-people me-1" aria-hidden="true" />
            {t("sales.tabCustomers")}
          </button>
        </li>
      </ul>

      {activeTab === "sales" ? (
        <AppCard
          bodyClassName="p-0"
          headerActions={
            <div className="d-flex flex-wrap gap-2 w-100">
              <input
                type="search"
                className="form-control form-control-sm"
                style={{ minWidth: "210px", flex: "1 1 210px" }}
                placeholder={t("sales.searchSalesPlaceholder")}
                value={salesSearch}
                onChange={(e) => setSalesSearch(e.target.value)}
              />
              <select
                aria-label="Filter sale status"
                className="form-select form-select-sm"
                style={{ width: "145px" }}
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setSalesPage(1);
                }}
              >
                <option value="">{t("controls.allStatuses")}</option>
                <option value="completed">{t("sales.statusCompleted")}</option>
                <option value="cancelled">{t("sales.statusCancelled")}</option>
                <option value="refunded">{t("sales.statusRefunded")}</option>
              </select>
              <select
                aria-label="Filter payment method"
                className="form-select form-select-sm"
                style={{ width: "145px" }}
                value={paymentFilter}
                onChange={(e) => {
                  setPaymentFilter(e.target.value);
                  setSalesPage(1);
                }}
              >
                <option value="">{t("sales.allPaymentMethods")}</option>
                <option value="cash">{t("sales.methodCash")}</option>
                <option value="card">{t("sales.methodCard")}</option>
                <option value="qr">{t("sales.methodQr")}</option>
                <option value="split">{t("sales.methodSplit")}</option>
              </select>
              <input
                type="date"
                aria-label="Filter date from"
                className="form-control form-control-sm"
                style={{ width: "145px" }}
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setSalesPage(1);
                }}
              />
              <input
                type="date"
                aria-label="Filter date to"
                className="form-control form-control-sm"
                style={{ width: "145px" }}
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setSalesPage(1);
                }}
              />
            </div>
          }
        >
          {salesError ? (
            <div className="p-4">
              <ErrorState message={salesError} onRetry={loadSales} />
            </div>
          ) : salesLoading ? (
            <LoadingState message={t("status.loading")} />
          ) : sales.length === 0 ? (
            <EmptyState icon="bi-receipt" title={t("sales.emptySales")} />
          ) : (
            <>
              <DataTable columns={salesColumns} rows={sales} rowKey="id" />
              <Pagination
                page={salesPage}
                pageSize={PAGE_SIZE}
                totalCount={salesCount}
                onPageChange={setSalesPage}
                previousLabel={t("controls.previous")}
                nextLabel={t("controls.next")}
              />
            </>
          )}
        </AppCard>
      ) : (
        <AppCard
          bodyClassName="p-0"
          headerActions={
            <input
              type="search"
              className="form-control form-control-sm"
              style={{ minWidth: "240px" }}
              placeholder={t("controls.search")}
              value={customersSearch}
              onChange={(e) => setCustomersSearch(e.target.value)}
            />
          }
        >
          {customersError ? (
            <div className="p-4">
              <ErrorState message={customersError} onRetry={loadCustomers} />
            </div>
          ) : customersLoading ? (
            <LoadingState message={t("status.loading")} />
          ) : customers.length === 0 ? (
            <EmptyState icon="bi-people" title={t("sales.emptyCustomers")} />
          ) : (
            <>
              <DataTable columns={customerColumns} rows={customers} rowKey="id" />
              <Pagination
                page={customersPage}
                pageSize={PAGE_SIZE}
                totalCount={customersCount}
                onPageChange={setCustomersPage}
                previousLabel={t("controls.previous")}
                nextLabel={t("controls.next")}
              />
            </>
          )}
        </AppCard>
      )}

      {/* Receipt Modal */}
      <ReceiptModal
        isOpen={Boolean(selectedSale)}
        sale={selectedSale}
        onClose={() => setSelectedSale(null)}
      />

      {/* Cancel / Refund Reason Modal */}
      <AppModal
        isOpen={Boolean(actionModal)}
        onClose={() => !submittingAction && setActionModal(null)}
        title={
          actionModal?.type === "cancel"
            ? `${t("sales.cancelModalTitle")} — ${actionModal.sale.sale_number}`
            : `${t("sales.refundModalTitle")} — ${actionModal?.sale?.sale_number || ""}`
        }
        size="md"
      >
        <form onSubmit={handleSubmitAction}>
          <div
            className={`alert ${
              actionModal?.type === "cancel" ? "alert-danger" : "alert-warning"
            } py-2 small`}
          >
            {actionModal?.type === "cancel" ? t("sales.cancelNotice") : t("sales.refundNotice")}
          </div>
          {actionError ? (
            <StatusAlert
              variant="danger"
              message={actionError}
              autoHideMs={6000}
              dismissible
              onClose={() => setActionError("")}
              className="py-2 small mb-3"
            />
          ) : null}
          <FormTextarea
            id="sale-action-reason"
            className="mb-3"
            label={t("sales.reasonLabel")}
            required
            rows={3}
            value={actionReason}
            onChange={(e) => setActionReason(e.target.value)}
          />
          <FormActions
            submitLabel={
              actionModal?.type === "cancel" ? t("sales.cancelSale") : t("sales.refundSale")
            }
            cancelLabel={t("controls.cancel")}
            onCancel={() => setActionModal(null)}
            submitting={submittingAction}
          />
        </form>
      </AppModal>

      {/* Customer Create / Edit Modal */}
      <AppModal
        isOpen={customerModalOpen}
        onClose={() => !savingCustomer && setCustomerModalOpen(false)}
        title={editingCustomer ? t("sales.editCustomerTitle") : t("sales.createCustomerTitle")}
        size="md"
      >
        <form onSubmit={handleSaveCustomer}>
          {customerFormError ? (
            <StatusAlert
              variant="danger"
              message={customerFormError}
              autoHideMs={6000}
              dismissible
              onClose={() => setCustomerFormError("")}
              className="py-2 small mb-3"
            />
          ) : null}
          <div className="mb-3">
            <CustomerAvatarField
              inputId="sales-customer-avatar"
              customer={editingCustomer}
              name={customerForm.name}
              file={customerForm.avatar}
              removeAvatar={customerForm.remove_avatar}
              disabled={savingCustomer}
              onFileSelect={(picked) =>
                setCustomerForm((p) => ({ ...p, avatar: picked, remove_avatar: false }))
              }
              onRemove={() =>
                setCustomerForm((p) => ({ ...p, avatar: null, remove_avatar: true }))
              }
              onValidationError={(msg) => setCustomerFormError(msg)}
              t={t}
            />
          </div>
          <FormInput
            id="customer-name"
            className="mb-3"
            label={t("sales.customerNameLabel")}
            required
            value={customerForm.name}
            onChange={(e) => setCustomerForm((p) => ({ ...p, name: e.target.value }))}
          />
          <FormInput
            id="customer-phone"
            className="mb-3"
            label={t("sales.phoneLabel")}
            value={customerForm.phone}
            onChange={(e) => setCustomerForm((p) => ({ ...p, phone: e.target.value }))}
          />
          <FormInput
            id="customer-email"
            className="mb-3"
            type="email"
            label={t("sales.emailLabel")}
            value={customerForm.email}
            onChange={(e) => setCustomerForm((p) => ({ ...p, email: e.target.value }))}
          />
          <FormTextarea
            id="customer-address"
            className="mb-3"
            label={t("sales.addressLabel")}
            rows={2}
            value={customerForm.address}
            onChange={(e) => setCustomerForm((p) => ({ ...p, address: e.target.value }))}
          />
          <FormTextarea
            id="customer-notes"
            className="mb-3"
            label={t("sales.notesLabel")}
            rows={2}
            value={customerForm.notes}
            onChange={(e) => setCustomerForm((p) => ({ ...p, notes: e.target.value }))}
          />
          <div className="form-check mb-3">
            <input
              id="customer-active"
              type="checkbox"
              className="form-check-input"
              checked={customerForm.is_active}
              onChange={(e) => setCustomerForm((p) => ({ ...p, is_active: e.target.checked }))}
            />
            <label htmlFor="customer-active" className="form-check-label">
              {t("sales.customerActiveLabel")}
            </label>
          </div>
          <FormActions
            submitLabel={t("controls.save")}
            cancelLabel={t("controls.cancel")}
            onCancel={() => setCustomerModalOpen(false)}
            submitting={savingCustomer}
          />
        </form>
      </AppModal>
    </div>
  );
}
