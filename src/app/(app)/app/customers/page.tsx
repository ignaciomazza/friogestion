"use client";

import type { FormEvent } from "react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BuildingOffice2Icon,
  CheckIcon,
  Cog6ToothIcon,
  PencilSquareIcon,
  ShoppingCartIcon,
  TrashIcon,
  UsersIcon,
} from "@/components/icons";

type CustomerRow = {
  id: string;
  displayName: string;
  address: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  type: string;
  defaultPriceListId?: string | null;
};

type PriceListOption = {
  id: string;
  name: string;
  currencyCode: string;
  isDefault: boolean;
  isConsumerFinal: boolean;
  isActive: boolean;
};

const normalizeTaxId = (value: string) => value.replace(/\D/g, "");
const PAGE_SIZE = 100;

type CustomersResponse = {
  items: CustomerRow[];
  total: number;
  nextOffset: number | null;
  hasMore: boolean;
};

export default function CustomersPage() {
  const [items, setItems] = useState<CustomerRow[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [priceLists, setPriceLists] = useState<PriceListOption[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [debouncedCustomerQuery, setDebouncedCustomerQuery] = useState("");
  const [sortOrder, setSortOrder] = useState("az");
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [form, setForm] = useState({
    displayName: "",
    email: "",
    phone: "",
    taxId: "",
    address: "",
    defaultPriceListId: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    displayName: "",
    email: "",
    phone: "",
    taxId: "",
    address: "",
    defaultPriceListId: "",
  });
  const [isUpdating, setIsUpdating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [isEditLookupLoading, setIsEditLookupLoading] = useState(false);

  const loadCustomers = useCallback(
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
      if (debouncedCustomerQuery.trim()) {
        params.set("q", debouncedCustomerQuery.trim());
      }

      try {
        const res = await fetch(`/api/customers?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as CustomersResponse;
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
    [debouncedCustomerQuery, sortOrder],
  );

  const loadPriceLists = async () => {
    const res = await fetch("/api/price-lists", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as PriceListOption[];
      setPriceLists(data.filter((priceList) => priceList.isActive !== false));
    }
  };

  useEffect(() => {
    loadPriceLists().catch(() => undefined);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedCustomerQuery(customerQuery);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [customerQuery]);

  useEffect(() => {
    loadCustomers({ offset: 0, append: false }).catch(() => undefined);
  }, [loadCustomers]);

  const reloadFromStart = async () => {
    await loadCustomers({ offset: 0, append: false });
  };

  const handleLoadMore = async () => {
    if (nextOffset === null || isLoadingMore) return;
    await loadCustomers({ offset: nextOffset, append: true });
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
      const displayName = taxpayer?.legalName ?? taxpayer?.displayName ?? "";
      const address = taxpayer?.address ?? "";
      if (target === "new") {
        setForm((prev) => ({
          ...prev,
          taxId,
          displayName: prev.displayName || displayName,
          address: prev.address || address,
        }));
      } else {
        setEditForm((prev) => ({
          ...prev,
          taxId,
          displayName: prev.displayName || displayName,
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: form.displayName,
          email: form.email || undefined,
          phone: form.phone || undefined,
          taxId: form.taxId || undefined,
          address: form.address || undefined,
          defaultPriceListId: form.defaultPriceListId || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setStatus(data?.error ?? "No se pudo crear");
        return;
      }

      setForm({
        displayName: "",
        email: "",
        phone: "",
        taxId: "",
        address: "",
        defaultPriceListId: "",
      });
      setStatus("Cliente creado");
      await reloadFromStart();
    } catch {
      setStatus("No se pudo crear");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditStart = (item: CustomerRow) => {
    setEditingId(item.id);
    setEditForm({
      displayName: item.displayName,
      email: item.email ?? "",
      phone: item.phone ?? "",
      taxId: item.taxId ?? "",
      address: item.address ?? "",
      defaultPriceListId: item.defaultPriceListId ?? "",
    });
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditForm({
      displayName: "",
      email: "",
      phone: "",
      taxId: "",
      address: "",
      defaultPriceListId: "",
    });
  };

  const handleUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingId) return;
    setStatus(null);
    setIsUpdating(true);
    try {
      const res = await fetch("/api/customers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          displayName: editForm.displayName,
          email: editForm.email || undefined,
          phone: editForm.phone || undefined,
          taxId: editForm.taxId || undefined,
          address: editForm.address || undefined,
          defaultPriceListId: editForm.defaultPriceListId || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setStatus(data?.error ?? "No se pudo actualizar");
        return;
      }

      setStatus("Cliente actualizado");
      handleEditCancel();
      await reloadFromStart();
    } catch {
      setStatus("No se pudo actualizar");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Eliminar cliente?")) return;
    setStatus(null);
    setDeletingId(id);
    try {
      const res = await fetch(`/api/customers?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setStatus(data?.error ?? "No se pudo eliminar");
        return;
      }
      setStatus("Cliente eliminado");
      await reloadFromStart();
    } catch {
      setStatus("No se pudo eliminar");
    } finally {
      setDeletingId(null);
    }
  };

  const totalCustomers = totalItems;
  const loadedCustomers = items.length;
  const customersWithPriceList = items.filter(
    (item) => Boolean(item.defaultPriceListId),
  ).length;
  const customersWithoutPriceList = loadedCustomers - customersWithPriceList;
  const consumerFinalPriceListCount = items.filter((item) => {
    if (!item.defaultPriceListId) return false;
    const priceList = priceLists.find(
      (candidate) => candidate.id === item.defaultPriceListId,
    );
    return Boolean(priceList?.isConsumerFinal);
  }).length;
  const priceListById = useMemo(
    () => new Map(priceLists.map((priceList) => [priceList.id, priceList])),
    [priceLists],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">
          Clientes
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Gestion basica de clientes por empresa.
        </p>
      </div>

      <div className="table-scroll pb-1">
        <div className="grid min-w-[760px] grid-cols-4 gap-2">
          <div className="card border !border-sky-200 p-3 !bg-white">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-medium text-sky-700">
                <UsersIcon className="size-3.5" />
                Clientes
              </span>
              <p className="text-base font-semibold text-zinc-900">
                {totalCustomers}
              </p>
            </div>
          </div>
          <div className="card border !border-dashed !border-emerald-200 p-3 !bg-white">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-medium text-emerald-700">
                <ShoppingCartIcon className="size-3.5" />
                Con lista asignada
              </span>
              <p className="text-base font-semibold text-zinc-900">
                {customersWithPriceList}
              </p>
            </div>
          </div>
          <div className="card border !border-dashed !border-amber-200 p-3 !bg-white">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-medium text-amber-700">
                <BuildingOffice2Icon className="size-3.5" />
                Lista consumidor final
              </span>
              <p className="text-base font-semibold text-zinc-900">
                {consumerFinalPriceListCount}
              </p>
            </div>
          </div>
          <div className="card border !border-rose-200 p-3 !bg-white">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-medium text-rose-700">
                <Cog6ToothIcon className="size-3.5" />
                Sin lista
              </span>
              <p className="text-base font-semibold text-zinc-900">
                {customersWithoutPriceList}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="card space-y-5 p-6">
        <div className="field-stack">
          <h2 className="text-lg font-semibold text-zinc-900">
            Nuevo cliente
          </h2>
          <p className="section-subtitle">Alta rapida para operar en ventas.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-3">
              <span className="input-label">Nombre o razon social</span>
              <input
                className="input w-full"
                value={form.displayName}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    displayName: event.target.value,
                  }))
                }
                placeholder="Nombre o razon social"
                required
              />
            </label>
            <label className="flex flex-col gap-3">
              <span className="input-label">Lista de precios</span>
              <select
                className="input cursor-pointer"
                value={form.defaultPriceListId}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    defaultPriceListId: event.target.value,
                  }))
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
              Filtros de clientes
            </h3>
            <p className="text-xs text-zinc-500">
              {items.length} de {totalItems} clientes
            </p>
          </div>
          <button
            type="button"
            className="btn btn-sky text-xs transition-transform hover:-translate-y-0.5"
            onClick={() => {
              setCustomerQuery("");
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
        <div className="grid gap-3">
          <input
            className="input w-full"
            value={customerQuery}
            onChange={(event) => setCustomerQuery(event.target.value)}
            placeholder="Buscar nombre, CUIT o correo"
          />
        </div>
      </div>

      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Clientes recientes
          </h3>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-zinc-500">
              {items.length} de {totalItems}
            </span>
            <select
              className="input cursor-pointer text-xs"
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
              aria-label="Ordenar clientes"
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
                <th className="py-2 pr-4">Cliente</th>
                <th className="py-2 pr-4">Lista</th>
                <th className="py-2 pr-4">Correo</th>
                <th className="py-2 pr-4">Telefono</th>
                <th className="py-2 pr-4">Direccion</th>
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
                        {item.defaultPriceListId
                          ? `${priceListById.get(item.defaultPriceListId)?.name ?? "Lista"}${
                              priceListById.get(item.defaultPriceListId)
                                ?.isConsumerFinal
                                ? " (Consumidor final)"
                                : ""
                            }`
                          : "-"}
                      </td>
                      <td className="py-3 pr-4 text-zinc-600">
                        {item.email ?? "-"}
                      </td>
                      <td className="py-3 pr-4 text-zinc-600">
                        {item.phone ?? "-"}
                      </td>
                      <td className="py-3 pr-4 text-zinc-600">
                        {item.address ?? "-"}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap items-center justify-end gap-2">
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
                          key={`customer-edit-${item.id}`}
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
                                  placeholder="Nombre o razon social"
                                  required
                                />
                                <select
                                  className="input cursor-pointer"
                                  value={editForm.defaultPriceListId}
                                  onChange={(event) =>
                                    setEditForm((prev) => ({
                                      ...prev,
                                      defaultPriceListId: event.target.value,
                                    }))
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
                                className="input w-full"
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
                    {isLoadingList ? "Cargando clientes..." : "Sin clientes por ahora."}
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
