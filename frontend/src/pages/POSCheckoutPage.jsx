import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ReceiptModal from "../components/sales/ReceiptModal";
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
import { usePreferences } from "../contexts/PreferencesContext";
import { useToast } from "../contexts/ToastContext";
import { fetchCategories } from "../services/categoriesService";
import {
  checkoutSale,
  createCustomer,
  fetchCustomers,
  fetchPOSCatalog,
} from "../services/salesService";
import { extractApiError } from "../utils/apiError";

function formatMoney(value) {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return "$0.00";
  return `$${num.toFixed(2)}`;
}

function formatQty(value) {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return "0";
  return Number.isInteger(num) ? String(num) : num.toFixed(3).replace(/\.?0+$/, "");
}

function roundMoney(num) {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function generateIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `pos-${crypto.randomUUID()}`;
  }
  return `pos-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const EMPTY_CUSTOMER_FORM = {
  name: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
};

export default function POSCheckoutPage() {
  const { hasPermission } = useAuth();
  const { t, language } = usePreferences();
  const { showToast } = useToast();

  const canDiscount = hasPermission("sales.discount");
  const canCreateCustomer = hasPermission("customers.create");
  const canViewSales = hasPermission("sales.view");

  const [catalog, setCatalog] = useState([]);
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const searchInputRef = useRef(null);

  // Cart state
  const [cart, setCart] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [discountInput, setDiscountInput] = useState("0.00");
  const [orderNotes, setOrderNotes] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(generateIdempotencyKey);

  // Payment modal state
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paidAmountInput, setPaidAmountInput] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [splitPayments, setSplitPayments] = useState([
    { payment_method: "cash", amount: "", reference_code: "" },
    { payment_method: "qr", amount: "", reference_code: "" },
  ]);
  const [paymentError, setPaymentError] = useState("");
  const [submittingSale, setSubmittingSale] = useState(false);

  // Receipt modal state
  const [completedSale, setCompletedSale] = useState(null);

  // Quick customer modal state
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customerForm, setCustomerForm] = useState(EMPTY_CUSTOMER_FORM);
  const [customerError, setCustomerError] = useState("");
  const [savingCustomer, setSavingCustomer] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 200);
    return () => clearTimeout(timer);
  }, [search]);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = { page_size: 100 };
      if (debouncedSearch) params.search = debouncedSearch;
      if (categoryFilter) params.category = categoryFilter;
      const data = await fetchPOSCatalog(params);
      setCatalog(data.results || []);
    } catch (err) {
      setError(extractApiError(err, "Unable to load POS product catalog."));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, categoryFilter]);

  const loadReferenceData = useCallback(async () => {
    try {
      const [catData, custData] = await Promise.all([
        fetchCategories({ page_size: 100, is_active: "true" }).catch(() => ({ results: [] })),
        fetchCustomers({ page_size: 100, is_active: "true" }).catch(() => ({ results: [] })),
      ]);
      setCategories(catData.results || []);
      setCustomers(custData.results || []);
    } catch {
      // Non-blocking reference data
    }
  }, []);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const addProductToCart = useCallback(
    (product) => {
      const stockQty = Number(product.stock_quantity || 0);
      if (product.track_inventory && stockQty <= 0) {
        showToast({ variant: "warning", message: `${product.name}: ${t("sales.outOfStock")}` });
        return;
      }

      setCart((prev) => {
        const existing = prev.find((item) => item.product.id === product.id);
        if (existing) {
          const nextQty = existing.quantity + 1;
          if (product.track_inventory && nextQty > stockQty) {
            showToast({
              variant: "warning",
              message: `${product.name}: max available stock is ${formatQty(stockQty)}`,
            });
            return prev;
          }
          return prev.map((item) =>
            item.product.id === product.id
              ? { ...item, quantity: nextQty, quantityInput: String(nextQty) }
              : item
          );
        }
        return [...prev, { product, quantity: 1, quantityInput: "1" }];
      });
    },
    [showToast, t]
  );

  const handleSearchKeyDown = (e) => {
    if (e.key !== "Enter") return;
    const term = search.trim().toLowerCase();
    if (!term) return;
    const exactMatch = catalog.find(
      (p) =>
        (p.barcode && p.barcode.toLowerCase() === term) ||
        (p.sku && p.sku.toLowerCase() === term)
    );
    const target = exactMatch || (catalog.length === 1 ? catalog[0] : null);
    if (target) {
      e.preventDefault();
      addProductToCart(target);
      setSearch("");
    }
  };

  const updateCartItemQuantity = (productId, rawValue) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.product.id !== productId) return item;
        const parsed = Number(rawValue);
        return {
          ...item,
          quantityInput: rawValue,
          quantity: Number.isFinite(parsed) && parsed > 0 ? parsed : item.quantity,
        };
      })
    );
  };

  const stepCartItemQuantity = (productId, delta) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id !== productId) return item;
          const next = roundMoney(item.quantity + delta);
          if (next <= 0) return null;
          const stockQty = Number(item.product.stock_quantity || 0);
          if (item.product.track_inventory && next > stockQty) {
            showToast({
              variant: "warning",
              message: `${item.product.name}: max available stock is ${formatQty(stockQty)}`,
            });
            return item;
          }
          return { ...item, quantity: next, quantityInput: String(next) };
        })
        .filter(Boolean)
    );
  };

  const removeCartItem = (productId) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setDiscountInput("0.00");
    setOrderNotes("");
    setSelectedCustomerId("");
    setIdempotencyKey(generateIdempotencyKey());
  };

  // Preview totals matching backend proportional discount + tax formula
  const totals = useMemo(() => {
    const subtotal = roundMoney(
      cart.reduce(
        (sum, item) => sum + roundMoney(item.quantity * Number(item.product.selling_price || 0)),
        0
      )
    );
    const rawDiscount = canDiscount ? Number(discountInput || 0) : 0;
    const discount = Number.isFinite(rawDiscount) && rawDiscount >= 0 ? roundMoney(rawDiscount) : 0;
    const clampedDiscount = Math.min(discount, subtotal);

    let remainingDiscount = clampedDiscount;
    let taxTotal = 0;

    cart.forEach((item, idx) => {
      const lineSubtotal = roundMoney(item.quantity * Number(item.product.selling_price || 0));
      let allocated = 0;
      if (subtotal > 0 && clampedDiscount > 0) {
        if (idx === cart.length - 1) {
          allocated = remainingDiscount;
        } else {
          allocated = roundMoney((clampedDiscount * lineSubtotal) / subtotal);
          allocated = Math.min(allocated, remainingDiscount, lineSubtotal);
          remainingDiscount = roundMoney(remainingDiscount - allocated);
        }
      }
      const taxableBase = Math.max(0, roundMoney(lineSubtotal - allocated));
      const rate = Number(item.product.tax_rate || 0);
      taxTotal = roundMoney(taxTotal + roundMoney((taxableBase * rate) / 100));
    });

    const grandTotal = roundMoney(subtotal - clampedDiscount + taxTotal);
    return {
      subtotal,
      discount: rawDiscount,
      taxTotal,
      grandTotal,
    };
  }, [cart, discountInput, canDiscount]);

  const openPaymentModal = () => {
    if (cart.length === 0) return;
    if (canDiscount && (Number(discountInput || 0) < 0 || Number(discountInput || 0) > totals.subtotal)) {
      showToast({ variant: "danger", message: t("sales.discountInvalid") });
      return;
    }
    setPaymentError("");
    setPaymentMethod("cash");
    setPaidAmountInput(totals.grandTotal.toFixed(2));
    setPaymentReference("");
    setSplitPayments([
      { payment_method: "cash", amount: totals.grandTotal.toFixed(2), reference_code: "" },
      { payment_method: "qr", amount: "", reference_code: "" },
    ]);
    setPaymentModalOpen(true);
  };

  const handleMethodChange = (nextMethod) => {
    setPaymentMethod(nextMethod);
    setPaymentError("");
    if (nextMethod !== "split") {
      setPaidAmountInput(totals.grandTotal.toFixed(2));
    }
  };

  const paymentSummary = useMemo(() => {
    if (paymentMethod === "split") {
      const totalPaid = roundMoney(
        splitPayments.reduce((sum, p) => sum + (Number(p.amount) > 0 ? Number(p.amount) : 0), 0)
      );
      const change = Math.max(0, roundMoney(totalPaid - totals.grandTotal));
      const remaining = Math.max(0, roundMoney(totals.grandTotal - totalPaid));
      return { totalPaid, change, remaining };
    }
    const totalPaid = roundMoney(Number(paidAmountInput || 0));
    const change = Math.max(0, roundMoney(totalPaid - totals.grandTotal));
    const remaining = Math.max(0, roundMoney(totals.grandTotal - totalPaid));
    return { totalPaid, change, remaining };
  }, [paymentMethod, paidAmountInput, splitPayments, totals.grandTotal]);

  const handleCompleteSale = async (e) => {
    e.preventDefault();
    if (submittingSale) return;
    setPaymentError("");

    const payload = {
      customer: selectedCustomerId ? Number(selectedCustomerId) : null,
      items: cart.map((item) => ({
        product: item.product.id,
        quantity: String(item.quantity),
      })),
      discount_amount: canDiscount ? Number(discountInput || 0).toFixed(2) : "0.00",
      notes: orderNotes.trim(),
      idempotency_key: idempotencyKey,
    };

    if (paymentMethod === "split") {
      const validLines = splitPayments
        .filter((p) => Number(p.amount) > 0)
        .map((p) => ({
          payment_method: p.payment_method,
          amount: Number(p.amount).toFixed(2),
          reference_code: (p.reference_code || "").trim(),
        }));
      const sumPaid = roundMoney(validLines.reduce((s, p) => s + Number(p.amount), 0));
      if (sumPaid < totals.grandTotal) {
        setPaymentError(t("sales.insufficientPayment"));
        return;
      }
      const hasCash = validLines.some((p) => p.payment_method === "cash");
      if (!hasCash && sumPaid > totals.grandTotal) {
        setPaymentError(t("sales.nonCashOverpay"));
        return;
      }
      payload.payments = validLines;
    } else {
      const paidNum = roundMoney(Number(paidAmountInput || 0));
      if (paidNum < totals.grandTotal) {
        setPaymentError(t("sales.insufficientPayment"));
        return;
      }
      if (paymentMethod !== "cash" && paidNum > totals.grandTotal) {
        setPaymentError(t("sales.nonCashOverpay"));
        return;
      }
      payload.payment_method = paymentMethod;
      payload.paid_amount = paidNum.toFixed(2);
      payload.payment_reference = paymentReference.trim();
    }

    setSubmittingSale(true);
    try {
      const created = await checkoutSale(payload, idempotencyKey);
      setPaymentModalOpen(false);
      setCompletedSale(created);
      clearCart();
      showToast({
        variant: "success",
        message: `${t("sales.saleCompletedToast")} (${created.sale_number})`,
      });
      await loadCatalog();
    } catch (err) {
      setPaymentError(extractApiError(err, "Checkout failed. Please review payment and stock."));
    } finally {
      setSubmittingSale(false);
    }
  };

  const handleSaveQuickCustomer = async (e) => {
    e.preventDefault();
    if (!customerForm.name.trim()) {
      setCustomerError("Customer name is required.");
      return;
    }
    setSavingCustomer(true);
    setCustomerError("");
    try {
      const created = await createCustomer({
        name: customerForm.name.trim(),
        phone: customerForm.phone.trim(),
        email: customerForm.email.trim(),
        address: customerForm.address.trim(),
        notes: customerForm.notes.trim(),
        is_active: true,
      });
      setCustomers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedCustomerId(String(created.id));
      setCustomerModalOpen(false);
      setCustomerForm(EMPTY_CUSTOMER_FORM);
      showToast({ variant: "success", message: t("sales.customerSavedToast") });
    } catch (err) {
      setCustomerError(extractApiError(err, "Unable to create customer."));
    } finally {
      setSavingCustomer(false);
    }
  };

  return (
    <div className="d-flex flex-column gap-3">
      <PageHeader
        title={t("sales.posTitle")}
        subtitle={t("sales.posSubtitle")}
        icon="bi-cash-register"
        actions={
          canViewSales ? (
            <Link to="/sales" className="btn btn-outline-secondary">
              <i className="bi bi-receipt me-2" aria-hidden="true" />
              {t("sales.tabSales")}
            </Link>
          ) : null
        }
      />

      <div className="row g-3 align-items-start">
        {/* Left: Fast Product Search, Category Pills & Product Grid */}
        <div className="col-12 col-lg-7 col-xl-8">
          <AppCard
            bodyClassName="p-3"
            headerActions={
              <div className="input-group input-group-sm" style={{ minWidth: "260px", maxWidth: "460px" }}>
                <span className="input-group-text">
                  <i className="bi bi-upc-scan" aria-hidden="true" />
                </span>
                <input
                  ref={searchInputRef}
                  type="search"
                  className="form-control"
                  aria-label="Search POS catalog"
                  placeholder={t("sales.searchCatalogPlaceholder")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                />
              </div>
            }
          >
            {/* Category filter pills */}
            <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Category filter">
              <button
                type="button"
                className={`btn btn-sm ${categoryFilter === "" ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => setCategoryFilter("")}
              >
                {t("sales.allCategories")}
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={`btn btn-sm ${
                    String(categoryFilter) === String(cat.id)
                      ? "btn-primary"
                      : "btn-outline-secondary"
                  }`}
                  onClick={() => setCategoryFilter(String(cat.id))}
                >
                  {language === "km" && cat.name_km ? cat.name_km : cat.name}
                </button>
              ))}
            </div>

            {error ? (
              <ErrorState message={error} onRetry={loadCatalog} />
            ) : loading ? (
              <LoadingState message={t("status.loading")} />
            ) : catalog.length === 0 ? (
              <EmptyState icon="bi-search" title={t("sales.emptyCatalog")} />
            ) : (
              <div className="row g-2">
                {catalog.map((product) => {
                  const stockNum = Number(product.stock_quantity || 0);
                  const outOfStock = product.track_inventory && stockNum <= 0;
                  const displayName =
                    language === "km" && product.name_km ? product.name_km : product.name;
                  return (
                    <div key={product.id} className="col-6 col-md-4 col-xxl-3">
                      <button
                        type="button"
                        disabled={outOfStock}
                        onClick={() => addProductToCart(product)}
                        className={`card h-100 w-100 text-start p-2 border pos-surface ${
                          outOfStock ? "opacity-50" : "shadow-sm"
                        }`}
                        style={{ cursor: outOfStock ? "not-allowed" : "pointer" }}
                      >
                        <div className="d-flex justify-content-between align-items-start gap-1 mb-1">
                          <code className="small text-body-secondary">{product.sku}</code>
                          {!product.track_inventory ? (
                            <span className="badge text-bg-info">{t("sales.untracked")}</span>
                          ) : outOfStock ? (
                            <span className="badge text-bg-danger">{t("sales.outOfStock")}</span>
                          ) : (
                            <span className="badge text-bg-success pos-tabular">
                              {formatQty(stockNum)} {product.unit_abbreviation}
                            </span>
                          )}
                        </div>
                        <div className="fw-semibold small text-truncate mb-1" title={displayName}>
                          {displayName}
                        </div>
                        <div className="d-flex justify-content-between align-items-center mt-auto pt-1">
                          <span className="fw-bold text-primary pos-tabular">
                            {formatMoney(product.selling_price)}
                          </span>
                          <span className="small text-body-secondary">
                            /{product.unit_abbreviation}
                          </span>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </AppCard>
        </div>

        {/* Right: Active Cart & Checkout Summary */}
        <div className="col-12 col-lg-5 col-xl-4">
          <AppCard
            title={`${t("sales.cartTitle")} (${cart.length})`}
            icon="bi-cart3"
            headerActions={
              cart.length > 0 ? (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  onClick={clearCart}
                >
                  {t("sales.clearCart")}
                </button>
              ) : null
            }
          >
            {/* Customer selector */}
            <div className="mb-3">
              <label htmlFor="pos-customer-select" className="form-label small fw-semibold mb-1">
                {t("sales.customerLabel")}
              </label>
              <div className="input-group input-group-sm">
                <select
                  id="pos-customer-select"
                  className="form-select"
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                >
                  <option value="">{t("sales.walkInCustomer")}</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.phone ? ` (${c.phone})` : ""}
                    </option>
                  ))}
                </select>
                {canCreateCustomer ? (
                  <button
                    type="button"
                    className="btn btn-outline-primary"
                    title={t("sales.newCustomer")}
                    aria-label={t("sales.newCustomer")}
                    onClick={() => {
                      setCustomerForm(EMPTY_CUSTOMER_FORM);
                      setCustomerError("");
                      setCustomerModalOpen(true);
                    }}
                  >
                    <i className="bi bi-person-plus" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </div>

            {/* Cart items */}
            {cart.length === 0 ? (
              <div className="text-center text-body-secondary py-4 small border rounded mb-3">
                <i className="bi bi-cart-x fs-3 d-block mb-2" aria-hidden="true" />
                {t("sales.emptyCart")}
              </div>
            ) : (
              <div className="d-flex flex-column gap-2 mb-3" style={{ maxHeight: "340px", overflowY: "auto" }}>
                {cart.map((item) => {
                  const lineSub = roundMoney(item.quantity * Number(item.product.selling_price || 0));
                  return (
                    <div key={item.product.id} className="border rounded p-2">
                      <div className="d-flex justify-content-between align-items-start gap-2 mb-1">
                        <div className="min-w-0">
                          <div className="fw-semibold small text-truncate">{item.product.name}</div>
                          <div className="small text-body-secondary pos-tabular">
                            {formatMoney(item.product.selling_price)} / {item.product.unit_abbreviation}
                            {Number(item.product.tax_rate) > 0 ? ` · +${item.product.tax_rate}% tax` : ""}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-sm btn-link text-danger p-0"
                          aria-label={`Remove ${item.product.name}`}
                          onClick={() => removeCartItem(item.product.id)}
                        >
                          <i className="bi bi-x-lg" aria-hidden="true" />
                        </button>
                      </div>
                      <div className="d-flex justify-content-between align-items-center gap-2">
                        <div className="input-group input-group-sm" style={{ width: "126px" }}>
                          <button
                            type="button"
                            className="btn btn-outline-secondary"
                            aria-label={`Decrease ${item.product.name}`}
                            onClick={() => stepCartItemQuantity(item.product.id, -1)}
                          >
                            -
                          </button>
                          <input
                            type="number"
                            className="form-control text-center pos-tabular px-1"
                            aria-label={`Quantity for ${item.product.name}`}
                            step={item.product.unit_allow_decimal ? "0.1" : "1"}
                            min={item.product.unit_allow_decimal ? "0.001" : "1"}
                            value={item.quantityInput}
                            onChange={(e) => updateCartItemQuantity(item.product.id, e.target.value)}
                          />
                          <button
                            type="button"
                            className="btn btn-outline-secondary"
                            aria-label={`Increase ${item.product.name}`}
                            onClick={() => stepCartItemQuantity(item.product.id, 1)}
                          >
                            +
                          </button>
                        </div>
                        <span className="fw-semibold pos-tabular">{formatMoney(lineSub)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Order-level discount (RBAC gated) */}
            {canDiscount ? (
              <div className="mb-3">
                <label htmlFor="pos-discount-input" className="form-label small fw-semibold mb-1">
                  {t("sales.discountLabel")}
                </label>
                <input
                  id="pos-discount-input"
                  type="number"
                  step="0.01"
                  min="0"
                  className="form-control form-control-sm pos-tabular"
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                />
              </div>
            ) : null}

            {/* Totals breakdown */}
            <div className="border-top pt-2 mb-3">
              <div className="d-flex justify-content-between small py-1">
                <span className="text-body-secondary">{t("sales.subtotalLabel")}</span>
                <span className="pos-tabular">{formatMoney(totals.subtotal)}</span>
              </div>
              {canDiscount ? (
                <div className="d-flex justify-content-between small py-1">
                  <span className="text-body-secondary">{t("sales.discountLabel")}</span>
                  <span className="pos-tabular text-danger">-{formatMoney(totals.discount)}</span>
                </div>
              ) : null}
              <div className="d-flex justify-content-between small py-1">
                <span className="text-body-secondary">{t("sales.taxLabel")}</span>
                <span className="pos-tabular">{formatMoney(totals.taxTotal)}</span>
              </div>
              <div className="d-flex justify-content-between fw-bold fs-4 border-top pt-2 mt-1">
                <span>{t("sales.grandTotalLabel")}</span>
                <span className="pos-tabular text-primary">{formatMoney(totals.grandTotal)}</span>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-primary btn-lg w-100 fw-semibold"
              disabled={cart.length === 0}
              onClick={openPaymentModal}
            >
              <i className="bi bi-credit-card me-2" aria-hidden="true" />
              {t("sales.proceedPayment")} ({formatMoney(totals.grandTotal)})
            </button>
          </AppCard>
        </div>
      </div>

      {/* Payment Modal */}
      <AppModal
        isOpen={paymentModalOpen}
        onClose={() => !submittingSale && setPaymentModalOpen(false)}
        title={t("sales.paymentModalTitle")}
        size="md"
      >
        <form onSubmit={handleCompleteSale}>
          {paymentError ? <div className="alert alert-danger py-2 small">{paymentError}</div> : null}

          <div className="p-3 rounded bg-body-tertiary mb-3 d-flex justify-content-between align-items-center">
            <span className="fw-semibold">{t("sales.grandTotalLabel")}</span>
            <span className="fs-3 fw-bold text-primary pos-tabular">
              {formatMoney(totals.grandTotal)}
            </span>
          </div>

          <div className="mb-3">
            <label className="form-label fw-semibold small">{t("sales.paymentMethodLabel")}</label>
            <div className="btn-group w-100" role="group" aria-label={t("sales.paymentMethodLabel")}>
              {[
                { key: "cash", label: t("sales.methodCash"), icon: "bi-cash-stack" },
                { key: "card", label: t("sales.methodCard"), icon: "bi-credit-card" },
                { key: "qr", label: t("sales.methodQr"), icon: "bi-qr-code" },
                { key: "split", label: t("sales.methodSplit"), icon: "bi-diagram-2" },
              ].map((m) => (
                <button
                  key={m.key}
                  type="button"
                  className={`btn btn-sm ${
                    paymentMethod === m.key ? "btn-primary" : "btn-outline-secondary"
                  }`}
                  onClick={() => handleMethodChange(m.key)}
                >
                  <i className={`bi ${m.icon} me-1`} aria-hidden="true" />
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {paymentMethod !== "split" ? (
            <>
              <div className="mb-3">
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <label htmlFor="pos-paid-amount" className="form-label small fw-semibold mb-0">
                    {t("sales.paidAmountLabel")}
                  </label>
                  <button
                    type="button"
                    className="btn btn-link btn-sm p-0"
                    onClick={() => setPaidAmountInput(totals.grandTotal.toFixed(2))}
                  >
                    {t("sales.exactAmount")}
                  </button>
                </div>
                <input
                  id="pos-paid-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  className="form-control form-control-lg pos-tabular"
                  value={paidAmountInput}
                  onChange={(e) => setPaidAmountInput(e.target.value)}
                />
                {paymentMethod === "cash" ? (
                  <div className="d-flex flex-wrap gap-1 mt-2">
                    {[5, 10, 20, 50, 100].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        className="btn btn-outline-secondary btn-sm pos-tabular"
                        onClick={() => setPaidAmountInput(amt.toFixed(2))}
                      >
                        ${amt}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              {paymentMethod !== "cash" ? (
                <FormInput
                  id="pos-payment-ref"
                  className="mb-3"
                  label={t("sales.referenceCodeLabel")}
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="e.g. KHQR-8821 / VISA-4242"
                />
              ) : null}
            </>
          ) : (
            <div className="mb-3 d-flex flex-column gap-2">
              {splitPayments.map((row, idx) => (
                <div key={idx} className="row g-2 align-items-center">
                  <div className="col-4">
                    <select
                      aria-label={`Split method ${idx + 1}`}
                      className="form-select form-select-sm"
                      value={row.payment_method}
                      onChange={(e) =>
                        setSplitPayments((prev) =>
                          prev.map((r, i) =>
                            i === idx ? { ...r, payment_method: e.target.value } : r
                          )
                        )
                      }
                    >
                      <option value="cash">{t("sales.methodCash")}</option>
                      <option value="card">{t("sales.methodCard")}</option>
                      <option value="qr">{t("sales.methodQr")}</option>
                    </select>
                  </div>
                  <div className="col-4">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      aria-label={`Split amount ${idx + 1}`}
                      className="form-control form-control-sm pos-tabular"
                      placeholder="0.00"
                      value={row.amount}
                      onChange={(e) =>
                        setSplitPayments((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, amount: e.target.value } : r))
                        )
                      }
                    />
                  </div>
                  <div className="col-4">
                    <input
                      type="text"
                      aria-label={`Split reference ${idx + 1}`}
                      className="form-control form-control-sm"
                      placeholder="Ref #"
                      value={row.reference_code}
                      onChange={(e) =>
                        setSplitPayments((prev) =>
                          prev.map((r, i) =>
                            i === idx ? { ...r, reference_code: e.target.value } : r
                          )
                        )
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="p-2 rounded border mb-3 d-flex justify-content-between align-items-center">
            <span className="small fw-semibold">{t("sales.changeDueLabel")}</span>
            <span className="fs-5 fw-bold text-success pos-tabular">
              {formatMoney(paymentSummary.change)}
            </span>
          </div>

          <FormTextarea
            id="pos-order-notes"
            className="mb-3"
            label={t("sales.orderNotesLabel")}
            rows={2}
            value={orderNotes}
            onChange={(e) => setOrderNotes(e.target.value)}
          />

          <FormActions
            submitLabel={t("sales.confirmCheckout")}
            submittingLabel={t("sales.processingCheckout")}
            cancelLabel={t("controls.cancel")}
            onCancel={() => setPaymentModalOpen(false)}
            submitting={submittingSale}
          />
        </form>
      </AppModal>

      {/* Quick Customer Create Modal */}
      <AppModal
        isOpen={customerModalOpen}
        onClose={() => !savingCustomer && setCustomerModalOpen(false)}
        title={t("sales.createCustomerTitle")}
        size="md"
      >
        <form onSubmit={handleSaveQuickCustomer}>
          {customerError ? <div className="alert alert-danger py-2 small">{customerError}</div> : null}
          <FormInput
            id="quick-customer-name"
            className="mb-3"
            label={t("sales.customerNameLabel")}
            required
            value={customerForm.name}
            onChange={(e) => setCustomerForm((p) => ({ ...p, name: e.target.value }))}
          />
          <FormInput
            id="quick-customer-phone"
            className="mb-3"
            label={t("sales.phoneLabel")}
            value={customerForm.phone}
            onChange={(e) => setCustomerForm((p) => ({ ...p, phone: e.target.value }))}
          />
          <FormInput
            id="quick-customer-email"
            className="mb-3"
            type="email"
            label={t("sales.emailLabel")}
            value={customerForm.email}
            onChange={(e) => setCustomerForm((p) => ({ ...p, email: e.target.value }))}
          />
          <FormTextarea
            id="quick-customer-address"
            className="mb-3"
            label={t("sales.addressLabel")}
            rows={2}
            value={customerForm.address}
            onChange={(e) => setCustomerForm((p) => ({ ...p, address: e.target.value }))}
          />
          <FormActions
            submitLabel={t("controls.save")}
            cancelLabel={t("controls.cancel")}
            onCancel={() => setCustomerModalOpen(false)}
            submitting={savingCustomer}
          />
        </form>
      </AppModal>

      {/* Post-checkout Printable Receipt Modal */}
      <ReceiptModal
        isOpen={Boolean(completedSale)}
        sale={completedSale}
        onClose={() => setCompletedSale(null)}
        onNewSale={() => {
          setCompletedSale(null);
          searchInputRef.current?.focus();
        }}
      />
    </div>
  );
}
