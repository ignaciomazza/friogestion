"use client";

import type { FormEvent } from "react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BuildingOffice2Icon,
  CheckIcon,
  EnvelopeIcon,
  IdentificationIcon,
  PencilSquareIcon,
  PhoneIcon,
  TrashIcon,
} from "@/components/icons";

type SupplierRow = {
  id: string;
  displayName: string;
  legalName: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  arcaVerificationStatus?: string | null;
  arcaVerificationCheckedAt?: string | null;
  arcaVerificationMessage?: string | null;
};

const normalizeTaxId = (value: string) => value.replace(/\D/g, "");
const PAGE_SIZE = 100;

type SuppliersResponse = {
  items: SupplierRow[];
  total: number;
  nextOffset: number | null;
  hasMore: boolean;
};

const ARCA_STATUS_LABELS: Record<string, string> = {
  MATCH: "Verificado",
  PARTIAL: "Parcial",
  MISMATCH: "No coincide",
  NO_ENCONTRADO: "No encontrado",
  ERROR: "Error",
  PENDING: "Pendiente",
};

const ARCA_STATUS_STYLES: Record<string, string> = {
  MATCH: "bg-white text-emerald-800 border border-emerald-200",
  PARTIAL: "bg-white text-amber-800 border border-amber-200",
  MISMATCH: "bg-white text-rose-700 border border-rose-200",
  NO_ENCONTRADO: "bg-white text-rose-700 border border-rose-200",
  ERROR: "bg-slate-500/10 text-slate-700 border border-slate-200/25",
  PENDING: "bg-zinc-500/10 text-zinc-700 border border-zinc-500/20",
};

