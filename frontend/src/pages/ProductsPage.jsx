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
} from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { useConfirm } from "../contexts/ConfirmContext";
import { usePreferences } from "../contexts/PreferencesContext";
import { useToast } from "../contexts/ToastContext";
import { fetchCategories } from "../services/categoriesService";
import {
  activateProduct,
  createProduct,
  deactivateProduct,
  deleteProduct,
  fetchProducts,
  updateProduct,
} from "../services/productsService";
import { fetchUnits } from "../services/unitsService";

const PAGE_SIZE = 10;

const EMPTY_FORM = {
  sku: "",
  barcode: "",
  name: "",
  name_km: "",
  category: "",
  unit: "",
  purchase_cost: "0.00",
  selling_price: "",
  wholesale_price: "",
  tax_rate: "0.00",
  min_stock_threshold: "0",
  description: "",
  track_inventory: true,
  is_active: true,
  image: null,
  remove_image: false,
};

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return `$${num.toFixed(2)}`;
}

function formatQty(value) {
  if (value === null || value === undefined || value === "") return "0";
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return num.toString();
}

export default function ProductsPage() {
  const { hasPermission } = useAuth();
  const { language, t } = usePreferences();
  const toast = useToast();
  const confirm = useConfirm();

  const canCreate = hasPermission("products.create");
  const canEdit = hasPermission("products.edit");
  const canEditPrice = hasPermission("products.edit_price");
  const canDelete = hasPermission("products.delete");

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [ordering, setOrdering] = useState("name");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const [detailProduct, setDetailProduct] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const loadLookups = useCallback(async () => {
    try {
      const [catsResp, unitsResp] = await Promise.all([
        fetchCategories({ page: 1, page_size: 100 }),
        fetchUnits({ page: 1, page_size: 100 }),
      ]);
      setCategories(catsResp.results || catsResp);
      setUnits(unitsResp.results || unitsResp);
    } catch {
      // Non-blocking; lookups can retry when opening modal
    }
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = { page, page_size: PAGE_SIZE, ordering };
      if (search.trim()) params.search = search.trim();
      if (categoryFilter) params.category = categoryFilter;
      if (unitFilter) params.unit = unitFilter;
      if (statusFilter) params.is_active = statusFilter;

      const data = await fetchProducts(params);
      const rows = data.results || data;
      setProducts(rows);
      setTotalCount(typeof data.count === "number" ? data.count : rows.length);
    } catch (err) {
      setError(err?.message || "Failed to load products.");
    } finally {
      setLoading(false);
    }
  }, [page, ordering, search, categoryFilter, unitFilter, statusFilter]);

  useEffect(() => {
    loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl && imagePreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  const openCreateModal = () => {
    setEditingProduct(null);
    setFormData(EMPTY_FORM);
    setImagePreviewUrl(null);
    setFieldErrors({});
    setModalOpen(true);
    if (categories.length === 0 || units.length === 0) {
      loadLookups();
    }
  };

  const openEditModal = useCallback(
    (product) => {
      setEditingProduct(product);
      setFormData({
        sku: product.sku || "",
        barcode: product.barcode || "",
        name: product.name || "",
        name_km: product.name_km || "",
        category: product.category ? String(product.category) : "",
        unit: product.unit ? String(product.unit) : "",
        purchase_cost: String(product.purchase_cost ?? "0.00"),
        selling_price: String(product.selling_price ?? ""),
        wholesale_price:
          product.wholesale_price !== null && product.wholesale_price !== undefined
            ? String(product.wholesale_price)
            : "",
        tax_rate: String(product.tax_rate ?? "0.00"),
        min_stock_threshold: formatQty(product.min_stock_threshold),
        description: product.description || "",
        track_inventory: Boolean(product.track_inventory),
        is_active: Boolean(product.is_active),
        image: null,
        remove_image: false,
      });
      setImagePreviewUrl(product.image_url || null);
      setFieldErrors({});
      setModalOpen(true);
      if (categories.length === 0 || units.length === 0) {
        loadLookups();
      }
    },
    [categories.length, loadLookups, units.length]
  );

  const handleImageFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    if (imagePreviewUrl && imagePreviewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setFormData((prev) => ({ ...prev, image: file, remove_image: false }));
    if (file) {
      setImagePreviewUrl(URL.createObjectURL(file));
    } else {
      setImagePreviewUrl(editingProduct?.image_url || null);
    }
  };

  const extractFieldErrors = (err) => {
    if (!err?.errors || typeof err.errors !== "object") return {};
    const mapped = {};
    for (const [key, val] of Object.entries(err.errors)) {
      mapped[key] = Array.isArray(val) ? val[0] : String(val);
    }
    return mapped;
  };

  const isNonNegativeNumber = (val) => {
    if (val === "" || val === null || val === undefined) return false;
    const n = Number(val);
    return Number.isFinite(n) && n >= 0;
  };

  const handleSave = async (event) => {
    event.preventDefault();
    const errors = {};
    if (!formData.sku.trim()) errors.sku = t("products.skuRequired");
    if (!formData.name.trim()) errors.name = t("products.nameRequired");
    if (!formData.category) errors.category = t("products.categoryRequired");
    if (!formData.unit) errors.unit = t("products.unitRequired");
    if (!isNonNegativeNumber(formData.purchase_cost)) {
      errors.purchase_cost = t("products.priceRequired");
    }
    if (!isNonNegativeNumber(formData.selling_price)) {
      errors.selling_price = t("products.priceRequired");
    }
    if (formData.wholesale_price !== "" && !isNonNegativeNumber(formData.wholesale_price)) {
      errors.wholesale_price = t("products.priceRequired");
    }
    if (!isNonNegativeNumber(formData.min_stock_threshold)) {
      errors.min_stock_threshold = t("products.thresholdInvalid");
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSaving(true);
    setFieldErrors({});
    try {
      const payload = {
        sku: formData.sku.trim(),
        barcode: formData.barcode.trim() || null,
        name: formData.name.trim(),
        name_km: formData.name_km.trim(),
        description: formData.description.trim(),
        category: Number(formData.category),
        unit: Number(formData.unit),
        tax_rate: String(formData.tax_rate || "0.00").trim(),
        min_stock_threshold: String(formData.min_stock_threshold || "0").trim(),
        track_inventory: formData.track_inventory,
        is_active: formData.is_active,
      };

      // Only send pricing fields on create, or on edit when user holds products.edit_price
      if (!editingProduct || canEditPrice) {
        payload.purchase_cost = String(formData.purchase_cost).trim();
        payload.selling_price = String(formData.selling_price).trim();
        payload.wholesale_price =
          formData.wholesale_price.trim() !== "" ? formData.wholesale_price.trim() : null;
      }

      if (formData.image instanceof File) {
        payload.image = formData.image;
      } else if (editingProduct && formData.remove_image) {
        payload.remove_image = true;
      }

      if (editingProduct) {
        await updateProduct(editingProduct.id, payload);
        toast.success(t("products.updatedToast"));
      } else {
        await createProduct(payload);
        toast.success(t("products.createdToast"));
      }
      setModalOpen(false);
      await loadProducts();
    } catch (err) {
      const mapped = extractFieldErrors(err);
      if (Object.keys(mapped).length > 0) setFieldErrors(mapped);
      toast.error(err?.message || "Failed to save product.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = useCallback(
    async (product) => {
      const approved = await confirm({
        title: product.is_active
          ? t("products.confirmDeactivateTitle")
          : t("products.confirmActivateTitle"),
        message: product.is_active
          ? t("products.confirmDeactivateMessage")
          : t("products.confirmActivateMessage"),
        confirmLabel: product.is_active ? t("controls.deactivate") : t("controls.activate"),
        cancelLabel: t("controls.cancel"),
        variant: product.is_active ? "warning" : "success",
      });
      if (!approved) return;

      setBusyId(product.id);
      try {
        if (product.is_active) {
          await deactivateProduct(product.id);
          toast.success(t("products.deactivatedToast"));
        } else {
          await activateProduct(product.id);
          toast.success(t("products.activatedToast"));
        }
        await loadProducts();
      } catch (err) {
        toast.error(err?.message || "Failed to update product status.");
      } finally {
        setBusyId(null);
      }
    },
    [confirm, loadProducts, t, toast]
  );

  const handleDelete = useCallback(
    async (product) => {
      const approved = await confirm({
        title: t("products.confirmDeleteTitle"),
        message: `${t("products.confirmDeleteMessage")} (${product.sku} — ${product.name})`,
        confirmLabel: t("controls.delete"),
        cancelLabel: t("controls.cancel"),
        variant: "danger",
      });
      if (!approved) return;

      setBusyId(product.id);
      try {
        await deleteProduct(product.id);
        toast.success(t("products.deletedToast"));
        if (products.length === 1 && page > 1) {
          setPage((prev) => prev - 1);
        } else {
          await loadProducts();
        }
      } catch (err) {
        toast.error(err?.message || "Cannot delete product.");
      } finally {
        setBusyId(null);
      }
    },
    [confirm, loadProducts, page, products.length, t, toast]
  );

  const categorySelectOptions = useMemo(
    () => [
      { value: "", label: t("products.selectCategory") },
      ...categories
        .filter((c) => c.is_active || String(c.id) === formData.category)
        .map((c) => ({
          value: String(c.id),
          label: language === "km" && c.name_km ? `${c.name_km} (${c.name})` : c.name,
        })),
    ],
    [categories, formData.category, language, t]
  );

  const unitSelectOptions = useMemo(
    () => [
      { value: "", label: t("products.selectUnit") },
      ...units
        .filter((u) => u.is_active || String(u.id) === formData.unit)
        .map((u) => ({
          value: String(u.id),
          label: `${language === "km" && u.name_km ? u.name_km : u.name} (${u.abbreviation})`,
        })),
    ],
    [formData.unit, language, t, units]
  );

  const columns = useMemo(
    () => [
      {
        key: "product",
        header: t("products.colProduct"),
        render: (p) => (
          <div className="d-flex align-items-center gap-3">
            {p.image_url ? (
              <img
                src={p.image_url}
                alt={p.name}
                className="rounded border object-fit-cover flex-shrink-0"
                style={{ width: "44px", height: "44px" }}
              />
            ) : (
              <div
                className="rounded border bg-body-tertiary d-flex align-items-center justify-content-center text-body-secondary flex-shrink-0"
                style={{ width: "44px", height: "44px" }}
              >
                <i className="bi bi-box-seam" aria-hidden="true" />
              </div>
            )}
            <div className="min-w-0">
              <div className="fw-semibold">
                {language === "km" && p.name_km ? p.name_km : p.name}
              </div>
              <div className="small text-body-secondary d-flex flex-wrap gap-2">
                <code>{p.sku}</code>
                {p.barcode && (
                  <span>
                    <i className="bi bi-upc me-1" aria-hidden="true" />
                    {p.barcode}
                  </span>
                )}
              </div>
            </div>
          </div>
        ),
      },
      {
        key: "category_unit",
        header: t("products.colCategoryUnit"),
        render: (p) => (
          <div className="small">
            <div className="fw-medium">
              {language === "km" && p.category_name_km ? p.category_name_km : p.category_name}
            </div>
            <div className="text-body-secondary">
              {p.unit_name} ({p.unit_abbreviation})
            </div>
          </div>
        ),
      },
      {
        key: "pricing",
        header: t("products.colPricing"),
        cellClassName: "pos-tabular",
        render: (p) => (
          <div className="small">
            <div className="fw-semibold text-primary">{formatMoney(p.selling_price)}</div>
            <div className="text-body-secondary">
              {t("products.costShort")}: {formatMoney(p.purchase_cost)}
              {p.wholesale_price !== null && p.wholesale_price !== undefined
                ? ` · ${t("products.wholesaleShort")}: ${formatMoney(p.wholesale_price)}`
                : ""}
            </div>
          </div>
        ),
      },
      {
        key: "min_stock_threshold",
        header: t("products.colThreshold"),
        cellClassName: "pos-tabular small",
        render: (p) => (
          <span>
            {formatQty(p.min_stock_threshold)} {p.unit_abbreviation}
          </span>
        ),
      },
      {
        key: "is_active",
        header: t("products.colStatus"),
        render: (p) => (
          <span className={`badge ${p.is_active ? "text-bg-success" : "text-bg-danger"}`}>
            {p.is_active ? t("status.active") : t("status.inactive")}
          </span>
        ),
      },
      {
        key: "actions",
        header: t("products.colActions"),
        headerClassName: "text-end",
        cellClassName: "text-end",
        render: (p) => {
          const isBusy = busyId === p.id;
          return (
            <div className="btn-group btn-group-sm">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setDetailProduct(p)}
              >
                {t("products.view")}
              </button>
              {canEdit && (
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  onClick={() => openEditModal(p)}
                  disabled={isBusy}
                >
                  {t("controls.edit")}
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  className={`btn ${
                    p.is_active ? "btn-outline-warning" : "btn-outline-success"
                  }`}
                  onClick={() => handleToggleStatus(p)}
                  disabled={isBusy}
                >
                  {p.is_active ? t("controls.deactivate") : t("controls.activate")}
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  className="btn btn-outline-danger"
                  onClick={() => handleDelete(p)}
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

  const priceLockedOnEdit = Boolean(editingProduct && !canEditPrice);

  return (
    <div className="d-flex flex-column gap-4">
      <PageHeader
        icon="bi-box-seam"
        title={t("products.title")}
        subtitle={t("products.subtitle")}
        actions={
          canCreate && (
            <button type="button" className="btn btn-primary" onClick={openCreateModal}>
              <i className="bi bi-plus-lg me-2" aria-hidden="true" />
              {t("products.newProduct")}
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
              placeholder={t("products.searchPlaceholder")}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            <select
              className="form-select form-select-sm"
              style={{ width: "160px" }}
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter product category"
            >
              <option value="">{t("products.allCategories")}</option>
              {categories.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {language === "km" && c.name_km ? c.name_km : c.name}
                </option>
              ))}
            </select>
            <select
              className="form-select form-select-sm"
              style={{ width: "145px" }}
              value={unitFilter}
              onChange={(e) => {
                setUnitFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter product unit"
            >
              <option value="">{t("products.allUnits")}</option>
              {units.map((u) => (
                <option key={u.id} value={String(u.id)}>
                  {u.name} ({u.abbreviation})
                </option>
              ))}
            </select>
            <select
              className="form-select form-select-sm"
              style={{ width: "140px" }}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter product status"
            >
              <option value="">{t("controls.allStatuses")}</option>
              <option value="true">{t("status.active")}</option>
              <option value="false">{t("status.inactive")}</option>
            </select>
            <select
              className="form-select form-select-sm"
              style={{ width: "165px" }}
              value={ordering}
              onChange={(e) => {
                setOrdering(e.target.value);
                setPage(1);
              }}
              aria-label="Sort products"
            >
              <option value="name">{t("products.sortNameAsc")}</option>
              <option value="-name">{t("products.sortNameDesc")}</option>
              <option value="selling_price">{t("products.sortPriceAsc")}</option>
              <option value="-selling_price">{t("products.sortPriceDesc")}</option>
              <option value="sku">{t("products.sortSkuAsc")}</option>
              <option value="-created_at">{t("products.sortNewest")}</option>
            </select>
          </div>
        }
      >
        <DataTable
          columns={columns}
          rows={products}
          loading={loading}
          loadingMessage={t("products.loading")}
          error={error}
          onRetry={loadProducts}
          emptyIcon="bi-box-seam"
          emptyTitle={t("products.emptyTitle")}
          emptyDescription={t("products.emptyDescription")}
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

      {/* Product Details Modal */}
      <AppModal
        isOpen={Boolean(detailProduct)}
        title={t("products.detailsTitle")}
        size="md"
        onClose={() => setDetailProduct(null)}
        footer={
          <div className="d-flex justify-content-end gap-2">
            {detailProduct && canEdit && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const target = detailProduct;
                  setDetailProduct(null);
                  openEditModal(target);
                }}
              >
                {t("controls.edit")}
              </button>
            )}
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => setDetailProduct(null)}
            >
              {t("controls.close")}
            </button>
          </div>
        }
      >
        {detailProduct && (
          <div className="d-flex flex-column gap-3">
            <div className="d-flex gap-3 align-items-start">
              {detailProduct.image_url ? (
                <img
                  src={detailProduct.image_url}
                  alt={detailProduct.name}
                  className="rounded border object-fit-cover flex-shrink-0"
                  style={{ width: "88px", height: "88px" }}
                />
              ) : (
                <div
                  className="rounded border bg-body-tertiary d-flex align-items-center justify-content-center text-body-secondary flex-shrink-0"
                  style={{ width: "88px", height: "88px" }}
                >
                  <i className="bi bi-box-seam fs-2" aria-hidden="true" />
                </div>
              )}
              <div>
                <h3 className="h5 mb-1">{detailProduct.name}</h3>
                {detailProduct.name_km && (
                  <div className="text-body-secondary mb-1">{detailProduct.name_km}</div>
                )}
                <div className="d-flex flex-wrap gap-2 small">
                  <code className="px-2 py-1 rounded border bg-body-tertiary">
                    SKU: {detailProduct.sku}
                  </code>
                  {detailProduct.barcode && (
                    <code className="px-2 py-1 rounded border bg-body-tertiary">
                      Barcode: {detailProduct.barcode}
                    </code>
                  )}
                  <span
                    className={`badge align-self-center ${
                      detailProduct.is_active ? "text-bg-success" : "text-bg-danger"
                    }`}
                  >
                    {detailProduct.is_active ? t("status.active") : t("status.inactive")}
                  </span>
                </div>
              </div>
            </div>

            <dl className="row mb-0 small pos-tabular">
              <dt className="col-5 text-body-secondary">{t("products.categoryLabel")}</dt>
              <dd className="col-7">{detailProduct.category_name}</dd>
              <dt className="col-5 text-body-secondary">{t("products.unitLabel")}</dt>
              <dd className="col-7">
                {detailProduct.unit_name} ({detailProduct.unit_abbreviation})
              </dd>
              <dt className="col-5 text-body-secondary">{t("products.purchaseCostLabel")}</dt>
              <dd className="col-7">{formatMoney(detailProduct.purchase_cost)}</dd>
              <dt className="col-5 text-body-secondary">{t("products.sellingPriceLabel")}</dt>
              <dd className="col-7 fw-semibold text-primary">
                {formatMoney(detailProduct.selling_price)}
              </dd>
              <dt className="col-5 text-body-secondary">{t("products.wholesalePriceLabel")}</dt>
              <dd className="col-7">{formatMoney(detailProduct.wholesale_price)}</dd>
              <dt className="col-5 text-body-secondary">{t("products.minStockLabel")}</dt>
              <dd className="col-7">
                {formatQty(detailProduct.min_stock_threshold)} {detailProduct.unit_abbreviation}
              </dd>
            </dl>

            {detailProduct.description && (
              <div>
                <div className="small fw-semibold text-body-secondary mb-1">
                  {t("products.descriptionLabel")}
                </div>
                <p className="small mb-0">{detailProduct.description}</p>
              </div>
            )}

            <StatusAlert variant="info" message={t("products.inventoryNotice")} />
          </div>
        )}
      </AppModal>

      {/* Create / Edit Product Modal */}
      <AppModal
        isOpen={modalOpen}
        title={
          editingProduct
            ? `${t("products.editTitle")}: ${editingProduct.sku}`
            : t("products.createTitle")
        }
        size="lg"
        onClose={() => setModalOpen(false)}
        disableClose={saving}
      >
        <form onSubmit={handleSave} noValidate className="d-flex flex-column gap-3">
          <StatusAlert variant="info" message={t("products.inventoryNotice")} />

          {priceLockedOnEdit && (
            <StatusAlert variant="warning" message={t("products.pricePermissionNotice")} />
          )}

          <div className="row g-3">
            <div className="col-12 col-md-6">
              <FormInput
                id="productSku"
                label={t("products.skuLabel")}
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                error={fieldErrors.sku}
                required
                disabled={saving}
              />
            </div>
            <div className="col-12 col-md-6">
              <FormInput
                id="productBarcode"
                label={t("products.barcodeLabel")}
                value={formData.barcode}
                onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                error={fieldErrors.barcode}
                disabled={saving}
              />
            </div>

            <div className="col-12 col-md-6">
              <FormInput
                id="productName"
                label={t("products.nameLabel")}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                error={fieldErrors.name}
                required
                disabled={saving}
              />
            </div>
            <div className="col-12 col-md-6">
              <FormInput
                id="productNameKm"
                label={t("products.nameKmLabel")}
                value={formData.name_km}
                onChange={(e) => setFormData({ ...formData, name_km: e.target.value })}
                error={fieldErrors.name_km}
                disabled={saving}
              />
            </div>

            <div className="col-12 col-md-6">
              <FormSelect
                id="productCategory"
                label={t("products.categoryLabel")}
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                options={categorySelectOptions}
                error={fieldErrors.category}
                required
                disabled={saving}
              />
            </div>
            <div className="col-12 col-md-6">
              <FormSelect
                id="productUnit"
                label={t("products.unitLabel")}
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                options={unitSelectOptions}
                error={fieldErrors.unit}
                required
                disabled={saving}
              />
            </div>

            <div className="col-12 col-md-4">
              <FormInput
                id="productCost"
                label={t("products.purchaseCostLabel")}
                type="number"
                step="0.01"
                min="0"
                value={formData.purchase_cost}
                onChange={(e) => setFormData({ ...formData, purchase_cost: e.target.value })}
                error={fieldErrors.purchase_cost}
                required
                disabled={saving || priceLockedOnEdit}
              />
            </div>
            <div className="col-12 col-md-4">
              <FormInput
                id="productSellingPrice"
                label={t("products.sellingPriceLabel")}
                type="number"
                step="0.01"
                min="0"
                value={formData.selling_price}
                onChange={(e) => setFormData({ ...formData, selling_price: e.target.value })}
                error={fieldErrors.selling_price}
                required
                disabled={saving || priceLockedOnEdit}
              />
            </div>
            <div className="col-12 col-md-4">
              <FormInput
                id="productWholesalePrice"
                label={t("products.wholesalePriceLabel")}
                type="number"
                step="0.01"
                min="0"
                value={formData.wholesale_price}
                onChange={(e) => setFormData({ ...formData, wholesale_price: e.target.value })}
                error={fieldErrors.wholesale_price}
                disabled={saving || priceLockedOnEdit}
              />
            </div>

            <div className="col-12 col-md-6">
              <FormInput
                id="productMinStock"
                label={t("products.minStockLabel")}
                type="number"
                step="0.001"
                min="0"
                value={formData.min_stock_threshold}
                onChange={(e) =>
                  setFormData({ ...formData, min_stock_threshold: e.target.value })
                }
                error={fieldErrors.min_stock_threshold}
                disabled={saving}
              />
            </div>
            <div className="col-12 col-md-6">
              <FormInput
                id="productTaxRate"
                label={t("products.taxRateLabel")}
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={formData.tax_rate}
                onChange={(e) => setFormData({ ...formData, tax_rate: e.target.value })}
                error={fieldErrors.tax_rate}
                disabled={saving}
              />
            </div>

            <div className="col-12">
              <label htmlFor="productImage" className="form-label fw-medium">
                {t("products.imageLabel")}
              </label>
              <input
                id="productImage"
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                className={`form-control${fieldErrors.image ? " is-invalid" : ""}`}
                onChange={handleImageFileChange}
                disabled={saving}
              />
              {fieldErrors.image && (
                <div className="invalid-feedback">{fieldErrors.image}</div>
              )}
              {imagePreviewUrl && !formData.remove_image && (
                <div className="mt-2 d-flex align-items-center gap-3">
                  <img
                    src={imagePreviewUrl}
                    alt="Preview"
                    className="rounded border object-fit-cover"
                    style={{ width: "64px", height: "64px" }}
                  />
                  {editingProduct?.image_url && !formData.image && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => {
                        setFormData((prev) => ({ ...prev, remove_image: true }));
                        setImagePreviewUrl(null);
                      }}
                      disabled={saving}
                    >
                      {t("products.removeImage")}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="col-12">
              <FormTextarea
                id="productDescription"
                label={t("products.descriptionLabel")}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                error={fieldErrors.description}
                disabled={saving}
              />
            </div>

            <div className="col-12 d-flex flex-column gap-2">
              <div className="form-check form-switch">
                <input
                  id="productTrackInventory"
                  type="checkbox"
                  className="form-check-input"
                  checked={formData.track_inventory}
                  onChange={(e) =>
                    setFormData({ ...formData, track_inventory: e.target.checked })
                  }
                  disabled={saving}
                />
                <label htmlFor="productTrackInventory" className="form-check-label">
                  {t("products.trackInventoryLabel")}
                </label>
              </div>
              <div className="form-check form-switch">
                <input
                  id="productActive"
                  type="checkbox"
                  className="form-check-input"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  disabled={saving}
                />
                <label htmlFor="productActive" className="form-check-label">
                  {t("products.activeLabel")}
                </label>
              </div>
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
