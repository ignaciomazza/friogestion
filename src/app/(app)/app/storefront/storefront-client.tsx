"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ToastContainer, toast } from "react-toastify";
import { MoneyInput } from "@/components/inputs/MoneyInput";
import { APP_NAVIGATION_GUARD_EVENT } from "@/lib/navigation-guard";
import "react-toastify/dist/ReactToastify.css";

type ChannelResponse = {
  channel: {
    id: string;
    name: string;
    storeName: string;
    supportEmail: string | null;
    supportPhone: string | null;
    pickupAddress: string | null;
    currencyCode: string;
    defaultPriceListId: string | null;
    allowsCustomerAccounts: boolean;
    customerAccountsMode: "prepared" | "enabled";
    defaultPaymentMethod: string;
    globalPriceAdjustmentPercent: string | number;
    normalShippingAmount: string | number;
    reserveTtlMinutes: number;
    manualBillingByDefault: boolean;
    paymentAdjustments: Array<{
      id: string;
      paymentMethod: string;
      percent: string | number;
    }>;
  };
  priceLists: Array<{
    id: string;
    name: string;
    isConsumerFinal: boolean;
    isDefault: boolean;
  }>;
  apiKeys: Array<{
    id: string;
    label: string;
    keyPrefix: string;
    isActive: boolean;
    lastUsedAt: string | null;
    createdAt: string;
  }>;
};

type PublicationRow = {
  publicationId: string | null;
  productId: string;
  productName: string;
  sku: string | null;
  brand: string | null;
  unit: string | null;
  slug: string;
  publicName: string;
  shortDescription: string;
  longDescription: string;
  category: string;
  publicationStatus: "PUBLISHED" | "PAUSED";
  stockMode: "STRICT" | "CONSULT" | "BACKORDER" | "OUT_OF_STOCK";
  webStockAvailable: number;
  webStockReserved: number;
  shippingType: "NORMAL" | "PICKUP" | "OWN_DELIVERY" | "QUOTE" | "RESTRICTED";
  pricingMode: "AUTO" | "FIXED";
  fixedFinalPrice: number | null;
  priceAdjustmentPercent: number;
  billingMode: "DEFAULT" | "MANUAL" | "AUTO";
  featured: boolean;
  computedPriceFinal: number;
};

type OrderRow = {
  id: string;
  displayNumber: string | null;
  status: string;
  paymentStatus: string;
  customerDisplayName: string;
  customerEmail: string;
  total: number;
  itemCount: number;
  createdAt: string;
  expiresAt: string | null;
};

type ConfigFormState = {
  name: string;
  storeName: string;
  supportEmail: string;
  supportPhone: string;
  pickupAddress: string;
  defaultPriceListId: string;
  allowsCustomerAccounts: boolean;
  customerAccountsMode: "prepared" | "enabled";
  defaultPaymentMethod: string;
  globalPriceAdjustmentPercent: string;
  normalShippingAmount: string;
  reserveTtlMinutes: string;
  manualBillingByDefault: boolean;
  paymentAdjustmentMercadoPago: string;
};

type SectionKey = "config" | "publications" | "orders";
type PublicationSortKey =
  | "name-asc"
  | "name-desc"
  | "price-desc"
  | "price-asc"
  | "stock-desc"
  | "stock-asc";
type PublicationStatusFilter = "active" | "paused" | "all";

const stockModeTone: Record<PublicationRow["stockMode"], string> = {
  STRICT: "border-sky-200 bg-sky-50 text-sky-900",
  CONSULT: "border-amber-200 bg-amber-50 text-amber-900",
  BACKORDER: "border-violet-200 bg-violet-50 text-violet-900",
  OUT_OF_STOCK: "border-rose-200 bg-rose-50 text-rose-900",
};

const statusTone: Record<PublicationRow["publicationStatus"], string> = {
  PUBLISHED: "border-emerald-200 bg-emerald-50 text-emerald-900",
  PAUSED: "border-zinc-200 bg-zinc-100 text-zinc-700",
};

const orderStatusTone: Record<string, string> = {
  PENDING_PAYMENT: "border-amber-200 bg-amber-50 text-amber-900",
  CONFIRMED: "border-emerald-200 bg-emerald-50 text-emerald-900",
  REJECTED: "border-rose-200 bg-rose-50 text-rose-900",
  CANCELLED: "border-zinc-200 bg-zinc-100 text-zinc-700",
  EXPIRED: "border-zinc-200 bg-zinc-100 text-zinc-700",
};

const paymentTone: Record<string, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-900",
  APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-900",
  REJECTED: "border-rose-200 bg-rose-50 text-rose-900",
  CANCELLED: "border-zinc-200 bg-zinc-100 text-zinc-700",
  REFUNDED: "border-zinc-200 bg-zinc-100 text-zinc-700",
};

const publicationStatusLabels: Record<PublicationRow["publicationStatus"], string> = {
  PUBLISHED: "Publicado",
  PAUSED: "Pausado",
};

const stockModeLabels: Record<PublicationRow["stockMode"], string> = {
  STRICT: "Compra con stock",
  CONSULT: "Consultar stock",
  BACKORDER: "Por encargo",
  OUT_OF_STOCK: "Sin stock",
};

const shippingTypeLabels: Record<PublicationRow["shippingType"], string> = {
  NORMAL: "Envio normal",
  PICKUP: "Retiro",
  OWN_DELIVERY: "Entrega propia",
  QUOTE: "A coordinar",
  RESTRICTED: "Logistica especial",
};

const pricingModeLabels: Record<PublicationRow["pricingMode"], string> = {
  AUTO: "Automatico",
  FIXED: "Precio fijo",
};

const billingModeLabels: Record<PublicationRow["billingMode"], string> = {
  DEFAULT: "Segun canal",
  MANUAL: "Manual",
  AUTO: "Automatico",
};

const orderStatusLabels: Record<string, string> = {
  PENDING_PAYMENT: "Pendiente de pago",
  CONFIRMED: "Confirmado",
  REJECTED: "Rechazado",
  CANCELLED: "Cancelado",
  EXPIRED: "Expirado",
};

const paymentStatusLabels: Record<string, string> = {
  PENDING: "Pendiente",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
  CANCELLED: "Cancelado",
  REFUNDED: "Reintegrado",
};

const panelClass =
  "rounded-[22px] border border-zinc-200 bg-white shadow-[0_16px_50px_-42px_rgba(24,39,75,0.28)]";
