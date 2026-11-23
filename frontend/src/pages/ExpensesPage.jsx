import { useCallback, useEffect, useState } from "react";
import {
  AppCard,
  AppModal,
  DataTable,
  EmptyState,
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
import { useConfirm } from "../contexts/ConfirmContext";
import { usePreferences } from "../contexts/PreferencesContext";
import { useToast } from "../contexts/ToastContext";
import {
  createExpense,
  createExpenseCategory,
  deleteExpense,
  deleteExpenseCategory,
  fetchCashFlowSummary,
  fetchExpenseCategories,
  fetchExpenses,
  updateExpense,
  updateExpenseCategory,
} from "../services/expensesService";
import { extractApiError } from "../utils/apiError";

const PAGE_SIZE = 10;
const todayISO = () => new Date().toISOString().slice(0, 10);

function formatMoney(value) {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return "$0.00";
  const sign = num < 0 ? "-" : "";
  return `${sign}$${Math.abs(num).toFixed(2)}`;
}

const EMPTY_EXPENSE_FORM = {
  category: "",
  title: "",
  amount: "",
  expense_date: todayISO(),
  payment_method: "cash",
  reference_code: "",
  vendor_name: "",
  notes: "",
};

const EMPTY_CATEGORY_FORM = {
  name: "",
  name_km: "",
  description: "",
  is_active: true,
};

export default function ExpensesPage() {
  const { hasPermission } = useAuth();
  const { t, language } = usePreferences();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const canCreate = hasPermission("expenses.create");
  const canEdit = hasPermission("expenses.edit");
  const canDelete = hasPermission("expenses.delete");

  const [activeTab, setActiveTab] = useState("expenses");

  // Shared active categories for dropdowns
  const [allCategories, setAllCategories] = useState([]);

  // Expenses list state
  const [expenses, setExpenses] = useState([]);
  const [expensesCount, setExpensesCount] = useState(0);
  const [expensesPage, setExpensesPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expensesLoading, setExpensesLoading] = useState(true);
  const [expensesError, setExpensesError] = useState("");

  // Expense modal state
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [expenseForm, setExpenseForm] = useState(EMPTY_EXPENSE_FORM);
  const [expenseFormError, setExpenseFormError] = useState("");
  const [savingExpense, setSavingExpense] = useState(false);

  // Cash flow summary state
  const [summaryDateFrom, setSummaryDateFrom] = useState("");
  const [summaryDateTo, setSummaryDateTo] = useState("");
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");

  // Categories tab state
  const [categories, setCategories] = useState([]);
  const [categoriesCount, setCategoriesCount] = useState(0);
  const [categoriesPage, setCategoriesPage] = useState(1);
  const [categoriesSearch, setCategoriesSearch] = useState("");
  const [debouncedCatSearch, setDebouncedCatSearch] = useState("");
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoriesError, setCategoriesError] = useState("");

  // Category modal state
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryForm, setCategoryForm] = useState(EMPTY_CATEGORY_FORM);
  const [categoryFormError, setCategoryFormError] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setExpensesPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCatSearch(categoriesSearch.trim());
      setCategoriesPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [categoriesSearch]);

  const loadAllCategories = useCallback(async () => {
    try {
      const data = await fetchExpenseCategories({ page_size: 100 });
      setAllCategories(data.results || []);
    } catch {
      // Non-blocking dropdown load
    }
  }, []);

  const loadExpenses = useCallback(async () => {
    setExpensesLoading(true);
    setExpensesError("");
    try {
      const params = { page: expensesPage, page_size: PAGE_SIZE };
      if (debouncedSearch) params.search = debouncedSearch;
      if (categoryFilter) params.category = categoryFilter;
      if (paymentFilter) params.payment_method = paymentFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const data = await fetchExpenses(params);
      setExpenses(data.results || []);
      setExpensesCount(data.count ?? 0);
    } catch (err) {
      setExpensesError(extractApiError(err, "Unable to load expenses."));
    } finally {
      setExpensesLoading(false);
    }
  }, [expensesPage, debouncedSearch, categoryFilter, paymentFilter, dateFrom, dateTo]);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError("");
    try {
      const params = {};
      if (summaryDateFrom) params.date_from = summaryDateFrom;
      if (summaryDateTo) params.date_to = summaryDateTo;
      const data = await fetchCashFlowSummary(params);
      setSummary(data);
    } catch (err) {
      setSummaryError(extractApiError(err, "Unable to load cash flow summary."));
    } finally {
      setSummaryLoading(false);
    }
  }, [summaryDateFrom, summaryDateTo]);

  const loadCategoriesTab = useCallback(async () => {
    setCategoriesLoading(true);
    setCategoriesError("");
    try {
      const params = { page: categoriesPage, page_size: PAGE_SIZE };
      if (debouncedCatSearch) params.search = debouncedCatSearch;
      const data = await fetchExpenseCategories(params);
      setCategories(data.results || []);
      setCategoriesCount(data.count ?? 0);
    } catch (err) {
      setCategoriesError(extractApiError(err, "Unable to load expense categories."));
    } finally {
      setCategoriesLoading(false);
    }
  }, [categoriesPage, debouncedCatSearch]);

  useEffect(() => {
    loadAllCategories();
  }, [loadAllCategories]);

  useEffect(() => {
    if (activeTab === "expenses") {
      loadExpenses();
    } else if (activeTab === "cashflow") {
      loadSummary();
    } else {
      loadCategoriesTab();
    }
  }, [activeTab, loadExpenses, loadSummary, loadCategoriesTab]);

  const paymentMethodLabel = (method) => {
    if (method === "bank_transfer") return t("expenses.methodBankTransfer");
    if (method === "card") return t("expenses.methodCard");
    if (method === "qr") return t("expenses.methodQr");
    if (method === "other") return t("expenses.methodOther");
    return t("expenses.methodCash");
  };

  const openCreateExpense = () => {
    setEditingExpense(null);
    setExpenseForm({ ...EMPTY_EXPENSE_FORM, expense_date: todayISO() });
    setExpenseFormError("");
    setExpenseModalOpen(true);
  };

  const openEditExpense = (row) => {
    setEditingExpense(row);
    setExpenseForm({
      category: String(row.category || ""),
      title: row.title || "",
      amount: String(row.amount || ""),
      expense_date: row.expense_date || todayISO(),
      payment_method: row.payment_method || "cash",
      reference_code: row.reference_code || "",
      vendor_name: row.vendor_name || "",
      notes: row.notes || "",
    });
    setExpenseFormError("");
    setExpenseModalOpen(true);
  };

  const handleSaveExpense = async (e) => {
    e.preventDefault();
    if (savingExpense) return;
    const amt = Number(expenseForm.amount);
    if (!expenseForm.category || !expenseForm.title.trim() || !Number.isFinite(amt) || amt <= 0) {
      setExpenseFormError(t("expenses.validationRequired"));
      return;
    }

    setSavingExpense(true);
    setExpenseFormError("");
    try {
      const payload = {
        category: Number(expenseForm.category),
        title: expenseForm.title.trim(),
        amount: amt.toFixed(2),
        expense_date: expenseForm.expense_date,
        payment_method: expenseForm.payment_method,
        reference_code: expenseForm.reference_code.trim(),
        vendor_name: expenseForm.vendor_name.trim(),
        notes: expenseForm.notes.trim(),
      };
      if (editingExpense) {
        await updateExpense(editingExpense.id, payload);
      } else {
        await createExpense(payload);
      }
      setExpenseModalOpen(false);
      showToast({ variant: "success", message: t("expenses.expenseSavedToast") });
      await Promise.all([loadExpenses(), loadAllCategories()]);
    } catch (err) {
      setExpenseFormError(extractApiError(err, "Unable to save expense."));
    } finally {
      setSavingExpense(false);
    }
  };

  const handleDeleteExpense = async (row) => {
    const confirmed = await confirm({
      title: t("expenses.confirmDeleteExpenseTitle"),
      message: `${t("expenses.confirmDeleteExpenseMessage")} (${row.expense_number} — ${formatMoney(row.amount)})`,
      confirmLabel: t("controls.delete"),
      cancelLabel: t("controls.cancel"),
      variant: "danger",
    });
    if (!confirmed) return;
    try {
      await deleteExpense(row.id);
      showToast({ variant: "success", message: t("expenses.expenseDeletedToast") });
      await Promise.all([loadExpenses(), loadAllCategories()]);
    } catch (err) {
      showToast({ variant: "danger", message: extractApiError(err, "Unable to delete expense.") });
    }
  };

  const openCreateCategory = () => {
    setEditingCategory(null);
    setCategoryForm(EMPTY_CATEGORY_FORM);
    setCategoryFormError("");
    setCategoryModalOpen(true);
  };

  const openEditCategory = (row) => {
    setEditingCategory(row);
    setCategoryForm({
      name: row.name || "",
      name_km: row.name_km || "",
      description: row.description || "",
      is_active: Boolean(row.is_active),
    });
    setCategoryFormError("");
    setCategoryModalOpen(true);
  };

  const handleSaveCategory = async (e) => {
    e.preventDefault();
    if (savingCategory) return;
    if (!categoryForm.name.trim()) {
      setCategoryFormError("Category name is required.");
      return;
    }
    setSavingCategory(true);
    setCategoryFormError("");
    try {
      const payload = {
        name: categoryForm.name.trim(),
        name_km: categoryForm.name_km.trim(),
        description: categoryForm.description.trim(),
        is_active: categoryForm.is_active,
      };
      if (editingCategory) {
        await updateExpenseCategory(editingCategory.id, payload);
      } else {
        await createExpenseCategory(payload);
      }
      setCategoryModalOpen(false);
      showToast({ variant: "success", message: t("expenses.categorySavedToast") });
      await Promise.all([loadAllCategories(), loadCategoriesTab()]);
    } catch (err) {
      setCategoryFormError(extractApiError(err, "Unable to save expense category."));
    } finally {
      setSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (row) => {
    const confirmed = await confirm({
      title: t("expenses.confirmDeleteCategoryTitle"),
      message: `${t("expenses.confirmDeleteCategoryMessage")} (${row.name})`,
      confirmLabel: t("controls.delete"),
      cancelLabel: t("controls.cancel"),
      variant: "danger",
    });
    if (!confirmed) return;
    try {
      await deleteExpenseCategory(row.id);
      showToast({ variant: "success", message: t("expenses.categoryDeletedToast") });
      await Promise.all([loadAllCategories(), loadCategoriesTab()]);
    } catch (err) {
      showToast({
        variant: "danger",
        message: extractApiError(err, "Unable to delete expense category."),
      });
    }
  };

  const expenseColumns = [
    {
      key: "expense_number",
      header: t("expenses.colNumber"),
      render: (row) => (
        <div>
          <code className="fw-semibold">{row.expense_number}</code>
          <div className="small text-body-secondary">{row.created_by_username}</div>
        </div>
      ),
    },
    {
      key: "title",
      header: t("expenses.colTitle"),
      render: (row) => (
        <div>
          <div className="fw-medium">{row.title}</div>
          <div className="small text-body-secondary">
            {row.vendor_name || "—"}
            {row.reference_code ? ` · ${row.reference_code}` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "category_name",
      header: t("expenses.colCategory"),
      render: (row) =>
        language === "km" && row.category_name_km ? row.category_name_km : row.category_name,
    },
    {
      key: "expense_date",
      header: t("expenses.colDate"),
      cellClassName: "small pos-tabular",
    },
    {
      key: "payment_method",
      header: t("expenses.colPayment"),
      render: (row) => (
        <span className="badge text-bg-light border text-body">
          {paymentMethodLabel(row.payment_method)}
        </span>
      ),
    },
    {
      key: "amount",
      header: t("expenses.colAmount"),
      cellClassName: "pos-tabular fw-semibold text-danger",
      render: (row) => formatMoney(row.amount),
    },
    {
      key: "actions",
      header: t("expenses.colActions"),
      headerClassName: "text-end",
      cellClassName: "text-end",
      render: (row) => (
        <div className="btn-group btn-group-sm">
          {canEdit ? (
            <button
              type="button"
              className="btn btn-outline-primary"
              onClick={() => openEditExpense(row)}
            >
              {t("controls.edit")}
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              className="btn btn-outline-danger"
              onClick={() => handleDeleteExpense(row)}
            >
              {t("controls.delete")}
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  const categoryColumns = [
    {
      key: "name",
      header: t("expenses.colCategory"),
      render: (row) => (
        <div>
          <div className="fw-semibold">{row.name}</div>
          {row.name_km ? <div className="small text-body-secondary">{row.name_km}</div> : null}
        </div>
      ),
    },
    {
      key: "description",
      header: t("expenses.descriptionLabel"),
      render: (row) => row.description || "—",
    },
    {
      key: "expenses_count",
      header: t("expenses.colCount"),
      cellClassName: "pos-tabular",
    },
    {
      key: "is_active",
      header: t("expenses.colStatus"),
      render: (row) => (
        <span className={`badge ${row.is_active ? "text-bg-success" : "text-bg-secondary"}`}>
          {row.is_active ? t("status.active") : t("status.inactive")}
        </span>
      ),
    },
    {
      key: "actions",
      header: t("expenses.colActions"),
      headerClassName: "text-end",
      cellClassName: "text-end",
      render: (row) => (
        <div className="btn-group btn-group-sm">
          {canEdit ? (
            <button
              type="button"
              className="btn btn-outline-primary"
              onClick={() => openEditCategory(row)}
            >
              {t("controls.edit")}
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              className="btn btn-outline-danger"
              disabled={row.is_in_use}
              title={row.is_in_use ? "In use by existing expenses" : t("controls.delete")}
              onClick={() => handleDeleteCategory(row)}
            >
              {t("controls.delete")}
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  const activeCategoryOptions = [
    { value: "", label: t("expenses.selectCategory") },
    ...allCategories
      .filter((c) => c.is_active || String(c.id) === String(expenseForm.category))
      .map((c) => ({
        value: String(c.id),
        label: language === "km" && c.name_km ? `${c.name_km} (${c.name})` : c.name,
      })),
  ];

  const paymentOptions = [
    { value: "cash", label: t("expenses.methodCash") },
    { value: "bank_transfer", label: t("expenses.methodBankTransfer") },
    { value: "card", label: t("expenses.methodCard") },
    { value: "qr", label: t("expenses.methodQr") },
    { value: "other", label: t("expenses.methodOther") },
  ];

  return (
    <div className="d-flex flex-column gap-4">
      <PageHeader
        title={t("expenses.title")}
        subtitle={t("expenses.subtitle")}
        icon="bi-cash-coin"
        actions={
          canCreate ? (
            <div className="d-flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={openCreateCategory}
              >
                <i className="bi bi-folder-plus me-2" aria-hidden="true" />
                {t("expenses.newCategory")}
              </button>
              <button type="button" className="btn btn-primary" onClick={openCreateExpense}>
                <i className="bi bi-plus-lg me-2" aria-hidden="true" />
                {t("expenses.newExpense")}
              </button>
            </div>
          ) : null
        }
      />

      <ul className="nav nav-tabs" role="tablist">
        <li className="nav-item" role="presentation">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "expenses"}
            className={`nav-link ${activeTab === "expenses" ? "active fw-semibold" : ""}`}
            onClick={() => setActiveTab("expenses")}
          >
            <i className="bi bi-receipt me-1" aria-hidden="true" />
            {t("expenses.tabExpenses")}
          </button>
        </li>
        <li className="nav-item" role="presentation">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "cashflow"}
            className={`nav-link ${activeTab === "cashflow" ? "active fw-semibold" : ""}`}
            onClick={() => setActiveTab("cashflow")}
          >
            <i className="bi bi-graph-up-arrow me-1" aria-hidden="true" />
            {t("expenses.tabCashFlow")}
          </button>
        </li>
        <li className="nav-item" role="presentation">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "categories"}
            className={`nav-link ${activeTab === "categories" ? "active fw-semibold" : ""}`}
            onClick={() => setActiveTab("categories")}
          >
            <i className="bi bi-tags me-1" aria-hidden="true" />
            {t("expenses.tabCategories")} ({allCategories.length})
          </button>
        </li>
      </ul>

      {activeTab === "expenses" ? (
        <AppCard
          bodyClassName="p-0"
          headerActions={
            <div className="d-flex flex-wrap gap-2 w-100">
              <input
                type="search"
                className="form-control form-control-sm"
                style={{ minWidth: "210px", flex: "1 1 210px" }}
                placeholder={t("expenses.searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                aria-label="Filter expense category"
                className="form-select form-select-sm"
                style={{ width: "160px" }}
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setExpensesPage(1);
                }}
              >
                <option value="">{t("expenses.allCategories")}</option>
                {allCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filter expense payment method"
                className="form-select form-select-sm"
                style={{ width: "155px" }}
                value={paymentFilter}
                onChange={(e) => {
                  setPaymentFilter(e.target.value);
                  setExpensesPage(1);
                }}
              >
                <option value="">{t("expenses.allPaymentMethods")}</option>
                {paymentOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <input
                type="date"
                aria-label="Expense date from"
                className="form-control form-control-sm"
                style={{ width: "145px" }}
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setExpensesPage(1);
                }}
              />
              <input
                type="date"
                aria-label="Expense date to"
                className="form-control form-control-sm"
                style={{ width: "145px" }}
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setExpensesPage(1);
                }}
              />
            </div>
          }
        >
          {expensesError ? (
            <div className="p-4">
              <ErrorState message={expensesError} onRetry={loadExpenses} />
            </div>
          ) : expensesLoading ? (
            <LoadingState message={t("status.loading")} />
          ) : expenses.length === 0 ? (
            <EmptyState icon="bi-cash-coin" title={t("expenses.emptyExpenses")} />
          ) : (
            <>
              <DataTable columns={expenseColumns} rows={expenses} rowKey="id" />
              <Pagination
                page={expensesPage}
                pageSize={PAGE_SIZE}
                totalCount={expensesCount}
                onPageChange={setExpensesPage}
                previousLabel={t("controls.previous")}
                nextLabel={t("controls.next")}
              />
            </>
          )}
        </AppCard>
      ) : activeTab === "cashflow" ? (
        <div className="d-flex flex-column gap-3">
          <AppCard
            title={t("expenses.tabCashFlow")}
            icon="bi-graph-up-arrow"
            headerActions={
              <div className="d-flex flex-wrap gap-2">
                <input
                  type="date"
                  aria-label="Cash flow date from"
                  className="form-control form-control-sm"
                  style={{ width: "150px" }}
                  value={summaryDateFrom}
                  onChange={(e) => setSummaryDateFrom(e.target.value)}
                />
                <input
                  type="date"
                  aria-label="Cash flow date to"
                  className="form-control form-control-sm"
                  style={{ width: "150px" }}
                  value={summaryDateTo}
                  onChange={(e) => setSummaryDateTo(e.target.value)}
                />
              </div>
            }
          >
            {summaryError ? (
              <ErrorState message={summaryError} onRetry={loadSummary} />
            ) : summaryLoading || !summary ? (
              <LoadingState message={t("status.loading")} />
            ) : (
              <>
                <div className="row g-3 mb-4">
                  <div className="col-6 col-xl-3">
                    <div className="p-3 border rounded h-100">
                      <div className="small text-body-secondary">{t("expenses.kpiSalesInflow")}</div>
                      <div className="fs-4 fw-bold text-success pos-tabular">
                        {formatMoney(summary.cash_flow.sales_inflow)}
                      </div>
                      <div className="small text-body-secondary pos-tabular">
                        {summary.cash_flow.sales_count} sales
                      </div>
                    </div>
                  </div>
                  <div className="col-6 col-xl-3">
                    <div className="p-3 border rounded h-100">
                      <div className="small text-body-secondary">
                        {t("expenses.kpiPurchasingOutflow")}
                      </div>
                      <div className="fs-4 fw-bold text-warning pos-tabular">
                        {formatMoney(summary.cash_flow.purchasing_outflow)}
                      </div>
                      <div className="small text-body-secondary pos-tabular">
                        {summary.cash_flow.purchases_count} POs
                      </div>
                    </div>
                  </div>
                  <div className="col-6 col-xl-3">
                    <div className="p-3 border rounded h-100">
                      <div className="small text-body-secondary">
                        {t("expenses.kpiExpenseOutflow")}
                      </div>
                      <div className="fs-4 fw-bold text-danger pos-tabular">
                        {formatMoney(summary.cash_flow.expense_outflow)}
                      </div>
                      <div className="small text-body-secondary pos-tabular">
                        {summary.cash_flow.expenses_count} expenses
                      </div>
                    </div>
                  </div>
                  <div className="col-6 col-xl-3">
                    <div className="p-3 border rounded h-100 bg-body-tertiary">
                      <div className="small text-body-secondary">{t("expenses.kpiNetCashFlow")}</div>
                      <div
                        className={`fs-4 fw-bold pos-tabular ${
                          Number(summary.cash_flow.net_cash_flow) >= 0
                            ? "text-primary"
                            : "text-danger"
                        }`}
                      >
                        {formatMoney(summary.cash_flow.net_cash_flow)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="row g-3">
                  <div className="col-12 col-lg-6">
                    <h2 className="h6 fw-semibold mb-2">{t("expenses.breakdownByCategory")}</h2>
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
                      rows={summary.by_category || []}
                      rowKey="category_id"
                      emptyTitle={t("expenses.emptyExpenses")}
                    />
                  </div>
                  <div className="col-12 col-lg-6">
                    <h2 className="h6 fw-semibold mb-2">{t("expenses.breakdownByPayment")}</h2>
                    <DataTable
                      columns={[
                        {
                          key: "payment_method",
                          header: t("expenses.colPayment"),
                          render: (row) => paymentMethodLabel(row.payment_method),
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
                      rows={summary.by_payment_method || []}
                      rowKey="payment_method"
                      emptyTitle={t("expenses.emptyExpenses")}
                    />
                  </div>
                </div>
              </>
            )}
          </AppCard>
        </div>
      ) : (
        <AppCard
          bodyClassName="p-0"
          headerActions={
            <input
              type="search"
              className="form-control form-control-sm"
              style={{ minWidth: "240px" }}
              placeholder={t("controls.search")}
              value={categoriesSearch}
              onChange={(e) => setCategoriesSearch(e.target.value)}
            />
          }
        >
          {categoriesError ? (
            <div className="p-4">
              <ErrorState message={categoriesError} onRetry={loadCategoriesTab} />
            </div>
          ) : categoriesLoading ? (
            <LoadingState message={t("status.loading")} />
          ) : categories.length === 0 ? (
            <EmptyState icon="bi-tags" title={t("expenses.emptyCategories")} />
          ) : (
            <>
              <DataTable columns={categoryColumns} rows={categories} rowKey="id" />
              <Pagination
                page={categoriesPage}
                pageSize={PAGE_SIZE}
                totalCount={categoriesCount}
                onPageChange={setCategoriesPage}
                previousLabel={t("controls.previous")}
                nextLabel={t("controls.next")}
              />
            </>
          )}
        </AppCard>
      )}

      {/* Expense Create / Edit Modal */}
      <AppModal
        isOpen={expenseModalOpen}
        onClose={() => !savingExpense && setExpenseModalOpen(false)}
        title={editingExpense ? t("expenses.editExpenseTitle") : t("expenses.createExpenseTitle")}
        size="lg"
      >
        <form onSubmit={handleSaveExpense}>
          {expenseFormError ? (
            <div className="alert alert-danger py-2 small">{expenseFormError}</div>
          ) : null}
          <div className="row g-3 mb-3">
            <div className="col-12 col-md-6">
              <FormSelect
                id="expense-category"
                label={t("expenses.categoryLabel")}
                required
                options={activeCategoryOptions}
                value={expenseForm.category}
                onChange={(e) => setExpenseForm((p) => ({ ...p, category: e.target.value }))}
              />
            </div>
            <div className="col-12 col-md-6">
              <FormInput
                id="expense-date"
                type="date"
                label={t("expenses.dateLabel")}
                required
                value={expenseForm.expense_date}
                onChange={(e) => setExpenseForm((p) => ({ ...p, expense_date: e.target.value }))}
              />
            </div>
            <div className="col-12">
              <FormInput
                id="expense-title"
                label={t("expenses.titleLabel")}
                required
                value={expenseForm.title}
                onChange={(e) => setExpenseForm((p) => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div className="col-12 col-md-6">
              <FormInput
                id="expense-amount"
                type="number"
                step="0.01"
                min="0.01"
                label={t("expenses.amountLabel")}
                required
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm((p) => ({ ...p, amount: e.target.value }))}
              />
            </div>
            <div className="col-12 col-md-6">
              <FormSelect
                id="expense-payment-method"
                label={t("expenses.paymentMethodLabel")}
                options={paymentOptions}
                value={expenseForm.payment_method}
                onChange={(e) => setExpenseForm((p) => ({ ...p, payment_method: e.target.value }))}
              />
            </div>
            <div className="col-12 col-md-6">
              <FormInput
                id="expense-vendor"
                label={t("expenses.vendorLabel")}
                value={expenseForm.vendor_name}
                onChange={(e) => setExpenseForm((p) => ({ ...p, vendor_name: e.target.value }))}
              />
            </div>
            <div className="col-12 col-md-6">
              <FormInput
                id="expense-reference"
                label={t("expenses.referenceLabel")}
                value={expenseForm.reference_code}
                onChange={(e) => setExpenseForm((p) => ({ ...p, reference_code: e.target.value }))}
              />
            </div>
            <div className="col-12">
              <FormTextarea
                id="expense-notes"
                label={t("expenses.notesLabel")}
                rows={2}
                value={expenseForm.notes}
                onChange={(e) => setExpenseForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>
          </div>
          <FormActions
            submitLabel={t("controls.save")}
            submittingLabel={t("controls.saving")}
            cancelLabel={t("controls.cancel")}
            onCancel={() => setExpenseModalOpen(false)}
            submitting={savingExpense}
          />
        </form>
      </AppModal>

      {/* Expense Category Create / Edit Modal */}
      <AppModal
        isOpen={categoryModalOpen}
        onClose={() => !savingCategory && setCategoryModalOpen(false)}
        title={
          editingCategory ? t("expenses.editCategoryTitle") : t("expenses.createCategoryTitle")
        }
        size="md"
      >
        <form onSubmit={handleSaveCategory}>
          {categoryFormError ? (
            <div className="alert alert-danger py-2 small">{categoryFormError}</div>
          ) : null}
          <FormInput
            id="exp-cat-name"
            className="mb-3"
            label={t("expenses.categoryNameLabel")}
            required
            value={categoryForm.name}
            onChange={(e) => setCategoryForm((p) => ({ ...p, name: e.target.value }))}
          />
          <FormInput
            id="exp-cat-name-km"
            className="mb-3"
            label={t("expenses.categoryNameKmLabel")}
            value={categoryForm.name_km}
            onChange={(e) => setCategoryForm((p) => ({ ...p, name_km: e.target.value }))}
          />
          <FormTextarea
            id="exp-cat-desc"
            className="mb-3"
            label={t("expenses.descriptionLabel")}
            rows={2}
            value={categoryForm.description}
            onChange={(e) => setCategoryForm((p) => ({ ...p, description: e.target.value }))}
          />
          <div className="form-check mb-3">
            <input
              id="exp-cat-active"
              type="checkbox"
              className="form-check-input"
              checked={categoryForm.is_active}
              onChange={(e) => setCategoryForm((p) => ({ ...p, is_active: e.target.checked }))}
            />
            <label htmlFor="exp-cat-active" className="form-check-label">
              {t("expenses.categoryActiveLabel")}
            </label>
          </div>
          <FormActions
            submitLabel={t("controls.save")}
            submittingLabel={t("controls.saving")}
            cancelLabel={t("controls.cancel")}
            onCancel={() => setCategoryModalOpen(false)}
            submitting={savingCategory}
          />
        </form>
      </AppModal>
    </div>
  );
}
