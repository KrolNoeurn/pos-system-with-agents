import { useEffect, useState } from "react";
import { AppModal } from "../ui";
import { usePreferences } from "../../contexts/PreferencesContext";
import { fetchReceiptProfile } from "../../services/settingsService";

const DEFAULT_RECEIPT_PROFILE = {
  store_name: "POS System",
  store_name_km: "",
  tagline: "",
  phone: "",
  address: "",
  address_km: "",
  tax_id: "",
  currency_code: "USD",
  currency_symbol: "$",
  exchange_rate_khr: "4100.00",
  receipt_header: "",
  receipt_footer: "",
  receipt_footer_km: "",
  show_khr_on_receipt: false,
  show_tax_id_on_receipt: false,
};

function formatMoney(value, symbol = "$") {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return `${symbol}0.00`;
  return `${symbol}${num.toFixed(2)}`;
}

function formatKHR(usdValue, rate) {
  const num = Number(usdValue ?? 0) * Number(rate || 4100);
  if (Number.isNaN(num)) return "0 ៛";
  return `${Math.round(num).toLocaleString()} ៛`;
}

function formatQty(value) {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return "0";
  return Number.isInteger(num) ? String(num) : num.toFixed(3).replace(/\.?0+$/, "");
}

function formatDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function ReceiptModal({ isOpen, sale, onClose, onNewSale }) {
  const { t, language } = usePreferences();
  const [profile, setProfile] = useState(DEFAULT_RECEIPT_PROFILE);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    fetchReceiptProfile()
      .then((data) => {
        if (active && data) {
          setProfile({ ...DEFAULT_RECEIPT_PROFILE, ...data });
        }
      })
      .catch(() => {
        // Fallback to default receipt branding silently
      });
    return () => {
      active = false;
    };
  }, [isOpen]);

  if (!sale) return null;

  const symbol = profile.currency_symbol || "$";
  const displayStoreName =
    language === "km" && profile.store_name_km ? profile.store_name_km : profile.store_name;
  const displayAddress =
    language === "km" && profile.address_km ? profile.address_km : profile.address;
  const displayFooter =
    language === "km" && profile.receipt_footer_km
      ? profile.receipt_footer_km
      : profile.receipt_footer;

  const statusBadgeClass =
    sale.status === "completed"
      ? "text-bg-success"
      : sale.status === "refunded"
        ? "text-bg-warning"
        : "text-bg-danger";

  const statusLabel =
    sale.status === "completed"
      ? t("sales.statusCompleted")
      : sale.status === "refunded"
        ? t("sales.statusRefunded")
        : t("sales.statusCancelled");

  const methodLabel = (method) => {
    if (method === "card") return t("sales.methodCard");
    if (method === "qr") return t("sales.methodQr");
    if (method === "split") return t("sales.methodSplit");
    return t("sales.methodCash");
  };

  return (
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      title={`${t("sales.receiptTitle")} — ${sale.sale_number}`}
      size="lg"
      footer={
        <>
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => window.print()}
          >
            <i className="bi bi-printer me-1" aria-hidden="true" />
            {t("sales.printReceipt")}
          </button>
          {onNewSale ? (
            <button type="button" className="btn btn-primary" onClick={onNewSale}>
              <i className="bi bi-plus-circle me-1" aria-hidden="true" />
              {t("sales.newSale")}
            </button>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t("controls.close")}
            </button>
          )}
        </>
      }
    >
      <div className="pos-receipt-preview">
        <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 border-bottom pb-3 mb-3">
          <div>
            <div className="fw-bold fs-5">{displayStoreName}</div>
            {profile.tagline ? (
              <div className="small text-body-secondary">{profile.tagline}</div>
            ) : null}
            {displayAddress ? <div className="small text-body-secondary">{displayAddress}</div> : null}
            {profile.phone ? (
              <div className="small text-body-secondary">Tel: {profile.phone}</div>
            ) : null}
            {profile.show_tax_id_on_receipt && profile.tax_id ? (
              <div className="small text-body-secondary">VAT TIN: {profile.tax_id}</div>
            ) : null}
            {profile.receipt_header ? (
              <div className="small fst-italic mt-1">{profile.receipt_header}</div>
            ) : null}
            <div className="small text-body-secondary mt-1">
              {t("sales.receiptNumber")}: <code className="fw-semibold">{sale.sale_number}</code>
            </div>
            <div className="small text-body-secondary">
              {t("sales.dateLabel")}: {formatDateTime(sale.created_at)}
            </div>
          </div>
          <div className="text-md-end">
            <span className={`badge ${statusBadgeClass} mb-1`}>{statusLabel}</span>
            <div className="small">
              <span className="text-body-secondary">{t("sales.cashierLabel")}: </span>
              <span className="fw-medium">{sale.cashier_full_name || sale.cashier_username}</span>
            </div>
            <div className="small">
              <span className="text-body-secondary">{t("sales.customerLabel")}: </span>
              <span className="fw-medium">{sale.customer_name_snapshot}</span>
            </div>
          </div>
        </div>

        {sale.status === "cancelled" && sale.cancel_reason ? (
          <div className="alert alert-danger py-2 small">
            <strong>{t("sales.statusCancelled")}:</strong> {sale.cancel_reason}
            {sale.cancelled_by_username ? ` (${sale.cancelled_by_username})` : ""}
          </div>
        ) : null}

        {sale.status === "refunded" && sale.refund_reason ? (
          <div className="alert alert-warning py-2 small">
            <strong>{t("sales.statusRefunded")}:</strong> {sale.refund_reason}
            {sale.refunded_by_username ? ` (${sale.refunded_by_username})` : ""}
          </div>
        ) : null}

        <div className="table-responsive mb-3">
          <table className="table table-sm align-middle mb-0">
            <thead>
              <tr className="text-body-secondary small text-uppercase">
                <th>Item</th>
                <th className="text-end">Qty</th>
                <th className="text-end">Price</th>
                <th className="text-end">Tax</th>
                <th className="text-end">Total</th>
              </tr>
            </thead>
            <tbody>
              {(sale.items || []).map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="fw-medium">{item.product_name_snapshot}</div>
                    <div className="small text-body-secondary">
                      <code>{item.product_sku_snapshot}</code> · {item.unit_abbreviation_snapshot}
                      {Number(item.line_discount) > 0 ? (
                        <span className="text-danger ms-1">
                          · -{formatMoney(item.line_discount, symbol)}
                          {item.discount_type === "percent" && Number(item.discount_value) > 0
                            ? ` (${Number(item.discount_value)}%)`
                            : ""}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="text-end pos-tabular">
                    {formatQty(item.quantity)} {item.unit_abbreviation_snapshot}
                  </td>
                  <td className="text-end pos-tabular">{formatMoney(item.unit_price, symbol)}</td>
                  <td className="text-end pos-tabular">{formatMoney(item.line_tax, symbol)}</td>
                  <td className="text-end pos-tabular fw-semibold">
                    {formatMoney(item.line_total, symbol)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="row g-3 border-top pt-3">
          <div className="col-12 col-md-6">
            <div className="small fw-semibold text-uppercase text-body-secondary mb-2">
              {t("sales.paymentSummary")}
            </div>
            {(sale.payments || []).length > 0 ? (
              <ul className="list-unstyled small mb-0">
                {sale.payments.map((p) => (
                  <li key={p.id} className="d-flex justify-content-between py-1 border-bottom">
                    <span>
                      {methodLabel(p.payment_method)}
                      {p.reference_code ? (
                        <span className="text-body-secondary ms-1">({p.reference_code})</span>
                      ) : null}
                    </span>
                    <span className="pos-tabular fw-medium">{formatMoney(p.amount, symbol)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="small text-body-secondary">{methodLabel(sale.payment_method)}</div>
            )}
            {sale.notes ? (
              <div className="small text-body-secondary mt-2">
                <strong>{t("sales.notesLabel")}:</strong> {sale.notes}
              </div>
            ) : null}
          </div>

          <div className="col-12 col-md-6">
            <div className="d-flex justify-content-between small py-1">
              <span className="text-body-secondary">{t("sales.subtotalLabel")}</span>
              <span className="pos-tabular">{formatMoney(sale.subtotal, symbol)}</span>
            </div>
            {Number(sale.item_discount_total) > 0 ? (
              <div className="d-flex justify-content-between small py-1">
                <span className="text-body-secondary">{t("sales.itemDiscountsSummary")}</span>
                <span className="pos-tabular text-danger">
                  -{formatMoney(sale.item_discount_total, symbol)}
                </span>
              </div>
            ) : null}
            {Number(sale.item_discount_total) > 0 && Number(sale.order_discount_amount) > 0 ? (
              <div className="d-flex justify-content-between small py-1">
                <span className="text-body-secondary">
                  {t("sales.orderDiscountLabel")}
                  {sale.order_discount_type === "percent" && Number(sale.order_discount_value) > 0
                    ? ` (${Number(sale.order_discount_value)}%)`
                    : ""}
                </span>
                <span className="pos-tabular text-danger">
                  -{formatMoney(sale.order_discount_amount, symbol)}
                </span>
              </div>
            ) : null}
            <div className="d-flex justify-content-between small py-1">
              <span className="text-body-secondary">
                {t("sales.discountLabel")}
                {!Number(sale.item_discount_total) &&
                sale.order_discount_type === "percent" &&
                Number(sale.order_discount_value) > 0
                  ? ` (${Number(sale.order_discount_value)}%)`
                  : ""}
              </span>
              <span className="pos-tabular text-danger">
                -{formatMoney(sale.discount_amount, symbol)}
              </span>
            </div>
            <div className="d-flex justify-content-between small py-1">
              <span className="text-body-secondary">{t("sales.taxLabel")}</span>
              <span className="pos-tabular">{formatMoney(sale.tax_amount, symbol)}</span>
            </div>
            <div className="d-flex justify-content-between fw-bold fs-5 border-top pt-2 mt-1">
              <span>{t("sales.grandTotalLabel")}</span>
              <span className="pos-tabular text-primary">
                {formatMoney(sale.total_amount, symbol)}
              </span>
            </div>
            {profile.show_khr_on_receipt ? (
              <div className="d-flex justify-content-between small text-body-secondary">
                <span>KHR ({Number(profile.exchange_rate_khr).toLocaleString()})</span>
                <span className="pos-tabular fw-medium">
                  {formatKHR(sale.total_amount, profile.exchange_rate_khr)}
                </span>
              </div>
            ) : null}
            <div className="d-flex justify-content-between small pt-2">
              <span className="text-body-secondary">{t("sales.paidAmountLabel")}</span>
              <span className="pos-tabular fw-medium">{formatMoney(sale.paid_amount, symbol)}</span>
            </div>
            <div className="d-flex justify-content-between small">
              <span className="text-body-secondary">{t("sales.changeDueLabel")}</span>
              <span className="pos-tabular fw-semibold text-success">
                {formatMoney(sale.change_amount, symbol)}
              </span>
            </div>
          </div>
        </div>

        {displayFooter ? (
          <div className="text-center small text-body-secondary border-top mt-3 pt-2">
            {displayFooter}
          </div>
        ) : null}
      </div>
    </AppModal>
  );
}
