"use client";

import type { FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PlusIcon } from "@/components/icons";

type SupplierFormData = {
  displayName: string;
  taxId: string;
  email: string;
  phone: string;
};

type InlineSupplierFormProps = {
  show: boolean;
  onToggle: () => void;
  form: SupplierFormData;
  onFormChange: (field: keyof SupplierFormData, value: string) => void;
  status: string | null;
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function InlineSupplierForm({
  show,
  onToggle,
  form,
  onFormChange,
  status,
  isSubmitting,
  onSubmit,
}: InlineSupplierFormProps) {
  return (
    <div className="card space-y-4 border-dashed border-sky-200 p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="section-title">Nuevo proveedor</h3>
          {show ? <p className="section-subtitle">Alta rapida.</p> : null}
        </div>
        <button
          type="button"
          className={`toggle-pill ${show ? "toggle-pill-active" : ""}`}
          onClick={onToggle}
          aria-expanded={show}
          aria-controls="purchase-supplier-form"
        >
          {show ? "Ocultar" : "Mostrar"}
        </button>
      </div>
      <AnimatePresence initial={false} mode="wait">
        {show ? (
          <motion.div
            key="purchase-supplier-form"
            initial={{ opacity: 0, height: 0, y: -8 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -8 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="reveal-motion"
          >
            <form id="purchase-supplier-form" onSubmit={onSubmit} className="space-y-5">
              <label className="flex flex-col gap-2">
                <span className="input-label">Nombre comercial</span>
                <input
                  className="input w-full"
                  value={form.displayName}
                  onChange={(event) =>
                    onFormChange("displayName", event.target.value)
                  }
                  placeholder="Nombre comercial"
                  required
                />
              </label>
              <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2">
                  <span className="input-label">CUIT</span>
                  <input
                    className="input"
                    value={form.taxId}
                    onChange={(event) => onFormChange("taxId", event.target.value)}
                    placeholder="CUIT"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="input-label">Telefono</span>
                  <input
                    className="input"
                    value={form.phone}
                    onChange={(event) => onFormChange("phone", event.target.value)}
                    placeholder="Telefono"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-2">
                <span className="input-label">Correo</span>
                <input
                  className="input w-full"
                  value={form.email}
                  onChange={(event) => onFormChange("email", event.target.value)}
                  placeholder="Correo"
                />
              </label>
              <button
                type="submit"
                className="btn btn-emerald mt-2 w-full"
                disabled={isSubmitting}
              >
                <PlusIcon className="size-4" />
                {isSubmitting ? "Guardando..." : "Crear proveedor"}
              </button>
              {status ? <p className="text-xs text-zinc-500">{status}</p> : null}
            </form>
          </motion.div>
        ) : (
          <motion.p
            key="purchase-supplier-hint"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="text-xs text-zinc-500"
          >
            Crea un proveedor rapido.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
