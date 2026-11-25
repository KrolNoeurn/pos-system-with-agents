import { useCallback, useEffect, useMemo, useState } from "react";
import StatusAlert from "../components/StatusAlert";
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
  SupplierAvatar,
  SupplierAvatarField,
} from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { useConfirm } from "../contexts/ConfirmContext";
import { usePreferences } from "../contexts/PreferencesContext";
import { useToast } from "../contexts/ToastContext";
import { fetchProducts } from "../services/productsService";
import {
  cancelPurchase,
  createPurchase,
  createSupplier,
  fetchPurchase,
  fetchPurchases,
  fetchSuppliers,
  receivePurchase,
  updatePurchase,
  updateSupplier,
} from "../services/purchasingService";

const PAGE_SIZE = 10;

const todayISO = () => new Date().toISOString().slice(0, 10);

const EMPTY_PO_FORM = {
  supplier: "",
  purchase_date: todayISO(),
  expected_date: "",
  status: "draft",
  discount_amount: "0.00",
  notes: "",
  items: [{ product: "", quantity: "1", unit_cost: "0.00" }],
};

const EMPTY_SUPPLIER_FORM = {
  name: "",
  contact_name: "",
  phone: "",
  email: "",
  address: "",
  is_active: true,
  avatar: null,
  remove_avatar: false,
};

function formatMoney(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return "$0.00";
  return `$${num.toFixed(2)}`;
}

function formatQty(value) {
  const num = Number(value);
  return Number.isNaN(num) ? String(value ?? "0") : num.toString();
}

