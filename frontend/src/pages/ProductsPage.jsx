import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
const MAX_PRODUCT_IMAGES = 10;

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

function resolveProductGallery(product) {
  if (!product) return [];
  if (Array.isArray(product.images) && product.images.length > 0) {
    return product.images
      .filter((img) => img && img.image_url)
      .map((img) => ({
        id: img.id,
        url: img.image_url,
        isPrimary: Boolean(img.is_primary),
      }));
  }
  if (product.image_url) {
    return [{ id: "legacy", url: product.image_url, isPrimary: true }];
  }
  return [];
}

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

function formatFileSize(bytes) {
  const num = Number(bytes || 0);
  if (num <= 0) return "";
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(2)} MB`;
}

function getFileNameFromUrl(url, fallback) {
  if (!url) return fallback;
  try {
    const clean = url.split("?")[0];
    const parts = clean.split("/");
    return decodeURIComponent(parts[parts.length - 1] || fallback);
  } catch {
    return fallback;
  }
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
  const [activeDetailImageUrl, setActiveDetailImageUrl] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [existingImages, setExistingImages] = useState([]);
  const [deletedImageIds, setDeletedImageIds] = useState([]);
  const [primaryImageId, setPrimaryImageId] = useState(null);
  const [queuedImages, setQueuedImages] = useState([]); // [{ file, previewUrl }]
  const [legacyPreviewUrl, setLegacyPreviewUrl] = useState(null);
  const [isDraggingMedia, setIsDraggingMedia] = useState(false);
  const mediaInputRef = useRef(null);
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
      queuedImages.forEach((item) => {
        if (item.previewUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
    };
  }, [queuedImages]);

  useEffect(() => {
    const gallery = resolveProductGallery(detailProduct);
    setActiveDetailImageUrl(gallery[0]?.url || null);
  }, [detailProduct]);

  const clearQueuedImages = useCallback(() => {
    setQueuedImages((prev) => {
      prev.forEach((item) => {
        if (item.previewUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
      return [];
    });
  }, []);

  const openCreateModal = () => {
    setEditingProduct(null);
    setFormData(EMPTY_FORM);
    setExistingImages([]);
    setDeletedImageIds([]);
    setPrimaryImageId(null);
    setLegacyPreviewUrl(null);
    clearQueuedImages();
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
      const gallery = Array.isArray(product.images) ? product.images : [];
      setExistingImages(gallery);
      setDeletedImageIds([]);
      const primary = gallery.find((img) => img.is_primary) || gallery[0] || null;
      setPrimaryImageId(primary ? primary.id : null);
      setLegacyPreviewUrl(gallery.length === 0 ? product.image_url || null : null);
      clearQueuedImages();
      setFieldErrors({});
      setModalOpen(true);
      if (categories.length === 0 || units.length === 0) {
        loadLookups();
      }
    },
    [categories.length, clearQueuedImages, loadLookups, units.length]
  );

  const appendSelectedFiles = (rawFiles) => {
    const files = Array.from(rawFiles || []).filter(
      (f) => f && (!f.type || f.type.startsWith("image/"))
    );
    if (files.length === 0) return;

    const currentCount = existingImages.length + queuedImages.length;
    const remainingSlots = MAX_PRODUCT_IMAGES - currentCount;
    if (remainingSlots <= 0) {
      toast.warning(t("products.maxImagesWarning"));
      return;
    }

    const accepted = files.slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      toast.warning(t("products.maxImagesWarning"));
    }

    const nextEntries = accepted.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setQueuedImages((prev) => [...prev, ...nextEntries]);
  };

  const handleImageFileChange = (event) => {
    appendSelectedFiles(event.target.files);
    event.target.value = "";
  };

  const handleDropMedia = (event) => {
    event.preventDefault();
    setIsDraggingMedia(false);
    if (saving || existingImages.length + queuedImages.length >= MAX_PRODUCT_IMAGES) return;
    appendSelectedFiles(event.dataTransfer?.files);
  };

  const handleRemoveQueuedImage = (index) => {
    setQueuedImages((prev) => {
      const target = prev[index];
      if (target?.previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((_, idx) => idx !== index);
    });
  };

  const handleMarkExistingImageDeleted = (imageId) => {
    setExistingImages((prev) => {
      const remaining = prev.filter((img) => img.id !== imageId);
      if (primaryImageId === imageId) {
        setPrimaryImageId(remaining[0]?.id ?? null);
      }
      return remaining;
    });
    setDeletedImageIds((prev) => (prev.includes(imageId) ? prev : [...prev, imageId]));
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

      if (queuedImages.length > 0) {
        payload.images = queuedImages.map((entry) => entry.file);
      }
      if (editingProduct) {
        if (formData.remove_image) {
          payload.remove_image = true;
        }
        if (deletedImageIds.length > 0) {
          payload.delete_image_ids = deletedImageIds;
        }
        if (primaryImageId !== null && existingImages.some((img) => img.id === primaryImageId)) {
          payload.primary_image_id = primaryImageId;
        }
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
            <div className="position-relative flex-shrink-0">
              {p.image_url ? (
                <img
                  src={p.image_url}
                  alt={p.name}
                  className="rounded border object-fit-cover"
                  style={{ width: "44px", height: "44px" }}
                />
              ) : (
                <div
                  className="rounded border bg-body-tertiary d-flex align-items-center justify-content-center text-body-secondary"
                  style={{ width: "44px", height: "44px" }}
                >
                  <i className="bi bi-box-seam" aria-hidden="true" />
                </div>
              )}
              {(p.images_count || p.images?.length || 0) > 1 && (
                <span
                  className="position-absolute bottom-0 end-0 badge text-bg-primary"
                  style={{ fontSize: "0.65rem", padding: "0.15em 0.35em" }}
                  title={`${p.images_count || p.images.length} images`}
                >
                  +{ (p.images_count || p.images.length) - 1 }
                </span>
              )}
            </div>
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
        {detailProduct && (() => {
          const detailGallery = resolveProductGallery(detailProduct);
          const activeIdx = Math.max(
            0,
            detailGallery.findIndex((img) => img.url === activeDetailImageUrl)
          );
          const activeImg = detailGallery[activeIdx] || detailGallery[0] || null;
          const heroUrl = activeImg?.url || null;
          const stepGallery = (delta) => {
            if (detailGallery.length <= 1) return;
            const nextIdx = (activeIdx + delta + detailGallery.length) % detailGallery.length;
            setActiveDetailImageUrl(detailGallery[nextIdx].url);
          };

          return (
          <div className="d-flex flex-column gap-3">
            {/* Vuexy Media Showcase Stage */}
            <div className="vuexy-media-box">
              <div className="vuexy-gallery-stage">
                {heroUrl ? (
                  <img src={heroUrl} alt={detailProduct.name} />
                ) : (
                  <div className="text-body-secondary d-flex flex-column align-items-center gap-1">
                    <i className="bi bi-images fs-1" aria-hidden="true" />
                    <span className="small">{t("products.galleryEmpty")}</span>
                  </div>
                )}

                {activeImg?.isPrimary && (
                  <span className="badge text-bg-primary position-absolute top-0 start-0 m-2">
                    <i className="bi bi-star-fill me-1" aria-hidden="true" />
                    {t("products.primaryBadge")}
                  </span>
                )}

                {detailGallery.length > 1 && (
                  <>
                    <span
                      className="badge position-absolute top-0 end-0 m-2 pos-tabular"
                      style={{ backgroundColor: "rgba(47, 43, 61, 0.72)", color: "#ffffff" }}
                    >
                      {activeIdx + 1} / {detailGallery.length}
                    </span>
                    <button
                      type="button"
                      className="vuexy-gallery-nav-btn"
                      style={{ left: "0.6rem" }}
                      onClick={() => stepGallery(-1)}
                      aria-label="Previous image"
                    >
                      <i className="bi bi-chevron-left" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="vuexy-gallery-nav-btn"
                      style={{ right: "0.6rem" }}
                      onClick={() => stepGallery(1)}
                      aria-label="Next image"
                    >
                      <i className="bi bi-chevron-right" aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>

              {detailGallery.length > 1 && (
                <div className="d-flex flex-wrap gap-2 mt-3 justify-content-center">
                  {detailGallery.map((img, idx) => {
                    const isActive = heroUrl === img.url;
                    return (
                      <button
                        key={img.id}
                        type="button"
                        className={`vuexy-gallery-thumb${isActive ? " is-active" : ""}`}
                        onClick={() => setActiveDetailImageUrl(img.url)}
                        aria-label={`View image ${idx + 1}`}
                      >
                        <img
                          src={img.url}
                          alt={`${detailProduct.name} ${idx + 1}`}
                          className="w-100 h-100 object-fit-cover"
                        />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

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
          );
        })()}
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

            {/* Vuexy Product Media Dropzone & Preview Cards */}
            <div className="col-12">
              <div className="vuexy-media-box">
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <label htmlFor="productImage" className="fw-semibold mb-0 d-flex align-items-center gap-2">
                    <i className="bi bi-images text-primary" aria-hidden="true" />
                    <span>{t("products.mediaTitle")}</span>
                  </label>
                  <span className="badge text-bg-primary pos-tabular">
                    {existingImages.length + queuedImages.length} / {MAX_PRODUCT_IMAGES}
                  </span>
                </div>

                <input
                  ref={mediaInputRef}
                  id="productImage"
                  type="file"
                  multiple
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  aria-label={t("products.imageLabel")}
                  className="d-none"
                  onChange={handleImageFileChange}
                  disabled={saving || existingImages.length + queuedImages.length >= MAX_PRODUCT_IMAGES}
                />

                <div
                  className={`vuexy-dropzone${isDraggingMedia ? " is-dragging" : ""}${
                    saving || existingImages.length + queuedImages.length >= MAX_PRODUCT_IMAGES
                      ? " is-disabled"
                      : ""
                  }`}
                  onClick={() => {
                    if (!saving && existingImages.length + queuedImages.length < MAX_PRODUCT_IMAGES) {
                      mediaInputRef.current?.click();
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!saving) setIsDraggingMedia(true);
                  }}
                  onDragLeave={() => setIsDraggingMedia(false)}
                  onDrop={handleDropMedia}
                >
                  <div className="vuexy-dropzone-icon" aria-hidden="true">
                    <i className="bi bi-upload" />
                  </div>
                  <div className="fw-semibold mb-1">{t("products.dropzoneTitle")}</div>
                  <div className="small text-body-secondary mb-2">{t("products.dropzoneOr")}</div>
                  <button
                    type="button"
                    className="btn btn-sm vuexy-btn-label-primary px-3"
                    onClick={(e) => {
                      e.stopPropagation();
                      mediaInputRef.current?.click();
                    }}
                    disabled={saving || existingImages.length + queuedImages.length >= MAX_PRODUCT_IMAGES}
                  >
                    {t("products.dropzoneBrowse")}
                  </button>
                  <div className="small text-body-secondary mt-2">{t("products.dropzoneHint")}</div>
                </div>

                {(fieldErrors.image || fieldErrors.images) && (
                  <div className="text-danger small mt-2">
                    {fieldErrors.image || fieldErrors.images}
                  </div>
                )}

                {(existingImages.length > 0 || queuedImages.length > 0) && (
                  <div className="vuexy-media-grid mt-3">
                    {existingImages.map((img, idx) => {
                      const isPrimary = primaryImageId === img.id;
                      const fileLabel = getFileNameFromUrl(img.image_url, `Image #${idx + 1}`);
                      return (
                        <div
                          key={img.id}
                          className={`vuexy-media-card${isPrimary ? " is-primary" : ""}`}
                        >
                          <div className="vuexy-media-thumb-wrap">
                            <img
                              src={img.image_url}
                              alt={editingProduct?.name || fileLabel}
                            />
                            {isPrimary && (
                              <span className="badge text-bg-primary position-absolute top-0 start-0 m-2">
                                <i className="bi bi-star-fill me-1" aria-hidden="true" />
                                {t("products.primaryBadge")}
                              </span>
                            )}
                          </div>
                          <div className="vuexy-media-footer">
                            <div className="small fw-medium text-truncate" title={fileLabel}>
                              {fileLabel}
                            </div>
                            {!isPrimary && (
                              <button
                                type="button"
                                className="btn btn-sm vuexy-btn-label-primary py-0 px-2 w-100"
                                style={{ fontSize: "0.72rem" }}
                                onClick={() => setPrimaryImageId(img.id)}
                                disabled={saving}
                              >
                                <i className="bi bi-star me-1" aria-hidden="true" />
                                {t("products.setPrimary")}
                              </button>
                            )}
                          </div>
                          <button
                            type="button"
                            className="vuexy-media-remove-btn"
                            aria-label={`Remove image ${img.id}`}
                            onClick={() => handleMarkExistingImageDeleted(img.id)}
                            disabled={saving}
                          >
                            {t("products.removeFile")}
                          </button>
                        </div>
                      );
                    })}

                    {queuedImages.map((entry, idx) => (
                      <div key={`${entry.file.name}-${idx}`} className="vuexy-media-card">
                        <div className="vuexy-media-thumb-wrap">
                          <img src={entry.previewUrl} alt={entry.file.name} />
                          <span className="badge text-bg-success position-absolute top-0 start-0 m-2">
                            {t("products.newBadge")}
                          </span>
                        </div>
                        <div className="vuexy-media-footer">
                          <div className="small fw-medium text-truncate" title={entry.file.name}>
                            {entry.file.name}
                          </div>
                          <div className="small text-body-secondary pos-tabular" style={{ fontSize: "0.72rem" }}>
                            {formatFileSize(entry.file.size)}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="vuexy-media-remove-btn"
                          aria-label={`Remove queued image ${entry.file.name}`}
                          onClick={() => handleRemoveQueuedImage(idx)}
                          disabled={saving}
                        >
                          {t("products.removeFile")}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {legacyPreviewUrl && !formData.remove_image && existingImages.length === 0 && (
                  <div className="vuexy-media-grid mt-3">
                    <div className="vuexy-media-card is-primary">
                      <div className="vuexy-media-thumb-wrap">
                        <img src={legacyPreviewUrl} alt="Preview" />
                        <span className="badge text-bg-primary position-absolute top-0 start-0 m-2">
                          {t("products.primaryBadge")}
                        </span>
                      </div>
                      <div className="vuexy-media-footer">
                        <div className="small fw-medium text-truncate">
                          {getFileNameFromUrl(legacyPreviewUrl, "Cover image")}
                        </div>
                      </div>
                      {editingProduct?.image_url && (
                        <button
                          type="button"
                          className="vuexy-media-remove-btn"
                          onClick={() => {
                            setFormData((prev) => ({ ...prev, remove_image: true }));
                            setLegacyPreviewUrl(null);
                          }}
                          disabled={saving}
                        >
                          {t("products.removeImage")}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
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
