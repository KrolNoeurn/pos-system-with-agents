import { useCallback, useEffect, useState } from "react";
import {
  AppCard,
  DataTable,
  ErrorState,
  LoadingState,
  PageHeader,
} from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { usePreferences } from "../contexts/PreferencesContext";
import { useToast } from "../contexts/ToastContext";
import { fetchInventoryReport } from "../services/inventoryService";
import {
  exportReportCsv,
  fetchProfitLossReport,
  fetchPurchasingReport,
  fetchSalesReport,
} from "../services/reportsService";
import { extractApiError } from "../utils/apiError";

function formatMoney(value) {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return "$0.00";
  const sign = num < 0 ? "-" : "";
  return `${sign}$${Math.abs(num).toFixed(2)}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function ReportsPage() {
  const { hasPermission } = useAuth();
  const { t, language } = usePreferences();
  const { showToast } = useToast();

  const canExport = hasPermission("reports.export");

  const [activeTab, setActiveTab] = useState("pnl");
  const [dateFrom, setDateFrom] = useState(monthStartISO());
  const [dateTo, setDateTo] = useState(todayISO());

  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  const loadActiveReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      let data;
      if (activeTab === "pnl") {
        data = await fetchProfitLossReport(params);
      } else if (activeTab === "sales") {
        data = await fetchSalesReport(params);
      } else if (activeTab === "inventory") {
        data = await fetchInventoryReport();
      } else {
        data = await fetchPurchasingReport(params);
      }
      setReportData(data);
    } catch (err) {
      setError(extractApiError(err, "Unable to load report."));
      setReportData(null);
    } finally {
      setLoading(false);
    }
  }, [activeTab, dateFrom, dateTo]);

  useEffect(() => {
    loadActiveReport();
  }, [loadActiveReport]);

  const handleExport = async () => {
    if (!canExport || exporting) return;
    setExporting(true);
    try {
      const params = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const filename = await exportReportCsv(activeTab, params);
      showToast({ variant: "success", message: `${t("reports.exportedToast")} (${filename})` });
    } catch (err) {
      showToast({ variant: "danger", message: extractApiError(err, "CSV export failed.") });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="d-flex flex-column gap-4">
      <PageHeader
        title={t("reports.title")}
        subtitle={t("reports.subtitle")}
        icon="bi-bar-chart-line"
        actions={
          canExport ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={exporting}
              onClick={handleExport}
            >
              <i className="bi bi-download me-2" aria-hidden="true" />
              {exporting ? t("reports.exporting") : t("reports.exportCsv")}
            </button>
          ) : null
        }
      />

      {/* Tabs + Date Range Filter */}
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 border-bottom pb-2">
        <ul className="nav nav-tabs border-bottom-0" role="tablist">
          {[
            { key: "pnl", label: t("reports.tabPnl"), icon: "bi-graph-up" },
            { key: "sales", label: t("reports.tabSales"), icon: "bi-receipt" },
            { key: "inventory", label: t("reports.tabInventory"), icon: "bi-boxes" },
            { key: "purchasing", label: t("reports.tabPurchasing"), icon: "bi-truck" },
          ].map((tab) => (
            <li key={tab.key} className="nav-item" role="presentation">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                className={`nav-link ${activeTab === tab.key ? "active fw-semibold" : ""}`}
                onClick={() => setActiveTab(tab.key)}
              >
                <i className={`bi ${tab.icon} me-1`} aria-hidden="true" />
                {tab.label}
              </button>
            </li>
          ))}
        </ul>

        {activeTab !== "inventory" ? (
          <div className="d-flex flex-wrap align-items-center gap-2">
            <div className="btn-group btn-group-sm" role="group" aria-label="Date presets">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => {
                  const tdy = todayISO();
                  setDateFrom(tdy);
                  setDateTo(tdy);
                }}
              >
                {t("reports.presetToday")}
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => {
                  setDateFrom(monthStartISO());
                  setDateTo(todayISO());
                }}
              >
                {t("reports.presetMonth")}
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                }}
              >
                {t("reports.presetAll")}
              </button>
            </div>
            <input
              type="date"
              aria-label="Report date from"
              className="form-control form-control-sm"
              style={{ width: "145px" }}
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            <input
              type="date"
              aria-label="Report date to"
              className="form-control form-control-sm"
              style={{ width: "145px" }}
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
        ) : null}
      </div>

      {error ? (
        <ErrorState message={error} onRetry={loadActiveReport} />
      ) : loading || !reportData ? (
        <LoadingState message={t("status.loading")} />
      ) : activeTab === "pnl" && reportData.statement ? (
        <div className="d-flex flex-column gap-4">
          <div className="row g-3">
            <div className="col-6 col-xl-3">
              <div className="card pos-surface p-3 h-100">
                <div className="small text-body-secondary">{t("reports.netSales")}</div>
                <div className="fs-4 fw-bold text-primary pos-tabular">
                  {formatMoney(reportData.statement.net_sales)}
                </div>
                <div className="small text-body-secondary pos-tabular">
                  {t("reports.grossSales")}: {formatMoney(reportData.statement.gross_sales)}
                </div>
              </div>
            </div>
            <div className="col-6 col-xl-3">
              <div className="card pos-surface p-3 h-100">
                <div className="small text-body-secondary">{t("reports.cogs")}</div>
                <div className="fs-4 fw-bold text-warning pos-tabular">
                  {formatMoney(reportData.statement.cost_of_goods_sold)}
                </div>
                <div className="small text-body-secondary pos-tabular">
                  {t("reports.discounts")}: -{formatMoney(reportData.statement.discounts)}
                </div>
              </div>
            </div>
            <div className="col-6 col-xl-3">
              <div className="card pos-surface p-3 h-100">
                <div className="small text-body-secondary">{t("reports.grossProfit")}</div>
                <div className="fs-4 fw-bold text-success pos-tabular">
                  {formatMoney(reportData.statement.gross_profit)}
                </div>
                <div className="small text-body-secondary pos-tabular">
                  {t("reports.marginLabel")}: {reportData.statement.gross_margin_pct}%
                </div>
              </div>
            </div>
            <div className="col-6 col-xl-3">
              <div className="card pos-surface p-3 h-100 bg-body-tertiary">
                <div className="small text-body-secondary">{t("reports.netProfit")}</div>
                <div
                  className={`fs-4 fw-bold pos-tabular ${
                    Number(reportData.statement.net_profit) >= 0 ? "text-success" : "text-danger"
                  }`}
                >
                  {formatMoney(reportData.statement.net_profit)}
                </div>
                <div className="small text-body-secondary pos-tabular">
                  {t("reports.marginLabel")}: {reportData.statement.net_margin_pct}%
                </div>
              </div>
            </div>
          </div>

          <div className="row g-4">
            <div className="col-12 col-lg-6">
              <AppCard title={t("reports.tabPnl")} icon="bi-calculator">
                <table className="table table-sm mb-0">
                  <tbody>
                    <tr>
                      <td>{t("reports.grossSales")}</td>
                      <td className="text-end pos-tabular">
                        {formatMoney(reportData.statement.gross_sales)}
                      </td>
                    </tr>
                    <tr>
                      <td>{t("reports.discounts")}</td>
                      <td className="text-end pos-tabular text-danger">
                        -{formatMoney(reportData.statement.discounts)}
                      </td>
                    </tr>
                    <tr className="fw-semibold">
                      <td>{t("reports.netSales")}</td>
                      <td className="text-end pos-tabular">
                        {formatMoney(reportData.statement.net_sales)}
                      </td>
                    </tr>
                    <tr>
                      <td>{t("reports.cogs")}</td>
                      <td className="text-end pos-tabular text-danger">
                        -{formatMoney(reportData.statement.cost_of_goods_sold)}
                      </td>
                    </tr>
                    <tr className="fw-semibold table-light">
                      <td>{t("reports.grossProfit")}</td>
                      <td className="text-end pos-tabular text-success">
                        {formatMoney(reportData.statement.gross_profit)} (
                        {reportData.statement.gross_margin_pct}%)
                      </td>
                    </tr>
                    <tr>
                      <td>{t("reports.operatingExpenses")}</td>
                      <td className="text-end pos-tabular text-danger">
                        -{formatMoney(reportData.statement.operating_expenses)}
                      </td>
                    </tr>
                    <tr className="fw-bold fs-6">
                      <td>{t("reports.netProfit")}</td>
                      <td className="text-end pos-tabular">
                        {formatMoney(reportData.statement.net_profit)} (
                        {reportData.statement.net_margin_pct}%)
                      </td>
                    </tr>
                    <tr className="small text-body-secondary">
                      <td>{t("reports.taxCollected")}</td>
                      <td className="text-end pos-tabular">
                        {formatMoney(reportData.statement.tax_collected)}
                      </td>
                    </tr>
                    <tr className="small text-body-secondary">
                      <td>{t("reports.receivedPurchasesNote")}</td>
                      <td className="text-end pos-tabular">
                        {formatMoney(reportData.statement.purchasing_received_total)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </AppCard>
            </div>

            <div className="col-12 col-lg-6">
              <AppCard
                title={t("reports.expenseBreakdown")}
                icon="bi-pie-chart"
                bodyClassName="p-0"
              >
                <DataTable
                  columns={[
                    {
                      key: "category_name",
                      header: t("expenses.colCategory"),
                      render: (row) =>
                        language === "km" && row.category_name_km
                          ? row.category_name_km
                          : row.category_name,
                    },
                    { key: "count", header: t("expenses.colCount"), cellClassName: "pos-tabular" },
                    {
                      key: "total_amount",
                      header: t("expenses.colAmount"),
                      headerClassName: "text-end",
                      cellClassName: "text-end pos-tabular fw-semibold",
                      render: (row) => formatMoney(row.total_amount),
                    },
                  ]}
                  rows={reportData.expense_breakdown || []}
                  rowKey="category_id"
                />
              </AppCard>
            </div>
          </div>
        </div>
      ) : activeTab === "sales" && reportData.summary ? (
        <div className="d-flex flex-column gap-4">
          <div className="row g-3">
            <div className="col-6 col-xl-3">
              <div className="card pos-surface p-3 h-100">
                <div className="small text-body-secondary">{t("reports.netRevenue")}</div>
                <div className="fs-4 fw-bold text-primary pos-tabular">
                  {formatMoney(reportData.summary.net_revenue)}
                </div>
              </div>
            </div>
            <div className="col-6 col-xl-3">
              <div className="card pos-surface p-3 h-100">
                <div className="small text-body-secondary">{t("reports.completedOrders")}</div>
                <div className="fs-4 fw-bold pos-tabular">
                  {reportData.summary.completed_count}
                </div>
              </div>
            </div>
            <div className="col-6 col-xl-3">
              <div className="card pos-surface p-3 h-100">
                <div className="small text-body-secondary">{t("reports.avgOrderValue")}</div>
                <div className="fs-4 fw-bold pos-tabular">
                  {formatMoney(reportData.summary.average_order_value)}
                </div>
              </div>
            </div>
            <div className="col-6 col-xl-3">
              <div className="card pos-surface p-3 h-100">
                <div className="small text-body-secondary">{t("reports.cancelledRefunded")}</div>
                <div className="fs-4 fw-bold pos-tabular text-warning">
                  {reportData.summary.cancelled_count} / {reportData.summary.refunded_count}
                </div>
              </div>
            </div>
          </div>

          <AppCard title={t("reports.topProducts")} icon="bi-trophy" bodyClassName="p-0">
            <DataTable
              columns={[
                {
                  key: "name",
                  header: t("reports.colProduct"),
                  render: (row) => (
                    <div>
                      <div className="fw-medium">{row.name}</div>
                      <code className="small text-body-secondary">{row.sku}</code>
                    </div>
                  ),
                },
                {
                  key: "quantity_sold",
                  header: t("reports.colQtySold"),
                  cellClassName: "pos-tabular",
                  render: (row) => `${row.quantity_sold} ${row.unit}`,
                },
                {
                  key: "revenue",
                  header: t("reports.colRevenue"),
                  headerClassName: "text-end",
                  cellClassName: "text-end pos-tabular",
                  render: (row) => formatMoney(row.revenue),
                },
                {
                  key: "cogs",
                  header: t("reports.colCogs"),
                  headerClassName: "text-end",
                  cellClassName: "text-end pos-tabular",
                  render: (row) => formatMoney(row.cogs),
                },
                {
                  key: "gross_profit",
                  header: t("reports.colGrossProfit"),
                  headerClassName: "text-end",
                  cellClassName: "text-end pos-tabular fw-semibold text-success",
                  render: (row) => formatMoney(row.gross_profit),
                },
              ]}
              rows={reportData.top_products || []}
              rowKey="product_id"
            />
          </AppCard>

          <div className="row g-4">
            <div className="col-12 col-lg-7">
              <AppCard
                title={t("reports.dailyBreakdown")}
                icon="bi-calendar3"
                bodyClassName="p-0"
              >
                <DataTable
                  columns={[
                    { key: "date", header: t("reports.colDate"), cellClassName: "pos-tabular" },
                    {
                      key: "sales_count",
                      header: t("reports.colOrders"),
                      cellClassName: "pos-tabular",
                    },
                    {
                      key: "discounts",
                      header: t("reports.colDiscounts"),
                      headerClassName: "text-end",
                      cellClassName: "text-end pos-tabular",
                      render: (row) => formatMoney(row.discounts),
                    },
                    {
                      key: "tax",
                      header: t("reports.colTax"),
                      headerClassName: "text-end",
                      cellClassName: "text-end pos-tabular",
                      render: (row) => formatMoney(row.tax),
                    },
                    {
                      key: "revenue",
                      header: t("reports.colRevenue"),
                      headerClassName: "text-end",
                      cellClassName: "text-end pos-tabular fw-semibold",
                      render: (row) => formatMoney(row.revenue),
                    },
                  ]}
                  rows={reportData.daily_breakdown || []}
                  rowKey="date"
                />
              </AppCard>
            </div>
            <div className="col-12 col-lg-5">
              <AppCard
                title={t("reports.paymentBreakdown")}
                icon="bi-credit-card"
                bodyClassName="p-0"
              >
                <DataTable
                  columns={[
                    { key: "payment_method", header: t("sales.colPayment") },
                    { key: "count", header: t("expenses.colCount"), cellClassName: "pos-tabular" },
                    {
                      key: "total_amount",
                      header: t("expenses.colAmount"),
                      headerClassName: "text-end",
                      cellClassName: "text-end pos-tabular fw-semibold",
                      render: (row) => formatMoney(row.total_amount),
                    },
                  ]}
                  rows={reportData.payment_breakdown || []}
                  rowKey="payment_method"
                />
              </AppCard>
            </div>
          </div>
        </div>
      ) : activeTab === "inventory" && reportData.summary ? (
        <div className="d-flex flex-column gap-4">
          <div className="row g-3">
            <div className="col-6 col-xl-3">
              <div className="card pos-surface p-3 h-100">
                <div className="small text-body-secondary">
                  {t("inventory.reportTrackedProducts")}
                </div>
                <div className="fs-4 fw-bold pos-tabular">
                  {reportData.summary.total_tracked_products}
                </div>
              </div>
            </div>
            <div className="col-6 col-xl-3">
              <div className="card pos-surface p-3 h-100">
                <div className="small text-body-secondary">
                  {t("inventory.reportTotalValuation")}
                </div>
                <div className="fs-4 fw-bold text-primary pos-tabular">
                  {formatMoney(reportData.summary.total_stock_valuation)}
                </div>
              </div>
            </div>
            <div className="col-6 col-xl-3">
              <div className="card pos-surface p-3 h-100">
                <div className="small text-body-secondary">
                  {t("inventory.reportRetailValuation")}
                </div>
                <div className="fs-4 fw-bold text-success pos-tabular">
                  {formatMoney(reportData.summary.total_retail_valuation)}
                </div>
              </div>
            </div>
            <div className="col-6 col-xl-3">
              <div className="card pos-surface p-3 h-100">
                <div className="small text-body-secondary">{t("inventory.reportLowStock")}</div>
                <div className="fs-4 fw-bold text-warning pos-tabular">
                  {reportData.summary.low_stock_count}
                </div>
              </div>
            </div>
          </div>

          <AppCard
            title={t("inventory.reportByCategory")}
            icon="bi-boxes"
            bodyClassName="p-0"
          >
            <DataTable
              columns={[
                {
                  key: "category_name",
                  header: t("inventory.colCategory"),
                  render: (row) =>
                    language === "km" && row.category_name_km
                      ? row.category_name_km
                      : row.category_name,
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
                },
                {
                  key: "stock_valuation",
                  header: t("inventory.reportTotalValuation"),
                  headerClassName: "text-end",
                  cellClassName: "text-end pos-tabular fw-semibold",
                  render: (row) => formatMoney(row.stock_valuation),
                },
                {
                  key: "retail_valuation",
                  header: t("inventory.colRetailValue"),
                  headerClassName: "text-end",
                  cellClassName: "text-end pos-tabular",
                  render: (row) => formatMoney(row.retail_valuation),
                },
              ]}
              rows={reportData.by_category || []}
              rowKey="category_id"
            />
          </AppCard>
        </div>
      ) : activeTab === "purchasing" && reportData.summary ? (
        <div className="d-flex flex-column gap-4">
          <div className="row g-3">
            <div className="col-12 col-md-4">
              <div className="card pos-surface p-3 h-100">
                <div className="small text-body-secondary">Total Purchase Orders</div>
                <div className="fs-4 fw-bold pos-tabular">{reportData.summary.total_orders}</div>
              </div>
            </div>
            <div className="col-12 col-md-4">
              <div className="card pos-surface p-3 h-100">
                <div className="small text-body-secondary">{t("reports.colReceivedOrders")}</div>
                <div className="fs-4 fw-bold text-success pos-tabular">
                  {reportData.summary.received_orders}
                </div>
              </div>
            </div>
            <div className="col-12 col-md-4">
              <div className="card pos-surface p-3 h-100">
                <div className="small text-body-secondary">{t("reports.colTotalSpend")}</div>
                <div className="fs-4 fw-bold text-primary pos-tabular">
                  {formatMoney(reportData.summary.received_total)}
                </div>
              </div>
            </div>
          </div>

          <div className="row g-4">
            <div className="col-12 col-lg-7">
              <AppCard
                title={t("reports.supplierBreakdown")}
                icon="bi-building"
                bodyClassName="p-0"
              >
                <DataTable
                  columns={[
                    { key: "supplier_name", header: t("reports.colSupplier") },
                    {
                      key: "received_count",
                      header: t("reports.colReceivedOrders"),
                      cellClassName: "pos-tabular",
                    },
                    {
                      key: "received_total",
                      header: t("reports.colTotalSpend"),
                      headerClassName: "text-end",
                      cellClassName: "text-end pos-tabular fw-semibold",
                      render: (row) => formatMoney(row.received_total),
                    },
                  ]}
                  rows={reportData.by_supplier || []}
                  rowKey="supplier_id"
                />
              </AppCard>
            </div>
            <div className="col-12 col-lg-5">
              <AppCard
                title={t("reports.statusBreakdown")}
                icon="bi-list-check"
                bodyClassName="p-0"
              >
                <DataTable
                  columns={[
                    { key: "status", header: t("purchasing.colStatus") },
                    { key: "count", header: t("expenses.colCount"), cellClassName: "pos-tabular" },
                    {
                      key: "total_amount",
                      header: t("purchasing.colTotal"),
                      headerClassName: "text-end",
                      cellClassName: "text-end pos-tabular fw-semibold",
                      render: (row) => formatMoney(row.total_amount),
                    },
                  ]}
                  rows={reportData.by_status || []}
                  rowKey="status"
                />
              </AppCard>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