const fieldClass =
  "input w-full min-h-[46px] rounded-2xl border-zinc-200 px-4 text-[15px] placeholder:text-zinc-400";
const textareaClass =
  "min-h-[118px] w-full rounded-[20px] border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-sky-200 focus:ring-2 focus:ring-sky-400/40";
const PUBLICATIONS_PAGE_SIZE = 18;

const createDefaultConfigForm = (): ConfigFormState => ({
  name: "Storefront",
  storeName: "",
  supportEmail: "",
  supportPhone: "",
  pickupAddress: "",
  defaultPriceListId: "",
  allowsCustomerAccounts: true,
  customerAccountsMode: "prepared",
  defaultPaymentMethod: "mercadopago_checkout_api",
  globalPriceAdjustmentPercent: "0",
  normalShippingAmount: "0",
  reserveTtlMinutes: "30",
  manualBillingByDefault: true,
  paymentAdjustmentMercadoPago: "0",
});

const serializePublicationDraft = (row: PublicationRow) =>
  JSON.stringify({
    productId: row.productId,
    publicationStatus: row.publicationStatus,
    publicName: row.publicName,
    shortDescription: row.shortDescription,
    longDescription: row.longDescription,
    category: row.category,
    featured: row.featured,
    shippingType: row.shippingType,
    stockMode: row.stockMode,
    webStockAvailable: row.webStockAvailable,
    pricingMode: row.pricingMode,
    fixedFinalPrice: row.fixedFinalPrice,
    priceAdjustmentPercent: row.priceAdjustmentPercent,
    billingMode: row.billingMode,
  });

const serializeConfigForm = (form: ConfigFormState) =>
  JSON.stringify({
    defaultPriceListId: form.defaultPriceListId,
    globalPriceAdjustmentPercent: form.globalPriceAdjustmentPercent,
    normalShippingAmount: form.normalShippingAmount,
    reserveTtlMinutes: form.reserveTtlMinutes,
    manualBillingByDefault: form.manualBillingByDefault,
    paymentAdjustmentMercadoPago: form.paymentAdjustmentMercadoPago,
  });

const toNumber = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatMoney = (value: number) =>
  value.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const formatDateTime = (value: string | null) => {
  if (!value) return "Sin registrar";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Sin registrar";
  return parsed.toLocaleString("es-AR");
};

function StoreIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className={className}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.75 8.25h14.5l-1 9.5a1.5 1.5 0 0 1-1.49 1.25H7.24a1.5 1.5 0 0 1-1.49-1.25l-1-9.5Zm1.75 0 1.1-3A1.5 1.5 0 0 1 9 4.25h6a1.5 1.5 0 0 1 1.4 1l1.1 3M9.5 11.75h5"
      />
    </svg>
  );
}

function PackageIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className={className}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m12 3 7 4-7 4-7-4 7-4Zm7 4v10l-7 4-7-4V7m7 4v10"
      />
    </svg>
  );
}

function OrdersIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className={className}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.75 4.75h8.5a1.5 1.5 0 0 1 1.5 1.5v11.5a1.5 1.5 0 0 1-1.5 1.5h-8.5a1.5 1.5 0 0 1-1.5-1.5V6.25a1.5 1.5 0 0 1 1.5-1.5Zm2.25 4h4m-4 3h4m-4 3h2.5"
      />
    </svg>
  );
}

function ChevronDownSmallIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      className={className}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 7.5 5 5 5-5" />
    </svg>
  );
}

function PlaySmallIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden>
      <path d="M7 5.75c0-.62.68-1.01 1.22-.68l6.06 3.75a.8.8 0 0 1 0 1.36l-6.06 3.75A.8.8 0 0 1 7 13.25v-7.5Z" />
    </svg>
  );
}

function PauseSmallIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden>
      <path d="M6.75 5.5c0-.41.34-.75.75-.75h1.25c.41 0 .75.34.75.75v9c0 .41-.34.75-.75.75H7.5a.75.75 0 0 1-.75-.75v-9Zm4.75 0c0-.41.34-.75.75-.75h1.25c.41 0 .75.34.75.75v9c0 .41-.34.75-.75.75h-1.25a.75.75 0 0 1-.75-.75v-9Z" />
    </svg>
  );
}

function MiniToggle({
  checked,
  onChange,
  label,
  help,
  className,
  contentClassName,
  helpClassName,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  help?: string;
  className?: string;
  contentClassName?: string;
  helpClassName?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-3 rounded-[18px] border border-zinc-200 bg-zinc-50/70 px-3.5 py-3 ${className ?? ""}`}>
      <div className={`min-w-0 ${contentClassName ?? ""}`}>
        <div className="text-sm font-medium text-zinc-900">{label}</div>
        {help ? <p className={`${helpClassName ?? "mt-1"} text-xs leading-relaxed text-zinc-500`}>{help}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        onClick={onChange}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 ${
          checked ? "border-sky-300 bg-sky-100" : "border-zinc-300 bg-zinc-100"
        }`}
      >
        <span
          className={`inline-block h-4.5 w-4.5 rounded-full bg-white shadow-[0_1px_5px_rgba(0,0,0,0.16)] transition-transform ${
            checked ? "translate-x-[22px]" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

function Field({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: ReactNode;
}) {
  return (
    <label className="field-stack block min-w-0 w-full">
      <span className="input-label">{label}</span>
      {children}
      {helper ? (
        <span className="block text-[11px] leading-relaxed text-zinc-500">{helper}</span>
      ) : null}
    </label>
  );
}

function SelectInput({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (containerRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="relative"
    >
      <button
        type="button"
        className={`input relative flex w-full min-h-[46px] items-center rounded-2xl border border-zinc-200 bg-white px-4 pr-12 text-left text-[15px] shadow-[0_10px_24px_-22px_rgba(24,39,75,0.4)] transition hover:border-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 ${
          open ? "border-sky-300 ring-2 ring-sky-400/20" : ""
        }`}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`block min-w-0 truncate ${selected ? "text-zinc-900" : "text-zinc-500"}`}>
          {selected?.label ?? placeholder ?? "Seleccionar"}
        </span>
        <span className="pointer-events-none absolute right-4 top-1/2 inline-flex -translate-y-1/2 items-center justify-center text-zinc-500">
          <ChevronDownSmallIcon className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open ? (
        <div
          role="listbox"
          className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-[20px] border border-zinc-200 bg-white p-1.5 shadow-[0_20px_40px_-28px_rgba(24,24,27,0.45)]"
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value || "__empty"}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm transition ${
                  isSelected
                    ? "border border-sky-200 bg-sky-50 text-sky-950"
                    : "border border-transparent text-zinc-700 hover:bg-zinc-50"
                }`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                {isSelected ? (
                  <span className="ml-3 shrink-0 text-xs font-semibold text-sky-700">
                    Actual
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function ChoicePills<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ label: string; value: T; icon?: ReactNode }>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`toggle-pill px-3 py-2 text-sm ${
            value === option.value ? "toggle-pill-active border-sky-300 bg-sky-50 text-sky-950" : ""
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            {option.icon ? <span className="shrink-0">{option.icon}</span> : null}
            <span>{option.label}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function PercentInput({
  value,
  onChange,
  placeholder = "0",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative mt-1">
      <input
        className="input no-spinner w-full min-h-[46px] rounded-2xl pl-3 pr-9 text-right tabular-nums placeholder:text-zinc-400"
        inputMode="decimal"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={(event) => {
          const length = event.currentTarget.value.length;
          event.currentTarget.setSelectionRange(length, length);
        }}
        onMouseUp={(event) => {
          event.preventDefault();
          const length = event.currentTarget.value.length;
          event.currentTarget.setSelectionRange(length, length);
        }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-1 right-1.5 inline-flex min-w-[1.5rem] items-center justify-center rounded-md border border-transparent bg-transparent px-1 text-[10px] font-semibold text-zinc-500 sm:right-2"
      >
        %
      </span>
    </div>
  );
}

function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] ${tone}`}>
      {children}
    </span>
  );
}