export default function SuppliersPage() {
  const [items, setItems] = useState<SupplierRow[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [supplierQuery, setSupplierQuery] = useState("");
  const [debouncedSupplierQuery, setDebouncedSupplierQuery] = useState("");
  const [sortOrder, setSortOrder] = useState("az");
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [form, setForm] = useState({
    displayName: "",
    legalName: "",
    taxId: "",
    email: "",
    phone: "",
    address: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    displayName: "",
    legalName: "",
    taxId: "",
    email: "",
    phone: "",
    address: "",
  });
  const [isUpdating, setIsUpdating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [isEditLookupLoading, setIsEditLookupLoading] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const loadSuppliers = useCallback(
    async ({
      offset,
      append,
    }: {
      offset: number;
      append: boolean;
    }) => {
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoadingList(true);
      }

      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(offset));
      params.set("sort", sortOrder);
      if (debouncedSupplierQuery.trim()) {
        params.set("q", debouncedSupplierQuery.trim());
      }

      try {
        const res = await fetch(`/api/suppliers?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as SuppliersResponse;
        setItems((previous) =>
          append ? [...previous, ...data.items] : data.items,
        );
        setTotalItems(data.total);
        setNextOffset(data.nextOffset);
        setHasMore(data.hasMore);
      } finally {
        setIsLoadingList(false);
        setIsLoadingMore(false);
      }
    },
    [debouncedSupplierQuery, sortOrder],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSupplierQuery(supplierQuery);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [supplierQuery]);

  useEffect(() => {
    loadSuppliers({ offset: 0, append: false }).catch(() => undefined);
  }, [loadSuppliers]);

  const reloadFromStart = async () => {
    await loadSuppliers({ offset: 0, append: false });
  };

  const handleLoadMore = async () => {
    if (nextOffset === null || isLoadingMore) return;
    await loadSuppliers({ offset: nextOffset, append: true });
  };

  const handleLookupByTaxId = async (target: "new" | "edit") => {
    const source = target === "new" ? form.taxId : editForm.taxId;
    const taxId = normalizeTaxId(source);
    if (!taxId) {
      setStatus("Ingresa un CUIT para buscar.");
      return;
    }

    if (target === "new") {
      setIsLookupLoading(true);
    } else {
      setIsEditLookupLoading(true);
    }
    setStatus(null);

    try {
      const res = await fetch("/api/arca/taxpayer-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taxId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data?.error ?? "No se pudo consultar ARCA");
        return;
      }
      const taxpayer = data?.taxpayer;
      const legalName = taxpayer?.legalName ?? taxpayer?.displayName ?? "";
      const address = taxpayer?.address ?? "";
      if (target === "new") {
        setForm((prev) => ({
          ...prev,
          taxId,
          legalName: legalName || prev.legalName,
          displayName: prev.displayName || taxpayer?.displayName || prev.legalName,
          address: prev.address || address,
        }));
      } else {
        setEditForm((prev) => ({
          ...prev,
          taxId,
          legalName: legalName || prev.legalName,
          displayName: prev.displayName || taxpayer?.displayName || prev.legalName,
          address: prev.address || address,
        }));
      }
      setStatus(`Datos ARCA actualizados (${data.source}).`);
    } catch {
      setStatus("No se pudo consultar ARCA");
    } finally {
      if (target === "new") {
        setIsLookupLoading(false);
      } else {
        setIsEditLookupLoading(false);
      }
    }
  };

  const handleVerifySupplier = async (supplierId: string) => {
    setStatus(null);
    setVerifyingId(supplierId);
    try {
      const res = await fetch("/api/suppliers/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data?.error ?? "No se pudo verificar");
        return;
      }
      setStatus(`ARCA: ${data.status} - ${data.message}`);
      await reloadFromStart();
    } catch {
      setStatus("No se pudo verificar");
    } finally {
      setVerifyingId(null);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: form.displayName,
          legalName: form.legalName || undefined,
          taxId: form.taxId || undefined,
          email: form.email || undefined,
          phone: form.phone || undefined,
          address: form.address || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setStatus(data?.error ?? "No se pudo crear");
        return;
      }

      setForm({
        displayName: "",
        legalName: "",
        taxId: "",
        email: "",
        phone: "",
        address: "",
      });
      setStatus("Proveedor creado");
      await reloadFromStart();
    } catch {
      setStatus("No se pudo crear");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditStart = (item: SupplierRow) => {
    setEditingId(item.id);
    setEditForm({
      displayName: item.displayName,
      legalName: item.legalName ?? "",
      taxId: item.taxId ?? "",
      email: item.email ?? "",
      phone: item.phone ?? "",
      address: item.address ?? "",
    });
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditForm({
      displayName: "",
      legalName: "",
      taxId: "",
      email: "",
      phone: "",
      address: "",
    });
  };

  const handleUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingId) return;
    setStatus(null);
    setIsUpdating(true);
    try {
      const res = await fetch("/api/suppliers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          displayName: editForm.displayName,
          legalName: editForm.legalName || undefined,
          taxId: editForm.taxId || undefined,
          email: editForm.email || undefined,
          phone: editForm.phone || undefined,
          address: editForm.address || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setStatus(data?.error ?? "No se pudo actualizar");
        return;
      }

      setStatus("Proveedor actualizado");
      handleEditCancel();
      await reloadFromStart();
    } catch {
      setStatus("No se pudo actualizar");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Eliminar proveedor?")) return;
    setStatus(null);
    setDeletingId(id);
    try {
      const res = await fetch(`/api/suppliers?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setStatus(data?.error ?? "No se pudo eliminar");
        return;
      }
      setStatus("Proveedor eliminado");
      await reloadFromStart();
    } catch {
      setStatus("No se pudo eliminar");
    } finally {
      setDeletingId(null);
    }
  };

  const totalSuppliers = totalItems;
  const suppliersWithEmail = items.filter((item) => item.email).length;
  const suppliersWithPhone = items.filter((item) => item.phone).length;
  const suppliersWithTaxId = items.filter((item) => item.taxId).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">
          Proveedores
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Gestion basica de proveedores por empresa.
        </p>
      </div>

      <div className="table-scroll pb-1">
        <div className="grid min-w-[760px] grid-cols-4 gap-2">
          <div className="card border !border-sky-200 p-3 !bg-white">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-medium text-sky-700">
                <BuildingOffice2Icon className="size-3.5" />
                Proveedores
              </span>
              <p className="text-base font-semibold text-zinc-900">
                {totalSuppliers}
              </p>
            </div>
          </div>
          <div className="card border !border-dashed !border-emerald-200 p-3 !bg-white">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-medium text-emerald-700">
                <EnvelopeIcon className="size-3.5" />
                Con correo
              </span>
              <p className="text-base font-semibold text-zinc-900">
                {suppliersWithEmail}
              </p>
            </div>
          </div>
          <div className="card border !border-dashed !border-amber-200 p-3 !bg-white">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-medium text-amber-700">
                <PhoneIcon className="size-3.5" />
                Con telefono
              </span>
              <p className="text-base font-semibold text-zinc-900">
                {suppliersWithPhone}
              </p>
            </div>
          </div>
          <div className="card border !border-rose-200 p-3 !bg-white">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-medium text-rose-700">
                <IdentificationIcon className="size-3.5" />
                Con CUIT
              </span>
              <p className="text-base font-semibold text-zinc-900">
                {suppliersWithTaxId}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="card space-y-5 p-6">
        <div className="field-stack">
          <h2 className="text-lg font-semibold text-zinc-900">
            Nuevo proveedor
          </h2>
          <p className="section-subtitle">Alta rapida para compras y pagos.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-3">
              <span className="input-label">Nombre comercial</span>
              <input
                className="input"
                value={form.displayName}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    displayName: event.target.value,
                  }))
                }
                placeholder="Nombre comercial"
                required
              />
            </label>
            <label className="flex flex-col gap-3">
              <span className="input-label">Razon social</span>
              <input
                className="input"
                value={form.legalName}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    legalName: event.target.value,
                  }))
                }
                placeholder="Razon social"
              />
            </label>
          </div>
          <label className="flex flex-col gap-3">
            <span className="input-label">CUIT</span>
            <input
              className="input w-full"
              value={form.taxId}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  taxId: normalizeTaxId(event.target.value),
                }))
              }
              placeholder="CUIT"
            />
            <button
              type="button"
              className="btn text-xs w-fit"
              onClick={() => handleLookupByTaxId("new")}
              disabled={isLookupLoading}
            >
              {isLookupLoading ? "Buscando..." : "Buscar por CUIT"}
            </button>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-3">
              <span className="input-label">Correo</span>
              <input
                className="input"
                value={form.email}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, email: event.target.value }))
                }
                placeholder="Correo"
              />
            </label>
            <label className="flex flex-col gap-3">
              <span className="input-label">Telefono</span>
              <input
                className="input"
                value={form.phone}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, phone: event.target.value }))
                }
                placeholder="Telefono"
              />
            </label>
          </div>
          <label className="flex flex-col gap-3">
            <span className="input-label">Direccion</span>
            <input
              className="input w-full"
              value={form.address}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, address: event.target.value }))
              }
              placeholder="Direccion"
            />
          </label>
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
              Filtros de proveedores
            </h3>
            <p className="text-xs text-zinc-500">
              {items.length} de {totalItems} proveedores
            </p>
          </div>
          <button
            type="button"
            className="btn btn-sky text-xs transition-transform hover:-translate-y-0.5"
            onClick={() => {
              setSupplierQuery("");
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
            value={supplierQuery}
            onChange={(event) => setSupplierQuery(event.target.value)}
            placeholder="Buscar proveedor, CUIT o correo"
          />
        </div>
      </div>

      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Proveedores recientes
          </h3>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-zinc-500">
              {items.length} de {totalItems}
            </span>
            <select
              className="input cursor-pointer text-xs"
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
              aria-label="Ordenar proveedores"
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
                <th className="py-2 pr-4">Nombre comercial</th>
                <th className="py-2 pr-4">Razon social</th>
                <th className="py-2 pr-4">Correo</th>
                <th className="py-2 pr-4">Telefono</th>
                <th className="py-2 pr-4">CUIT / ARCA</th>
                <th className="py-2 pr-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.length ? (
                items.map((item) => (
                  <Fragment key={item.id}>
                    <tr className="border-t border-zinc-200/60 transition-colors hover:bg-white/60">
                      <td className="py-3 pr-4 text-zinc-900">
                        {item.displayName}
                      </td>
                      <td className="py-3 pr-4 text-zinc-600">
                        {item.legalName ?? "-"}
                      </td>
                      <td className="py-3 pr-4 text-zinc-600">
                        {item.email ?? "-"}
                      </td>
                      <td className="py-3 pr-4 text-zinc-600">
                        {item.phone ?? "-"}
                      </td>
                      <td className="py-3 pr-4 text-zinc-600">
                        <div className="flex flex-col gap-1">
                          <span>{item.taxId ?? "-"}</span>
                          <span
                            className={`inline-flex max-w-max rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${
                              ARCA_STATUS_STYLES[
                                item.arcaVerificationStatus ?? "PENDING"
                              ] ??
                              "bg-zinc-500/10 text-zinc-700 border border-zinc-500/20"
                            }`}
                            title={item.arcaVerificationMessage ?? undefined}
                          >
                            {ARCA_STATUS_LABELS[
                              item.arcaVerificationStatus ?? "PENDING"
                            ] ?? item.arcaVerificationStatus ?? "Pendiente"}
                          </span>
                          {item.arcaVerificationCheckedAt ? (
                            <span className="text-[10px] text-zinc-500">
                              {new Date(
                                item.arcaVerificationCheckedAt
                              ).toLocaleString("es-AR")}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <button
                            type="button"
                            className="btn btn-sky text-xs"
                            onClick={() => handleVerifySupplier(item.id)}
                            disabled={verifyingId === item.id}
                            aria-label="Verificar ARCA"
                          >
                            {verifyingId === item.id
                              ? "Verificando..."
                              : "Verificar ARCA"}
                          </button>
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
                          key={`supplier-edit-${item.id}`}
                          initial={{ opacity: 0, height: 0, y: -6 }}
                          animate={{ opacity: 1, height: "auto", y: 0 }}
                          exit={{ opacity: 0, height: 0, y: -6 }}
                          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                          className="border-t border-zinc-200/60"
                        >
                          <td className="py-3" colSpan={6}>
                            <form onSubmit={handleUpdate} className="space-y-4">
                              <div className="grid gap-3 sm:grid-cols-2">
                                <input
                                  className="input"
                                  value={editForm.displayName}
                                  onChange={(event) =>
                                    setEditForm((prev) => ({
                                      ...prev,
                                      displayName: event.target.value,
                                    }))
                                  }
                                  placeholder="Nombre comercial"
                                  required
                                />
                                <input
                                  className="input"
                                  value={editForm.legalName}
                                  onChange={(event) =>
                                    setEditForm((prev) => ({
                                      ...prev,
                                      legalName: event.target.value,
                                    }))
                                  }
                                  placeholder="Razon social"
                                />
                              </div>
                              <input
                                className="input w-full"
                                value={editForm.taxId}
                                onChange={(event) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    taxId: normalizeTaxId(event.target.value),
                                  }))
                                }
                                placeholder="CUIT"
                              />
                              <div className="grid gap-3 sm:grid-cols-2">
                                <input
                                  className="input"
                                  value={editForm.email}
                                  onChange={(event) =>
                                    setEditForm((prev) => ({
                                      ...prev,
                                      email: event.target.value,
                                    }))
                                  }
                                  placeholder="Correo"
                                />
                                <input
                                  className="input"
                                  value={editForm.phone}
                                  onChange={(event) =>
                                    setEditForm((prev) => ({
                                      ...prev,
                                      phone: event.target.value,
                                    }))
                                  }
                                  placeholder="Telefono"
                                />
                              </div>
                              <input
                                className="input"
                                value={editForm.address}
                                onChange={(event) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    address: event.target.value,
                                  }))
                                }
                                placeholder="Direccion"
                              />
                              <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="btn text-xs"
                                onClick={() => handleLookupByTaxId("edit")}
                                disabled={isEditLookupLoading}
                              >
                                {isEditLookupLoading ? "Buscando..." : "Buscar CUIT"}
                              </button>
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
                              <button
                                type="button"
                                className="btn btn-sky text-xs"
                                onClick={() => handleVerifySupplier(item.id)}
                                disabled={verifyingId === item.id}
                              >
                                {verifyingId === item.id
                                  ? "Verificando..."
                                  : "Verificar ARCA"}
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
                    {isLoadingList
                      ? "Cargando proveedores..."
                      : "Sin proveedores por ahora."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {hasMore ? (
          <div className="pt-3">
            <button
              type="button"
              className="btn btn-sky text-xs w-full sm:w-auto"
              onClick={() => handleLoadMore().catch(() => undefined)}
              disabled={isLoadingList || isLoadingMore}
            >
              {isLoadingMore ? "Cargando..." : "Cargar mas"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