export default function PurchasingPage() {
  const { hasPermission } = useAuth();
  const { language, t } = usePreferences();
  const toast = useToast();
  const confirm = useConfirm();

  const canCreatePurchase = hasPermission("purchases.create");
  const canReceive = hasPermission("purchases.receive");
  const canCancel = hasPermission("purchases.cancel");
  const canCreateSupplier = hasPermission("suppliers.create");
  const canEditSupplier = hasPermission("suppliers.edit");

  const [activeTab, setActiveTab] = useState("purchases"); // purchases | suppliers

  // Purchases state
  const [purchases, setPurchases] = useState([]);
  const [purchasesCount, setPurchasesCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  // Suppliers & Products lookups
  const [suppliers, setSuppliers] = useState([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [products, setProducts] = useState([]);

  // Detail modal
  const [detailPurchase, setDetailPurchase] = useState(null);

  // Purchase Create/Edit modal
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [poForm, setPoForm] = useState(EMPTY_PO_FORM);
  const [poErrors, setPoErrors] = useState({});
  const [savingPo, setSavingPo] = useState(false);

  // Supplier Create/Edit modal
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [supplierForm, setSupplierForm] = useState(EMPTY_SUPPLIER_FORM);
  const [savingSupplier, setSavingSupplier] = useState(false);

  const loadSuppliers = useCallback(async () => {
    setSuppliersLoading(true);
    try {
      const data = await fetchSuppliers({ page: 1, page_size: 100 });
      setSuppliers(data.results || data);
    } catch {
      // Non-blocking
    } finally {
      setSuppliersLoading(false);
    }
  }, []);

  const loadProducts = useCallback(async () => {
    try {
      const data = await fetchProducts({ page: 1, page_size: 100, is_active: "true" });
      setProducts(data.results || data);
    } catch {
      // Non-blocking
    }
  }, []);

  const loadPurchases = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = { page, page_size: PAGE_SIZE };
      if (search.trim()) params.search = search.trim();
      if (supplierFilter) params.supplier = supplierFilter;
      if (statusFilter) params.status = statusFilter;

      const data = await fetchPurchases(params);
      const rows = data.results || data;
      setPurchases(rows);
      setPurchasesCount(typeof data.count === "number" ? data.count : rows.length);
    } catch (err) {
      setError(err?.message || "Failed to load purchase orders.");
    } finally {
      setLoading(false);
    }
  }, [page, search, supplierFilter, statusFilter]);

  useEffect(() => {
    loadSuppliers();
    loadProducts();
  }, [loadSuppliers, loadProducts]);

  useEffect(() => {
    loadPurchases();
  }, [loadPurchases]);

  const statusBadge = useCallback(
    (st) => {
      if (st === "received") {
        return <span className="badge text-bg-success">{t("purchasing.statusReceived")}</span>;
      }
      if (st === "cancelled") {
        return <span className="badge text-bg-danger">{t("purchasing.statusCancelled")}</span>;
      }
      if (st === "ordered") {
        return <span className="badge text-bg-primary">{t("purchasing.statusOrdered")}</span>;
      }
      return <span className="badge text-bg-secondary">{t("purchasing.statusDraft")}</span>;
    },
    [t]
  );

  const openDetail = useCallback(async (purchaseRow) => {
    try {
      const full = await fetchPurchase(purchaseRow.id);
      setDetailPurchase(full);
    } catch (err) {
      toast.error(err?.message || "Failed to load purchase details.");
    }
  }, [toast]);

  const openCreatePoModal = () => {
    setEditingPurchase(null);
    setPoForm({
      ...EMPTY_PO_FORM,
      purchase_date: todayISO(),
      items: [{ product: "", quantity: "1", unit_cost: "0.00" }],
    });
    setPoErrors({});
    setPoModalOpen(true);
  };

  const openEditPoModal = useCallback(async (purchaseRow) => {
    try {
      const full = await fetchPurchase(purchaseRow.id);
      setEditingPurchase(full);
      setPoForm({
        supplier: String(full.supplier),
        purchase_date: full.purchase_date || todayISO(),
        expected_date: full.expected_date || "",
        status: full.status === "ordered" ? "ordered" : "draft",
        discount_amount: String(full.discount_amount || "0.00"),
        notes: full.notes || "",
        items: (full.items || []).map((item) => ({
          product: String(item.product),
          quantity: formatQty(item.quantity),
          unit_cost: String(item.unit_cost),
        })),
      });
      setPoErrors({});
      setPoModalOpen(true);
    } catch (err) {
      toast.error(err?.message || "Failed to load purchase for editing.");
    }
  }, [toast]);

  const handleItemChange = (index, field, value) => {
    setPoForm((prev) => {
      const nextItems = prev.items.map((item, idx) => {
        if (idx !== index) return item;
        const updated = { ...item, [field]: value };
        if (field === "product") {
          const matched = products.find((p) => String(p.id) === value);
          if (matched) {
            updated.unit_cost = String(matched.purchase_cost ?? "0.00");
          }
        }
        return updated;
      });
      return { ...prev, items: nextItems };
    });
  };

  const addItemRow = () => {
    setPoForm((prev) => ({
      ...prev,
      items: [...prev.items, { product: "", quantity: "1", unit_cost: "0.00" }],
    }));
  };

  const removeItemRow = (index) => {
    setPoForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, idx) => idx !== index),
    }));
  };

  // Client-side preview totals (authoritative totals computed server-side in Decimal)
  const previewTotals = useMemo(() => {
    const subtotal = poForm.items.reduce((sum, item) => {
      const qty = Number(item.quantity);
      const cost = Number(item.unit_cost);
      if (!Number.isFinite(qty) || !Number.isFinite(cost) || qty < 0 || cost < 0) return sum;
      return sum + qty * cost;
    }, 0);
    const discount = Math.max(0, Number(poForm.discount_amount) || 0);
    const total = Math.max(0, subtotal - discount);
    return { subtotal, discount, total };
  }, [poForm.items, poForm.discount_amount]);

  const handleSavePurchase = async (event) => {
    event.preventDefault();
    const errors = {};
    if (!poForm.supplier) errors.supplier = t("purchasing.supplierRequired");

    const validItems = poForm.items.filter(
      (item) =>
        item.product &&
        Number.isFinite(Number(item.quantity)) &&
        Number(item.quantity) > 0 &&
        Number.isFinite(Number(item.unit_cost)) &&
        Number(item.unit_cost) >= 0
    );
    if (validItems.length === 0 || validItems.length !== poForm.items.length) {
      errors.items = t("purchasing.itemsRequired");
    }

    const discountNum = Number(poForm.discount_amount || 0);
    if (!Number.isFinite(discountNum) || discountNum < 0 || discountNum > previewTotals.subtotal) {
      errors.discount_amount = t("purchasing.discountInvalid");
    }

    if (Object.keys(errors).length > 0) {
      setPoErrors(errors);
      return;
    }

    setSavingPo(true);
    setPoErrors({});
    try {
      const payload = {
        supplier: Number(poForm.supplier),
        purchase_date: poForm.purchase_date,
        expected_date: poForm.expected_date || null,
        status: poForm.status,
        discount_amount: String(poForm.discount_amount || "0.00").trim(),
        notes: poForm.notes.trim(),
        items: validItems.map((item) => ({
          product: Number(item.product),
          quantity: String(item.quantity).trim(),
          unit_cost: String(item.unit_cost).trim(),
        })),
      };

      if (editingPurchase) {
        await updatePurchase(editingPurchase.id, payload);
        toast.success(t("purchasing.updatedToast"));
      } else {
        await createPurchase(payload);
        toast.success(t("purchasing.createdToast"));
      }
      setPoModalOpen(false);
      await loadPurchases();
    } catch (err) {
      toast.error(err?.message || "Failed to save purchase order.");
    } finally {
      setSavingPo(false);
    }
  };

  const handleReceive = useCallback(
    async (purchaseRow) => {
      const approved = await confirm({
        title: t("purchasing.confirmReceiveTitle"),
        message: `${t("purchasing.confirmReceiveMessage")} (${purchaseRow.purchase_number})`,
        confirmLabel: t("purchasing.receiveGoods"),
        cancelLabel: t("controls.cancel"),
        variant: "success",
      });
      if (!approved) return;

      setBusyId(purchaseRow.id);
      try {
        const updated = await receivePurchase(purchaseRow.id, {});
        toast.success(t("purchasing.receivedToast"));
        if (detailPurchase?.id === purchaseRow.id) {
          setDetailPurchase(updated);
        }
        await loadPurchases();
      } catch (err) {
        toast.error(err?.message || "Failed to receive purchase goods.");
      } finally {
        setBusyId(null);
      }
    },
    [confirm, detailPurchase, loadPurchases, t, toast]
  );

  const handleCancel = useCallback(
    async (purchaseRow) => {
      const approved = await confirm({
        title: t("purchasing.confirmCancelTitle"),
        message: `${t("purchasing.confirmCancelMessage")} (${purchaseRow.purchase_number})`,
        confirmLabel: t("purchasing.cancelPurchase"),
        cancelLabel: t("controls.cancel"),
        variant: "danger",
      });
      if (!approved) return;

      setBusyId(purchaseRow.id);
      try {
        const updated = await cancelPurchase(purchaseRow.id, {});
        toast.success(t("purchasing.cancelledToast"));
        if (detailPurchase?.id === purchaseRow.id) {
          setDetailPurchase(updated);
        }
        await loadPurchases();
      } catch (err) {
        toast.error(err?.message || "Failed to cancel purchase.");
      } finally {
        setBusyId(null);
      }
    },
    [confirm, detailPurchase, loadPurchases, t, toast]
  );

  const openSupplierModal = (sup = null) => {
    setEditingSupplier(sup);
    setSupplierForm(
      sup
        ? {
            name: sup.name || "",
            contact_name: sup.contact_name || "",
            phone: sup.phone || "",
            email: sup.email || "",
            address: sup.address || "",
            is_active: Boolean(sup.is_active),
            avatar: null,
            remove_avatar: false,
          }
        : EMPTY_SUPPLIER_FORM
    );
    setSupplierModalOpen(true);
  };

  const handleSaveSupplier = async (event) => {
    event.preventDefault();
    if (!supplierForm.name.trim()) return;
    setSavingSupplier(true);
    try {
      const payload = {
        name: supplierForm.name.trim(),
        contact_name: supplierForm.contact_name.trim(),
        phone: supplierForm.phone.trim(),
        email: supplierForm.email.trim(),
        address: supplierForm.address.trim(),
        is_active: supplierForm.is_active,
      };
      if (supplierForm.avatar instanceof File) {
        payload.avatar = supplierForm.avatar;
      } else if (editingSupplier && supplierForm.remove_avatar) {
        payload.remove_avatar = true;
      }
      if (editingSupplier) {
        await updateSupplier(editingSupplier.id, payload);
      } else {
        await createSupplier(payload);
      }
      toast.success(t("purchasing.supplierSavedToast"));
      setSupplierModalOpen(false);
      await loadSuppliers();
    } catch (err) {
      toast.error(err?.message || "Failed to save supplier.");
    } finally {
      setSavingSupplier(false);
    }
  };

  const purchaseColumns = useMemo(
    () => [
      {
        key: "purchase_number",
        header: t("purchasing.colPoNumber"),
        render: (row) => (
          <div>
            <code className="fw-semibold">{row.purchase_number}</code>
            <div className="small text-body-secondary">{row.created_by_username}</div>
          </div>
        ),
      },
      {
        key: "supplier_name",
        header: t("purchasing.colSupplier"),
        render: (row) => (
          <div className="d-flex align-items-center gap-2">
            <SupplierAvatar
              name={row.supplier_name}
              src={row.supplier_avatar_url || ""}
              size="sm"
            />
            <span>{row.supplier_name}</span>
          </div>
        ),
      },
      {
        key: "purchase_date",
        header: t("purchasing.colDate"),
        cellClassName: "pos-tabular small",
      },
      {
        key: "items_count",
        header: t("purchasing.colItems"),
        cellClassName: "pos-tabular",
      },
      {
        key: "total_amount",
        header: t("purchasing.colTotal"),
        cellClassName: "pos-tabular fw-semibold",
        render: (row) => formatMoney(row.total_amount),
      },
      {
        key: "status",
        header: t("purchasing.colStatus"),
        render: (row) => statusBadge(row.status),
      },
      {
        key: "actions",
        header: t("purchasing.colActions"),
        headerClassName: "text-end",
        cellClassName: "text-end",
        render: (row) => {
          const isOpen = row.status === "draft" || row.status === "ordered";
          const isBusy = busyId === row.id;
          return (
            <div className="btn-group btn-group-sm">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => openDetail(row)}
              >
                {t("purchasing.view")}
              </button>
              {isOpen && canCreatePurchase && (
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  onClick={() => openEditPoModal(row)}
                  disabled={isBusy}
                >
                  {t("controls.edit")}
                </button>
              )}
              {isOpen && canReceive && (
                <button
                  type="button"
                  className="btn btn-outline-success"
                  onClick={() => handleReceive(row)}
                  disabled={isBusy}
                >
                  {t("purchasing.receiveGoods")}
                </button>
              )}
              {isOpen && canCancel && (
                <button
                  type="button"
                  className="btn btn-outline-danger"
                  onClick={() => handleCancel(row)}
                  disabled={isBusy}
                >
                  {t("purchasing.cancelPurchase")}
                </button>
              )}
            </div>
          );
        },
      },
    ],
    [
      busyId,
      canCancel,
      canCreatePurchase,
      canReceive,
      handleCancel,
      handleReceive,
      openDetail,
      openEditPoModal,
      statusBadge,
      t,
    ]
  );

  const activeSuppliersOptions = useMemo(
    () => [
      { value: "", label: t("purchasing.selectSupplier") },
      ...suppliers
        .filter((s) => s.is_active || String(s.id) === poForm.supplier)
        .map((s) => ({ value: String(s.id), label: s.name })),
    ],
    [poForm.supplier, suppliers, t]
  );

  return (
    <div className="d-flex flex-column gap-4">
      <PageHeader
        icon="bi-truck"
        title={t("purchasing.title")}
        subtitle={t("purchasing.subtitle")}
        actions={
          <>
            {canCreateSupplier && (
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => openSupplierModal(null)}
              >
                <i className="bi bi-building-add me-2" aria-hidden="true" />
                {t("purchasing.newSupplier")}
              </button>
            )}
            {canCreatePurchase && (
              <button type="button" className="btn btn-primary" onClick={openCreatePoModal}>
                <i className="bi bi-plus-lg me-2" aria-hidden="true" />
                {t("purchasing.newPurchase")}
              </button>
            )}
          </>
        }
      />

      <ul className="nav nav-tabs" role="tablist">
        <li className="nav-item" role="presentation">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "purchases"}
            className={`nav-link${activeTab === "purchases" ? " active fw-semibold" : ""}`}
            onClick={() => setActiveTab("purchases")}
          >
            <i className="bi bi-receipt-cutoff me-1" aria-hidden="true" />
            {t("purchasing.tabPurchases")}
          </button>
        </li>
        <li className="nav-item" role="presentation">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "suppliers"}
            className={`nav-link${activeTab === "suppliers" ? " active fw-semibold" : ""}`}
            onClick={() => setActiveTab("suppliers")}
          >
            <i className="bi bi-building me-1" aria-hidden="true" />
            {t("purchasing.tabSuppliers")} ({suppliers.length})
          </button>
        </li>
      </ul>

      {/* Tab 1: Purchase History */}
      {activeTab === "purchases" && (
        <AppCard
          noPadding
          headerActions={
            <div className="d-flex flex-wrap gap-2 w-100">
              <input
                type="search"
                className="form-control form-control-sm"
                style={{ minWidth: "220px", flex: "1 1 220px" }}
                placeholder={t("purchasing.searchPlaceholder")}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
              <select
                className="form-select form-select-sm"
                style={{ width: "170px" }}
                value={supplierFilter}
                onChange={(e) => {
                  setSupplierFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter supplier"
              >
                <option value="">{t("purchasing.allSuppliers")}</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name}
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
                aria-label="Filter purchase status"
              >
                <option value="">{t("purchasing.allStatuses")}</option>
                <option value="draft">{t("purchasing.statusDraft")}</option>
                <option value="ordered">{t("purchasing.statusOrdered")}</option>
                <option value="received">{t("purchasing.statusReceived")}</option>
                <option value="cancelled">{t("purchasing.statusCancelled")}</option>
              </select>
            </div>
          }
        >
          <DataTable
            columns={purchaseColumns}
            rows={purchases}
            loading={loading}
            error={error}
            onRetry={loadPurchases}
            emptyIcon="bi-receipt-cutoff"
            emptyTitle={t("purchasing.emptyPurchases")}
          />
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            totalCount={purchasesCount}
            onPageChange={setPage}
            previousLabel={t("controls.previous")}
            nextLabel={t("controls.next")}
          />
        </AppCard>
      )}

      {/* Tab 2: Suppliers */}
      {activeTab === "suppliers" && (
        <AppCard noPadding>
          <DataTable
            loading={suppliersLoading}
            rows={suppliers}
            emptyIcon="bi-building"
            emptyTitle={t("purchasing.emptySuppliers")}
            columns={[
              {
                key: "name",
                header: t("purchasing.supplierNameLabel"),
                render: (s) => (
                  <div className="d-flex align-items-center gap-2">
                    <SupplierAvatar supplier={s} size="md" />
                    <div>
                      <div className="fw-semibold">{s.name}</div>
                      {s.contact_name && (
                        <div className="small text-body-secondary">{s.contact_name}</div>
                      )}
                    </div>
                  </div>
                ),
              },
              { key: "phone", header: t("purchasing.phoneLabel"), cellClassName: "small" },
              { key: "email", header: t("purchasing.emailLabel"), cellClassName: "small" },
              {
                key: "is_active",
                header: t("purchasing.colStatus"),
                render: (s) => (
                  <span className={`badge ${s.is_active ? "text-bg-success" : "text-bg-danger"}`}>
                    {s.is_active ? t("status.active") : t("status.inactive")}
                  </span>
                ),
              },
              ...(canEditSupplier
                ? [
                    {
                      key: "actions",
                      header: t("purchasing.colActions"),
                      headerClassName: "text-end",
                      cellClassName: "text-end",
                      render: (s) => (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => openSupplierModal(s)}
                        >
                          {t("controls.edit")}
                        </button>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </AppCard>
      )}

      {/* Purchase Detail Modal */}
      <AppModal
        isOpen={Boolean(detailPurchase)}
        title={
          detailPurchase
            ? `${t("purchasing.detailTitle")}: ${detailPurchase.purchase_number}`
            : ""
        }
        size="lg"
        onClose={() => setDetailPurchase(null)}
        footer={
          detailPurchase && (
            <div className="d-flex flex-wrap justify-content-end gap-2">
              {(detailPurchase.status === "draft" || detailPurchase.status === "ordered") &&
                canReceive && (
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={() => handleReceive(detailPurchase)}
                    disabled={busyId === detailPurchase.id}
                  >
                    <i className="bi bi-box-arrow-in-down me-1" aria-hidden="true" />
                    {t("purchasing.receiveGoods")}
                  </button>
                )}
              {(detailPurchase.status === "draft" || detailPurchase.status === "ordered") &&
                canCancel && (
                  <button
                    type="button"
                    className="btn btn-outline-danger"
                    onClick={() => handleCancel(detailPurchase)}
                    disabled={busyId === detailPurchase.id}
                  >
                    {t("purchasing.cancelPurchase")}
                  </button>
                )}
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setDetailPurchase(null)}
              >
                {t("controls.close")}
              </button>
            </div>
          )
        }
      >
        {detailPurchase && (
          <div className="d-flex flex-column gap-3">
            <div className="row g-2 small">
              <div className="col-6 col-md-3">
                <div className="text-body-secondary">{t("purchasing.colStatus")}</div>
                <div>{statusBadge(detailPurchase.status)}</div>
              </div>
              <div className="col-6 col-md-3">
                <div className="text-body-secondary">{t("purchasing.colSupplier")}</div>
                <div className="d-flex align-items-center gap-2 mt-1">
                  <SupplierAvatar
                    name={detailPurchase.supplier_name}
                    src={detailPurchase.supplier_avatar_url || ""}
                    size="sm"
                  />
                  <span className="fw-semibold">{detailPurchase.supplier_name}</span>
                </div>
              </div>
              <div className="col-6 col-md-3">
                <div className="text-body-secondary">{t("purchasing.colDate")}</div>
                <div className="pos-tabular">{detailPurchase.purchase_date}</div>
              </div>
              <div className="col-6 col-md-3">
                <div className="text-body-secondary">Created By</div>
                <div>{detailPurchase.created_by_username}</div>
              </div>
            </div>

            <div className="table-responsive border rounded">
              <table className="table table-sm align-middle mb-0">
                <thead>
                  <tr>
                    <th>{t("purchasing.productLabel")}</th>
                    <th className="text-end">{t("purchasing.quantityLabel")}</th>
                    <th className="text-end">{t("purchasing.unitCostLabel")}</th>
                    <th className="text-end">{t("purchasing.lineTotalLabel")}</th>
                  </tr>
                </thead>
                <tbody className="pos-tabular">
                  {(detailPurchase.items || []).map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="fw-medium">{item.product_name_snapshot}</div>
                        <code className="small text-body-secondary">
                          {item.product_sku_snapshot}
                        </code>
                      </td>
                      <td className="text-end">
                        {formatQty(item.quantity)} {item.unit_abbreviation_snapshot}
                      </td>
                      <td className="text-end">{formatMoney(item.unit_cost)}</td>
                      <td className="text-end fw-semibold">{formatMoney(item.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="ms-auto text-end pos-tabular small" style={{ minWidth: "220px" }}>
              <div className="d-flex justify-content-between">
                <span className="text-body-secondary">{t("purchasing.subtotalLabel")}:</span>
                <span>{formatMoney(detailPurchase.subtotal)}</span>
              </div>
              <div className="d-flex justify-content-between">
                <span className="text-body-secondary">{t("purchasing.discountLabel")}:</span>
                <span>-{formatMoney(detailPurchase.discount_amount)}</span>
              </div>
              <div className="d-flex justify-content-between fw-bold fs-6 border-top pt-1 mt-1">
                <span>{t("purchasing.totalLabel")}:</span>
                <span className="text-primary">{formatMoney(detailPurchase.total_amount)}</span>
              </div>
            </div>

            {detailPurchase.notes && (
              <div className="small text-body-secondary">
                <strong>{t("purchasing.notesLabel")}:</strong> {detailPurchase.notes}
              </div>
            )}
          </div>
        )}
      </AppModal>

      {/* Create / Edit Purchase Modal */}
      <AppModal
        isOpen={poModalOpen}
        title={
          editingPurchase
            ? `${t("purchasing.editTitle")}: ${editingPurchase.purchase_number}`
            : t("purchasing.createTitle")
        }
        size="lg"
        onClose={() => setPoModalOpen(false)}
        disableClose={savingPo}
      >
        <form onSubmit={handleSavePurchase} noValidate className="d-flex flex-column gap-3">
          <StatusAlert variant="info" message={t("purchasing.draftStockNotice")} />

          <div className="row g-3">
            <div className="col-12 col-md-6">
              <FormSelect
                id="poSupplier"
                label={t("purchasing.supplierLabel")}
                value={poForm.supplier}
                onChange={(e) => setPoForm({ ...poForm, supplier: e.target.value })}
                options={activeSuppliersOptions}
                error={poErrors.supplier}
                required
                disabled={savingPo}
              />
            </div>
            <div className="col-6 col-md-3">
              <FormInput
                id="poDate"
                label={t("purchasing.purchaseDateLabel")}
                type="date"
                value={poForm.purchase_date}
                onChange={(e) => setPoForm({ ...poForm, purchase_date: e.target.value })}
                disabled={savingPo}
              />
            </div>
            <div className="col-6 col-md-3">
              <FormSelect
                id="poStatus"
                label={t("purchasing.statusLabel")}
                value={poForm.status}
                onChange={(e) => setPoForm({ ...poForm, status: e.target.value })}
                options={[
                  { value: "draft", label: t("purchasing.statusDraft") },
                  { value: "ordered", label: t("purchasing.statusOrdered") },
                ]}
                disabled={savingPo}
              />
            </div>
          </div>

          <div className="border rounded p-3">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="fw-semibold small">{t("purchasing.itemsSectionTitle")}</span>
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                onClick={addItemRow}
                disabled={savingPo}
              >
                <i className="bi bi-plus me-1" aria-hidden="true" />
                {t("purchasing.addItem")}
              </button>
            </div>

            {poErrors.items && (
              <div className="text-danger small mb-2">{poErrors.items}</div>
            )}

            <div className="d-flex flex-column gap-2">
              {poForm.items.map((item, idx) => {
                const linePreview =
                  (Number(item.quantity) || 0) * (Number(item.unit_cost) || 0);
                return (
                  <div key={idx} className="row g-2 align-items-end">
                    <div className="col-12 col-md-5">
                      <select
                        className="form-select form-select-sm"
                        aria-label={`Product row ${idx + 1}`}
                        value={item.product}
                        onChange={(e) => handleItemChange(idx, "product", e.target.value)}
                        disabled={savingPo}
                      >
                        <option value="">{t("purchasing.selectProduct")}</option>
                        {products.map((p) => (
                          <option key={p.id} value={String(p.id)}>
                            {p.sku} — {language === "km" && p.name_km ? p.name_km : p.name} ({p.unit_abbreviation})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-4 col-md-2">
                      <input
                        type="number"
                        step="0.001"
                        min="0.001"
                        className="form-control form-control-sm"
                        aria-label={`Quantity row ${idx + 1}`}
                        placeholder={t("purchasing.quantityLabel")}
                        value={item.quantity}
                        onChange={(e) => handleItemChange(idx, "quantity", e.target.value)}
                        disabled={savingPo}
                      />
                    </div>
                    <div className="col-4 col-md-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="form-control form-control-sm"
                        aria-label={`Unit cost row ${idx + 1}`}
                        placeholder={t("purchasing.unitCostLabel")}
                        value={item.unit_cost}
                        onChange={(e) => handleItemChange(idx, "unit_cost", e.target.value)}
                        disabled={savingPo}
                      />
                    </div>
                    <div className="col-3 col-md-2 text-end small pos-tabular fw-medium">
                      {formatMoney(linePreview)}
                    </div>
                    <div className="col-1 text-end">
                      {poForm.items.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          aria-label={`Remove item ${idx + 1}`}
                          onClick={() => removeItemRow(idx)}
                          disabled={savingPo}
                        >
                          <i className="bi bi-x" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="row g-3 align-items-end">
            <div className="col-12 col-md-5">
              <FormInput
                id="poDiscount"
                label={t("purchasing.discountLabel")}
                type="number"
                step="0.01"
                min="0"
                value={poForm.discount_amount}
                onChange={(e) => setPoForm({ ...poForm, discount_amount: e.target.value })}
                error={poErrors.discount_amount}
                disabled={savingPo}
              />
            </div>
            <div className="col-12 col-md-7 text-md-end pos-tabular small">
              <div>
                {t("purchasing.subtotalLabel")}:{" "}
                <strong>{formatMoney(previewTotals.subtotal)}</strong>
              </div>
              <div className="fs-6 fw-bold text-primary">
                {t("purchasing.totalLabel")}: {formatMoney(previewTotals.total)}
              </div>
            </div>
          </div>

          <FormTextarea
            id="poNotes"
            label={t("purchasing.notesLabel")}
            rows={2}
            value={poForm.notes}
            onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })}
            disabled={savingPo}
          />

          <div className="pt-2 border-top">
            <FormActions
              submitting={savingPo}
              submitLabel={t("controls.save")}
              submittingLabel={t("controls.saving")}
              cancelLabel={t("controls.cancel")}
              onCancel={() => setPoModalOpen(false)}
            />
          </div>
        </form>
      </AppModal>

      {/* Supplier Create / Edit Modal */}
      <AppModal
        isOpen={supplierModalOpen}
        title={
          editingSupplier
            ? t("purchasing.editSupplierTitle")
            : t("purchasing.createSupplierTitle")
        }
        size="md"
        onClose={() => setSupplierModalOpen(false)}
        disableClose={savingSupplier}
      >
        <form onSubmit={handleSaveSupplier} className="d-flex flex-column gap-3">
          <SupplierAvatarField
            inputId="poSupAvatar"
            supplier={editingSupplier}
            name={supplierForm.name}
            file={supplierForm.avatar}
            removeAvatar={supplierForm.remove_avatar}
            disabled={savingSupplier}
            onFileSelect={(picked) =>
              setSupplierForm((prev) => ({ ...prev, avatar: picked, remove_avatar: false }))
            }
            onRemove={() =>
              setSupplierForm((prev) => ({ ...prev, avatar: null, remove_avatar: true }))
            }
            onValidationError={(msg) => toast.error(msg)}
            t={t}
          />
          <FormInput
            id="supName"
            label={t("purchasing.supplierNameLabel")}
            value={supplierForm.name}
            onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
            required
            disabled={savingSupplier}
          />
          <FormInput
            id="supContact"
            label={t("purchasing.contactNameLabel")}
            value={supplierForm.contact_name}
            onChange={(e) => setSupplierForm({ ...supplierForm, contact_name: e.target.value })}
            disabled={savingSupplier}
          />
          <div className="row g-3">
            <div className="col-12 col-sm-6">
              <FormInput
                id="supPhone"
                label={t("purchasing.phoneLabel")}
                value={supplierForm.phone}
                onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                disabled={savingSupplier}
              />
            </div>
            <div className="col-12 col-sm-6">
              <FormInput
                id="supEmail"
                label={t("purchasing.emailLabel")}
                type="email"
                value={supplierForm.email}
                onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                disabled={savingSupplier}
              />
            </div>
          </div>
          <FormTextarea
            id="supAddress"
            label={t("purchasing.addressLabel")}
            rows={2}
            value={supplierForm.address}
            onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
            disabled={savingSupplier}
          />
          <div className="form-check form-switch">
            <input
              id="supActive"
              type="checkbox"
              className="form-check-input"
              checked={supplierForm.is_active}
              onChange={(e) => setSupplierForm({ ...supplierForm, is_active: e.target.checked })}
              disabled={savingSupplier}
            />
            <label htmlFor="supActive" className="form-check-label">
              {t("purchasing.supplierActiveLabel")}
            </label>
          </div>
          <div className="pt-2 border-top">
            <FormActions
              submitting={savingSupplier}
              submitLabel={t("controls.save")}
              submittingLabel={t("controls.saving")}
              cancelLabel={t("controls.cancel")}
              onCancel={() => setSupplierModalOpen(false)}
            />
          </div>
        </form>
      </AppModal>
    </div>
  );
}
