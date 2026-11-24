import { useCallback, useEffect, useState } from "react";
import StatusAlert from "../components/StatusAlert";
import {
  AppCard,
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
import { fetchStoreSettings, updateStoreSettings } from "../services/settingsService";
import { extractApiError } from "../utils/apiError";

function formatKHR(usdAmount, rate) {
  const num = Number(usdAmount || 0) * Number(rate || 4100);
  if (Number.isNaN(num)) return "0 ៛";
  return `${Math.round(num).toLocaleString()} ៛`;
}

export default function SettingsPage() {
  const { hasPermission } = useAuth();
  const { t, language } = usePreferences();
  const { showToast } = useToast();

  const canEdit = hasPermission("settings.edit");

  const [form, setForm] = useState(null);
  const [meta, setMeta] = useState({ updated_by_username: null, updated_at: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchStoreSettings();
      setForm({
        store_name: data.store_name || "",
        store_name_km: data.store_name_km || "",
        tagline: data.tagline || "",
        phone: data.phone || "",
        email: data.email || "",
        address: data.address || "",
        address_km: data.address_km || "",
        tax_id: data.tax_id || "",
        currency_code: data.currency_code || "USD",
        currency_symbol: data.currency_symbol || "$",
        exchange_rate_khr: String(data.exchange_rate_khr ?? "4100.00"),
        default_tax_rate: String(data.default_tax_rate ?? "0.00"),
        receipt_header: data.receipt_header || "",
        receipt_footer: data.receipt_footer || "",
        receipt_footer_km: data.receipt_footer_km || "",
        show_khr_on_receipt: Boolean(data.show_khr_on_receipt),
        show_tax_id_on_receipt: Boolean(data.show_tax_id_on_receipt),
      });
      setMeta({
        updated_by_username: data.updated_by_username,
        updated_at: data.updated_at,
      });
    } catch (err) {
      setError(extractApiError(err, "Unable to load store settings."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!canEdit || saving || !form) return;

    const rate = Number(form.exchange_rate_khr);
    const tax = Number(form.default_tax_rate);
    if (!form.store_name.trim()) {
      setFormError("Store name is required.");
      return;
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      setFormError("Exchange rate must be greater than zero.");
      return;
    }
    if (!Number.isFinite(tax) || tax < 0 || tax > 100) {
      setFormError("Default tax rate must be between 0 and 100.");
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      const updated = await updateStoreSettings({
        ...form,
        store_name: form.store_name.trim(),
        currency_code: form.currency_code.trim().toUpperCase(),
        currency_symbol: form.currency_symbol.trim(),
        exchange_rate_khr: rate.toFixed(2),
        default_tax_rate: tax.toFixed(2),
      });
      setMeta({
        updated_by_username: updated.updated_by_username,
        updated_at: updated.updated_at,
      });
      showToast({ variant: "success", message: t("settings.savedToast") });
    } catch (err) {
      setFormError(extractApiError(err, "Unable to save store settings."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingState message={t("status.loading")} />;
  }

  if (error || !form) {
    return <ErrorState message={error || "Settings unavailable."} onRetry={loadSettings} />;
  }

  const previewStoreName =
    language === "km" && form.store_name_km ? form.store_name_km : form.store_name || "POS Store";
  const previewAddress =
    language === "km" && form.address_km ? form.address_km : form.address;
  const previewFooter =
    language === "km" && form.receipt_footer_km ? form.receipt_footer_km : form.receipt_footer;

  return (
    <div className="d-flex flex-column gap-4">
      <PageHeader
        title={t("settings.title")}
        subtitle={t("settings.subtitle")}
        icon="bi-gear"
      />

      {!canEdit ? (
        <div className="alert alert-info py-2 small mb-0">
          <i className="bi bi-info-circle me-2" aria-hidden="true" />
          {t("settings.readOnlyNotice")}
        </div>
      ) : null}

      <div className="row g-4 align-items-start">
        <div className="col-12 col-xl-8">
          <form onSubmit={handleSave} className="d-flex flex-column gap-4">
            {formError ? (
              <StatusAlert
                variant="danger"
                message={formError}
                autoHideMs={6000}
                dismissible
                onClose={() => setFormError("")}
                className="py-2 small"
              />
            ) : null}

            <AppCard title={t("settings.sectionIdentity")} icon="bi-shop">
              <div className="row g-3">
                <div className="col-12 col-md-6">
                  <FormInput
                    id="store-name"
                    label={t("settings.storeNameLabel")}
                    required
                    disabled={!canEdit}
                    value={form.store_name}
                    onChange={(e) => setForm((p) => ({ ...p, store_name: e.target.value }))}
                  />
                </div>
                <div className="col-12 col-md-6">
                  <FormInput
                    id="store-name-km"
                    label={t("settings.storeNameKmLabel")}
                    disabled={!canEdit}
                    value={form.store_name_km}
                    onChange={(e) => setForm((p) => ({ ...p, store_name_km: e.target.value }))}
                  />
                </div>
                <div className="col-12 col-md-6">
                  <FormInput
                    id="store-tagline"
                    label={t("settings.taglineLabel")}
                    disabled={!canEdit}
                    value={form.tagline}
                    onChange={(e) => setForm((p) => ({ ...p, tagline: e.target.value }))}
                  />
                </div>
                <div className="col-12 col-md-6">
                  <FormInput
                    id="store-tax-id"
                    label={t("settings.taxIdLabel")}
                    disabled={!canEdit}
                    value={form.tax_id}
                    onChange={(e) => setForm((p) => ({ ...p, tax_id: e.target.value }))}
                  />
                </div>
                <div className="col-12 col-md-6">
                  <FormInput
                    id="store-phone"
                    label={t("settings.phoneLabel")}
                    disabled={!canEdit}
                    value={form.phone}
                    onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                  />
                </div>
                <div className="col-12 col-md-6">
                  <FormInput
                    id="store-email"
                    type="email"
                    label={t("settings.emailLabel")}
                    disabled={!canEdit}
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  />
                </div>
                <div className="col-12 col-md-6">
                  <FormTextarea
                    id="store-address"
                    label={t("settings.addressLabel")}
                    rows={2}
                    disabled={!canEdit}
                    value={form.address}
                    onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                  />
                </div>
                <div className="col-12 col-md-6">
                  <FormTextarea
                    id="store-address-km"
                    label={t("settings.addressKmLabel")}
                    rows={2}
                    disabled={!canEdit}
                    value={form.address_km}
                    onChange={(e) => setForm((p) => ({ ...p, address_km: e.target.value }))}
                  />
                </div>
              </div>
            </AppCard>

            <AppCard title={t("settings.sectionCurrency")} icon="bi-currency-exchange">
              <div className="row g-3">
                <div className="col-6 col-md-3">
                  <FormInput
                    id="currency-code"
                    label={t("settings.currencyCodeLabel")}
                    required
                    disabled={!canEdit}
                    value={form.currency_code}
                    onChange={(e) => setForm((p) => ({ ...p, currency_code: e.target.value }))}
                  />
                </div>
                <div className="col-6 col-md-3">
                  <FormInput
                    id="currency-symbol"
                    label={t("settings.currencySymbolLabel")}
                    required
                    disabled={!canEdit}
                    value={form.currency_symbol}
                    onChange={(e) => setForm((p) => ({ ...p, currency_symbol: e.target.value }))}
                  />
                </div>
                <div className="col-12 col-md-3">
                  <FormInput
                    id="exchange-rate-khr"
                    type="number"
                    step="0.01"
                    min="0.01"
                    label={t("settings.exchangeRateKhrLabel")}
                    required
                    disabled={!canEdit}
                    value={form.exchange_rate_khr}
                    onChange={(e) => setForm((p) => ({ ...p, exchange_rate_khr: e.target.value }))}
                  />
                </div>
                <div className="col-12 col-md-3">
                  <FormInput
                    id="default-tax-rate"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    label={t("settings.defaultTaxRateLabel")}
                    required
                    disabled={!canEdit}
                    value={form.default_tax_rate}
                    onChange={(e) => setForm((p) => ({ ...p, default_tax_rate: e.target.value }))}
                  />
                </div>
              </div>
            </AppCard>

            <AppCard title={t("settings.sectionReceipt")} icon="bi-receipt">
              <div className="row g-3">
                <div className="col-12">
                  <FormTextarea
                    id="receipt-header"
                    label={t("settings.receiptHeaderLabel")}
                    rows={2}
                    disabled={!canEdit}
                    value={form.receipt_header}
                    onChange={(e) => setForm((p) => ({ ...p, receipt_header: e.target.value }))}
                  />
                </div>
                <div className="col-12 col-md-6">
                  <FormTextarea
                    id="receipt-footer"
                    label={t("settings.receiptFooterLabel")}
                    rows={2}
                    disabled={!canEdit}
                    value={form.receipt_footer}
                    onChange={(e) => setForm((p) => ({ ...p, receipt_footer: e.target.value }))}
                  />
                </div>
                <div className="col-12 col-md-6">
                  <FormTextarea
                    id="receipt-footer-km"
                    label={t("settings.receiptFooterKmLabel")}
                    rows={2}
                    disabled={!canEdit}
                    value={form.receipt_footer_km}
                    onChange={(e) => setForm((p) => ({ ...p, receipt_footer_km: e.target.value }))}
                  />
                </div>
                <div className="col-12 d-flex flex-column gap-2">
                  <div className="form-check">
                    <input
                      id="show-khr"
                      type="checkbox"
                      className="form-check-input"
                      disabled={!canEdit}
                      checked={form.show_khr_on_receipt}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, show_khr_on_receipt: e.target.checked }))
                      }
                    />
                    <label htmlFor="show-khr" className="form-check-label">
                      {t("settings.showKhrLabel")}
                    </label>
                  </div>
                  <div className="form-check">
                    <input
                      id="show-tax-id"
                      type="checkbox"
                      className="form-check-input"
                      disabled={!canEdit}
                      checked={form.show_tax_id_on_receipt}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, show_tax_id_on_receipt: e.target.checked }))
                      }
                    />
                    <label htmlFor="show-tax-id" className="form-check-label">
                      {t("settings.showTaxIdLabel")}
                    </label>
                  </div>
                </div>
              </div>
            </AppCard>

            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
              <div className="small text-body-secondary">
                {meta.updated_by_username ? (
                  <>
                    {t("settings.lastUpdatedBy")}: <strong>{meta.updated_by_username}</strong>
                  </>
                ) : null}
              </div>
              {canEdit ? (
                <FormActions
                  submitLabel={t("controls.save")}
                  submittingLabel={t("controls.saving")}
                  submitting={saving}
                />
              ) : null}
            </div>
          </form>
        </div>

        {/* Live Receipt Preview */}
        <div className="col-12 col-xl-4">
          <AppCard title={t("settings.previewTitle")} icon="bi-eye">
            <div className="border rounded p-3 bg-body-tertiary font-monospace small">
              <div className="text-center border-bottom pb-2 mb-2">
                <div className="fw-bold fs-6">{previewStoreName}</div>
                {form.tagline ? <div className="text-body-secondary">{form.tagline}</div> : null}
                {previewAddress ? <div>{previewAddress}</div> : null}
                {form.phone ? <div>Tel: {form.phone}</div> : null}
                {form.show_tax_id_on_receipt && form.tax_id ? (
                  <div>VAT TIN: {form.tax_id}</div>
                ) : null}
                {form.receipt_header ? (
                  <div className="mt-1 fst-italic">{form.receipt_header}</div>
                ) : null}
              </div>
              <div className="d-flex justify-content-between">
                <span>Iced Coffee x2</span>
                <span>{form.currency_symbol}7.00</span>
              </div>
              <div className="d-flex justify-content-between border-top mt-2 pt-2 fw-bold">
                <span>TOTAL ({form.currency_code})</span>
                <span>{form.currency_symbol}7.00</span>
              </div>
              {form.show_khr_on_receipt ? (
                <div className="d-flex justify-content-between text-body-secondary">
                  <span>TOTAL (KHR)</span>
                  <span>{formatKHR(7, form.exchange_rate_khr)}</span>
                </div>
              ) : null}
              {previewFooter ? (
                <div className="text-center border-top mt-3 pt-2 text-body-secondary">
                  {previewFooter}
                </div>
              ) : null}
            </div>
          </AppCard>
        </div>
      </div>
    </div>
  );
}
