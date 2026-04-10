"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDownTrayIcon,
  ArrowRightStartOnRectangleIcon,
  Bars3Icon,
  BuildingOffice2Icon,
  ChartBarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Cog6ToothIcon,
  IdentificationIcon,
  CurrencyDollarIcon,
  CubeIcon,
  DocumentTextIcon,
  HomeIcon,
  InformationCircleIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  UsersIcon,
  XMarkIcon,
} from "@/components/icons";
import { cn } from "@/lib/cn";
import { ADMIN_ROLES } from "@/lib/auth/rbac";
import { formatCurrencyARS } from "@/lib/format";
import type { DolarBlueRate, DolarOfficialRate } from "@/lib/market/dolar-hoy";

type TopbarClientProps = {
  latestRate: string | null;
  blueRate: DolarBlueRate | null;
  officialRate: DolarOfficialRate | null;
  role: string | null;
  sessionUserName: string;
};

type NavItem = {
  href: string;
  label: string;
  Icon: React.ComponentType<React.ComponentProps<"svg">>;
  roles?: readonly string[];
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const SIDEBAR_STORAGE_KEY = "friogestion-sidebar-collapsed";

let cachedSidebarCollapsed = false;
const sidebarListeners = new Set<() => void>();
const subscribeHydration = () => () => {};
const getHydratedSnapshot = () => true;
const getHydratedServerSnapshot = () => false;

const getSidebarSnapshot = () => cachedSidebarCollapsed;
const getSidebarServerSnapshot = () => false;

const subscribeSidebar = (listener: () => void) => {
  sidebarListeners.add(listener);
  return () => {
    sidebarListeners.delete(listener);
  };
};

const notifySidebar = () => {
  sidebarListeners.forEach((listener) => listener());
};

const NAV_SECTIONS: NavSection[] = [
  {
    title: "General",
    items: [{ href: "/app", label: "Inicio", Icon: HomeIcon }],
  },
  {
    title: "Comercial",
    items: [
      { href: "/app/quotes", label: "Presupuestos", Icon: DocumentTextIcon },
      { href: "/app/sales", label: "Ventas", Icon: ShoppingCartIcon },
      { href: "/app/billing", label: "Facturacion", Icon: CurrencyDollarIcon },
      {
        href: "/app/income-check",
        label: "Control ingresos",
        Icon: ArrowDownTrayIcon,
        roles: [...ADMIN_ROLES],
      },
    ],
  },
  {
    title: "Operacion",
    items: [
      { href: "/app/purchases", label: "Compras", Icon: ShoppingBagIcon },
      { href: "/app/stock", label: "Stock", Icon: CubeIcon },
      { href: "/app/products", label: "Productos", Icon: DocumentTextIcon },
      { href: "/app/customers", label: "Clientes", Icon: UsersIcon },
      {
        href: "/app/suppliers",
        label: "Proveedores",
        Icon: BuildingOffice2Icon,
      },
    ],
  },
  {
    title: "Finanzas",
    items: [
      {
        href: "/app/current-accounts",
        label: "Cuenta corriente",
        Icon: IdentificationIcon,
      },
      {
        href: "/app/cash-reconciliation",
        label: "Arqueo",
        Icon: ChartBarIcon,
        roles: [...ADMIN_ROLES],
      },
    ],
  },
  {
    title: "Sistema",
    items: [
      {
        href: "/app/admin",
        label: "Administracion",
        Icon: Cog6ToothIcon,
        roles: [...ADMIN_ROLES],
      },
      {
        href: "/app/developer",
        label: "Developer",
        Icon: InformationCircleIcon,
        roles: ["DEVELOPER"],
      },
    ],
  },
];

export default function TopbarClient({
  latestRate,
  blueRate,
  officialRate,
  role,
  sessionUserName,
}: TopbarClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isCollapsed = useSyncExternalStore(
    subscribeSidebar,
    getSidebarSnapshot,
    getSidebarServerSnapshot
  );
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [isSidebarCompact, setIsSidebarCompact] = useState(isCollapsed);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const isHydrated = useSyncExternalStore(
    subscribeHydration,
    getHydratedSnapshot,
    getHydratedServerSnapshot
  );
  const hoverCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncSidebarState = () => {
      let next = false;
      try {
        next = window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
      } catch {
        next = false;
      }
      if (next !== cachedSidebarCollapsed) {
        cachedSidebarCollapsed = next;
        notifySidebar();
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== SIDEBAR_STORAGE_KEY) return;
      syncSidebarState();
    };

    syncSidebarState();
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const visibleSections = useMemo(() => {
    return NAV_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.roles || (role ? item.roles.includes(role) : false)
      ),
    })).filter((section) => section.items.length > 0);
  }, [role]);

  const blueUpdatedAt = blueRate?.updatedAt
    ? new Date(blueRate.updatedAt)
    : null;
  const blueUpdatedLabel =
    blueUpdatedAt && Number.isFinite(blueUpdatedAt.getTime())
      ? blueUpdatedAt.toLocaleString("es-AR")
      : null;
  const officialUpdatedAt = officialRate?.updatedAt
    ? new Date(officialRate.updatedAt)
    : null;
  const officialUpdatedLabel =
    officialUpdatedAt && Number.isFinite(officialUpdatedAt.getTime())
      ? officialUpdatedAt.toLocaleString("es-AR")
      : null;

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const toggleCollapse = () => {
    const next = !isCollapsed;
    cachedSidebarCollapsed = next;
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // ignore
    }
    notifySidebar();
  };

  const isActivePath = (href: string) => {
    return href === "/app" ? pathname === "/app" : pathname?.startsWith(href);
  };

  useEffect(() => {
    return () => {
      if (hoverCloseTimeoutRef.current) {
        clearTimeout(hoverCloseTimeoutRef.current);
      }
    };
  }, []);

  const handleSidebarMouseEnter = () => {
    if (hoverCloseTimeoutRef.current) {
      clearTimeout(hoverCloseTimeoutRef.current);
      hoverCloseTimeoutRef.current = null;
    }
    setIsSidebarHovered(true);
  };

  const handleSidebarMouseLeave = () => {
    if (hoverCloseTimeoutRef.current) {
      clearTimeout(hoverCloseTimeoutRef.current);
    }
    hoverCloseTimeoutRef.current = setTimeout(() => {
      setIsSidebarHovered(false);
      hoverCloseTimeoutRef.current = null;
    }, 110);
  };

  const isSidebarExpanded = !isCollapsed || isSidebarHovered;

  useEffect(() => {
    const compactTimer = setTimeout(() => {
      setIsSidebarCompact(!isSidebarExpanded);
    }, isSidebarExpanded ? 0 : 220);

    return () => clearTimeout(compactTimer);
  }, [isSidebarExpanded]);

  const renderSections = (
    compactLayout: boolean,
    showLabels: boolean,
    onNavigate?: () => void
  ) => {
    return visibleSections.map((section) => (
      <section key={section.title} className="space-y-1">
        <p
          className={cn(
            "px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
            showLabels
              ? "delay-100 translate-x-0 opacity-100"
              : "delay-0 -translate-x-1 opacity-0"
          )}
        >
          {section.title}
        </p>
        <div className="space-y-1">
          {section.items.map((item) => {
            const isActive = isActivePath(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                title={compactLayout ? item.label : undefined}
                className={cn(
                  "group relative flex h-9 items-center rounded-2xl border border-transparent py-2 text-zinc-700 transition-all",
                  compactLayout ? "justify-center px-2" : "gap-3 px-3",
                  isActive
                    ? "border-sky-200 bg-white text-sky-950 shadow-[0_4px_12px_-10px_rgba(14,116,144,0.45)]"
                    : "hover:border-zinc-200/70 hover:bg-white/60"
                )}
              >
                <item.Icon
                  className={cn(
                    "size-4 shrink-0",
                    isActive
                      ? "text-sky-700"
                      : "text-zinc-500"
                  )}
                />
                <span
                  className={cn(
                    "truncate text-sm leading-5 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    showLabels
                      ? "delay-100 translate-x-0 opacity-100"
                      : "delay-0 -translate-x-1 opacity-0",
                    compactLayout && !showLabels && "pointer-events-none absolute"
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    ));
  };

  const internalLabel = latestRate ? formatCurrencyARS(latestRate) : "Sin cotizacion";
  const blueLabel = blueRate
    ? `Compra ${formatCurrencyARS(blueRate.buy)} · Venta ${formatCurrencyARS(
        blueRate.sell
      )}`
    : "Sin dato";
  const officialLabel = officialRate
    ? `Compra ${formatCurrencyARS(officialRate.buy)} · Venta ${formatCurrencyARS(
        officialRate.sell
      )}`
    : "Sin dato";
  const ratePortalTarget =
    isHydrated ? document.getElementById("rates-slot") : null;
  const rateCards = (
    <div className="pointer-events-auto flex flex-wrap items-stretch gap-2">
      <div className="inline-flex items-center gap-2 rounded-2xl border border-sky-200 bg-white px-3 py-2 text-xs shadow-[0_6px_14px_-12px_rgba(14,116,144,0.28)]">
        <div className="flex items-center gap-1 text-sky-900">
          <CurrencyDollarIcon className="size-4 text-sky-600" />
          <span>Interno</span>
        </div>
        <p className="font-semibold text-sky-950">{internalLabel}</p>
      </div>
      <div
        className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-white px-3 py-2 text-xs shadow-[0_6px_14px_-12px_rgba(16,185,129,0.28)]"
        title={
          blueRate
            ? `Fuente: ${blueRate.source}${blueUpdatedLabel ? ` · ${blueUpdatedLabel}` : ""}`
            : "Fuente: sin datos"
        }
      >
        <div className="flex items-center gap-1 text-emerald-900">
          <CurrencyDollarIcon className="size-4" />
          <span>Blue</span>
        </div>
        <p className="font-semibold text-emerald-950">{blueLabel}</p>
      </div>
      <div
        className="inline-flex items-center gap-2 rounded-2xl border border-cyan-200 bg-white px-3 py-2 text-xs shadow-[0_6px_14px_-12px_rgba(8,145,178,0.28)]"
        title={
          officialRate
            ? `Fuente: ${officialRate.source}${officialUpdatedLabel ? ` · ${officialUpdatedLabel}` : ""}`
            : "Fuente: sin datos"
        }
      >
        <div className="flex items-center gap-1 text-cyan-900">
          <CurrencyDollarIcon className="size-4" />
          <span>Oficial</span>
        </div>
        <p className="font-semibold text-cyan-950">{officialLabel}</p>
      </div>
    </div>
  );

  return (
    <>
      {ratePortalTarget ? createPortal(rateCards, ratePortalTarget) : null}

      <div className="mb-4 lg:hidden">
        <div className="glass  rounded-3xl p-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsMobileOpen(true)}
              className="btn text-xs"
              aria-label="Abrir menu"
            >
              <Bars3Icon className="size-4" />
            </button>
            <div className="min-w-0 flex-1" />
            <button
              type="button"
              onClick={handleLogout}
              className="btn btn-rose text-xs"
              aria-label="Cerrar sesion"
            >
              <ArrowRightStartOnRectangleIcon className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {isMobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar menu"
            className="absolute inset-0 bg-black/45"
            onClick={() => setIsMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[84vw] max-w-sm flex-col rounded-r-3xl border-r border-zinc-200/80 bg-zinc-50/95 p-3 shadow-[0_14px_30px_-24px_rgba(63,63,70,0.4)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold tracking-wide text-sky-800">
                  Menu
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileOpen(false)}
                className="btn text-xs"
                aria-label="Cerrar menu lateral"
              >
                <XMarkIcon className="size-4" />
              </button>
            </div>

            <nav className="mt-3 flex-1 space-y-4 overflow-y-auto pr-1">
              {renderSections(false, true, () => setIsMobileOpen(false))}
            </nav>

          </aside>
        </div>
      ) : null}

      <aside
        onMouseEnter={handleSidebarMouseEnter}
        onMouseLeave={handleSidebarMouseLeave}
        className={cn(
          "hidden overflow-x-hidden lg:flex lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:flex-col lg:gap-3 rounded-3xl border border-zinc-200/70 bg-white/65 p-3 shadow-[0_14px_30px_-24px_rgba(63,63,70,0.28)] backdrop-blur-xl transition-[width,box-shadow,background-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
          isSidebarExpanded ? "lg:w-64" : "lg:w-[4.5rem]"
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2",
            isSidebarCompact ? "justify-center" : "justify-between"
          )}
        >
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-xs font-semibold text-zinc-600 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
              isSidebarExpanded
                ? "delay-100 translate-x-0 opacity-100"
                : "delay-0 -translate-x-1 opacity-0",
              isSidebarCompact && !isSidebarExpanded && "pointer-events-none absolute"
            )}
            title={isSidebarExpanded ? sessionUserName : undefined}
          >
            {sessionUserName}
          </span>
          <button
            type="button"
            onClick={toggleCollapse}
            className="btn text-xs"
            aria-label={
              isSidebarExpanded ? "Colapsar menu lateral" : "Expandir menu lateral"
            }
          >
            {isSidebarExpanded ? (
              <ChevronLeftIcon className="size-4" />
            ) : (
              <ChevronRightIcon className="size-4" />
            )}
          </button>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto pr-1">
          {renderSections(isSidebarCompact, isSidebarExpanded)}
        </nav>

        <div className="border-t border-zinc-200/70 pt-3">
          <button
            type="button"
            onClick={handleLogout}
            className={cn(
              "btn btn-rose relative h-9 w-full justify-center text-xs",
              isSidebarCompact && "px-2"
            )}
            aria-label="Cerrar sesion"
            title={isSidebarCompact ? "Cerrar sesion" : undefined}
          >
            <ArrowRightStartOnRectangleIcon className="size-4" />
            <span
              className={cn(
                "leading-5 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                isSidebarExpanded
                  ? "delay-100 translate-x-0 opacity-100"
                  : "delay-0 -translate-x-1 opacity-0",
                isSidebarCompact && !isSidebarExpanded && "pointer-events-none absolute"
              )}
            >
              Salir
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
