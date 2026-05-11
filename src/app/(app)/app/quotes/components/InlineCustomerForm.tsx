"use client";

import type { FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PlusIcon } from "@/components/icons";
import {
  CUSTOMER_FISCAL_TAX_PROFILE_LABELS,
  CUSTOMER_FISCAL_TAX_PROFILE_VALUES,
  type CustomerFiscalTaxProfile,
} from "@/lib/customers/fiscal-profile";

type CustomerFormData = {
  displayName: string;
  defaultPriceListId: string;
  fiscalTaxProfile: CustomerFiscalTaxProfile;
  email: string;
  phone: string;
  taxId: string;
  address: string;
};

type PriceListOption = {
  id: string;
  name: string;
  currencyCode: string;
  isDefault: boolean;
  isConsumerFinal: boolean;
};

type InlineCustomerFormProps = {
  show: boolean;
  autoFocusName?: boolean;
  onToggle: () => void;
  form: CustomerFormData;
  priceLists: PriceListOption[];
  defaultPriceListId: string | null;
  onFormChange: (field: keyof CustomerFormData, value: string) => void;
  onLookupByTaxId: () => void;
  isLookupLoading: boolean;
  status: string | null;
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function InlineCustomerForm({
  show,
  autoFocusName,
  onToggle,
  form,
  priceLists,
  defaultPriceListId,
  onFormChange,
  onLookupByTaxId,
  isLookupLoading,
  status,
  isSubmitting,
  onSubmit,
}: InlineCustomerFormProps) {
  const normalizedStatus = status?.toLowerCase() ?? "";
  const isErrorStatus =
    normalizedStatus.includes("no se pudo") ||
    normalizedStatus.includes("no encontro") ||
    normalizedStatus.includes("invalido") ||
    normalizedStatus.includes("requerido") ||
    normalizedStatus.includes("ingresa");
  const isWarningStatus =
    normalizedStatus.includes("no devolvio") ||
    normalizedStatus.includes("no pudimos") ||
    normalizedStatus.includes("revisa") ||
    normalizedStatus.includes("elegila") ||
    normalizedStatus.includes("distinto");

  return (
    <div className="card w-full space-y-2 border-dashed border-sky-200 p-3 md:p-4">
      <button
        type="button"
        className="w-full rounded-2xl bg-white/30 px-3 py-2 text-left transition hover:bg-white/50"
        onClick={onToggle}
        aria-expanded={show}
        aria-controls="quote-customer-form"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="section-title">Nuevo cliente</h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              {show ? "Alta rapida." : "Crea un cliente rapido."}
            </p>
          </div>
          <span
            className={`pill border px-2.5 py-1 text-[11px] font-semibold ${
              show
                ? "border-sky-200 bg-white text-sky-900"
                : "border-sky-200 bg-white/60 text-sky-800"
            }`}
          >
            {show ? "Ocultar" : "Mostrar"}
          </span>
        </div>
      </button>
      <AnimatePresence initial={false} mode="wait">
        {show ? (
          <motion.div
            key="customer-form"
            initial={{ opacity: 0, height: 0, y: -8 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -8 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="reveal-motion"
          >
            <form
              id="quote-customer-form"
              onSubmit={onSubmit}
              className="space-y-3"
            >
              <label className="flex flex-col gap-2">
                <span className="input-label">Nombre o razon social</span>
                <input
                  className="input w-full"
                  value={form.displayName}
                  autoFocus={autoFocusName}
                  onChange={(event) =>
                    onFormChange("displayName", event.target.value)
                  }
                  placeholder="Ej: Garcia Hnos SA"
                  required
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="input-label">Lista de precios</span>
                <select
                  className="input cursor-pointer"
                  value={form.defaultPriceListId}
                  onChange={(event) =>
                    onFormChange("defaultPriceListId", event.target.value)
                  }
                >
                  <option value="">Sin lista por defecto</option>
                  {priceLists.map((priceList) => (
                    <option key={priceList.id} value={priceList.id}>
                      {priceList.name}
                      {priceList.isDefault ? " (Default)" : ""}
                      {priceList.isConsumerFinal ? " (Consumidor final)" : ""}
                    </option>
                  ))}
                </select>
                {defaultPriceListId ? (
                  <p className="text-[11px] text-zinc-500">
                    Si no elegis una, se usa la lista Default.
                  </p>
                ) : null}
              </label>
              <div className="grid gap-x-3 gap-y-2 sm:grid-cols-2">
                <label className="flex flex-col gap-2">
                  <span className="input-label">CUIT</span>
                  <input
                    className="input"
                    value={form.taxId}
                    onChange={(event) => onFormChange("taxId", event.target.value)}
                    placeholder="20-12345678-9"
                  />
                  <button
                    type="button"
                    className="btn text-xs"
                    onClick={onLookupByTaxId}
                    disabled={isLookupLoading}
                  >
                    {isLookupLoading ? "Buscando..." : "Buscar por CUIT"}
                  </button>
                </label>
                <label className="flex flex-col gap-2">
                  <span className="input-label">Condicion fiscal</span>
                  <select
                    className="input cursor-pointer"
                    value={form.fiscalTaxProfile}
                    onChange={(event) =>
                      onFormChange(
                        "fiscalTaxProfile",
                        event.target.value as CustomerFiscalTaxProfile,
                      )
                    }
                  >
                    {CUSTOMER_FISCAL_TAX_PROFILE_VALUES.map((profile) => (
                      <option key={profile} value={profile}>
                        {CUSTOMER_FISCAL_TAX_PROFILE_LABELS[profile]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid gap-x-3 gap-y-2 sm:grid-cols-2">
                <label className="flex flex-col gap-2">
                  <span className="input-label">Correo</span>
                  <input
                    className="input"
                    value={form.email}
                    onChange={(event) => onFormChange("email", event.target.value)}
                    placeholder="cliente@empresa.com"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="input-label">Telefono</span>
                  <input
                    className="input"
                    value={form.phone}
                    onChange={(event) => onFormChange("phone", event.target.value)}
                    placeholder="+54 9 11..."
                  />
                </label>
              </div>
              <label className="flex flex-col gap-2">
                <span className="input-label">Direccion</span>
                <input
                  className="input w-full"
                  value={form.address}
                  onChange={(event) =>
                    onFormChange("address", event.target.value)
                  }
                  placeholder="Calle, numero, localidad"
                />
              </label>
              <button
                type="submit"
                className="btn btn-emerald mt-2 w-full py-2"
                disabled={isSubmitting}
              >
                <PlusIcon className="size-4" />
                {isSubmitting ? "Guardando..." : "Crear cliente"}
              </button>
            </form>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {status ? (
        <p
          className={`text-xs ${
            isErrorStatus
              ? "text-rose-700"
              : isWarningStatus
                ? "text-amber-700"
                : "text-emerald-700"
          }`}
          role="status"
          aria-live="polite"
        >
          {status}
        </p>
      ) : null}
    </div>
  );
}
