"use client";

import type { FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PlusIcon } from "@/components/icons";
import { UNIT_OPTIONS } from "@/lib/units";

type ProductFormData = {
  name: string;
  sku: string;
  brand: string;
  model: string;
  unit: string;
};

type InlineProductFormProps = {
  show: boolean;
  onToggle: () => void;
  form: ProductFormData;
  onFormChange: (field: keyof ProductFormData, value: string) => void;
  status: string | null;
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function InlineProductForm({
  show,
  onToggle,
  form,
  onFormChange,
  status,
  isSubmitting,
  onSubmit,
}: InlineProductFormProps) {
  return (
    <div className="card space-y-4 border-dashed border-sky-200 p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="section-title">Nuevo producto</h3>
          {show ? <p className="section-subtitle">Alta rapida.</p> : null}
        </div>
        <button
          type="button"
          className={`toggle-pill ${show ? "toggle-pill-active" : ""}`}
          onClick={onToggle}
          aria-expanded={show}
          aria-controls="purchase-product-form"
        >
          {show ? "Ocultar" : "Mostrar"}
        </button>
      </div>
      <AnimatePresence initial={false} mode="wait">
        {show ? (
          <motion.div
            key="purchase-product-form"
            initial={{ opacity: 0, height: 0, y: -8 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -8 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="reveal-motion"
          >
            <form id="purchase-product-form" onSubmit={onSubmit} className="space-y-5">
              <label className="flex flex-col gap-2">
                <span className="input-label">Nombre</span>
                <input
                  className="input w-full"
                  value={form.name}
                  onChange={(event) => onFormChange("name", event.target.value)}
                  placeholder="Nombre"
                  required
                />
              </label>
              <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2">
                  <span className="input-label">Codigo</span>
                  <input
                    className="input"
                    value={form.sku}
                    onChange={(event) => onFormChange("sku", event.target.value)}
                    placeholder="Codigo"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="input-label">Unidad</span>
                  <select
                    className="input cursor-pointer"
                    value={form.unit}
                    onChange={(event) => onFormChange("unit", event.target.value)}
                  >
                    <option value="">Unidad</option>
                    {UNIT_OPTIONS.map((unit) => (
                      <option key={unit.value} value={unit.value}>
                        {unit.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2">
                  <span className="input-label">Marca</span>
                  <input
                    className="input"
                    value={form.brand}
                    onChange={(event) => onFormChange("brand", event.target.value)}
                    placeholder="Marca"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="input-label">Modelo</span>
                  <input
                    className="input"
                    value={form.model}
                    onChange={(event) => onFormChange("model", event.target.value)}
                    placeholder="Modelo"
                  />
                </label>
              </div>
              <button
                type="submit"
                className="btn btn-emerald mt-2 w-full"
                disabled={isSubmitting}
              >
                <PlusIcon className="size-4" />
                {isSubmitting ? "Guardando..." : "Crear producto"}
              </button>
              {status ? <p className="text-xs text-zinc-500">{status}</p> : null}
            </form>
          </motion.div>
        ) : (
          <motion.p
            key="purchase-product-hint"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="text-xs text-zinc-500"
          >
            Crea un producto rapido.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
