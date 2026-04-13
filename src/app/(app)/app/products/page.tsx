"use client";

import type { FormEvent } from "react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckIcon,
  CubeIcon,
  DocumentTextIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@/components/icons";
import { UNIT_LABELS, UNIT_OPTIONS, UNIT_VALUES } from "@/lib/units";

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  brand: string | null;
  model: string | null;
  unit: string | null;
};

const normalizeQuery = (value: string) => value.trim().toLowerCase();

export default function ProductsPage() {
  const [items, setItems] = useState<ProductRow[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [unitFilter, setUnitFilter] = useState("ALL");
  const [sortOrder, setSortOrder] = useState("az");
  const [form, setForm] = useState({
    name: "",
    sku: "",
    brand: "",
    model: "",
    unit: "u",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    sku: "",
    brand: "",
    model: "",
    unit: "u",
  });
  const [isUpdating, setIsUpdating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadProducts = async () => {
    const res = await fetch("/api/products", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as ProductRow[];
      setItems(data);
    }
  };

  useEffect(() => {
    loadProducts().catch(() => undefined);
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          sku: form.sku || undefined,
          brand: form.brand || undefined,
          model: form.model || undefined,
          unit: form.unit || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setStatus(data?.error ?? "No se pudo crear");
        return;
      }

      setForm({
        name: "",
        sku: "",
        brand: "",
        model: "",
        unit: "u",
      });
      setStatus("Producto creado");
      await loadProducts();
    } catch {
      setStatus("No se pudo crear");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditStart = (item: ProductRow) => {
    setEditingId(item.id);
    setEditForm({
      name: item.name,
      sku: item.sku ?? "",
      brand: item.brand ?? "",
      model: item.model ?? "",
      unit: item.unit ?? "u",
    });
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditForm({
      name: "",
      sku: "",
      brand: "",
      model: "",
      unit: "u",
    });
  };

  const handleUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingId) return;
    setStatus(null);
    setIsUpdating(true);
    try {
      const res = await fetch("/api/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          name: editForm.name,
          sku: editForm.sku || undefined,
          brand: editForm.brand || undefined,
          model: editForm.model || undefined,
          unit: editForm.unit || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setStatus(data?.error ?? "No se pudo actualizar");
        return;
      }

      setStatus("Producto actualizado");
      handleEditCancel();
      await loadProducts();
    } catch {
      setStatus("No se pudo actualizar");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Eliminar producto?")) return;
    setStatus(null);
    setDeletingId(id);
    try {
      const res = await fetch(`/api/products?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setStatus(data?.error ?? "No se pudo eliminar");
        return;
      }
      setStatus("Producto eliminado");
      await loadProducts();
    } catch {
      setStatus("No se pudo eliminar");
    } finally {
      setDeletingId(null);
    }
  };

  const totalProducts = items.length;
  const productsWithUnit = items.filter((item) => item.unit).length;
  const productsWithSku = items.filter((item) => item.sku).length;

  const filteredItems = useMemo(() => {
    const query = normalizeQuery(productQuery);
    const filtered = items.filter((item) => {
      if (unitFilter !== "ALL" && item.unit !== unitFilter) {
        return false;
      }
      if (query) {
        const haystack = normalizeQuery(
          `${item.name} ${item.sku ?? ""} ${item.brand ?? ""} ${item.model ?? ""}`
        );
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      if (aName === bName) return 0;
      const order = aName > bName ? 1 : -1;
      return sortOrder === "za" ? -order : order;
    });

    return filtered;
  }, [items, productQuery, sortOrder, unitFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">
          Productos
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Gestion basica de productos por empresa.
        </p>
      </div>

      <div className="table-scroll pb-1">
        <div className="grid min-w-[680px] grid-cols-3 gap-2">
          <div className="card border !border-sky-200 p-3 !bg-white">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-medium text-sky-700">
                <CubeIcon className="size-3.5" />
                Productos
              </span>
              <p className="text-base font-semibold text-zinc-900">
                {totalProducts}
              </p>
            </div>
          </div>
          <div className="card border !border-dashed !border-emerald-200 p-3 !bg-white">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-medium text-emerald-700">
                <CheckIcon className="size-3.5" />
                Con unidad
              </span>
              <p className="text-base font-semibold text-zinc-900">
                {productsWithUnit}
              </p>
            </div>
          </div>
          <div className="card border !border-amber-200 p-3 !bg-white">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-medium text-amber-700">
                <DocumentTextIcon className="size-3.5" />
                Con codigo
              </span>
              <p className="text-base font-semibold text-zinc-900">
                {productsWithSku}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="card space-y-5 p-6">
        <div className="field-stack">
          <h2 className="text-lg font-semibold text-zinc-900">
            Nuevo producto
          </h2>
          <p className="section-subtitle">Alta rapida de catalogo.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <label className="flex flex-col gap-3">
            <span className="input-label">Nombre</span>
            <input
              className="input w-full"
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="Nombre"
              required
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-3">
              <span className="input-label">Codigo</span>
              <input
                className="input"
                value={form.sku}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, sku: event.target.value }))
                }
                placeholder="Codigo"
              />
            </label>
            <label className="flex flex-col gap-3">
              <span className="input-label">Unidad</span>
              <select
                className="input cursor-pointer"
                value={form.unit}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, unit: event.target.value }))
                }
              >
                {UNIT_OPTIONS.map((unit) => (
                  <option key={unit.value} value={unit.value}>
                    {unit.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-3">
              <span className="input-label">Marca</span>
              <input
                className="input"
                value={form.brand}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, brand: event.target.value }))
                }
                placeholder="Marca"
              />
            </label>
            <label className="flex flex-col gap-3">
              <span className="input-label">Modelo</span>
              <input
                className="input"
                value={form.model}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, model: event.target.value }))
                }
                placeholder="Modelo"
              />
            </label>
          </div>
          <button
            type="submit"
            className="btn btn-emerald w-full"
            disabled={isSubmitting}
          >
            <CheckIcon className="size-4" />
            {isSubmitting ? "Guardando..." : "Guardar"}
          </button>
          {status ? <p className="text-xs text-zinc-500">{status}</p> : null}
        </form>
      </div>

      <div className="card space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Filtros de productos
            </h3>
            <p className="text-xs text-zinc-500">
              {filteredItems.length} de {items.length} productos
            </p>
          </div>
          <button
            type="button"
            className="btn btn-sky text-xs transition-transform hover:-translate-y-0.5"
            onClick={() => {
              setProductQuery("");
              setUnitFilter("ALL");
              setSortOrder("az");
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="size-4"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
            Limpiar filtros
          </button>
        </div>
        <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
          <input
            className="input w-full"
            value={productQuery}
            onChange={(event) => setProductQuery(event.target.value)}
            placeholder="Buscar nombre, codigo o marca"
          />
          <select
            className="input cursor-pointer"
            value={unitFilter}
            onChange={(event) => setUnitFilter(event.target.value)}
          >
            <option value="ALL">Todas las unidades</option>
            {UNIT_OPTIONS.map((unit) => (
              <option key={unit.value} value={unit.value}>
                {unit.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Catalogo reciente
          </h3>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-zinc-500">
              {filteredItems.length} resultados
            </span>
            <select
              className="input cursor-pointer text-xs"
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
              aria-label="Ordenar productos"
            >
              <option value="az">A-Z</option>
              <option value="za">Z-A</option>
            </select>
          </div>
        </div>
        <div className="table-scroll">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="py-2 pr-4">Producto</th>
                <th className="py-2 pr-4">Codigo</th>
                <th className="py-2 pr-4">Marca</th>
                <th className="py-2 pr-4">Modelo</th>
                <th className="py-2 pr-4">Unidad</th>
                <th className="py-2 pr-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length ? (
                filteredItems.map((item) => (
                  <Fragment key={item.id}>
                    <tr className="border-t border-zinc-200/60 transition-colors hover:bg-white/60">
                      <td className="py-3 pr-4 text-zinc-900">
                        {item.name}
                      </td>
                      <td className="py-3 pr-4 text-zinc-600">
                        {item.sku ?? "-"}
                      </td>
                      <td className="py-3 pr-4 text-zinc-600">
                        {item.brand ?? "-"}
                      </td>
                      <td className="py-3 pr-4 text-zinc-600">
                        {item.model ?? "-"}
                      </td>
                      <td className="py-3 pr-4 text-zinc-900">
                        {item.unit
                          ? UNIT_LABELS[
                              item.unit as (typeof UNIT_VALUES)[number]
                            ] ?? item.unit
                          : "-"}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap items-center gap-2 justify-end">
                          <button
                            type="button"
                            className="btn text-xs"
                            onClick={() => handleEditStart(item)}
                            aria-label="Editar"
                          >
                            <PencilSquareIcon className="size-4" />
                          </button>
                          <button
                            type="button"
                            className="btn btn-rose text-xs"
                            onClick={() => handleDelete(item.id)}
                            disabled={deletingId === item.id}
                            aria-label="Eliminar"
                          >
                            <TrashIcon className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    <AnimatePresence initial={false}>
                      {editingId === item.id ? (
                        <motion.tr
                          key={`product-edit-${item.id}`}
                          initial={{ opacity: 0, height: 0, y: -6 }}
                          animate={{ opacity: 1, height: "auto", y: 0 }}
                          exit={{ opacity: 0, height: 0, y: -6 }}
                          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                          className="border-t border-zinc-200/60"
                        >
                          <td className="py-3" colSpan={6}>
                            <form onSubmit={handleUpdate} className="space-y-4">
                              <div className="grid gap-3 sm:grid-cols-6">
                              <input
                                className="input sm:col-span-2"
                                value={editForm.name}
                                onChange={(event) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    name: event.target.value,
                                  }))
                                }
                                placeholder="Nombre"
                                required
                              />
                              <input
                                className="input"
                                value={editForm.sku}
                                onChange={(event) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    sku: event.target.value,
                                  }))
                                }
                                placeholder="Codigo"
                              />
                              <select
                                className="input cursor-pointer"
                                value={editForm.unit}
                                onChange={(event) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    unit: event.target.value,
                                  }))
                                }
                              >
                                {UNIT_OPTIONS.map((unit) => (
                                  <option key={unit.value} value={unit.value}>
                                    {unit.label}
                                  </option>
                                ))}
                              </select>
                              <input
                                className="input"
                                value={editForm.brand}
                                onChange={(event) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    brand: event.target.value,
                                  }))
                                }
                                placeholder="Marca"
                              />
                              <input
                                className="input"
                                value={editForm.model}
                                onChange={(event) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    model: event.target.value,
                                  }))
                                }
                                placeholder="Modelo"
                              />
                            </div>
                              <div className="flex flex-wrap gap-2">
                              <button
                                type="submit"
                                className="btn btn-emerald text-xs"
                                disabled={isUpdating}
                              >
                                <CheckIcon className="size-4" />
                                {isUpdating ? "Guardando..." : "Guardar"}
                              </button>
                              <button
                                type="button"
                                className="btn text-xs"
                                onClick={handleEditCancel}
                              >
                                Cancelar
                              </button>
                              </div>
                            </form>
                          </td>
                        </motion.tr>
                      ) : null}
                    </AnimatePresence>
                  </Fragment>
                ))
              ) : (
                <tr>
                  <td className="py-3 text-sm text-zinc-500" colSpan={6}>
                    Sin productos por ahora.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