function PublicationEditorCard({
  row,
  onChange,
  onSave,
  categoryOptions,
  open,
  onToggleOpen,
}: {
  row: PublicationRow;
  onChange: (patch: Partial<PublicationRow>) => void;
  onSave: () => void;
  categoryOptions: Array<{ label: string; value: string }>;
  open: boolean;
  onToggleOpen: () => void;
}) {
  return (
    <article className="overflow-visible rounded-[22px] border border-dashed border-zinc-200 bg-white shadow-[0_18px_36px_-34px_rgba(24,39,75,0.34)]">
      <button
        type="button"
        onClick={onToggleOpen}
        className="flex w-full flex-col gap-3 px-4 py-4 text-left transition hover:bg-zinc-50/50 sm:px-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-zinc-950">{row.productName}</h3>
            <p className="mt-1 text-xs text-zinc-500">
              {row.sku || "Sin codigo"}
              {row.brand ? ` · ${row.brand}` : ""}
              {row.unit ? ` · ${row.unit}` : ""}
              {row.featured ? " · destacado" : ""}
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Badge tone={statusTone[row.publicationStatus]}>
              {publicationStatusLabels[row.publicationStatus]}
            </Badge>
            <Badge tone={stockModeTone[row.stockMode]}>
              {stockModeLabels[row.stockMode]}
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap gap-2 text-xs text-zinc-600">
            <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1">
              Cupo: {row.webStockAvailable}
            </span>
            <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1">
              Reservado: {row.webStockReserved}
            </span>
            <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1">
              Entrega: {shippingTypeLabels[row.shippingType]}
            </span>
            <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1">
              Facturacion: {billingModeLabels[row.billingMode]}
            </span>
          </div>
          <div className="text-right text-base font-semibold text-zinc-950 sm:text-lg">
            ${formatMoney(row.computedPriceFinal)}
          </div>
        </div>
      </button>

      {open ? (
        <div className="rounded-b-[22px] border-t border-dashed border-zinc-200 bg-white px-4 py-4 sm:px-5">
          <div className="space-y-4">
            <div className="space-y-4 border-b border-zinc-100 pb-4">
              <div>
                <h4 className="text-sm font-semibold text-zinc-950">Contenido visible</h4>
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <Field label="Nombre publico">
                  <input
                    className={fieldClass}
                    placeholder="Ej. Manifold digital R410A / R32"
                    value={row.publicName}
                    onChange={(event) => onChange({ publicName: event.target.value })}
                  />
                </Field>
                <Field label="Categoria">
                  <SelectInput
                    value={row.category}
                    onChange={(value) => onChange({ category: value })}
                    options={categoryOptions}
                    placeholder="Elegir categoria"
                  />
                </Field>
                <Field label="Descripcion corta">
                  <input
                    className={fieldClass}
                    placeholder="Instrumento de diagnostico para instaladores."
                    value={row.shortDescription}
                    onChange={(event) =>
                      onChange({ shortDescription: event.target.value })
                    }
                  />
                </Field>
                <div className="lg:col-span-2">
                  <Field
                    label="Descripcion larga"
                  >
                    <textarea
                      className={textareaClass}
                      placeholder="Describe caracteristicas, compatibilidades, limitaciones logísticas y cualquier aclaracion operativa."
                      value={row.longDescription}
                      onChange={(event) => onChange({ longDescription: event.target.value })}
                    />
                  </Field>
                </div>
              </div>
            </div>

            <div className="space-y-4 border-b border-zinc-100 pb-4">
              <div>
                <h4 className="text-sm font-semibold text-zinc-950">Operacion comercial</h4>
              </div>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                <div className="rounded-[20px] border border-zinc-200 bg-zinc-50/45 px-4 py-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <Field label="Estado de la publicacion">
                      <ChoicePills
                        value={row.publicationStatus}
                        onChange={(value) =>
                          onChange({
                            publicationStatus: value as PublicationRow["publicationStatus"],
                          })
                        }
                        options={[
                          { value: "PUBLISHED", label: publicationStatusLabels.PUBLISHED, icon: <PlaySmallIcon /> },
                          { value: "PAUSED", label: publicationStatusLabels.PAUSED, icon: <PauseSmallIcon /> },
                        ]}
                      />
                    </Field>
                    <Field label="Como se entrega">
                      <SelectInput
                        value={row.shippingType}
                        onChange={(value) =>
                          onChange({
                            shippingType: value as PublicationRow["shippingType"],
                          })
                        }
                        options={[
                          { value: "NORMAL", label: shippingTypeLabels.NORMAL },
                          { value: "PICKUP", label: shippingTypeLabels.PICKUP },
                          { value: "OWN_DELIVERY", label: shippingTypeLabels.OWN_DELIVERY },
                          { value: "QUOTE", label: shippingTypeLabels.QUOTE },
                          { value: "RESTRICTED", label: shippingTypeLabels.RESTRICTED },
                        ]}
                      />
                    </Field>
                    <Field label="Disponibilidad">
                      <SelectInput
                        value={row.stockMode}
                        onChange={(value) =>
                          onChange({
                            stockMode: value as PublicationRow["stockMode"],
                          })
                        }
                        options={[
                          { value: "STRICT", label: stockModeLabels.STRICT },
                          { value: "CONSULT", label: stockModeLabels.CONSULT },
                          { value: "BACKORDER", label: stockModeLabels.BACKORDER },
                          { value: "OUT_OF_STOCK", label: stockModeLabels.OUT_OF_STOCK },
                        ]}
                      />
                    </Field>
                    <Field label="Cantidad para vender">
                      <input
                        className={fieldClass}
                        inputMode="numeric"
                        placeholder="0"
                        value={row.webStockAvailable}
                        onChange={(event) =>
                          onChange({
                            webStockAvailable: Math.max(
                              0,
                              Math.trunc(Number(event.target.value) || 0),
                            ),
                          })
                        }
                      />
                    </Field>
                  </div>
                </div>

                <div className="rounded-[20px] border border-zinc-200 bg-zinc-50/45 px-4 py-4">
                  <div className="grid gap-4">
                    <div>
                      <Field label="Como se factura">
                        <ChoicePills
                          value={row.billingMode}
                          onChange={(value) =>
                            onChange({
                              billingMode: value as PublicationRow["billingMode"],
                            })
                          }
                          options={[
                            { value: "DEFAULT", label: billingModeLabels.DEFAULT },
                            { value: "MANUAL", label: billingModeLabels.MANUAL },
                            { value: "AUTO", label: billingModeLabels.AUTO },
                          ]}
                        />
                      </Field>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-[max-content_minmax(0,1fr)] lg:items-end">
                      <div className="lg:min-w-[260px]">
                        <Field label="Como calcular el precio">
                          <ChoicePills
                            value={row.pricingMode}
                            onChange={(value) =>
                              onChange({
                                pricingMode: value as PublicationRow["pricingMode"],
                                fixedFinalPrice:
                                  value === "FIXED"
                                    ? row.fixedFinalPrice
                                    : null,
                              })
                            }
                            options={[
                              { value: "AUTO", label: pricingModeLabels.AUTO },
                              { value: "FIXED", label: pricingModeLabels.FIXED },
                            ]}
                          />
                        </Field>
                      </div>
                      {row.pricingMode === "AUTO" ? (
                        <Field label="Ajuste de esta publicacion">
                          <PercentInput
                            value={String(row.priceAdjustmentPercent ?? 0)}
                            onChange={(value) =>
                              onChange({
                                priceAdjustmentPercent: Number(value) || 0,
                              })
                            }
                          />
                        </Field>
                      ) : (
                        <Field label="Precio fijo">
                          <div className="relative mt-1">
                            <MoneyInput
                              className="input no-spinner w-full min-h-[46px] rounded-2xl pl-9 pr-3 text-right tabular-nums"
                              value={row.fixedFinalPrice === null ? "" : String(row.fixedFinalPrice)}
                              onValueChange={(value) =>
                                onChange({
                                  fixedFinalPrice: value ? Number(value) : null,
                                })
                              }
                              placeholder="0"
                              maxDecimals={2}
                              caretToEndOnFocus
                            />
                            <span
                              aria-hidden="true"
                              className="pointer-events-none absolute inset-y-1 left-1.5 inline-flex min-w-[1.5rem] items-center justify-center rounded-md border border-transparent bg-transparent px-1 text-[10px] font-semibold text-zinc-500 sm:left-2"
                            >
                              $
                            </span>
                          </div>
                        </Field>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4 border-t border-zinc-100 pt-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex w-full flex-col gap-4 lg:max-w-[920px] lg:flex-row lg:items-stretch">
                <div className="w-full lg:max-w-[520px]">
                  <MiniToggle
                    checked={row.featured}
                    onChange={() => onChange({ featured: !row.featured })}
                    label="Producto destacado"
                    help="Le da prioridad visual dentro del catalogo y los listados de la tienda."
                    className="h-full min-h-[84px]"
                    contentClassName="flex h-full flex-col justify-between"
                    helpClassName="mt-3"
                  />
                </div>
                <div className="flex h-full min-h-[84px] flex-col justify-between rounded-[18px] border border-dashed border-sky-200 bg-sky-50/60 px-3.5 py-3 text-sm text-sky-950 lg:min-w-[320px]">
                  <div className="text-sm font-medium">Resumen</div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-sky-200 bg-white px-2.5 py-1">
                      Reservado actual: {row.webStockReserved}
                    </span>
                    <span className="rounded-full border border-sky-200 bg-white px-2.5 py-1">
                      Precio final estimado: ${formatMoney(row.computedPriceFinal)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <button className="btn btn-sky" onClick={onSave} type="button">
                  Guardar publicacion
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function OrderCard({ order }: { order: OrderRow }) {
  return (
    <article className="rounded-[20px] border border-zinc-200 bg-zinc-50/50 px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-zinc-950">
              {order.displayNumber || order.id}
            </h3>
            <Badge tone={orderStatusTone[order.status] ?? "border-zinc-200 bg-zinc-100 text-zinc-700"}>
              {orderStatusLabels[order.status] ?? order.status}
            </Badge>
            <Badge tone={paymentTone[order.paymentStatus] ?? "border-zinc-200 bg-zinc-100 text-zinc-700"}>
              {paymentStatusLabels[order.paymentStatus] ?? order.paymentStatus}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-zinc-700">{order.customerDisplayName}</p>
          <p className="text-xs text-zinc-500">{order.customerEmail}</p>
        </div>

        <div className="grid gap-2 text-right">
          <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-zinc-500">
              Total
            </div>
            <div className="text-base font-semibold text-zinc-950">${formatMoney(order.total)}</div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[16px] border border-zinc-200 bg-white px-3 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-zinc-500">
            Items
          </div>
          <div className="mt-1 text-sm font-medium text-zinc-900">{order.itemCount}</div>
        </div>
        <div className="rounded-[16px] border border-zinc-200 bg-white px-3 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-zinc-500">
            Creado
          </div>
          <div className="mt-1 text-sm font-medium text-zinc-900">
            {formatDateTime(order.createdAt)}
          </div>
        </div>
        <div className="rounded-[16px] border border-zinc-200 bg-white px-3 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-zinc-500">
            Expira
          </div>
          <div className="mt-1 text-sm font-medium text-zinc-900">
            {formatDateTime(order.expiresAt)}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function StorefrontClient({ role: _role }: { role: string }) {
  void _role;
  const [channelData, setChannelData] = useState<ChannelResponse | null>(null);
  const [publications, setPublications] = useState<PublicationRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [isNewApiKeyCopied, setIsNewApiKeyCopied] = useState(false);
  const [apiKeyActionId, setApiKeyActionId] = useState<string | null>(null);
  const [configForm, setConfigForm] = useState<ConfigFormState>(
    createDefaultConfigForm(),
  );
  const [activeSection, setActiveSection] = useState<SectionKey>("config");
  const [visiblePublicationsCount, setVisiblePublicationsCount] = useState(
    PUBLICATIONS_PAGE_SIZE,
  );
  const [publicationStatusFilter, setPublicationStatusFilter] =
    useState<PublicationStatusFilter>("active");
  const [openPublicationIds, setOpenPublicationIds] = useState<string[]>([]);
  const [publicationSort, setPublicationSort] =
    useState<PublicationSortKey>("name-asc");
  const skipInitialQuerySyncRef = useRef(true);
  const publicationBaselineRef = useRef<Record<string, string>>({});
  const configBaselineRef = useRef("");
  const hasUnsavedChangesRef = useRef(false);

  async function loadDashboard(search = "") {
    setIsLoading(true);
    try {
      const [channelRes, publicationsRes, ordersRes] = await Promise.all([
        fetch("/api/storefront/admin/channel", { cache: "no-store" }),
        fetch(
          `/api/storefront/admin/publications${
            search ? `?q=${encodeURIComponent(search)}` : ""
          }`,
          { cache: "no-store" },
        ),
        fetch("/api/storefront/admin/orders", { cache: "no-store" }),
      ]);

      if (!channelRes.ok || !publicationsRes.ok || !ordersRes.ok) {
        setStatus("No se pudo cargar Storefront.");
        return;
      }

      const [channelJson, publicationsJson, ordersJson] = (await Promise.all([
        channelRes.json(),
        publicationsRes.json(),
        ordersRes.json(),
      ])) as [ChannelResponse, PublicationRow[], OrderRow[]];

      setChannelData(channelJson);
      setPublications(publicationsJson);
      setOrders(ordersJson);
      setVisiblePublicationsCount(PUBLICATIONS_PAGE_SIZE);
      setStatus(null);

      const mercadopagoAdjustment =
        channelJson.channel.paymentAdjustments.find((item) =>
          item.paymentMethod.trim().toLowerCase().includes("mercadopago"),
        )?.percent ?? 0;

      const loadedConfigForm = {
        name: channelJson.channel.name,
        storeName: channelJson.channel.storeName,
        supportEmail: channelJson.channel.supportEmail ?? "",
        supportPhone: channelJson.channel.supportPhone ?? "",
        pickupAddress: channelJson.channel.pickupAddress ?? "",
        defaultPriceListId: channelJson.channel.defaultPriceListId ?? "",
        allowsCustomerAccounts: channelJson.channel.allowsCustomerAccounts,
        customerAccountsMode: channelJson.channel.customerAccountsMode,
        defaultPaymentMethod: channelJson.channel.defaultPaymentMethod,
        globalPriceAdjustmentPercent: String(
          channelJson.channel.globalPriceAdjustmentPercent ?? 0,
        ),
        normalShippingAmount: String(channelJson.channel.normalShippingAmount ?? 0),
        reserveTtlMinutes: String(channelJson.channel.reserveTtlMinutes ?? 30),
        manualBillingByDefault: channelJson.channel.manualBillingByDefault,
        paymentAdjustmentMercadoPago: String(mercadopagoAdjustment),
      };

      publicationBaselineRef.current = Object.fromEntries(
        publicationsJson.map((row) => [row.productId, serializePublicationDraft(row)]),
      );
      configBaselineRef.current = serializeConfigForm(loadedConfigForm);
      setConfigForm(loadedConfigForm);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard().catch(() => {
      setStatus("No se pudo cargar Storefront.");
      setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    if (skipInitialQuerySyncRef.current) {
      skipInitialQuerySyncRef.current = false;
      return;
    }

    const timeout = window.setTimeout(() => {
      loadDashboard(query).catch(() => {
        setStatus("No se pudo cargar Storefront.");
        setIsLoading(false);
      });
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [query]);

  const dirtyPublicationIds = useMemo(
    () =>
      publications
        .filter(
          (row) =>
            publicationBaselineRef.current[row.productId] !==
            serializePublicationDraft(row),
        )
        .map((row) => row.productId),
    [publications],
  );
  const hasPendingPublicationChanges = dirtyPublicationIds.length > 0;
  const hasDirtyConfig = useMemo(() => {
    if (!configBaselineRef.current) return false;
    return serializeConfigForm(configForm) !== configBaselineRef.current;
  }, [configForm]);
  const hasUnsavedChanges = hasDirtyConfig || hasPendingPublicationChanges;

  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChangesRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    const handleAppNavigation = (event: Event) => {
      if (!hasUnsavedChangesRef.current) return;
      const shouldLeave = window.confirm(
        "Tenes cambios sin guardar en Storefront. Si salis ahora, se van a perder. Queres continuar?",
      );
      if (!shouldLeave) {
        event.preventDefault();
      }
    };

    window.addEventListener(APP_NAVIGATION_GUARD_EVENT, handleAppNavigation);
    return () =>
      window.removeEventListener(
        APP_NAVIGATION_GUARD_EVENT,
        handleAppNavigation,
      );
  }, []);

  async function handleSaveConfig() {
    setIsSavingConfig(true);
    setStatus(null);
    try {
      const response = await fetch("/api/storefront/admin/channel", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: configForm.name,
          storeName: configForm.storeName,
          supportEmail: configForm.supportEmail || null,
          supportPhone: configForm.supportPhone || null,
          pickupAddress: configForm.pickupAddress || null,
          currencyCode: "ARS",
          defaultPriceListId: configForm.defaultPriceListId || null,
          allowsCustomerAccounts: configForm.allowsCustomerAccounts,
          customerAccountsMode: configForm.customerAccountsMode,
          defaultPaymentMethod: configForm.defaultPaymentMethod,
          globalPriceAdjustmentPercent: toNumber(
            configForm.globalPriceAdjustmentPercent,
          ),
          normalShippingAmount: toNumber(configForm.normalShippingAmount),
          reserveTtlMinutes: toNumber(configForm.reserveTtlMinutes),
          manualBillingByDefault: configForm.manualBillingByDefault,
          paymentAdjustments: [
            {
              paymentMethod: "mercadopago_checkout_api",
              percent: toNumber(configForm.paymentAdjustmentMercadoPago),
            },
          ],
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setStatus(data?.error ?? "No se pudo guardar la configuracion.");
        toast.error(data?.error ?? "No se pudo guardar la configuracion.");
        return;
      }

      setStatus("Configuracion de la tienda actualizada.");
      toast.success("Configuracion guardada.");
      await loadDashboard(query);
    } finally {
      setIsSavingConfig(false);
    }
  }

  async function handleCreateApiKey() {
    setIsCreatingKey(true);
    setStatus(null);
    setNewApiKey(null);
    setIsNewApiKeyCopied(false);
    try {
      const response = await fetch("/api/storefront/admin/channel/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: nextApiKeyLabel }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setStatus(data?.error ?? "No se pudo generar la clave de conexion.");
        toast.error(data?.error ?? "No se pudo generar la clave de conexion.");
        return;
      }

      setNewApiKey(data.value);
      setStatus("Clave de conexion generada.");
      toast.success("Clave de conexion generada.");
      await loadDashboard(query);
    } finally {
      setIsCreatingKey(false);
    }
  }

  async function handleCopyNewApiKey() {
    if (!newApiKey) return;
    try {
      await navigator.clipboard.writeText(newApiKey);
      setIsNewApiKeyCopied(true);
      toast.success("Clave copiada.");
    } catch {
      toast.error("No se pudo copiar la clave.");
    }
  }

  async function handleDeactivateApiKey(apiKeyId: string, label: string) {
    const shouldDeactivate = window.confirm(
      `Vas a desactivar la clave "${label}". Si alguna tienda la esta usando, va a dejar de poder consultar Storefront. Queres continuar?`,
    );
    if (!shouldDeactivate) return;

    setApiKeyActionId(apiKeyId);
    setStatus(null);
    try {
      const response = await fetch(
        `/api/storefront/admin/channel/api-keys/${apiKeyId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
        },
      );

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setStatus(data?.error ?? "No se pudo desactivar la clave.");
        toast.error(data?.error ?? "No se pudo desactivar la clave.");
        return;
      }

      setStatus("Clave de conexion desactivada.");
      toast.success("Clave desactivada.");
      await loadDashboard(query);
    } finally {
      setApiKeyActionId(null);
    }
  }

  async function handleSavePublication(row: PublicationRow) {
    setStatus(null);
    const response = await fetch("/api/storefront/admin/publications", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productId: row.productId,
        slug: null,
        publicationStatus: row.publicationStatus,
        publicName: row.publicName,
        shortDescription: row.shortDescription,
        longDescription: row.longDescription,
        category: row.category,
        featured: row.featured,
        shippingType: row.shippingType,
        stockMode: row.stockMode,
        webStockAvailable: row.webStockAvailable,
        pricingMode: row.pricingMode,
        fixedFinalPrice: row.fixedFinalPrice,
        priceAdjustmentPercent: row.priceAdjustmentPercent,
        billingMode: row.billingMode,
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setStatus(data?.error ?? `No se pudo guardar ${row.productName}.`);
      toast.error(data?.error ?? `No se pudo guardar ${row.productName}.`);
      return;
    }

    setOpenPublicationIds((current) =>
      current.filter((productId) => productId !== row.productId),
    );
    setStatus(`Publicacion actualizada: ${row.productName}.`);
    toast.success(`Cambios guardados en ${row.productName}.`);
    await loadDashboard(query);
  }

  function updatePublication(productId: string, patch: Partial<PublicationRow>) {
    setPublications((current) =>
      current.map((row) =>
        row.productId === productId ? { ...row, ...patch } : row,
      ),
    );
  }

  function togglePublicationOpen(productId: string) {
    setOpenPublicationIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
  }

  const publishedCount = publications.filter(
    (row) => row.publicationStatus === "PUBLISHED",
  ).length;
  const pausedCount = publications.length - publishedCount;
  const pendingOrders = orders.filter(
    (order) => order.status === "PENDING_PAYMENT",
  ).length;
  const filteredPublications = useMemo(() => {
    const items = publications.filter((row) => {
      if (openPublicationIds.includes(row.productId)) return true;
      if (publicationStatusFilter === "active") {
        return row.publicationStatus === "PUBLISHED";
      }
      if (publicationStatusFilter === "paused") {
        return row.publicationStatus === "PAUSED";
      }
      return true;
    });

    items.sort((left, right) => {
      switch (publicationSort) {
        case "name-desc":
          return right.productName.localeCompare(left.productName, "es", {
            sensitivity: "base",
          });
        case "price-desc":
          return right.computedPriceFinal - left.computedPriceFinal;
        case "price-asc":
          return left.computedPriceFinal - right.computedPriceFinal;
        case "stock-desc":
          return right.webStockAvailable - left.webStockAvailable;
        case "stock-asc":
          return left.webStockAvailable - right.webStockAvailable;
        case "name-asc":
        default:
          return left.productName.localeCompare(right.productName, "es", {
            sensitivity: "base",
          });
      }
    });

    return items;
  }, [openPublicationIds, publicationSort, publicationStatusFilter, publications]);
  const publicationCategoryOptions = useMemo(() => {
    const categories = Array.from(
      new Set(
        publications
          .map((row) => row.category.trim())
          .filter(Boolean),
      ),
    ).sort((left, right) =>
      left.localeCompare(right, "es", { sensitivity: "base" }),
    );

    return categories.map((category) => ({
      label: category,
      value: category,
    }));
  }, [publications]);
  const visiblePublications = filteredPublications.slice(0, visiblePublicationsCount);
  const hasMorePublications = visiblePublicationsCount < filteredPublications.length;
  const nextApiKeyLabel =
    (channelData?.apiKeys.length ?? 0) > 0
      ? `Conexion principal #${(channelData?.apiKeys.length ?? 0) + 1}`
      : "Conexion principal";

  return (
    <div className="space-y-5 px-2 pb-8 lg:px-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-[2rem] font-semibold tracking-[-0.03em] text-zinc-950">
          Tienda online
        </h1>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900">
            Publicadas: {publishedCount}
          </span>
          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
            Pendientes: {pendingOrders}
          </span>
        </div>
      </div>

      {status ? (
        <div
          className={`rounded-[18px] border px-4 py-3 text-sm ${
            status.toLowerCase().includes("no se pudo")
              ? "border-rose-200 bg-rose-50 text-rose-950"
              : "border-sky-200 bg-sky-50 text-sky-950"
          }`}
        >
          {status}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {[
          { key: "config", label: "Configuracion", icon: <StoreIcon className="h-4 w-4" /> },
          { key: "publications", label: "Publicaciones", icon: <PackageIcon className="h-4 w-4" /> },
          { key: "orders", label: "Pedidos", icon: <OrdersIcon className="h-4 w-4" /> },
        ].map((section) => (
          <button
            key={section.key}
            type="button"
            onClick={() => setActiveSection(section.key as SectionKey)}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
              activeSection === section.key
                ? "border-sky-300 bg-sky-50 text-sky-950"
                : "border-zinc-200 bg-white text-zinc-600"
            }`}
          >
            {section.icon}
            <span className="font-medium">{section.label}</span>
          </button>
        ))}
      </div>

      {activeSection === "config" ? (
        <>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-zinc-950">Configuracion</h2>
            <p className="text-sm text-zinc-500">
              Precios generales, claves de conexion y reglas de funcionamiento de la tienda.
            </p>
          </div>
        <section className={`${panelClass} px-5 py-5 sm:px-6`}>
          <div className="space-y-6">
            <div>
              <div className="mb-4">
                <h3 className="text-base font-semibold text-zinc-950">Precios y funcionamiento</h3>
                <p className="mt-1 text-sm text-zinc-500">
                  Elegi la lista base, defini recargos y ajusta las reglas generales de la tienda.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-1">
                <div className="max-w-[460px]">
                  <Field label="Lista base">
                    <SelectInput
                      value={configForm.defaultPriceListId}
                      placeholder="Elegir lista"
                      onChange={(value) =>
                        setConfigForm((current) => ({
                          ...current,
                          defaultPriceListId: value,
                        }))
                      }
                      options={[
                        { label: "Elegir lista", value: "" },
                        ...(
                          channelData?.priceLists.map((priceList) => ({
                            value: priceList.id,
                            label: `${priceList.name}${
                              priceList.isConsumerFinal ? " · consumidor final" : ""
                            }${priceList.isDefault ? " · default" : ""}`,
                          })) ?? []
                        ),
                      ]}
                    />
                  </Field>
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <Field label="Recargo o descuento general">
                  <PercentInput
                    value={configForm.globalPriceAdjustmentPercent}
                    onChange={(value) =>
                      setConfigForm((current) => ({
                        ...current,
                        globalPriceAdjustmentPercent: value,
                      }))
                    }
                  />
                </Field>
                <Field label="Recargo por cobro con Mercado Pago">
                  <PercentInput
                    value={configForm.paymentAdjustmentMercadoPago}
                    onChange={(value) =>
                      setConfigForm((current) => ({
                        ...current,
                        paymentAdjustmentMercadoPago: value,
                      }))
                    }
                  />
                </Field>
                <Field label="Costo fijo de envio normal">
                  <div className="relative mt-1">
                    <MoneyInput
                      className="input no-spinner w-full min-h-[46px] rounded-2xl pl-9 pr-3 text-right tabular-nums"
                      value={configForm.normalShippingAmount}
                      onValueChange={(value) =>
                        setConfigForm((current) => ({
                          ...current,
                          normalShippingAmount: value,
                        }))
                      }
                      placeholder="0"
                      maxDecimals={2}
                      caretToEndOnFocus
                    />
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-1 left-1.5 inline-flex min-w-[1.5rem] items-center justify-center rounded-md border border-transparent bg-transparent px-1 text-[10px] font-semibold text-zinc-500 sm:left-2"
                    >
                      $
                    </span>
                  </div>
                </Field>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <MiniToggle checked={configForm.manualBillingByDefault} onChange={() => setConfigForm((current) => ({ ...current, manualBillingByDefault: !current.manualBillingByDefault }))} label="Facturacion manual por defecto" help="Si un producto no define excepcion propia, el pedido queda en circuito manual." />
                <div className="rounded-[18px] border border-zinc-200 bg-zinc-50/70 px-3.5 py-3">
                  <Field label="Tiempo de reserva">
                    <div className="mt-1 flex flex-wrap gap-2">
                      {[15, 30, 45, 60].map((minutes) => (
                        <button
                          key={minutes}
                          type="button"
                          onClick={() =>
                            setConfigForm((current) => ({
                              ...current,
                              reserveTtlMinutes: String(minutes),
                            }))
                          }
                          className={`toggle-pill ${
                            configForm.reserveTtlMinutes === String(minutes)
                              ? "toggle-pill-active border-sky-300 bg-sky-50 text-sky-950"
                              : ""
                          }`}
                        >
                          {minutes} min
                        </button>
                      ))}
                    </div>
                  </Field>
                </div>
              </div>
            </div>

            <div className="border-t border-zinc-200 pt-6">
              <div className="mb-4">
                <h3 className="text-base font-semibold text-zinc-950">Claves de conexion</h3>
                <p className="mt-1 text-sm text-zinc-500">
                  Permiten que la tienda online consulte productos, precios y stock desde Frio Gestion.
                </p>
              </div>

              {newApiKey ? (
                <div className="mb-4 rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-950">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-emerald-950">
                        Clave nueva generada
                      </div>
                      <div className="mt-1 text-sm text-emerald-900">
                        Copiala ahora. Despues no se vuelve a mostrar completa.
                      </div>
                      <div className="mt-3 rounded-2xl border border-emerald-200 bg-white/80 px-4 py-3 font-mono text-xs break-all text-emerald-950">
                        {newApiKey}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleCopyNewApiKey}
                        className="btn btn-emerald min-w-[150px]"
                      >
                        {isNewApiKeyCopied ? "Clave copiada" : "Copiar clave"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNewApiKey(null);
                          setIsNewApiKeyCopied(false);
                        }}
                        className="btn min-w-[120px] border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                      >
                        Cerrar
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="flex justify-end">
                <button className="btn btn-emerald min-w-[220px]" disabled={isCreatingKey || isLoading} onClick={handleCreateApiKey} type="button">
                  {isCreatingKey
                    ? "Generando..."
                    : channelData?.apiKeys.length
                      ? "Generar nueva clave"
                      : "Generar clave"}
                </button>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {channelData?.apiKeys.length ? (
                  channelData.apiKeys.map((apiKey) => (
                    <div key={apiKey.id} className="rounded-[18px] border border-zinc-200 bg-zinc-50/40 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-zinc-950">{apiKey.label}</div>
                          <div className="mt-1 font-mono text-[11px] text-zinc-500">{apiKey.keyPrefix}...</div>
                        </div>
                        <Badge tone={apiKey.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-zinc-200 bg-zinc-100 text-zinc-700"}>
                          {apiKey.isActive ? "Activa" : "Inactiva"}
                        </Badge>
                      </div>
                      <div className="mt-2 text-xs text-zinc-500">Ultimo uso: {formatDateTime(apiKey.lastUsedAt)}</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {apiKey.isActive ? (
                          <button
                            type="button"
                            onClick={() => handleDeactivateApiKey(apiKey.id, apiKey.label)}
                            disabled={apiKeyActionId === apiKey.id}
                            className="btn min-w-[130px] border-rose-200 bg-white text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {apiKeyActionId === apiKey.id ? "Desactivando..." : "Desactivar"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[18px] border border-dashed border-zinc-200 bg-zinc-50/40 px-4 py-4 text-sm text-zinc-500 lg:col-span-2">
                    Todavia no hay claves de conexion creadas para esta tienda.
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-zinc-200 pt-6">
              <div className="flex justify-end">
                <button className="btn btn-sky min-w-[220px]" disabled={isSavingConfig || isLoading} onClick={handleSaveConfig} type="button">
                  {isSavingConfig ? "Guardando..." : "Guardar configuracion"}
                </button>
              </div>
            </div>
          </div>
        </section>
        </>
      ) : null}

      {activeSection === "publications" ? (
        <>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-zinc-950">Publicaciones</h2>
            <p className="text-sm text-zinc-500">
              Publica, pausa y ajusta reglas por producto desde una vista simple.
            </p>
          </div>
          <div className="flex">
            <div className="inline-flex rounded-2xl border border-zinc-200 bg-zinc-50/80 p-1">
              {[
                { value: "active", label: "Activas" },
                { value: "paused", label: "Pausadas" },
                { value: "all", label: "Todas" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setPublicationStatusFilter(option.value as PublicationStatusFilter);
                    setVisiblePublicationsCount(PUBLICATIONS_PAGE_SIZE);
                  }}
                  className={`rounded-[12px] px-4 py-2 text-sm font-medium transition ${
                    publicationStatusFilter === option.value
                      ? "bg-white text-zinc-950 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                      : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        <div className="space-y-5">
          <div className="sticky top-4 z-20 rounded-[22px] border border-zinc-200 bg-white/92 px-5 py-4 shadow-[0_18px_38px_-30px_rgba(24,39,75,0.32)] backdrop-blur supports-[backdrop-filter]:bg-white/82 sm:px-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500">
                <span className="text-base font-semibold uppercase tracking-[0.04em] text-zinc-700">
                  Productos publicados
                </span>
                <span>&bull;</span>
                <span>{filteredPublications.length.toLocaleString("es-AR")} en vista</span>
                <span>&bull;</span>
                <span>{publishedCount} activas</span>
                <span>&bull;</span>
                <span>{pausedCount} pausadas</span>
              </div>

              <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-zinc-600">Ordenar</span>
                  <div className="min-w-[220px]">
                    <SelectInput
                      value={publicationSort}
                      onChange={(value) =>
                        setPublicationSort(value as PublicationSortKey)
                      }
                      options={[
                        { label: "Nombre A-Z", value: "name-asc" },
                        { label: "Nombre Z-A", value: "name-desc" },
                        { label: "Precio mas alto", value: "price-desc" },
                        { label: "Precio mas bajo", value: "price-asc" },
                        { label: "Mas stock", value: "stock-desc" },
                        { label: "Menos stock", value: "stock-asc" },
                      ]}
                    />
                  </div>
                </div>

                <div>
                  <input
                    className={`${fieldClass} w-full`}
                    placeholder="Buscar por nombre, codigo o marca"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {filteredPublications.length ? (
              visiblePublications.map((row) => (
                <PublicationEditorCard
                  key={row.productId}
                  row={row}
                  categoryOptions={
                    publicationCategoryOptions.some((option) => option.value === row.category)
                      ? publicationCategoryOptions
                      : [
                          ...publicationCategoryOptions,
                          { label: row.category || "General", value: row.category || "General" },
                        ]
                  }
                  open={openPublicationIds.includes(row.productId)}
                  onToggleOpen={() => togglePublicationOpen(row.productId)}
                  onChange={(patch) => updatePublication(row.productId, patch)}
                  onSave={() => handleSavePublication(row)}
                />
              ))
            ) : (
              <div className="rounded-[20px] border border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-6 text-sm text-zinc-500">
                No hay productos para mostrar con el filtro actual.
              </div>
            )}
          </div>

          {hasMorePublications ? (
            <div className="flex justify-center">
              <button
                className="btn min-w-[220px]"
                onClick={() =>
                  setVisiblePublicationsCount((current) =>
                    Math.min(current + PUBLICATIONS_PAGE_SIZE, filteredPublications.length),
                  )
                }
                type="button"
              >
                Cargar mas publicaciones
              </button>
            </div>
          ) : null}
        </div>
        </>
      ) : null}

      {activeSection === "orders" ? (
        <>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-zinc-950">Pedidos</h2>
            <p className="text-sm text-zinc-500">
              Revisa pedidos y estados de pago desde una vista simple.
            </p>
          </div>
        <section className={`${panelClass} px-5 py-5 sm:px-6`}>
        <div className="space-y-4">
          {orders.length ? (
            orders.map((order) => <OrderCard key={order.id} order={order} />)
          ) : (
            <div className="rounded-[20px] border border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-6 text-sm text-zinc-500">
              Todavia no hay pedidos registrados en esta tienda.
            </div>
          )}
        </div>
        </section>
        </>
      ) : null}

      {isLoading ? (
        <div className="rounded-[18px] border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
          Cargando Storefront...
        </div>
      ) : null}

      <ToastContainer position="bottom-right" theme="light" />
    </div>
  );
}
