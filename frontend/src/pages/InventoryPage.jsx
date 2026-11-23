import { useCallback, useEffect, useMemo, useState } from "react";
import StatusAlert from "../components/StatusAlert";
import {
  AppCard,
  AppModal,
  DataTable,
  ErrorState,
  FormActions,
  FormInput,
  FormSelect,
  FormTextarea,
  LoadingState,
  PageHeader,
  Pagination,
} from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { usePreferences } from "../contexts/PreferencesContext";
import { useToast } from "../contexts/ToastContext";
import { fetchCategories } from "../services/categoriesService";
import {
  fetchInventoryReport,
  fetchLowStockAlerts,
  fetchStockBalances,
  fetchStockMovements,
  submitOpeningStock,
  submitStockAdjustment,
  submitStockIn,
  submitStockOut,
} from "../services/inventoryService";

const PAGE_SIZE = 10;

const EMPTY_OP_FORM = {
  product: "",
  direction: "increase",
  quantity: "",
  unit_cost: "",
  reference_code: "",
  notes: "",
};

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "$0.00";
  const num = Number(value);
  return Number.isNaN(num) ? String(value) : `$${num.toFixed(2)}`;
}

function formatQty(value) {
  if (value === null || value === undefined || value === "") return "0";
  const num = Number(value);
  return Number.isNaN(num) ? String(value) : num.toString();
}

export default function InventoryPage() {
  const { hasPermission } = useAuth();
  const { language, t } = usePreferences();
  const toast = useToast();

  const canAdjust = hasPermission("inventory.adjust");

  const [activeTab, setActiveTab] = useState("balances"); // balances | movements | low_stock | report
  const [categories, setCategories] = useState([]);
  const [allTrackedProducts, setAllTrackedProducts] = useState([]);

  // Balances state
  const [balances, setBalances] = useState([]);
  const [balancesCount, setBalancesCount] = useState(0);
  const [balancesPage, setBalancesPage] = useState(1);
  const [balanceSearch, setBalanceSearch] = useState("");
  const [balanceCategory, setBalanceCategory] = useState("");
  const [balanceStatus, setBalanceStatus] = useState("");
  const [balancesLoading, setBalancesLoading] = useState(true);
  const [balancesError, setBalancesError] = useState("");

  // Movements state
  const [movements, setMovements] = useState([]);
  const [movementsCount, setMovementsCount] = useState(0);
  const [movementsPage, setMovementsPage] = useState(1);
  const [movementSearch, setMovementSearch] = useState("");
  const [movementType, setMovementType] = useState("");
  const [movementProduct, setMovementProduct] = useState("");
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [movementsError, setMovementsError] = useState("");

  // Low-stock alerts state
  const [alerts, setAlerts] = useState([]);
  const [alertsCount, setAlertsCount] = useState(0);
  const [alertsPage, setAlertsPage] = useState(1);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState("");

  // Valuation report state
  const [report, setReport] = useState(null);
  const [reportCategory, setReportCategory] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");

  // Stock operation modal state
  const [opModalType, setOpModalType] = useState(null); // opening | stock_in | stock_out | adjustment
  const [opForm, setOpForm] = useState(EMPTY_OP_FORM);
  const [opErrors, setOpErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const loadLookups = useCallback(async () => {
    try {
      const [catsResp, trackedResp] = await Promise.all([
        fetchCategories({ page: 1, page_size: 100 }),
        fetchStockBalances({ page: 1, page_size: 100 }),
      ]);
      setCategories(catsResp.results || catsResp);
      setAllTrackedProducts(trackedResp.results || trackedResp);
    } catch {
      // Non-blocking
    }
  }, []);

  const loadBalances = useCallback(async () => {
    setBalancesLoading(true);
    setBalancesError("");
    try {
      const params = { page: balancesPage, page_size: PAGE_SIZE };
      if (balanceSearch.trim()) params.search = balanceSearch.trim();
      if (balanceCategory) params.category = balanceCategory;
      if (balanceStatus) params.stock_status = balanceStatus;

      const data = await fetchStockBalances(params);
      const rows = data.results || data;
      setBalances(rows);
      setBalancesCount(typeof data.count === "number" ? data.count : rows.length);
    } catch (err) {
      setBalancesError(err?.message || "Failed to load stock balances.");
    } finally {
      setBalancesLoading(false);
    }
  }, [balancesPage, balanceSearch, balanceCategory, balanceStatus]);

  const loadMovements = useCallback(async () => {
    setMovementsLoading(true);
    setMovementsError("");
    try {
      const params = { page: movementsPage, page_size: PAGE_SIZE };
      if (movementSearch.trim()) params.search = movementSearch.trim();
      if (movementType) params.movement_type = movementType;
      if (movementProduct) params.product = movementProduct;

      const data = await fetchStockMovements(params);
      const rows = data.results || data;
      setMovements(rows);
      setMovementsCount(typeof data.count === "number" ? data.count : rows.length);
    } catch (err) {
      setMovementsError(err?.message || "Failed to load movement history.");
    } finally {
      setMovementsLoading(false);
    }
  }, [movementsPage, movementSearch, movementType, movementProduct]);

  const loadLowStockAlerts = useCallback(async () => {
    setAlertsLoading(true);
    setAlertsError("");
    try {
      const data = await fetchLowStockAlerts({ page: alertsPage, page_size: PAGE_SIZE });
      const rows = data.results || data;
      setAlerts(rows);
      setAlertsCount(typeof data.count === "number" ? data.count : rows.length);
    } catch (err) {
      setAlertsError(err?.message || "Failed to load low-stock alerts.");
    } finally {
      setAlertsLoading(false);
    }
  }, [alertsPage]);

  const loadReport = useCallback(async () => {
    setReportLoading(true);
    setReportError("");
    try {
      const params = {};
      if (reportCategory) params.category = reportCategory;
      const data = await fetchInventoryReport(params);
      setReport(data);
    } catch (err) {
      setReportError(err?.message || "Failed to load inventory valuation report.");
    } finally {
      setReportLoading(false);
    }
  }, [reportCategory]);

  useEffect(() => {
    loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    loadBalances();
  }, [loadBalances]);

  useEffect(() => {
    loadLowStockAlerts();
  }, [loadLowStockAlerts]);

  useEffect(() => {
    if (activeTab === "movements") loadMovements();
  }, [activeTab, loadMovements]);

  useEffect(() => {
    if (activeTab === "report") loadReport();
  }, [activeTab, loadReport]);

  const openOperationModal = useCallback((type, productItem = null) => {
    setOpModalType(type);
    setOpErrors({});
    setOpForm({
      ...EMPTY_OP_FORM,
      product: productItem ? String(productItem.product_id) : "",
      unit_cost:
        productItem && (type === "opening" || type === "stock_in")
          ? String(productItem.purchase_cost || "")
          : "",
    });
  }, []);

  const extractFieldErrors = (err) => {
    if (!err?.errors || typeof err.errors !== "object") return {};
    const mapped = {};
    for (const [key, val] of Object.entries(err.errors)) {
      mapped[key] = Array.isArray(val) ? val[0] : String(val);
    }
    return mapped;
  };

  const handleSubmitOperation = async (event) => {
    event.preventDefault();
    const errors = {};
    const qtyNum = Number(opForm.quantity);
    if (!opForm.product) errors.product = t("inventory.productRequired");
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      errors.quantity = t("inventory.quantityInvalid");
    }
    if (opModalType === "adjustment" && !opForm.notes.trim()) {
      errors.notes = t("inventory.notesRequired");
    }

    if (Object.keys(errors).length > 0) {
      setOpErrors(errors);
      return;
    }

    setSubmitting(true);
    setOpErrors({});
    try {
      const basePayload = {
        product: Number(opForm.product),
        quantity: String(opForm.quantity).trim(),
        reference_code: opForm.reference_code.trim(),
        notes: opForm.notes.trim(),
      };

      if (opModalType === "opening") {
        if (opForm.unit_cost.trim() !== "") basePayload.unit_cost = opForm.unit_cost.trim();
        await submitOpeningStock(basePayload);
      } else if (opModalType === "stock_in") {
        if (opForm.unit_cost.trim() !== "") basePayload.unit_cost = opForm.unit_cost.trim();
        await submitStockIn(basePayload);
      } else if (opModalType === "stock_out") {
        await submitStockOut(basePayload);
      } else if (opModalType === "adjustment") {
        basePayload.direction = opForm.direction;
        if (opForm.direction === "increase" && opForm.unit_cost.trim() !== "") {
          basePayload.unit_cost = opForm.unit_cost.trim();
        }
        await submitStockAdjustment(basePayload);
      }

      toast.success(t("inventory.recordedToast"));
      setOpModalType(null);
      await Promise.all([
        loadBalances(),
        loadLowStockAlerts(),
        activeTab === "movements" ? loadMovements() : Promise.resolve(),
        activeTab === "report" ? loadReport() : Promise.resolve(),
      ]);
    } catch (err) {
      const mapped = extractFieldErrors(err);
      if (Object.keys(mapped).length > 0) setOpErrors(mapped);
      toast.error(err?.message || "Inventory operation failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const movementTypeLabel = useCallback(
    (code) => {
      const map = {
        opening: "inventory.typeOpening",
        stock_in: "inventory.typeStockIn",
        stock_out: "inventory.typeStockOut",
        adjustment: "inventory.typeAdjustment",
        sale: "inventory.typeSale",
        purchase: "inventory.typePurchase",
        refund: "inventory.typeRefund",
        void: "inventory.typeVoid",
      };
      return map[code] ? t(map[code]) : code;
    },
    [t]
  );

  const stockStatusBadge = useCallback(
    (statusCode) => {
      if (statusCode === "out_of_stock") {
        return <span className="badge text-bg-danger">{t("inventory.statusOutOfStock")}</span>;
      }
      if (statusCode === "low_stock") {
        return <span className="badge text-bg-warning">{t("inventory.statusLowStock")}</span>;
      }
      return <span className="badge text-bg-success">{t("inventory.statusInStock")}</span>;
    },
    [t]
  );

  const productSelectOptions = useMemo(() => {
    const source = allTrackedProducts.length > 0 ? allTrackedProducts : balances;
    return [
      { value: "", label: t("inventory.selectProduct") },
      ...source.map((p) => ({
        value: String(p.product_id),
        label: `${p.sku} — ${language === "km" && p.name_km ? p.name_km : p.name} (${formatQty(p.quantity_on_hand)} ${p.unit_abbreviation})`,
      })),
    ];
  }, [allTrackedProducts, balances, language, t]);

  const balanceColumns = useMemo(
    () => [
      {
        key: "product",
        header: t("inventory.colProduct"),
        render: (row) => (
          <div>
            <div className="fw-semibold">
              {language === "km" && row.name_km ? row.name_km : row.name}
            </div>
            <div className="small text-body-secondary">
              <code>{row.sku}</code> · {row.category_name}
            </div>
          </div>
        ),
      },
      {
        key: "quantity_on_hand",
        header: t("inventory.colOnHand"),
        cellClassName: "pos-tabular fw-semibold",
        render: (row) => (
          <span>
            {formatQty(row.quantity_on_hand)} {row.unit_abbreviation}
          </span>
        ),
      },
      {
        key: "min_stock_threshold",
        header: t("inventory.colMinThreshold"),
        cellClassName: "pos-tabular small text-body-secondary",
        render: (row) => (
          <span>
            {formatQty(row.min_stock_threshold)} {row.unit_abbreviation}
          </span>
        ),
      },
      {
        key: "average_unit_cost",
        header: t("inventory.colAvgCost"),
        cellClassName: "pos-tabular small",
        render: (row) => formatMoney(row.average_unit_cost),
      },
      {
        key: "stock_value",
        header: t("inventory.colStockValue"),
        cellClassName: "pos-tabular fw-medium",
        render: (row) => formatMoney(row.stock_value),
      },
      {
        key: "stock_status",
        header: t("inventory.colStockStatus"),
        render: (row) => stockStatusBadge(row.stock_status),
      },
      ...(canAdjust
        ? [
            {
              key: "actions",
              header: t("inventory.colActions"),
              headerClassName: "text-end",
              cellClassName: "text-end",
              render: (row) => (
                <div className="btn-group btn-group-sm">
                  <button
                    type="button"
                    className="btn btn-outline-success"
                    onClick={() => openOperationModal("stock_in", row)}
                  >
                    + In
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-warning"
                    onClick={() => openOperationModal("stock_out", row)}
                  >
                    - Out
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-primary"
                    onClick={() => openOperationModal("adjustment", row)}
                  >
                    Adjust
                  </button>
                </div>
              ),
            },
          ]
        : []),
    ],
    [canAdjust, language, openOperationModal, stockStatusBadge, t]
  );

  const alertColumns = useMemo(
    () => [
      {
        key: "product",
        header: t("inventory.colProduct"),
        render: (row) => (
          <div>
            <div className="fw-semibold">
              {language === "km" && row.name_km ? row.name_km : row.name}
            </div>
            <div className="small text-body-secondary">
              <code>{row.sku}</code> · {row.category_name}
            </div>
          </div>
        ),
      },
      {
        key: "quantity_on_hand",
        header: t("inventory.colOnHand"),
        cellClassName: "pos-tabular fw-semibold text-danger",
        render: (row) => (
          <span>
            {formatQty(row.quantity_on_hand)} {row.unit_abbreviation}
          </span>
        ),
      },
      {
        key: "min_stock_threshold",
        header: t("inventory.colMinThreshold"),
        cellClassName: "pos-tabular small",
        render: (row) => (
          <span>
            {formatQty(row.min_stock_threshold)} {row.unit_abbreviation}
          </span>
        ),
      },
      {
        key: "shortage",
        header: t("inventory.colShortage"),
        cellClassName: "pos-tabular fw-semibold",
        render: (row) => (
          <span>
            {formatQty(row.shortage)} {row.unit_abbreviation}
          </span>
        ),
      },
      {
        key: "stock_status",
        header: t("inventory.colStockStatus"),
        render: (row) => stockStatusBadge(row.stock_status),
      },
      ...(canAdjust
        ? [
            {
              key: "restock",
              header: t("inventory.colActions"),
              headerClassName: "text-end",
              cellClassName: "text-end",
              render: (row) => (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-success"
                  onClick={() => openOperationModal("stock_in", row)}
                >
                  <i className="bi bi-plus-circle me-1" aria-hidden="true" />
                  {t("inventory.opStockIn")}
                </button>
              ),
            },
          ]
        : []),
    ],
    [canAdjust, language, openOperationModal, stockStatusBadge, t]
  );

  const movementColumns = useMemo(
    () => [
      {
        key: "created_at",
        header: t("inventory.colDate"),
        cellClassName: "small pos-tabular text-nowrap",
        render: (m) => new Date(m.created_at).toLocaleString(),
      },
      {
        key: "product",
        header: t("inventory.colProduct"),
        render: (m) => (
          <div>
            <div className="fw-medium">
              {language === "km" && m.product_name_km ? m.product_name_km : m.product_name}
            </div>
            <code className="small text-body-secondary">{m.product_sku}</code>
          </div>
        ),
      },
      {
        key: "movement_type",
        header: t("inventory.colType"),
        render: (m) => (
          <span className="badge text-bg-secondary">{movementTypeLabel(m.movement_type)}</span>
        ),
      },
      {
        key: "quantity_delta",
        header: t("inventory.colChange"),
        cellClassName: "pos-tabular fw-semibold",
        render: (m) => {
          const isPos = Number(m.quantity_delta) > 0;
          return (
            <span className={isPos ? "text-success" : "text-danger"}>
              {isPos ? "+" : ""}
              {formatQty(m.quantity_delta)} {m.unit_abbreviation}
            </span>
          );
        },
      },
      {
        key: "balance",
        header: t("inventory.colBeforeAfter"),
        cellClassName: "pos-tabular small text-nowrap",
        render: (m) => `${formatQty(m.balance_before)} → ${formatQty(m.balance_after)}`,
      },
      {
        key: "reference",
        header: t("inventory.colReference"),
        cellClassName: "small",
        render: (m) => (
          <div>
            {m.reference_code && <code className="me-2">{m.reference_code}</code>}
            <span className="text-body-secondary">{m.notes || "—"}</span>
          </div>
        ),
      },
      {
        key: "created_by",
        header: t("inventory.colUser"),
        cellClassName: "small",
        render: (m) => m.created_by_full_name || m.created_by_username,
      },
    ],
    [language, movementTypeLabel, t]
  );

  const opModalTitle = useMemo(() => {
    if (opModalType === "opening") return t("inventory.opOpening");
    if (opModalType === "stock_in") return t("inventory.opStockIn");
    if (opModalType === "stock_out") return t("inventory.opStockOut");
    if (opModalType === "adjustment") return t("inventory.opAdjustment");
    return "";
  }, [opModalType, t]);

  return (
    <div className="d-flex flex-column gap-4">
      <PageHeader
        icon="bi-boxes"
        title={t("inventory.title")}
        subtitle={t("inventory.subtitle")}
        actions={
          canAdjust && (
            <>
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                onClick={() => openOperationModal("opening")}
              >
                <i className="bi bi-flag me-1" aria-hidden="true" />
                {t("inventory.opOpening")}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-success"
                onClick={() => openOperationModal("stock_in")}
              >
                <i className="bi bi-arrow-down-circle me-1" aria-hidden="true" />
                {t("inventory.opStockIn")}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-warning"
                onClick={() => openOperationModal("stock_out")}
              >
                <i className="bi bi-arrow-up-circle me-1" aria-hidden="true" />
                {t("inventory.opStockOut")}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => openOperationModal("adjustment")}
              >
                <i className="bi bi-sliders me-1" aria-hidden="true" />
                {t("inventory.opAdjustment")}
              </button>
            </>
          )
        }
      />

      {/* Navigation Tabs */}
      <ul className="nav nav-tabs" role="tablist">
        <li className="nav-item" role="presentation">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "balances"}
            className={`nav-link${activeTab === "balances" ? " active fw-semibold" : ""}`}
            onClick={() => setActiveTab("balances")}
          >
            <i className="bi bi-clipboard-data me-1" aria-hidden="true" />
            {t("inventory.tabBalances")}
          </button>
        </li>
        <li className="nav-item" role="presentation">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "movements"}
            className={`nav-link${activeTab === "movements" ? " active fw-semibold" : ""}`}
            onClick={() => setActiveTab("movements")}
          >
            <i className="bi bi-clock-history me-1" aria-hidden="true" />
            {t("inventory.tabMovements")}
          </button>
        </li>
        <li className="nav-item" role="presentation">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "low_stock"}
            className={`nav-link d-flex align-items-center gap-2${
              activeTab === "low_stock" ? " active fw-semibold" : ""
            }`}
            onClick={() => setActiveTab("low_stock")}
          >
            <i className="bi bi-exclamation-triangle" aria-hidden="true" />
            <span>{t("inventory.tabLowStock")}</span>
            {alertsCount > 0 && <span className="badge text-bg-danger">{alertsCount}</span>}
          </button>
        </li>
        <li className="nav-item" role="presentation">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "report"}
            className={`nav-link${activeTab === "report" ? " active fw-semibold" : ""}`}
            onClick={() => setActiveTab("report")}
          >
            <i className="bi bi-bar-chart-line me-1" aria-hidden="true" />
            {t("inventory.tabReport")}
          </button>
        </li>
      </ul>

      {/* Tab 1: Stock Balances */}
      {activeTab === "balances" && (
        <AppCard
          noPadding
          headerActions={
            <div className="d-flex flex-wrap gap-2 w-100">
              <input
                type="search"
                className="form-control form-control-sm"
                style={{ minWidth: "220px", flex: "1 1 220px" }}
                placeholder={t("inventory.searchBalancesPlaceholder")}
                value={balanceSearch}
                onChange={(e) => {
                  setBalanceSearch(e.target.value);
                  setBalancesPage(1);
                }}
              />
              <select
                className="form-select form-select-sm"
                style={{ width: "160px" }}
                value={balanceCategory}
                onChange={(e) => {
                  setBalanceCategory(e.target.value);
                  setBalancesPage(1);
                }}
                aria-label="Filter inventory category"
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
                style={{ width: "160px" }}
                value={balanceStatus}
                onChange={(e) => {
                  setBalanceStatus(e.target.value);
                  setBalancesPage(1);
                }}
                aria-label="Filter stock status"
              >
                <option value="">{t("inventory.allStockStatuses")}</option>
                <option value="in_stock">{t("inventory.statusInStock")}</option>
                <option value="low_stock">{t("inventory.statusLowStock")}</option>
                <option value="out_of_stock">{t("inventory.statusOutOfStock")}</option>
              </select>
            </div>
          }
        >
          <DataTable
            columns={balanceColumns}
            rows={balances}
            rowKey="product_id"
            loading={balancesLoading}
            error={balancesError}
            onRetry={loadBalances}
            emptyIcon="bi-boxes"
            emptyTitle={t("inventory.emptyBalances")}
          />
          <Pagination
            page={balancesPage}
            pageSize={PAGE_SIZE}
            totalCount={balancesCount}
            onPageChange={setBalancesPage}
            previousLabel={t("controls.previous")}
            nextLabel={t("controls.next")}
          />
        </AppCard>
      )}

      {/* Tab 2: Movement History */}
      {activeTab === "movements" && (
        <AppCard
          noPadding
          headerActions={
            <div className="d-flex flex-wrap gap-2 w-100">
              <input
                type="search"
                className="form-control form-control-sm"
                style={{ minWidth: "220px", flex: "1 1 220px" }}
                placeholder={t("inventory.searchMovementsPlaceholder")}
                value={movementSearch}
                onChange={(e) => {
                  setMovementSearch(e.target.value);
                  setMovementsPage(1);
                }}
              />
              <select
                className="form-select form-select-sm"
                style={{ width: "170px" }}
                value={movementType}
                onChange={(e) => {
                  setMovementType(e.target.value);
                  setMovementsPage(1);
                }}
                aria-label="Filter movement type"
              >
                <option value="">{t("inventory.allMovementTypes")}</option>
                <option value="opening">{t("inventory.typeOpening")}</option>
                <option value="stock_in">{t("inventory.typeStockIn")}</option>
                <option value="stock_out">{t("inventory.typeStockOut")}</option>
                <option value="adjustment">{t("inventory.typeAdjustment")}</option>
                <option value="sale">{t("inventory.typeSale")}</option>
                <option value="purchase">{t("inventory.typePurchase")}</option>
                <option value="refund">{t("inventory.typeRefund")}</option>
                <option value="void">{t("inventory.typeVoid")}</option>
              </select>
              <select
                className="form-select form-select-sm"
                style={{ width: "190px" }}
                value={movementProduct}
                onChange={(e) => {
                  setMovementProduct(e.target.value);
                  setMovementsPage(1);
                }}
                aria-label="Filter movement product"
              >
                <option value="">{t("products.title")}</option>
                {allTrackedProducts.map((p) => (
                  <option key={p.product_id} value={String(p.product_id)}>
                    {p.sku} — {p.name}
                  </option>
                ))}
              </select>
            </div>
          }
        >
          <DataTable
            columns={movementColumns}
            rows={movements}
            loading={movementsLoading}
            error={movementsError}
            onRetry={loadMovements}
            emptyIcon="bi-clock-history"
            emptyTitle={t("inventory.emptyMovements")}
          />
          <Pagination
            page={movementsPage}
            pageSize={PAGE_SIZE}
            totalCount={movementsCount}
            onPageChange={setMovementsPage}
            previousLabel={t("controls.previous")}
            nextLabel={t("controls.next")}
          />
        </AppCard>
      )}

      {/* Tab 3: Low-Stock Alerts */}
      {activeTab === "low_stock" && (
        <AppCard noPadding>
          <DataTable
            columns={alertColumns}
            rows={alerts}
            rowKey="product_id"
            loading={alertsLoading}
            error={alertsError}
            onRetry={loadLowStockAlerts}
            emptyIcon="bi-check-circle"
            emptyTitle={t("inventory.emptyLowStock")}
          />
          <Pagination
            page={alertsPage}
            pageSize={PAGE_SIZE}
            totalCount={alertsCount}
            onPageChange={setAlertsPage}
            previousLabel={t("controls.previous")}
            nextLabel={t("controls.next")}
          />
        </AppCard>
      )}

      {/* Tab 4: Valuation Report */}
      {activeTab === "report" && (
        <div className="d-flex flex-column gap-4">
          <div className="d-flex justify-content-end">
            <select
              className="form-select form-select-sm"
              style={{ width: "220px" }}
              value={reportCategory}
              onChange={(e) => setReportCategory(e.target.value)}
              aria-label="Filter report category"
            >
              <option value="">{t("products.allCategories")}</option>
              {categories.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {language === "km" && c.name_km ? c.name_km : c.name}
                </option>
              ))}
            </select>
          </div>

          {reportLoading ? (
            <AppCard>
              <LoadingState />
            </AppCard>
          ) : reportError ? (
            <AppCard noPadding>
              <ErrorState message={reportError} onRetry={loadReport} />
            </AppCard>
          ) : (
            report && (
              <>
                <div className="row g-3">
                  <div className="col-12 col-sm-6 col-xl-3">
                    <AppCard>
                      <div className="small text-body-secondary mb-1">
                        {t("inventory.reportTrackedProducts")}
                      </div>
                      <div className="h4 mb-0 pos-tabular">
                        {report.summary.total_tracked_products}
                      </div>
                    </AppCard>
                  </div>
                  <div className="col-12 col-sm-6 col-xl-3">
                    <AppCard>
                      <div className="small text-body-secondary mb-1">
                        {t("inventory.reportTotalValuation")}
                      </div>
                      <div className="h4 mb-0 text-primary pos-tabular">
                        {formatMoney(report.summary.total_stock_valuation)}
                      </div>
                    </AppCard>
                  </div>
                  <div className="col-12 col-sm-6 col-xl-3">
                    <AppCard>
                      <div className="small text-body-secondary mb-1">
                        {t("inventory.reportRetailValuation")}
                      </div>
                      <div className="h4 mb-0 text-success pos-tabular">
                        {formatMoney(report.summary.total_retail_valuation)}
                      </div>
                    </AppCard>
                  </div>
                  <div className="col-12 col-sm-6 col-xl-3">
                    <AppCard>
                      <div className="small text-body-secondary mb-1">
                        {t("inventory.reportLowStock")} / {t("inventory.reportOutOfStock")}
                      </div>
                      <div className="h4 mb-0 text-danger pos-tabular">
                        {report.summary.low_stock_count} / {report.summary.out_of_stock_count}
                      </div>
                    </AppCard>
                  </div>
                </div>

                <AppCard title={t("inventory.reportByCategory")} icon="bi-pie-chart" noPadding>
                  <DataTable
                    rowKey="category_id"
                    rows={report.by_category || []}
                    columns={[
                      {
                        key: "category_name",
                        header: t("inventory.colCategory"),
                        render: (c) =>
                          language === "km" && c.category_name_km
                            ? c.category_name_km
                            : c.category_name,
                      },
                      {
                        key: "product_count",
                        header: t("inventory.colProductCount"),
                        cellClassName: "pos-tabular",
                      },
                      {
                        key: "total_quantity",
                        header: t("inventory.colTotalQty"),
                        cellClassName: "pos-tabular",
                        render: (c) => formatQty(c.total_quantity),
                      },
                      {
                        key: "stock_valuation",
                        header: t("inventory.colStockValue"),
                        cellClassName: "pos-tabular fw-semibold",
                        render: (c) => formatMoney(c.stock_valuation),
                      },
                      {
                        key: "retail_valuation",
                        header: t("inventory.colRetailValue"),
                        cellClassName: "pos-tabular",
                        render: (c) => formatMoney(c.retail_valuation),
                      },
                    ]}
                  />
                </AppCard>
              </>
            )
          )}
        </div>
      )}

      {/* Controlled Stock Movement Modal */}
      <AppModal
        isOpen={Boolean(opModalType)}
        title={opModalTitle}
        size="md"
        onClose={() => setOpModalType(null)}
        disableClose={submitting}
      >
        <form onSubmit={handleSubmitOperation} noValidate className="d-flex flex-column gap-3">
          <StatusAlert variant="info" message={t("inventory.traceabilityNotice")} />

          <FormSelect
            id="invProduct"
            label={t("inventory.productLabel")}
            value={opForm.product}
            onChange={(e) => setOpForm({ ...opForm, product: e.target.value })}
            options={productSelectOptions}
            error={opErrors.product}
            required
            disabled={submitting}
          />

          {opModalType === "adjustment" && (
            <FormSelect
              id="invDirection"
              label={t("inventory.directionLabel")}
              value={opForm.direction}
              onChange={(e) => setOpForm({ ...opForm, direction: e.target.value })}
              options={[
                { value: "increase", label: t("inventory.directionIncrease") },
                { value: "decrease", label: t("inventory.directionDecrease") },
              ]}
              error={opErrors.direction}
              required
              disabled={submitting}
            />
          )}

          <div className="row g-3">
            <div className="col-12 col-sm-6">
              <FormInput
                id="invQuantity"
                label={t("inventory.quantityLabel")}
                type="number"
                step="0.001"
                min="0.001"
                value={opForm.quantity}
                onChange={(e) => setOpForm({ ...opForm, quantity: e.target.value })}
                error={opErrors.quantity}
                required
                disabled={submitting}
              />
            </div>

            {(opModalType === "opening" ||
              opModalType === "stock_in" ||
              (opModalType === "adjustment" && opForm.direction === "increase")) && (
              <div className="col-12 col-sm-6">
                <FormInput
                  id="invUnitCost"
                  label={t("inventory.unitCostLabel")}
                  type="number"
                  step="0.01"
                  min="0"
                  value={opForm.unit_cost}
                  onChange={(e) => setOpForm({ ...opForm, unit_cost: e.target.value })}
                  error={opErrors.unit_cost}
                  helpText={t("inventory.unitCostHelp")}
                  disabled={submitting}
                />
              </div>
            )}
          </div>

          <FormInput
            id="invRefCode"
            label={t("inventory.referenceCodeLabel")}
            value={opForm.reference_code}
            onChange={(e) => setOpForm({ ...opForm, reference_code: e.target.value })}
            error={opErrors.reference_code}
            disabled={submitting}
          />

          <FormTextarea
            id="invNotes"
            label={t("inventory.notesLabel")}
            value={opForm.notes}
            onChange={(e) => setOpForm({ ...opForm, notes: e.target.value })}
            error={opErrors.notes}
            helpText={opModalType === "adjustment" ? t("inventory.notesRequiredHelp") : undefined}
            required={opModalType === "adjustment"}
            disabled={submitting}
          />

          <div className="pt-2 border-top">
            <FormActions
              submitting={submitting}
              submitLabel={t("controls.save")}
              submittingLabel={t("controls.saving")}
              cancelLabel={t("controls.cancel")}
              onCancel={() => setOpModalType(null)}
            />
          </div>
        </form>
      </AppModal>
    </div>
  );
}
