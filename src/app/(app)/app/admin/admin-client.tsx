"use client";

import type { FormEvent, MouseEvent, ReactElement, ReactNode } from "react";
import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  BuildingOffice2Icon,
  ChevronDownIcon,
  Cog6ToothIcon,
  CurrencyDollarIcon,
  DocumentTextIcon,
  InformationCircleIcon,
  UsersIcon,
} from "@/components/icons";
import { MoneyInput } from "@/components/inputs/MoneyInput";
import {
  ROLE_LABELS,
  USER_MANAGEMENT_ROLE_OPTIONS,
  roleLabel,
} from "@/lib/labels";
import { getAfipMissingItems, summarizeAfipMissing } from "@/lib/afip/messages";
import { formatCurrencyARS } from "@/lib/format";
import { notifyExchangeRateUpdated } from "@/lib/exchange-rate-events";
import {
  normalizeIntegerInput,
} from "@/lib/input-format";
import type { DolarBlueRate, DolarOfficialRate } from "@/lib/market/dolar-hoy";
import { STOCK_ENABLED } from "@/lib/features";

type UserRow = {
  id: string;
  email: string;
  name?: string | null;
  role: string;
  isActive: boolean;
};

type ExchangeRate = {
  id: string;
  baseCode: string;
  quoteCode: string;
  rate: string;
  asOf: string;
};

type MarketRatesResponse = {
  blue: DolarBlueRate | null;
  official: DolarOfficialRate | null;
};

type PaymentMethodRow = {
  id: string;
  name: string;
  type: "CASH" | "TRANSFER" | "CARD" | "CHECK" | "OTHER";
  requiresAccount: boolean;
  requiresApproval: boolean;
  requiresDoubleCheck: boolean;
  isActive: boolean;
};

type AccountRow = {
  id: string;
  name: string;
  type: "CASH" | "BANK" | "VIRTUAL";
  currencyCode: string;
  isActive: boolean;
};

type CurrencyRow = {
  id: string;
  code: string;
  name: string;
  symbol?: string | null;
  isDefault: boolean;
};

type PriceListRow = {
  id: string;
  name: string;
  currencyCode: string;
  isDefault: boolean;
  isConsumerFinal: boolean;
  isActive: boolean;
  sortOrder: number;
};

type AdminClientProps = {
  role: string;
  activeOrg: {
    id: string;
    name: string;
    adjustStockOnQuoteConfirm: boolean;
  };
  users: UserRow[];
  afipStatus: {
    ok: boolean;
    env: string;
    missing: string[];
    missingOptional: string[];
    clientReady?: boolean;
    helpLinks?: Array<{ label: string; url: string }>;
  };
  arcaStatus: {
    secretsKeyValid: boolean;
    config: {
      status: string;
      taxIdRepresentado: string;
      taxIdLogin: string;
      alias: string;
      defaultPointOfSale?: number | null;
      authorizedServices: string[];
      lastError?: string | null;
      lastOkAt?: string | null;
    } | null;
    job: {
      id: string;
      status: string;
      step: string;
      services: string[];
      currentServiceIndex: number;
      lastError?: string | null;
      createdAt: string;
      updatedAt: string;
      completedAt?: string | null;
    } | null;
    jobInfo?: {
      statusMessage: string;
      helpLinks?: Array<{ label: string; url: string }>;
    } | null;
  };
  paymentMethods: PaymentMethodRow[];
  accounts: AccountRow[];
  currencies: CurrencyRow[];
  priceLists: PriceListRow[];
};

const ARCA_CONFIG_LABELS: Record<string, string> = {
  CONNECTED: "Conectado",
  ERROR: "Error",
  PENDING: "Pendiente",
  SIN_CONFIG: "Sin configurar",
};

const ARCA_PROCESS_LABELS: Record<string, string> = {
  COMPLETED: "Completado",
  ERROR: "Error",
  PENDING: "Pendiente",
  WAITING: "En espera",
  RUNNING: "En curso",
  REQUIRES_ACTION: "Requiere accion",
};

const ARCA_STEP_LABELS: Record<string, string> = {
  CREATE_CERT: "Creacion de certificado",
  AUTH_WS: "Autorizacion de servicios",
  DONE: "Finalizado",
};

const ARCA_STEP_ORDER = ["CREATE_CERT", "AUTH_WS", "DONE"] as const;

const ARCA_SERVICE_OPTIONS = [
  {
    value: "wsfe",
    label: "WSFE (facturacion)",
  },
  {
    value: "wscdc",
    label: "WSCDC (constatacion)",
  },
  {
    value: "ws_sr_constancia_inscripcion",
    label: "Constancia inscripcion",
  },
] as const;

type ArcaServiceOption = (typeof ARCA_SERVICE_OPTIONS)[number]["value"];

function normalizeArcaServices(services: string[] | null | undefined) {
  const allowed = new Set<ArcaServiceOption>(
    ARCA_SERVICE_OPTIONS.map((service) => service.value)
  );
  const isAllowedService = (service: string): service is ArcaServiceOption =>
    allowed.has(service as ArcaServiceOption);
  const normalized = Array.from(
    new Set(
      (services ?? [])
        .map((service) => service.trim().toLowerCase())
        .filter(Boolean)
    )
  ).filter(isAllowedService);

  return normalized.length ? normalized : ["wsfe"];
}

function normalizeArcaMessage(value: string) {
  return value.replace(/AFIP/gi, "ARCA");
}

const PAYMENT_METHOD_TYPE_LABELS: Record<PaymentMethodRow["type"], string> = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  CARD: "Tarjeta",
  CHECK: "Cheque",
  OTHER: "Otro",
};

const ACCOUNT_TYPE_LABELS: Record<AccountRow["type"], string> = {
  CASH: "Caja",
  BANK: "Banco",
  VIRTUAL: "Virtual",
};

const Details = ({
  defaultOpen = false,
  className,
  children,
}: {
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const childArray = Children.toArray(children);
  const summaryElement = childArray.find(
    (
      child,
    ): child is ReactElement<{
      onClick?: (event: MouseEvent<HTMLElement>) => void;
    }> => isValidElement(child) && child.type === "summary",
  );
  const contentChildren = childArray.filter((child) => child !== summaryElement);
  const summaryNode = summaryElement
    ? cloneElement(summaryElement, {
        onClick: (event: MouseEvent<HTMLElement>) => {
          event.preventDefault();
          summaryElement.props.onClick?.(event);
          setOpen((prev) => !prev);
        },
      })
    : null;

  return (
    <details className={className} open={open}>
      {summaryNode}
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="details-content"
            initial={{ height: 0, opacity: 0, y: -8 }}
            animate={{ height: "auto", opacity: 1, y: 0 }}
            exit={{ height: 0, opacity: 0, y: -8 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="reveal-motion"
          >
            {contentChildren}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </details>
  );
};

const Section = ({
  title,
  subtitle,
  children,
  defaultOpen = false,
  icon,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  icon?: ReactNode;
}) => (
  <Details
    className="card group p-0 border-dashed border-sky-200"
    defaultOpen={defaultOpen}
  >
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
      <div className="flex items-center gap-2">
        {icon ? <span className="text-zinc-400">{icon}</span> : null}
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">
            {title}
          </h2>
          {subtitle ? (
            <p className="text-xs text-zinc-500">{subtitle}</p>
          ) : null}
        </div>
      </div>
      <ChevronDownIcon className="size-4 text-zinc-500 transition-transform group-open:rotate-180" />
    </summary>
    <div className="border-t border-zinc-200/70 px-4 pb-4 pt-3">
      {children}
    </div>
  </Details>
);

const Spinner = ({ className = "h-3.5 w-3.5" }: { className?: string }) => (
  <span
    className={`inline-block rounded-full border-2 border-current border-t-transparent animate-spin ${className}`}
    aria-hidden
  />
);

export default function AdminClient({
  role,
  activeOrg,
  users,
  afipStatus,
  arcaStatus,
  paymentMethods: initialPaymentMethods,
  accounts: initialAccounts,
  currencies,
  priceLists: initialPriceLists,
}: AdminClientProps) {
  const router = useRouter();
  const isSalesLimitedAdmin = role === "SALES";
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [userRole, setUserRole] = useState<
    (typeof USER_MANAGEMENT_ROLE_OPTIONS)[number]
  >("SALES");
  const [userPassword, setUserPassword] = useState("");
  const [userStatus, setUserStatus] = useState<string | null>(null);
  const [isUserSubmitting, setIsUserSubmitting] = useState(false);
  const [userUpdating, setUserUpdating] = useState<Record<string, boolean>>({});
  const [userUpdateStatus, setUserUpdateStatus] = useState<
    Record<string, string>
  >({});
  const [afipPointOfSale, setAfipPointOfSale] = useState("1");
  const [afipVoucherType, setAfipVoucherType] = useState("6");
  const [afipResult, setAfipResult] = useState<string | null>(null);
  const [isAfipChecking, setIsAfipChecking] = useState(false);
  const [afipSalesPoints, setAfipSalesPoints] = useState<number[]>([]);
  const [afipSalesPointsStatus, setAfipSalesPointsStatus] = useState<string | null>(
    null,
  );
  const [isAfipSalesPointsLoading, setIsAfipSalesPointsLoading] = useState(false);
  const [isAfipDefaultPosSaving, setIsAfipDefaultPosSaving] = useState(false);
  const [arcaConfig, setArcaConfig] = useState(arcaStatus.config);
  const [arcaJob, setArcaJob] = useState(arcaStatus.job);
  const [arcaJobInfo, setArcaJobInfo] = useState(arcaStatus.jobInfo ?? null);
  const [arcaSecretsValid, setArcaSecretsValid] = useState(
    arcaStatus.secretsKeyValid,
  );
  const [arcaStatusMessage, setArcaStatusMessage] = useState<string | null>(
    null,
  );
  const [arcaTaxIdRepresentado, setArcaTaxIdRepresentado] = useState(
    arcaStatus.config?.taxIdRepresentado ?? "",
  );
  const [arcaTaxIdLogin, setArcaTaxIdLogin] = useState(
    arcaStatus.config?.taxIdLogin ?? "",
  );
  const [arcaAlias, setArcaAlias] = useState(arcaStatus.config?.alias ?? "");
  const [arcaServices, setArcaServices] = useState<string[]>(
    normalizeArcaServices(
      arcaStatus.config?.authorizedServices ?? arcaStatus.job?.services ?? ["wsfe"]
    )
  );
  const [arcaPassword, setArcaPassword] = useState("");
  const [arcaResumePassword, setArcaResumePassword] = useState("");
  const [arcaRotatePassword, setArcaRotatePassword] = useState("");
  const [isArcaSubmitting, setIsArcaSubmitting] = useState(false);
  const [isArcaRefreshing, setIsArcaRefreshing] = useState(false);
  const [isArcaRotating, setIsArcaRotating] = useState(false);
  const [rate, setRate] = useState("");
  const [history, setHistory] = useState<ExchangeRate[]>([]);
  const [rateStatus, setRateStatus] = useState<string | null>(null);
  const [isRateSubmitting, setIsRateSubmitting] = useState(false);
  const [dolarBlue, setDolarBlue] = useState<DolarBlueRate | null>(null);
  const [dolarOfficial, setDolarOfficial] = useState<DolarOfficialRate | null>(
    null
  );
  const [marketRatesStatus, setMarketRatesStatus] = useState<string | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>(
    initialPaymentMethods
  );
  const [accounts, setAccounts] = useState<AccountRow[]>(initialAccounts);
  const [priceLists, setPriceLists] = useState<PriceListRow[]>(
    initialPriceLists,
  );
  const defaultCurrencyCode =
    currencies.find((currency) => currency.isDefault)?.code ??
    currencies[0]?.code ??
    "ARS";
  const [newMethod, setNewMethod] = useState({
    name: "",
    type: "CASH" as PaymentMethodRow["type"],
    requiresAccount: false,
    isActive: true,
  });
  const [newAccount, setNewAccount] = useState({
    name: "",
    type: "CASH" as AccountRow["type"],
    currencyCode: defaultCurrencyCode,
    isActive: true,
  });
  const [methodsStatus, setMethodsStatus] = useState<string | null>(null);
  const [accountsStatus, setAccountsStatus] = useState<string | null>(null);
  const [isMethodsSubmitting, setIsMethodsSubmitting] = useState(false);
  const [isAccountsSubmitting, setIsAccountsSubmitting] = useState(false);
  const [isPriceListSubmitting, setIsPriceListSubmitting] = useState(false);
  const [methodBusyId, setMethodBusyId] = useState<string | null>(null);
  const [accountBusyId, setAccountBusyId] = useState<string | null>(null);
  const [priceListsStatus, setPriceListsStatus] = useState<string | null>(null);
  const [priceListBusyId, setPriceListBusyId] = useState<string | null>(null);
  const [adjustStockOnQuoteConfirm, setAdjustStockOnQuoteConfirm] = useState(
    activeOrg.adjustStockOnQuoteConfirm,
  );
  const [salesSettingsStatus, setSalesSettingsStatus] = useState<string | null>(
    null,
  );
  const [isSalesSettingsSaving, setIsSalesSettingsSaving] = useState(false);
  const [editingPriceListId, setEditingPriceListId] = useState<string | null>(
    null,
  );
  const [editingPriceList, setEditingPriceList] = useState({
    name: "",
    currencyCode: defaultCurrencyCode,
    isDefault: false,
    isConsumerFinal: false,
    sortOrder: "",
  });
  const [newPriceList, setNewPriceList] = useState({
    name: "",
    currencyCode: defaultCurrencyCode,
    isDefault: false,
    isConsumerFinal: false,
    sortOrder: "",
  });
  const afipReady = Boolean(afipStatus.ok && afipStatus.clientReady);
  const afipMissingItems = getAfipMissingItems(afipStatus.missing);
  const afipOptionalItems = getAfipMissingItems(afipStatus.missingOptional);
  const afipRequiredSummary = summarizeAfipMissing(afipStatus.missing);
  const afipOptionalSummary = summarizeAfipMissing(afipStatus.missingOptional);
  const afipHint = afipReady
    ? "Conexion ARCA activa"
    : afipStatus.ok
      ? afipOptionalSummary || "Cliente ARCA no disponible"
      : afipRequiredSummary || afipOptionalSummary || "Configuracion pendiente";

  const arcaConfigStatus = arcaConfig?.status ?? "SIN_CONFIG";
  const arcaConfigLabel =
    ARCA_CONFIG_LABELS[arcaConfigStatus] ?? arcaConfigStatus;
  const arcaProcessLabel = arcaJob
    ? (ARCA_PROCESS_LABELS[arcaJob.status] ?? arcaJob.status)
    : null;
  const arcaStepLabel = arcaJob?.step
    ? (ARCA_STEP_LABELS[arcaJob.step] ?? arcaJob.step)
    : null;
  const arcaNeedsSetup =
    !arcaConfig ||
    arcaConfigStatus === "ERROR" ||
    arcaConfigStatus === "PENDING";
  const arcaConfigClass =
    arcaConfigStatus === "CONNECTED"
      ? "bg-white text-emerald-800 border border-emerald-200"
      : arcaConfigStatus === "ERROR"
        ? "bg-white text-rose-800 border border-rose-200"
        : "bg-white text-amber-800 border border-amber-200";
  const arcaJobClass = arcaJob?.status
    ? arcaJob.status === "COMPLETED"
      ? "bg-white text-emerald-800 border border-emerald-200"
      : arcaJob.status === "ERROR"
        ? "bg-white text-rose-800 border border-rose-200"
        : "bg-white text-amber-800 border border-amber-200"
    : "bg-zinc-100/25 text-zinc-700 border border-zinc-200/70";
  const arcaStepIndex = arcaJob?.step
    ? ARCA_STEP_ORDER.findIndex((step) => step === arcaJob.step)
    : -1;
  const arcaActionLocked =
    isArcaSubmitting || isArcaRefreshing || isArcaRotating;
  const arcaActivityMessage = isArcaRefreshing
    ? "Actualizando estado de conexion..."
    : isArcaRotating
      ? "Renovando certificado en ARCA..."
      : isArcaSubmitting
        ? "Enviando solicitud a ARCA..."
        : arcaJob?.status === "RUNNING"
          ? "ARCA esta procesando la solicitud..."
          : arcaJob?.status === "WAITING"
            ? "ARCA sigue procesando la solicitud. Reintenta en unos segundos."
            : null;
  const arcaMainMessage =
    arcaStatusMessage ??
    arcaJobInfo?.statusMessage ??
    "Completa los datos y conecta ARCA para emitir comprobantes.";
  const afipStatusClass = afipReady
    ? "bg-white text-emerald-800 border border-emerald-200"
    : "bg-white text-rose-800 border border-rose-200";
  const defaultPointOfSale =
    typeof arcaConfig?.defaultPointOfSale === "number" &&
    Number.isFinite(arcaConfig.defaultPointOfSale) &&
    arcaConfig.defaultPointOfSale > 0
      ? Math.trunc(arcaConfig.defaultPointOfSale)
      : null;
  const selectedPointRaw = Number(afipPointOfSale);
  const selectedPoint =
    Number.isFinite(selectedPointRaw) && selectedPointRaw > 0
      ? Math.trunc(selectedPointRaw)
      : null;
  const selectedPointAvailable =
    selectedPoint !== null && afipSalesPoints.includes(selectedPoint);
  const defaultPointAvailable =
    defaultPointOfSale !== null && afipSalesPoints.includes(defaultPointOfSale);
  const suggestedPoint = afipSalesPoints[0] ?? null;

  const formatDate = (value?: string | null) =>
    value ? new Date(value).toLocaleString("es-AR") : "-";
  const helpLinkClass = (label: string) => {
    const normalized = label.toLowerCase();
    if (normalized.includes("token")) return "btn-sky";
    if (normalized.includes("certificado")) return "btn-amber";
    if (normalized.includes("autorizar")) return "btn-indigo";
    if (normalized.includes("punto de venta")) return "btn-emerald";
    return "";
  };

  const loadRateHistory = async () => {
    const res = await fetch("/api/config/exchange-rate", {
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as ExchangeRate[];
      setHistory(data);
    }
  };

  const loadMarketRates = async () => {
    setMarketRatesStatus(null);
    try {
      const res = await fetch("/api/market/dolar-hoy", { cache: "no-store" });
      if (!res.ok) {
        setDolarBlue(null);
        setDolarOfficial(null);
        setMarketRatesStatus("No se pudieron cargar cotizaciones de mercado");
        return;
      }
      const data = (await res.json()) as MarketRatesResponse;
      setDolarBlue(data.blue ?? null);
      setDolarOfficial(data.official ?? null);
      if (!data.blue && !data.official) {
        setMarketRatesStatus("No se encontraron cotizaciones disponibles");
      }
    } catch {
      setDolarBlue(null);
      setDolarOfficial(null);
      setMarketRatesStatus("No se pudieron cargar cotizaciones de mercado");
    }
  };

  const loadPaymentMethods = async () => {
    const res = await fetch("/api/payment-methods", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as PaymentMethodRow[];
      setPaymentMethods(data);
    }
  };

  const loadAccounts = async () => {
    const res = await fetch("/api/accounts", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as AccountRow[];
      setAccounts(data);
    }
  };

  const loadPriceLists = async () => {
    const res = await fetch("/api/price-lists", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as PriceListRow[];
      setPriceLists(data.filter((priceList) => priceList.isActive !== false));
    }
  };

  const handleAdjustStockOnQuoteConfirm = async (enabled: boolean) => {
    if (isSalesSettingsSaving) return;
    const previous = adjustStockOnQuoteConfirm;
    setSalesSettingsStatus(null);
    setAdjustStockOnQuoteConfirm(enabled);
    setIsSalesSettingsSaving(true);
    try {
      const res = await fetch("/api/admin/organizations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adjustStockOnQuoteConfirm: enabled }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setAdjustStockOnQuoteConfirm(previous);
        setSalesSettingsStatus(data?.error ?? "No se pudo guardar configuracion");
        return;
      }

      if (typeof data?.adjustStockOnQuoteConfirm === "boolean") {
        setAdjustStockOnQuoteConfirm(data.adjustStockOnQuoteConfirm);
      }
      setSalesSettingsStatus("Configuracion guardada");
    } catch {
      setAdjustStockOnQuoteConfirm(previous);
      setSalesSettingsStatus("No se pudo guardar configuracion");
    } finally {
      setIsSalesSettingsSaving(false);
    }
  };

  const loadAfipSalesPoints = useCallback(async () => {
    setIsAfipSalesPointsLoading(true);
    setAfipSalesPointsStatus(null);
    try {
      const res = await fetch("/api/afip/sales-points", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setAfipSalesPoints([]);
        setAfipSalesPointsStatus(
          normalizeArcaMessage(
            data?.error ?? "No se pudieron cargar puntos de venta",
          ),
        );
        return;
      }

      const salesPoints = Array.isArray(data?.salesPoints)
        ? data.salesPoints
            .map((item: unknown) => Number(item))
            .filter(
              (item: number): item is number =>
                Number.isFinite(item) && item > 0
            )
            .map((item: number) => Math.trunc(item))
            .sort((a: number, b: number) => a - b)
        : [];

      setAfipSalesPoints(salesPoints);

      if (!salesPoints.length) {
        setAfipSalesPointsStatus(
          "ARCA no devolvio puntos de venta habilitados para este CUIT.",
        );
        return;
      }

      const preferredPoint =
        defaultPointOfSale !== null && salesPoints.includes(defaultPointOfSale)
          ? defaultPointOfSale
          : salesPoints[0];
      const fallbackPoint = String(preferredPoint);
      setAfipPointOfSale((prev) => {
        const prevNumber = Number(prev);
        if (!Number.isFinite(prevNumber) || prevNumber <= 0) return fallbackPoint;
        const normalizedPrev = Math.trunc(prevNumber);
        if (!salesPoints.includes(normalizedPrev)) return fallbackPoint;
        return String(normalizedPrev);
      });
    } catch {
      setAfipSalesPoints([]);
      setAfipSalesPointsStatus("No se pudieron cargar puntos de venta");
    } finally {
      setIsAfipSalesPointsLoading(false);
    }
  }, [defaultPointOfSale]);

  const saveDefaultPointOfSale = async (pointOfSale: number) => {
    setIsAfipDefaultPosSaving(true);
    setAfipSalesPointsStatus(null);
    try {
      const res = await fetch("/api/arca", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultPointOfSale: pointOfSale }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAfipSalesPointsStatus(
          normalizeArcaMessage(
            data?.error ?? "No se pudo guardar punto de venta por defecto",
          ),
        );
        return;
      }
      if (data?.config) {
        setArcaConfig(data.config);
      }
      setAfipPointOfSale(String(pointOfSale));
      setAfipSalesPointsStatus(`PV ${pointOfSale} guardado como predeterminado.`);
    } catch {
      setAfipSalesPointsStatus("No se pudo guardar punto de venta por defecto");
    } finally {
      setIsAfipDefaultPosSaving(false);
    }
  };

  useEffect(() => {
    loadRateHistory().catch(() => undefined);
    loadMarketRates().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (isSalesLimitedAdmin) return;
    if (arcaConfigStatus !== "CONNECTED") return;
    loadAfipSalesPoints().catch(() => undefined);
  }, [arcaConfigStatus, isSalesLimitedAdmin, loadAfipSalesPoints]);

  useEffect(() => {
    const services = normalizeArcaServices(
      arcaConfig?.authorizedServices ?? arcaJob?.services ?? ["wsfe"]
    );
    setArcaServices(services);
  }, [arcaConfig?.authorizedServices, arcaJob?.services]);

  const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUserStatus(null);
    setIsUserSubmitting(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userEmail,
          name: userName || undefined,
          role: userRole,
          password: userPassword || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setUserStatus(data?.error ?? "No se pudo crear");
        return;
      }
      setUserEmail("");
      setUserName("");
      setUserPassword("");
      setUserRole("SALES");
      setUserStatus("Usuario creado");
      router.refresh();
    } catch {
      setUserStatus("No se pudo crear");
    } finally {
      setIsUserSubmitting(false);
    }
  };

  const handleUpdateUser = async (
    event: FormEvent<HTMLFormElement>,
    userId: string,
  ) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const role = formData.get("role")?.toString();
    const passwordRaw = formData.get("password")?.toString() ?? "";
    const password = passwordRaw.trim();
    const isActive = formData.get("isActive") === "on";

    setUserUpdateStatus((prev) => ({ ...prev, [userId]: "" }));
    setUserUpdating((prev) => ({ ...prev, [userId]: true }));

    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          role,
          password: password ? password : undefined,
          isActive,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setUserUpdateStatus((prev) => ({
          ...prev,
          [userId]: data?.error ?? "No se pudo actualizar",
        }));
        return;
      }

      setUserUpdateStatus((prev) => ({
        ...prev,
        [userId]: "Usuario actualizado",
      }));
      const passwordInput = event.currentTarget.querySelector(
        'input[name="password"]',
      ) as HTMLInputElement | null;
      if (passwordInput) {
        passwordInput.value = "";
      }
      router.refresh();
    } catch {
      setUserUpdateStatus((prev) => ({
        ...prev,
        [userId]: "No se pudo actualizar",
      }));
    } finally {
      setUserUpdating((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const handleCheckAfip = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAfipResult(null);
    setIsAfipChecking(true);
    try {
      const res = await fetch(
        `/api/afip/last-voucher?pointOfSale=${encodeURIComponent(
          afipPointOfSale,
        )}&voucherType=${encodeURIComponent(afipVoucherType)}`,
      );
      const data = await res.json();
      if (!res.ok) {
        setAfipResult(
          normalizeArcaMessage(data?.error ?? "No se pudo consultar"),
        );
        return;
      }
      setAfipResult(`Ultimo comprobante: ${data.lastVoucher}`);
    } catch {
      setAfipResult("No se pudo consultar");
    } finally {
      setIsAfipChecking(false);
    }
  };

  const refreshArca = async () => {
    setIsArcaRefreshing(true);
    setArcaStatusMessage(null);
    try {
      const res = await fetch("/api/arca", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setArcaStatusMessage(
          normalizeArcaMessage(data?.error ?? "No se pudo actualizar"),
        );
        return;
      }
      setArcaConfig(data.config ?? null);
      setArcaJob(data.job ?? null);
      setArcaJobInfo(data.jobInfo ?? null);
      if (typeof data.secretsKeyValid === "boolean") {
        setArcaSecretsValid(data.secretsKeyValid);
      }
    } catch {
      setArcaStatusMessage("No se pudo actualizar");
    } finally {
      setIsArcaRefreshing(false);
    }
  };

  const toggleArcaService = (service: string) => {
    setArcaServices((prev) => {
      if (prev.includes(service)) {
        if (prev.length === 1) return prev;
        return prev.filter((item) => item !== service);
      }
      return [...prev, service];
    });
  };

  const handleArcaConnect = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setArcaStatusMessage(null);
    setIsArcaSubmitting(true);
    const selectedServices = normalizeArcaServices(arcaServices);
    if (!selectedServices.length) {
      setArcaStatusMessage("Selecciona al menos un servicio ARCA.");
      setIsArcaSubmitting(false);
      return;
    }
    try {
      const res = await fetch("/api/arca/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taxIdRepresentado: arcaTaxIdRepresentado,
          taxIdLogin: arcaTaxIdLogin,
          alias: arcaAlias,
          password: arcaPassword,
          services: selectedServices,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setArcaStatusMessage(
          normalizeArcaMessage(data?.error ?? "No se pudo conectar"),
        );
        if (data?.helpLinks) {
          setArcaJobInfo({
            statusMessage: normalizeArcaMessage(data?.error ?? "Error ARCA"),
            helpLinks: data.helpLinks,
          });
        }
        return;
      }
      setArcaJob(data.job ?? null);
      setArcaJobInfo(data.jobInfo ?? null);
      setArcaPassword("");
      await refreshArca();
    } catch {
      setArcaStatusMessage("No se pudo conectar");
    } finally {
      setIsArcaSubmitting(false);
    }
  };

  const handleArcaResume = async () => {
    if (!arcaJob) return;
    setArcaStatusMessage(null);
    setIsArcaSubmitting(true);
    try {
      const res = await fetch(`/api/arca/connect/${arcaJob.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          arcaResumePassword ? { password: arcaResumePassword } : {},
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setArcaStatusMessage(
          normalizeArcaMessage(data?.error ?? "No se pudo reintentar"),
        );
        return;
      }
      setArcaJob(data.job ?? null);
      setArcaJobInfo(data.jobInfo ?? null);
      setArcaResumePassword("");
      await refreshArca();
    } catch {
      setArcaStatusMessage("No se pudo reintentar");
    } finally {
      setIsArcaSubmitting(false);
    }
  };

  const handleArcaRotate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setArcaStatusMessage(null);
    setIsArcaRotating(true);
    const selectedServices = normalizeArcaServices(arcaServices);
    if (!selectedServices.length) {
      setArcaStatusMessage("Selecciona al menos un servicio ARCA.");
      setIsArcaRotating(false);
      return;
    }
    try {
      const res = await fetch("/api/arca/rotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: arcaRotatePassword,
          services: selectedServices,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setArcaStatusMessage(
          normalizeArcaMessage(data?.error ?? "No se pudo rotar"),
        );
        return;
      }
      setArcaJob(data.job ?? null);
      setArcaJobInfo(data.jobInfo ?? null);
      setArcaRotatePassword("");
      await refreshArca();
    } catch {
      setArcaStatusMessage("No se pudo rotar");
    } finally {
      setIsArcaRotating(false);
    }
  };

  const handleRateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRateStatus(null);
    setIsRateSubmitting(true);
    try {
      const res = await fetch("/api/config/exchange-rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseCode: "USD",
          quoteCode: "ARS",
          rate,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setRateStatus(data?.error ?? "No se pudo guardar");
        return;
      }

      const created = (await res.json()) as ExchangeRate;
      setRate("");
      setRateStatus("Cotizacion actualizada");
      notifyExchangeRateUpdated({
        baseCode: created.baseCode,
        quoteCode: created.quoteCode,
        rate: created.rate,
      });
      await loadRateHistory();
      router.refresh();
    } catch {
      setRateStatus("No se pudo guardar");
    } finally {
      setIsRateSubmitting(false);
    }
  };

  const handleCreateMethod = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMethodsStatus(null);
    setIsMethodsSubmitting(true);
    try {
      const res = await fetch("/api/payment-methods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newMethod),
      });
      if (!res.ok) {
        const data = await res.json();
        setMethodsStatus(data?.error ?? "No se pudo crear");
        return;
      }
      setNewMethod({
        name: "",
        type: "CASH",
        requiresAccount: false,
        isActive: true,
      });
      setMethodsStatus("Metodo creado");
      await loadPaymentMethods();
    } catch {
      setMethodsStatus("No se pudo crear");
    } finally {
      setIsMethodsSubmitting(false);
    }
  };

  const handleUpdateMethod = async (
    event: FormEvent<HTMLFormElement>,
    methodId: string,
  ) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setMethodsStatus(null);
    setMethodBusyId(methodId);
    try {
      const res = await fetch("/api/payment-methods", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: methodId,
          name: formData.get("name")?.toString() ?? "",
          type: formData.get("type")?.toString() ?? "OTHER",
          requiresAccount: formData.get("requiresAccount") === "on",
          isActive: formData.get("isActive") === "on",
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMethodsStatus(data?.error ?? "No se pudo actualizar");
        return;
      }
      setMethodsStatus("Metodo actualizado");
      await loadPaymentMethods();
    } catch {
      setMethodsStatus("No se pudo actualizar");
    } finally {
      setMethodBusyId(null);
    }
  };

  const handleDeleteMethod = async (methodId: string) => {
    if (!window.confirm("Eliminar metodo de pago?")) return;
    setMethodsStatus(null);
    setMethodBusyId(methodId);
    try {
      const res = await fetch(
        `/api/payment-methods?id=${encodeURIComponent(methodId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json();
        setMethodsStatus(data?.error ?? "No se pudo eliminar");
        return;
      }
      setMethodsStatus("Metodo eliminado");
      await loadPaymentMethods();
    } catch {
      setMethodsStatus("No se pudo eliminar");
    } finally {
      setMethodBusyId(null);
    }
  };

  const handleCreateAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAccountsStatus(null);
    setIsAccountsSubmitting(true);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAccount),
      });
      if (!res.ok) {
        const data = await res.json();
        setAccountsStatus(data?.error ?? "No se pudo crear");
        return;
      }
      setNewAccount({
        name: "",
        type: "CASH",
        currencyCode: defaultCurrencyCode,
        isActive: true,
      });
      setAccountsStatus("Cuenta creada");
      await loadAccounts();
    } catch {
      setAccountsStatus("No se pudo crear");
    } finally {
      setIsAccountsSubmitting(false);
    }
  };

  const handleUpdateAccount = async (
    event: FormEvent<HTMLFormElement>,
    accountId: string,
  ) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setAccountsStatus(null);
    setAccountBusyId(accountId);
    try {
      const res = await fetch("/api/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: accountId,
          name: formData.get("name")?.toString() ?? "",
          type: formData.get("type")?.toString() ?? "CASH",
          currencyCode: formData.get("currencyCode")?.toString() ?? "ARS",
          isActive: formData.get("isActive") === "on",
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setAccountsStatus(data?.error ?? "No se pudo actualizar");
        return;
      }
      setAccountsStatus("Cuenta actualizada");
      await loadAccounts();
    } catch {
      setAccountsStatus("No se pudo actualizar");
    } finally {
      setAccountBusyId(null);
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    if (!window.confirm("Eliminar cuenta?")) return;
    setAccountsStatus(null);
    setAccountBusyId(accountId);
    try {
      const res = await fetch(
        `/api/accounts?id=${encodeURIComponent(accountId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json();
        setAccountsStatus(data?.error ?? "No se pudo eliminar");
        return;
      }
      setAccountsStatus("Cuenta eliminada");
      await loadAccounts();
    } catch {
      setAccountsStatus("No se pudo eliminar");
    } finally {
      setAccountBusyId(null);
    }
  };

  const handleCreatePriceList = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPriceListsStatus(null);
    setIsPriceListSubmitting(true);
    try {
      const res = await fetch("/api/price-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newPriceList.name.trim(),
          currencyCode: newPriceList.currencyCode.trim().toUpperCase(),
          isDefault: newPriceList.isDefault,
          isConsumerFinal: newPriceList.isConsumerFinal,
          ...(newPriceList.sortOrder
            ? { sortOrder: Number(newPriceList.sortOrder) }
            : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setPriceListsStatus(data?.error ?? "No se pudo crear la lista");
        return;
      }

      setNewPriceList({
        name: "",
        currencyCode: defaultCurrencyCode,
        isDefault: false,
        isConsumerFinal: false,
        sortOrder: "",
      });
      setPriceListsStatus("Lista de precios creada");
      await loadPriceLists();
    } catch {
      setPriceListsStatus("No se pudo crear la lista");
    } finally {
      setIsPriceListSubmitting(false);
    }
  };

  const handleStartEditPriceList = (priceList: PriceListRow) => {
    setEditingPriceListId(priceList.id);
    setEditingPriceList({
      name: priceList.name,
      currencyCode: priceList.currencyCode,
      isDefault: priceList.isDefault,
      isConsumerFinal: priceList.isConsumerFinal,
      sortOrder: String(priceList.sortOrder),
    });
    setPriceListsStatus(null);
  };

  const handleCancelEditPriceList = () => {
    setEditingPriceListId(null);
    setEditingPriceList({
      name: "",
      currencyCode: defaultCurrencyCode,
      isDefault: false,
      isConsumerFinal: false,
      sortOrder: "",
    });
  };

  const handleSaveEditPriceList = async (id: string) => {
    setPriceListsStatus(null);
    setPriceListBusyId(id);
    try {
      const res = await fetch("/api/price-lists", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          name: editingPriceList.name.trim(),
          currencyCode: editingPriceList.currencyCode.trim().toUpperCase(),
          isDefault: editingPriceList.isDefault,
          isConsumerFinal: editingPriceList.isConsumerFinal,
          ...(editingPriceList.sortOrder
            ? { sortOrder: Number(editingPriceList.sortOrder) }
            : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setPriceListsStatus(data?.error ?? "No se pudo actualizar la lista");
        return;
      }

      setPriceListsStatus("Lista actualizada");
      handleCancelEditPriceList();
      await loadPriceLists();
    } catch {
      setPriceListsStatus("No se pudo actualizar la lista");
    } finally {
      setPriceListBusyId(null);
    }
  };

  const handleDeletePriceList = async (id: string) => {
    if (!window.confirm("Eliminar lista de precios?")) return;
    setPriceListsStatus(null);
    setPriceListBusyId(id);
    try {
      const res = await fetch(`/api/price-lists?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        setPriceListsStatus(data?.error ?? "No se pudo eliminar la lista");
        return;
      }

      if (editingPriceListId === id) {
        handleCancelEditPriceList();
      }
      setPriceListsStatus("Lista eliminada");
      await loadPriceLists();
    } catch {
      setPriceListsStatus("No se pudo eliminar la lista");
    } finally {
      setPriceListBusyId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">
          Administracion y configuracion
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          {isSalesLimitedAdmin
            ? "Acceso limitado: solo cotizacion y moneda."
            : "Configura moneda, integra ARCA y gestiona usuarios."}
        </p>
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {isSalesLimitedAdmin ? (
              <div className="pill border border-emerald-200 bg-white text-xs text-emerald-800">
                Perfil vendedor: acceso solo a cotizacion y moneda
              </div>
            ) : (
              <>
                <span
                  className={`text-xs ${
                    afipReady ? "text-zinc-500" : "text-rose-600"
                  }`}
                >
                  {afipHint}
                </span>
                <div className="pill glass  text-xs">
                  ARCA {afipReady ? "Listo" : "Pendiente"}
                  {afipStatus.clientReady ? " · cliente listo" : ""}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {!isSalesLimitedAdmin && STOCK_ENABLED ? (
        <Section
          title="Ventas y stock"
          subtitle="Define si las ventas confirmadas desde presupuestos descuentan stock."
          icon={<Cog6ToothIcon className="size-4" />}
        >
          <div className="rounded-2xl border border-zinc-200/70 bg-white/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Ajuste automatico en presupuestos
                </p>
                <p className="text-xs text-zinc-500">
                  Se aplica al confirmar y crear venta desde Presupuestos.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-label="Ajustar stock al confirmar venta desde presupuestos"
                aria-checked={adjustStockOnQuoteConfirm}
                onClick={() =>
                  handleAdjustStockOnQuoteConfirm(!adjustStockOnQuoteConfirm)
                }
                disabled={isSalesSettingsSaving}
                className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 disabled:opacity-60 ${
                  adjustStockOnQuoteConfirm
                    ? "border-sky-300 bg-sky-100"
                    : "border-zinc-300 bg-zinc-100"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.16)] transition-transform ${
                    adjustStockOnQuoteConfirm ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
            <p className="mt-2 text-xs text-zinc-600">
              {adjustStockOnQuoteConfirm
                ? "Estado actual: activo (descuenta stock al confirmar venta)."
                : "Estado actual: desactivado (no descuenta stock al confirmar venta)."}
              {isSalesSettingsSaving ? " Guardando..." : ""}
            </p>
            {salesSettingsStatus ? (
              <p className="mt-2 text-xs text-zinc-500">{salesSettingsStatus}</p>
            ) : null}
          </div>
        </Section>
      ) : null}

      <Section
        title="Cotizacion y moneda"
        subtitle="Actualiza la cotizacion interna y revisa Dolar blue y oficial (compra/venta)."
        icon={<CurrencyDollarIcon className="size-4" />}
      >
        <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-5 rounded-2xl border border-emerald-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                  Cotizacion USD {"->"} ARS
                </h3>
                <p className="text-xs text-zinc-500">
                  Ingreso manual usado para costos y precios.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-emerald text-xs"
                onClick={() => loadMarketRates()}
              >
                Actualizar cotizaciones
              </button>
            </div>

            <form
              onSubmit={handleRateSubmit}
              className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end"
            >
              <div>
                <label className="block text-xs uppercase tracking-wide text-zinc-500">
                  Cotizacion (ARS por USD)
                </label>
                <div className="relative mt-2">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-zinc-500">
                    $
                  </span>
                  <MoneyInput
                    className="input no-spinner w-full pl-10 text-right tabular-nums"
                    value={rate}
                    onValueChange={setRate}
                    placeholder="0,00"
                    maxDecimals={2}
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                className="btn btn-emerald"
                disabled={isRateSubmitting}
              >
                {isRateSubmitting ? "Guardando..." : "Guardar"}
              </button>
            </form>
            {rateStatus ? (
              <p className="text-xs text-emerald-700/90">
                {rateStatus}
              </p>
            ) : null}

            <div className="rounded-2xl border border-indigo-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-indigo-700/80">
                    Dolar blue (referencia)
                  </p>
                  <p className="text-xs text-zinc-500">Compra / Venta</p>
                  {dolarBlue?.source ? (
                    <p className="text-xs text-zinc-500">
                      Fuente: {dolarBlue.source}
                    </p>
                  ) : null}
                </div>
                {dolarBlue?.updatedAt ? (
                  <span className="text-xs text-zinc-500">
                    {new Date(dolarBlue.updatedAt).toLocaleString("es-AR")}
                  </span>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-sm text-zinc-600">
                <div>
                  Compra:{" "}
                  <span className="font-semibold text-zinc-900">
                    {dolarBlue ? formatCurrencyARS(dolarBlue.buy) : "Sin dato"}
                  </span>
                </div>
                <div>
                  Venta:{" "}
                  <span className="font-semibold text-zinc-900">
                    {dolarBlue ? formatCurrencyARS(dolarBlue.sell) : "Sin dato"}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-cyan-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-cyan-700/80">
                    Dolar oficial (referencia)
                  </p>
                  <p className="text-xs text-zinc-500">Compra / Venta</p>
                  {dolarOfficial?.source ? (
                    <p className="text-xs text-zinc-500">
                      Fuente: {dolarOfficial.source}
                    </p>
                  ) : null}
                </div>
                {dolarOfficial?.updatedAt ? (
                  <span className="text-xs text-zinc-500">
                    {new Date(dolarOfficial.updatedAt).toLocaleString("es-AR")}
                  </span>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-sm text-zinc-600">
                <div>
                  Compra:{" "}
                  <span className="font-semibold text-zinc-900">
                    {dolarOfficial ? formatCurrencyARS(dolarOfficial.buy) : "Sin dato"}
                  </span>
                </div>
                <div>
                  Venta:{" "}
                  <span className="font-semibold text-zinc-900">
                    {dolarOfficial ? formatCurrencyARS(dolarOfficial.sell) : "Sin dato"}
                  </span>
                </div>
              </div>
              {marketRatesStatus ? (
                <p className="mt-2 text-xs text-zinc-500">{marketRatesStatus}</p>
              ) : null}
            </div>
          </div>

          <Details className="rounded-2xl border border-sky-200 bg-white p-0 group border-dashed border-sky-200">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <div className="flex items-center gap-2">
                <DocumentTextIcon className="size-4 text-zinc-400" />
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                    Historial reciente
                  </p>
                  <p className="text-xs text-zinc-500">
                    {history.length} registros
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-500 group-open:hidden">
                  Mostrar
                </span>
                <span className="hidden text-[10px] text-zinc-500 group-open:inline">
                  Ocultar
                </span>
                <ChevronDownIcon className="size-4 text-zinc-500 transition-transform group-open:rotate-180" />
              </div>
            </summary>
            <div className="border-t border-sky-200 px-4 pb-5 pt-4">
              <div className="table-scroll">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="py-2 pr-4">Fecha</th>
                      <th className="py-2 pr-4">Base</th>
                      <th className="py-2 pr-4 text-right">Cotizacion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.length ? (
                      history.map((item) => (
                        <tr
                          key={item.id}
                          className="border-t border-zinc-200/60"
                        >
                          <td className="py-2 pr-4 text-zinc-600">
                            {new Date(item.asOf).toLocaleString("es-AR")}
                          </td>
                          <td className="py-2 pr-4 text-zinc-900">
                            {item.baseCode}/{item.quoteCode}
                          </td>
                          <td className="py-2 pr-4 text-right text-zinc-900">
                            {formatCurrencyARS(item.rate)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="py-3 text-sm text-zinc-500" colSpan={3}>
                          Sin registros por ahora.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </Details>
        </div>
      </Section>

      {!isSalesLimitedAdmin ? (
        <>
          <Section
            title="Listas de precios"
            subtitle="Administra listas para clientes y productos."
            icon={<DocumentTextIcon className="size-4" />}
          >
        <div className="space-y-5">
          <form
            onSubmit={handleCreatePriceList}
            className="flex flex-wrap items-end gap-3"
          >
            <label className="flex w-full flex-col gap-2 text-xs text-zinc-500 sm:w-72">
              Nombre
              <input
                className="input text-sm"
                value={newPriceList.name}
                onChange={(event) =>
                  setNewPriceList((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
                placeholder="Ej: Responsable inscripto"
                required
              />
            </label>
            <label className="flex w-full flex-col gap-2 text-xs text-zinc-500 sm:w-36">
              Moneda
              <select
                className="input cursor-pointer text-sm"
                value={newPriceList.currencyCode}
                onChange={(event) =>
                  setNewPriceList((prev) => ({
                    ...prev,
                    currencyCode: event.target.value,
                  }))
                }
              >
                {currencies.map((currency) => (
                  <option key={currency.id} value={currency.code}>
                    {currency.code}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex w-full flex-col gap-2 text-xs text-zinc-500 sm:w-28">
              Posicion
              <input
                className="input text-sm"
                value={newPriceList.sortOrder}
                inputMode="numeric"
                onChange={(event) =>
                  setNewPriceList((prev) => ({
                    ...prev,
                    sortOrder: normalizeIntegerInput(event.target.value),
                  }))
                }
                placeholder="Auto"
              />
            </label>
            <label className="flex items-center gap-2 pb-2 text-xs text-zinc-600">
              <input
                type="checkbox"
                checked={newPriceList.isDefault}
                onChange={(event) =>
                  setNewPriceList((prev) => ({
                    ...prev,
                    isDefault: event.target.checked,
                  }))
                }
              />
              Marcar como Default
            </label>
            <label className="flex items-center gap-2 pb-2 text-xs text-zinc-600">
              <input
                type="checkbox"
                checked={newPriceList.isConsumerFinal}
                onChange={(event) =>
                  setNewPriceList((prev) => ({
                    ...prev,
                    isConsumerFinal: event.target.checked,
                  }))
                }
              />
              Consumidor final (sin identificar)
            </label>
            <button
              type="submit"
              className="btn btn-emerald"
              disabled={isPriceListSubmitting}
            >
              {isPriceListSubmitting ? "Guardando..." : "Crear lista"}
            </button>
          </form>

          {priceListsStatus ? (
            <p className="text-xs text-zinc-500">{priceListsStatus}</p>
          ) : null}

          <div className="table-scroll">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="py-2 pr-4">Lista</th>
                  <th className="py-2 pr-4">Moneda</th>
                  <th className="py-2 pr-4">Posicion</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2 pr-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {priceLists.length ? (
                  priceLists.map((priceList) => {
                    const isEditing = editingPriceListId === priceList.id;
                    const isBusy = priceListBusyId === priceList.id;
                    return (
                      <tr
                        key={priceList.id}
                        className="border-t border-zinc-200/60"
                      >
                        <td className="py-2 pr-4 text-zinc-900">
                          {isEditing ? (
                            <input
                              className="input h-9 text-sm"
                              value={editingPriceList.name}
                              onChange={(event) =>
                                setEditingPriceList((prev) => ({
                                  ...prev,
                                  name: event.target.value,
                                }))
                              }
                              placeholder="Nombre de lista"
                            />
                          ) : (
                            priceList.name
                          )}
                        </td>
                        <td className="py-2 pr-4 text-zinc-700">
                          {isEditing ? (
                            <select
                              className="input h-9 cursor-pointer text-sm"
                              value={editingPriceList.currencyCode}
                              onChange={(event) =>
                                setEditingPriceList((prev) => ({
                                  ...prev,
                                  currencyCode: event.target.value,
                                }))
                              }
                            >
                              {currencies.map((currency) => (
                                <option key={currency.id} value={currency.code}>
                                  {currency.code}
                                </option>
                              ))}
                            </select>
                          ) : (
                            priceList.currencyCode
                          )}
                        </td>
                        <td className="py-2 pr-4 text-zinc-700">
                          {isEditing ? (
                            <input
                              className="input h-9 w-24 text-sm tabular-nums"
                              value={editingPriceList.sortOrder}
                              inputMode="numeric"
                              onChange={(event) =>
                                setEditingPriceList((prev) => ({
                                  ...prev,
                                  sortOrder: normalizeIntegerInput(
                                    event.target.value,
                                  ),
                                }))
                              }
                              placeholder="1"
                            />
                          ) : (
                            <span className="tabular-nums">
                              {priceList.sortOrder || "-"}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-4">
                          {isEditing ? (
                            <div className="space-y-2">
                              <label className="inline-flex items-center gap-2 text-xs text-zinc-600">
                                <input
                                  type="checkbox"
                                  checked={editingPriceList.isDefault}
                                  onChange={(event) =>
                                    setEditingPriceList((prev) => ({
                                      ...prev,
                                      isDefault: event.target.checked,
                                    }))
                                  }
                                />
                                Default
                              </label>
                              <label className="inline-flex items-center gap-2 text-xs text-zinc-600">
                                <input
                                  type="checkbox"
                                  checked={editingPriceList.isConsumerFinal}
                                  onChange={(event) =>
                                    setEditingPriceList((prev) => ({
                                      ...prev,
                                      isConsumerFinal: event.target.checked,
                                    }))
                                  }
                                />
                                Consumidor final
                              </label>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`pill border px-2 py-1 text-[10px] font-semibold uppercase ${
                                  priceList.isDefault
                                    ? "border-emerald-200 bg-white text-emerald-800"
                                    : "border-zinc-200 bg-white text-zinc-700"
                                }`}
                              >
                                {priceList.isDefault ? "Default" : "Activa"}
                              </span>
                              {priceList.isConsumerFinal ? (
                                <span className="pill border border-sky-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase text-sky-800">
                                  Consumidor final
                                </span>
                              ) : null}
                            </div>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          <div className="inline-flex items-center gap-2">
                            {isEditing ? (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-emerald text-xs"
                                  onClick={() => handleSaveEditPriceList(priceList.id)}
                                  disabled={isBusy || !editingPriceList.name.trim()}
                                >
                                  {isBusy ? "Guardando..." : "Guardar"}
                                </button>
                                <button
                                  type="button"
                                  className="btn text-xs"
                                  onClick={handleCancelEditPriceList}
                                  disabled={isBusy}
                                >
                                  Cancelar
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="btn text-xs"
                                  onClick={() => handleStartEditPriceList(priceList)}
                                  disabled={Boolean(priceListBusyId)}
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-rose text-xs"
                                  onClick={() => handleDeletePriceList(priceList.id)}
                                  disabled={Boolean(priceListBusyId)}
                                >
                                  {isBusy ? "Eliminando..." : "Eliminar"}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="py-3 text-sm text-zinc-500" colSpan={5}>
                      Sin listas por ahora.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
          </Section>

          <Section
            title="Metodos de pago"
            subtitle="Configura medios de cobro y su estado."
            icon={<CurrencyDollarIcon className="size-4" />}
          >
        <div className="space-y-5">
          <form onSubmit={handleCreateMethod} className="flex flex-wrap items-end gap-3">
            <label className="flex w-full flex-col gap-2 text-xs text-zinc-500 sm:w-56">
              Nombre
              <input
                className="input"
                value={newMethod.name}
                onChange={(event) =>
                  setNewMethod((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="Ej: Efectivo"
                required
              />
            </label>
            <label className="flex w-full flex-col gap-2 text-xs text-zinc-500 sm:w-40">
              Tipo
              <select
                className="input"
                value={newMethod.type}
                onChange={(event) =>
                  setNewMethod((prev) => ({
                    ...prev,
                    type: event.target.value as PaymentMethodRow["type"],
                  }))
                }
              >
                {Object.entries(PAYMENT_METHOD_TYPE_LABELS).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-zinc-500">
              <input
                type="checkbox"
                checked={newMethod.requiresAccount}
                onChange={(event) =>
                  setNewMethod((prev) => ({
                    ...prev,
                    requiresAccount: event.target.checked,
                  }))
                }
              />
              Requiere cuenta
            </label>
            <label className="flex items-center gap-2 text-xs text-zinc-500">
              <input
                type="checkbox"
                checked={newMethod.isActive}
                onChange={(event) =>
                  setNewMethod((prev) => ({
                    ...prev,
                    isActive: event.target.checked,
                  }))
                }
              />
              Activo
            </label>
            <button
              type="submit"
              className="btn btn-sky"
              disabled={isMethodsSubmitting}
            >
              {isMethodsSubmitting ? "Creando..." : "Crear"}
            </button>
          </form>
          {methodsStatus ? (
            <p className="text-xs text-zinc-500">{methodsStatus}</p>
          ) : null}

          <div className="space-y-3">
            {paymentMethods.length ? (
              paymentMethods.map((method) => (
                <form
                  key={method.id}
                  onSubmit={(event) => handleUpdateMethod(event, method.id)}
                  className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200/70 bg-white/40 p-3"
                >
                  <label className="flex w-full flex-col gap-2 text-xs text-zinc-500 sm:w-56">
                    Nombre
                    <input
                      name="name"
                      className="input"
                      defaultValue={method.name}
                      required
                    />
                  </label>
                  <label className="flex w-full flex-col gap-2 text-xs text-zinc-500 sm:w-40">
                    Tipo
                    <select name="type" className="input" defaultValue={method.type}>
                      {Object.entries(PAYMENT_METHOD_TYPE_LABELS).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-zinc-500">
                    <input
                      type="checkbox"
                      name="requiresAccount"
                      defaultChecked={method.requiresAccount}
                    />
                    Requiere cuenta
                  </label>
                  <label className="flex items-center gap-2 text-xs text-zinc-500">
                    <input
                      type="checkbox"
                      name="isActive"
                      defaultChecked={method.isActive}
                    />
                    Activo
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      className="btn btn-sky text-xs"
                      disabled={methodBusyId === method.id}
                    >
                      {methodBusyId === method.id ? "Guardando..." : "Guardar"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-rose text-xs"
                      disabled={methodBusyId === method.id}
                      onClick={() => handleDeleteMethod(method.id)}
                    >
                      Eliminar
                    </button>
                  </div>
                </form>
              ))
            ) : (
              <p className="text-xs text-zinc-500">Sin metodos por ahora.</p>
            )}
          </div>
        </div>
          </Section>

          <Section
            title="Cuentas"
            subtitle="Cuentas operativas en ARS/USD."
            icon={<BuildingOffice2Icon className="size-4" />}
          >
        <div className="space-y-5">
          <form onSubmit={handleCreateAccount} className="flex flex-wrap items-end gap-3">
            <label className="flex w-full flex-col gap-2 text-xs text-zinc-500 sm:w-56">
              Nombre
              <input
                className="input"
                value={newAccount.name}
                onChange={(event) =>
                  setNewAccount((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="Ej: Caja ARS"
                required
              />
            </label>
            <label className="flex w-full flex-col gap-2 text-xs text-zinc-500 sm:w-40">
              Tipo
              <select
                className="input"
                value={newAccount.type}
                onChange={(event) =>
                  setNewAccount((prev) => ({
                    ...prev,
                    type: event.target.value as AccountRow["type"],
                  }))
                }
              >
                {Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex w-full flex-col gap-2 text-xs text-zinc-500 sm:w-28">
              Moneda
              <select
                className="input"
                value={newAccount.currencyCode}
                onChange={(event) =>
                  setNewAccount((prev) => ({
                    ...prev,
                    currencyCode: event.target.value,
                  }))
                }
              >
                {currencies.map((currency) => (
                  <option key={currency.id} value={currency.code}>
                    {currency.code}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-zinc-500">
              <input
                type="checkbox"
                checked={newAccount.isActive}
                onChange={(event) =>
                  setNewAccount((prev) => ({
                    ...prev,
                    isActive: event.target.checked,
                  }))
                }
              />
              Activa
            </label>
            <button
              type="submit"
              className="btn btn-sky"
              disabled={isAccountsSubmitting}
            >
              {isAccountsSubmitting ? "Creando..." : "Crear"}
            </button>
          </form>
          {accountsStatus ? (
            <p className="text-xs text-zinc-500">{accountsStatus}</p>
          ) : null}

          <div className="space-y-3">
            {accounts.length ? (
              accounts.map((account) => (
                <form
                  key={account.id}
                  onSubmit={(event) => handleUpdateAccount(event, account.id)}
                  className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200/70 bg-white/40 p-3"
                >
                  <label className="flex w-full flex-col gap-2 text-xs text-zinc-500 sm:w-56">
                    Nombre
                    <input
                      name="name"
                      className="input"
                      defaultValue={account.name}
                      required
                    />
                  </label>
                  <label className="flex w-full flex-col gap-2 text-xs text-zinc-500 sm:w-40">
                    Tipo
                    <select name="type" className="input" defaultValue={account.type}>
                      {Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex w-full flex-col gap-2 text-xs text-zinc-500 sm:w-28">
                    Moneda
                    <select
                      name="currencyCode"
                      className="input"
                      defaultValue={account.currencyCode}
                    >
                      {currencies.map((currency) => (
                        <option key={currency.id} value={currency.code}>
                          {currency.code}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-zinc-500">
                    <input
                      type="checkbox"
                      name="isActive"
                      defaultChecked={account.isActive}
                    />
                    Activa
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      className="btn btn-sky text-xs"
                      disabled={accountBusyId === account.id}
                    >
                      {accountBusyId === account.id ? "Guardando..." : "Guardar"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-rose text-xs"
                      disabled={accountBusyId === account.id}
                      onClick={() => handleDeleteAccount(account.id)}
                    >
                      Eliminar
                    </button>
                  </div>
                </form>
              ))
            ) : (
              <p className="text-xs text-zinc-500">Sin cuentas por ahora.</p>
            )}
          </div>
        </div>
          </Section>

          <Section
            title="ARCA (prueba basica)"
            subtitle="Consulta el ultimo comprobante emitido (wsfe)."
            icon={<DocumentTextIcon className="size-4" />}
          >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Estado
              </p>
              <p className="text-sm font-semibold text-zinc-900">
                {afipReady ? "Conectado" : "Pendiente"}
              </p>
              <p className="text-xs text-zinc-500">{afipHint}</p>
            </div>
            <span
              className={`pill text-[9px] px-1.5 py-0.5 font-semibold ${afipStatusClass}`}
            >
              {afipReady ? "Listo" : "Pendiente"}
            </span>
          </div>

          <div className="rounded-2xl border border-zinc-200/70 bg-white/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Puntos de venta ARCA
                </p>
                <p className="text-xs text-zinc-500">
                  Disponibles para el CUIT representado.
                </p>
              </div>
              <button
                type="button"
                className="btn text-xs"
                onClick={() => loadAfipSalesPoints().catch(() => undefined)}
                disabled={
                  isAfipSalesPointsLoading || isAfipDefaultPosSaving || !afipReady
                }
              >
                {isAfipSalesPointsLoading ? (
                  <>
                    <Spinner />
                    Cargando...
                  </>
                ) : (
                  "Actualizar puntos"
                )}
              </button>
            </div>

            {afipSalesPointsStatus ? (
              <p className="mt-2 text-xs text-zinc-500">{afipSalesPointsStatus}</p>
            ) : null}

            {afipSalesPoints.length ? (
              <>
                <div className="mt-2 flex flex-wrap gap-2">
                  {afipSalesPoints.map((point) => {
                    const selected = selectedPoint === point;
                    const isDefault = defaultPointOfSale === point;
                    return (
                      <button
                        key={point}
                        type="button"
                        onClick={() => setAfipPointOfSale(String(point))}
                        className={`pill text-xs ${
                          isDefault
                            ? "bg-white text-emerald-800 border border-emerald-200"
                            : selected
                            ? "bg-white text-sky-800 border border-sky-200"
                            : "bg-zinc-100/25 text-zinc-700 border border-zinc-200/70"
                        }`}
                      >
                        PV {point}
                        {isDefault ? " · default" : ""}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  Predeterminado para facturar:{" "}
                  {defaultPointOfSale !== null ? `PV ${defaultPointOfSale}` : "-"}
                  {defaultPointOfSale !== null
                    ? defaultPointAvailable
                      ? " (habilitado)"
                      : " (fuera de la lista actual)"
                    : ""}
                  {suggestedPoint !== null ? ` · Sugerido por ARCA: PV ${suggestedPoint}` : ""}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Seleccionado para consulta:{" "}
                  {selectedPoint !== null ? `PV ${selectedPoint}` : "-"}
                  {selectedPoint !== null
                    ? selectedPointAvailable
                      ? " (habilitado)"
                      : " (fuera de la lista actual)"
                    : ""}
                </p>
                {selectedPointAvailable && selectedPoint !== defaultPointOfSale ? (
                  <div className="mt-2">
                    <button
                      type="button"
                      className="btn btn-emerald text-xs"
                      onClick={() => saveDefaultPointOfSale(selectedPoint)}
                      disabled={isAfipDefaultPosSaving || !afipReady}
                    >
                      {isAfipDefaultPosSaving ? (
                        <>
                          <Spinner />
                          Guardando...
                        </>
                      ) : (
                        `Usar PV ${selectedPoint} por defecto`
                      )}
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          {afipMissingItems.length ||
          afipOptionalItems.length ||
          afipStatus.helpLinks?.length ? (
            <Details className="rounded-2xl border border-zinc-200/70 bg-white/40 p-0 group border-dashed border-sky-200">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <div className="flex items-center gap-2">
                  <InformationCircleIcon className="size-4 text-zinc-400" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Requisitos y ayuda
                    </p>
                    <p className="text-xs text-zinc-500">
                      Ver pendientes y enlaces utiles.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500 group-open:hidden">
                    Mostrar
                  </span>
                  <span className="hidden text-[10px] text-zinc-500 group-open:inline">
                    Ocultar
                  </span>
                  <ChevronDownIcon className="size-4 text-zinc-500 transition-transform group-open:rotate-180" />
                </div>
              </summary>
              <div className="border-t border-zinc-200/70 px-4 pb-5 pt-4">
                <div className="space-y-4">
                  {afipMissingItems.length ? (
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Pendientes
                        </p>
                        <span className="pill text-[9px] px-1.5 py-0.5 font-semibold bg-white text-rose-800 border border-rose-200">
                          {afipMissingItems.length}
                        </span>
                      </div>
                      <ul className="mt-2 space-y-2 text-xs text-zinc-600">
                        {afipMissingItems.map((item) => (
                          <li
                            key={item.key}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <span className="pill text-[10px] px-2 py-0.5 font-semibold bg-white text-rose-800 border border-rose-200">
                              {item.title}
                            </span>
                            {item.description ? (
                              <span className="text-zinc-500">
                                {item.description}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {afipOptionalItems.length ? (
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Opcional
                        </p>
                        <span className="pill text-[9px] px-1.5 py-0.5 font-semibold bg-white text-amber-800 border border-amber-200">
                          {afipOptionalItems.length}
                        </span>
                      </div>
                      <ul className="mt-2 space-y-2 text-xs text-zinc-600">
                        {afipOptionalItems.map((item) => (
                          <li
                            key={item.key}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <span className="pill text-[10px] px-2 py-0.5 font-semibold bg-white text-amber-800 border border-amber-200">
                              {item.title}
                            </span>
                            {item.description ? (
                              <span className="text-zinc-500">
                                {item.description}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {afipStatus.helpLinks?.length ? (
                    <div className="flex flex-wrap gap-3">
                      {afipStatus.helpLinks.map((link) => (
                        <a
                          key={link.url}
                          className={`btn text-xs ${helpLinkClass(link.label)}`}
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {link.label}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </Details>
          ) : null}

          <Details className="rounded-2xl border border-zinc-200/70 bg-white/40 p-0 group border-dashed border-sky-200">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <div className="flex items-center gap-2">
                <DocumentTextIcon className="size-4 text-zinc-400" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Prueba basica
                  </p>
                  <p className="text-xs text-zinc-500">
                    Consultar ultimo comprobante.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-500 group-open:hidden">
                  Mostrar
                </span>
                <span className="hidden text-[10px] text-zinc-500 group-open:inline">
                  Ocultar
                </span>
                <ChevronDownIcon className="size-4 text-zinc-500 transition-transform group-open:rotate-180" />
              </div>
            </summary>
            <div className="border-t border-zinc-200/70 px-4 pb-4 pt-3">
              <form
                onSubmit={handleCheckAfip}
                className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
              >
                <label className="flex flex-col gap-2 text-xs text-zinc-500">
                  Punto de venta
                  <input
                    className="input no-spinner text-right tabular-nums"
                    value={afipPointOfSale}
                    onChange={(event) =>
                      setAfipPointOfSale(
                        normalizeIntegerInput(event.target.value),
                      )
                    }
                    placeholder="1"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs text-zinc-500">
                  Tipo comprobante
                  <input
                    className="input no-spinner text-right tabular-nums"
                    value={afipVoucherType}
                    onChange={(event) =>
                      setAfipVoucherType(
                        normalizeIntegerInput(event.target.value),
                      )
                    }
                    placeholder="6"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                  />
                </label>
                <button
                  type="submit"
                  className="btn btn-sky sm:mt-4"
                  disabled={isAfipChecking}
                >
                  {isAfipChecking ? "Consultando..." : "Consultar"}
                </button>
              </form>
              {afipResult ? (
                <p className="mt-2 text-xs text-zinc-500">{afipResult}</p>
              ) : null}
            </div>
          </Details>
        </div>
          </Section>

          <Section
            title="Conexion ARCA"
            subtitle="Conecta ARCA paso a paso para generar certificado y autorizar servicios."
            icon={<Cog6ToothIcon className="size-4" />}
          >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Estado general
              </p>
              <p className="text-sm font-semibold text-zinc-900">
                {arcaConfigLabel}
              </p>
            </div>
            <button
              type="button"
              className="btn text-xs"
              onClick={refreshArca}
              disabled={arcaActionLocked}
            >
              {isArcaRefreshing ? (
                <>
                  <Spinner />
                  Actualizando...
                </>
              ) : (
                "Actualizar estado"
              )}
            </button>
          </div>

          {!arcaSecretsValid ? (
            <div className="rounded-2xl border border-rose-200 bg-white p-3 text-xs text-rose-700">
              Falta la clave de cifrado de ARCA para guardar certificados.
              Consultar con soporte.
            </div>
          ) : null}

          <div className="rounded-2xl border border-zinc-200/70 bg-white/40 p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span
                className={`pill inline-flex min-h-7 items-center leading-none text-[9px] px-1.5 py-0.5 font-semibold ${arcaConfigClass}`}
              >
                Conexion: {arcaConfigLabel}
              </span>
              {arcaProcessLabel ? (
                <span
                  className={`pill inline-flex min-h-7 items-center leading-none text-[9px] px-1.5 py-0.5 font-semibold ${arcaJobClass}`}
                >
                  Proceso: {arcaProcessLabel}
                </span>
              ) : null}
              {arcaStepLabel ? (
                <span className="pill glass  inline-flex min-h-7 items-center leading-none text-xs">
                  Etapa: {arcaStepLabel}
                </span>
              ) : null}
              {arcaConfig?.lastOkAt ? (
                <span className="pill glass  inline-flex min-h-7 items-center leading-none text-xs">
                  Ultimo OK: {formatDate(arcaConfig.lastOkAt)}
                </span>
              ) : null}
              {arcaJob?.createdAt ? (
                <span className="pill glass  inline-flex min-h-7 items-center leading-none text-xs">
                  Inicio: {formatDate(arcaJob.createdAt)}
                </span>
              ) : null}
            </div>

            <p className="mt-3 text-xs text-zinc-600">
              {arcaMainMessage}
            </p>
            <div className="mt-2">
              <span className="pill inline-flex min-h-7 items-center leading-none text-xs bg-white text-emerald-800 border border-emerald-200">
                PV default facturacion:{" "}
                {defaultPointOfSale !== null
                  ? ` ${defaultPointOfSale}`
                  : " sin definir"}
              </span>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Servicios seleccionados:{" "}
              {normalizeArcaServices(arcaServices).join(", ")}
            </p>
            {arcaConfig?.authorizedServices?.length ? (
              <p className="mt-1 text-xs text-zinc-500">
                Servicios activos:{" "}
                {normalizeArcaServices(arcaConfig.authorizedServices).join(", ")}
              </p>
            ) : null}

            {arcaActivityMessage ? (
              <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-medium text-sky-800">
                <Spinner />
                {arcaActivityMessage}
              </div>
            ) : null}

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {ARCA_STEP_ORDER.map((step, index) => {
                const isCurrent =
                  arcaStepIndex === index && arcaJob?.status !== "COMPLETED";
                const isDone =
                  arcaJob?.status === "COMPLETED" ||
                  (arcaStepIndex !== -1 && index < arcaStepIndex);
                const hasError = isCurrent && arcaJob?.status === "ERROR";
                const needsAction =
                  isCurrent && arcaJob?.status === "REQUIRES_ACTION";
                const stepClass = hasError
                  ? "border-rose-200 bg-white text-rose-800"
                  : isDone
                    ? "border-emerald-200 bg-white text-emerald-800"
                    : isCurrent
                      ? "border-sky-200 bg-white text-sky-800"
                      : "border-zinc-200/70 bg-zinc-100/40 text-zinc-700";
                const stepStatus = hasError
                  ? "Error"
                  : needsAction
                    ? "Requiere accion"
                    : isDone
                      ? "Completado"
                      : isCurrent
                        ? "En curso"
                        : "Pendiente";

                return (
                  <div
                    key={step}
                    className={`min-h-[84px] rounded-xl border px-3 py-2 text-xs flex flex-col justify-center ${stepClass}`}
                  >
                    <p className="font-semibold">
                      {index + 1}. {ARCA_STEP_LABELS[step]}
                    </p>
                    <p className="mt-1">{stepStatus}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <Details
            className="rounded-2xl border border-zinc-200/70 bg-white/40 p-0 group border-dashed border-sky-200"
            defaultOpen={arcaNeedsSetup}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <div className="flex items-center gap-2">
                  <Cog6ToothIcon className="size-4 text-zinc-400" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Datos para conectar ARCA
                    </p>
                    <p className="text-xs text-zinc-500">
                      Ingresa los datos de acceso para generar el certificado y autorizar servicios.
                    </p>
                  </div>
                </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-500 group-open:hidden">
                  Mostrar
                </span>
                <span className="hidden text-[10px] text-zinc-500 group-open:inline">
                  Ocultar
                </span>
                <ChevronDownIcon className="size-4 text-zinc-500 transition-transform group-open:rotate-180" />
              </div>
            </summary>
            <div className="border-t border-zinc-200/70 px-4 pb-4 pt-3">
              <form
                onSubmit={handleArcaConnect}
                className="grid gap-3 lg:grid-cols-2"
              >
                <label className="flex flex-col gap-2 text-xs text-zinc-500">
                  CUIT representado
                  <input
                    className="input no-spinner tabular-nums"
                    value={arcaTaxIdRepresentado}
                    onChange={(event) =>
                      setArcaTaxIdRepresentado(
                        normalizeIntegerInput(event.target.value),
                      )
                    }
                    placeholder="20123456789"
                    inputMode="numeric"
                    required
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs text-zinc-500">
                  CUIT login
                  <input
                    className="input no-spinner tabular-nums"
                    value={arcaTaxIdLogin}
                    onChange={(event) =>
                      setArcaTaxIdLogin(
                        normalizeIntegerInput(event.target.value),
                      )
                    }
                    placeholder="20123456789"
                    inputMode="numeric"
                    required
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs text-zinc-500">
                  Alias
                  <input
                    className="input"
                    value={arcaAlias}
                    onChange={(event) => setArcaAlias(event.target.value)}
                    placeholder="Alias"
                    required
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs text-zinc-500">
                  Clave fiscal
                  <input
                    className="input"
                    type="password"
                    value={arcaPassword}
                    onChange={(event) => setArcaPassword(event.target.value)}
                    placeholder="No se guarda"
                    required
                  />
                </label>
                <div className="lg:col-span-2">
                  <p className="text-xs text-zinc-500">Servicios a autorizar</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {ARCA_SERVICE_OPTIONS.map((service) => (
                      <label
                        key={service.value}
                        className="flex items-center gap-2 rounded-full border border-zinc-200/70 bg-white/60 px-3 py-1 text-xs text-zinc-600"
                      >
                        <input
                          type="checkbox"
                          checked={arcaServices.includes(service.value)}
                          onChange={() => toggleArcaService(service.value)}
                        />
                        {service.label}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 lg:col-span-2">
                  <button
                    type="submit"
                    className="btn btn-emerald"
                    disabled={arcaActionLocked}
                  >
                    {isArcaSubmitting ? (
                      <>
                        <Spinner />
                        Conectando...
                      </>
                    ) : (
                      "Conectar ARCA"
                    )}
                  </button>
                  {arcaJob && arcaJob.status !== "REQUIRES_ACTION" ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={handleArcaResume}
                      disabled={arcaActionLocked}
                    >
                      {isArcaSubmitting ? (
                        <>
                          <Spinner />
                          Reintentando...
                        </>
                      ) : (
                        "Reintentar proceso"
                      )}
                    </button>
                  ) : null}
                </div>
                <p className="text-xs text-zinc-500 lg:col-span-2">
                  La clave fiscal solo se usa para esta operacion y no se
                  almacena.
                </p>
              </form>
            </div>
          </Details>

          {arcaJob?.status === "REQUIRES_ACTION" ? (
            <Details
              className="rounded-2xl border border-amber-200 bg-white p-0 group border-dashed border-sky-200"
              defaultOpen
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <div className="flex items-center gap-2">
                  <InformationCircleIcon className="size-4 text-amber-500" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Continuar proceso
                    </p>
                    <p className="text-xs text-zinc-500">
                      Reingresa la clave fiscal para continuar.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500 group-open:hidden">
                    Mostrar
                  </span>
                  <span className="hidden text-[10px] text-zinc-500 group-open:inline">
                    Ocultar
                  </span>
                  <ChevronDownIcon className="size-4 text-zinc-500 transition-transform group-open:rotate-180" />
                </div>
              </summary>
              <div className="border-t border-amber-200 px-4 pb-4 pt-3">
                <div className="flex flex-wrap gap-3">
                  <input
                    className="input"
                    type="password"
                    value={arcaResumePassword}
                    onChange={(event) =>
                      setArcaResumePassword(event.target.value)
                    }
                    placeholder="Clave fiscal"
                  />
                  <button
                    type="button"
                    className="btn btn-sky"
                    onClick={handleArcaResume}
                    disabled={arcaActionLocked}
                  >
                    {isArcaSubmitting ? (
                      <>
                        <Spinner />
                        Continuando...
                      </>
                    ) : (
                      "Continuar"
                    )}
                  </button>
                </div>
              </div>
            </Details>
          ) : null}

          {arcaConfig ? (
            <Details className="rounded-2xl border border-zinc-200/70 bg-white/40 p-0 group border-dashed border-sky-200">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <div className="flex items-center gap-2">
                  <Cog6ToothIcon className="size-4 text-zinc-400" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Renovar certificado
                    </p>
                    <p className="text-xs text-zinc-500">
                      Vuelve a emitir el certificado y reautoriza los servicios seleccionados.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500 group-open:hidden">
                    Mostrar
                  </span>
                  <span className="hidden text-[10px] text-zinc-500 group-open:inline">
                    Ocultar
                  </span>
                  <ChevronDownIcon className="size-4 text-zinc-500 transition-transform group-open:rotate-180" />
                </div>
              </summary>
              <div className="border-t border-zinc-200/70 px-4 pb-4 pt-3">
                <form
                  onSubmit={handleArcaRotate}
                  className="flex flex-wrap gap-3"
                >
                  <p className="w-full text-xs text-zinc-500">
                    Usa esta opcion si el certificado actual vencio, fue
                    revocado o queres regenerarlo.
                  </p>
                  <input
                    className="input"
                    type="password"
                    value={arcaRotatePassword}
                    onChange={(event) =>
                      setArcaRotatePassword(event.target.value)
                    }
                    placeholder="Clave fiscal"
                    required
                  />
                  <button
                    type="submit"
                    className="btn btn-rose"
                    disabled={arcaActionLocked}
                  >
                    {isArcaRotating ? (
                      <>
                        <Spinner />
                        Renovando...
                      </>
                    ) : (
                      "Renovar certificado"
                    )}
                  </button>
                </form>
              </div>
            </Details>
          ) : null}

          {arcaJobInfo?.helpLinks?.length ||
          arcaConfig?.lastError ||
          arcaJobInfo?.statusMessage ? (
            <Details
              className="rounded-2xl border border-zinc-200/70 bg-white/40 p-0 group border-dashed border-sky-200"
              defaultOpen={
                Boolean(arcaStatusMessage || arcaConfig?.lastError) ||
                arcaJob?.status === "ERROR"
              }
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <div className="flex items-center gap-2">
                  <InformationCircleIcon className="size-4 text-zinc-400" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Que paso y como resolverlo
                    </p>
                    <p className="text-xs text-zinc-500">
                      Mensajes de ARCA y accesos rapidos para solucionarlo.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500 group-open:hidden">
                    Mostrar
                  </span>
                  <span className="hidden text-[10px] text-zinc-500 group-open:inline">
                    Ocultar
                  </span>
                  <ChevronDownIcon className="size-4 text-zinc-500 transition-transform group-open:rotate-180" />
                </div>
              </summary>
              <div className="border-t border-zinc-200/70 px-4 pb-4 pt-3">
                <div className="space-y-2">
                  <p className="text-xs text-zinc-500">
                    Si falla la conexion, aca aparece el motivo reportado por
                    ARCA.
                  </p>
                  {arcaJobInfo?.statusMessage ? (
                    <p className="text-xs text-zinc-500">
                      {arcaJobInfo.statusMessage}
                    </p>
                  ) : null}
                  {arcaConfig?.lastError ? (
                    <p className="text-xs text-rose-600">
                      {arcaConfig.lastError}
                    </p>
                  ) : null}
                  {arcaJobInfo?.helpLinks?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {arcaJobInfo.helpLinks.map((link) => (
                        <a
                          key={link.url}
                          className="btn text-xs"
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {link.label}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </Details>
          ) : null}
        </div>
          </Section>

          <div className="space-y-6">
            <Section
              title="Usuarios"
              subtitle={`Gestiona roles para ${activeOrg.name}`}
              icon={<UsersIcon className="size-4" />}
            >
          <div className="space-y-4">
            <ul className="space-y-2 text-sm">
              {users.map((user) => (
                <li
                  key={`${user.id}-${user.role}-${user.isActive ? "1" : "0"}`}
                  className="rounded-2xl border border-zinc-200/70 bg-white/40 text-zinc-700"
                >
                  <Details className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 [&::-webkit-details-marker]:hidden">
                      <div>
                        <p className="font-medium text-zinc-900">
                          {user.name ?? user.email}
                        </p>
                        <p className="text-xs text-zinc-500">{user.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="pill text-xs font-semibold">
                          {roleLabel(user.role)}
                        </span>
                        <span
                          className={`pill text-[9px] px-1.5 py-0.5 font-semibold ${
                            user.isActive
                              ? "bg-white text-emerald-800 border border-emerald-200"
                              : "bg-zinc-100/25 text-zinc-700 border border-zinc-200/70"
                          }`}
                        >
                          {user.isActive ? "Activo" : "Inactivo"}
                        </span>
                      </div>
                    </summary>
                    <div className="border-t border-zinc-200/70 px-3 pb-3 pt-2">
                      <form
                        onSubmit={(event) => handleUpdateUser(event, user.id)}
                        className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
                      >
                        <label className="flex flex-col gap-2 text-xs text-zinc-500">
                          Rol
                          <select
                            name="role"
                            className="input"
                            defaultValue={user.role}
                          >
                            {USER_MANAGEMENT_ROLE_OPTIONS.map((role) => (
                              <option key={role} value={role}>
                                {ROLE_LABELS[role]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-2 text-xs text-zinc-500">
                          Nueva contraseña
                          <input
                            name="password"
                            type="password"
                            className="input"
                            placeholder="Contraseña"
                            autoComplete="new-password"
                          />
                        </label>
                        <label className="flex items-center gap-2 text-xs text-zinc-500 sm:col-span-3">
                          <input
                            type="checkbox"
                            name="isActive"
                            defaultChecked={user.isActive}
                          />
                          Activo
                        </label>
                        <button
                          type="submit"
                          className="btn btn-sky sm:col-span-3"
                          disabled={userUpdating[user.id]}
                        >
                          {userUpdating[user.id]
                            ? "Actualizando..."
                            : "Actualizar"}
                        </button>
                      </form>
                      {userUpdateStatus[user.id] ? (
                        <p className="mt-2 text-xs text-zinc-500">
                          {userUpdateStatus[user.id]}
                        </p>
                      ) : null}
                    </div>
                  </Details>
                </li>
              ))}
            </ul>
            <Details className="rounded-2xl border border-zinc-200/70 bg-white/40 p-0 group border-dashed border-sky-200">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <div className="flex items-center gap-2">
                  <UsersIcon className="size-4 text-zinc-400" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Nuevo usuario
                    </p>
                    <p className="text-xs text-zinc-500">
                      Agrega un usuario con rol y acceso.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500 group-open:hidden">
                    Mostrar
                  </span>
                  <span className="hidden text-[10px] text-zinc-500 group-open:inline">
                    Ocultar
                  </span>
                  <ChevronDownIcon className="size-4 text-zinc-500 transition-transform group-open:rotate-180" />
                </div>
              </summary>
              <div className="border-t border-zinc-200/70 px-4 pb-4 pt-3">
                <form onSubmit={handleCreateUser} className="space-y-3">
                  <label className="block space-y-2 text-xs text-zinc-500">
                    Correo
                    <input
                      className="input w-full"
                      value={userEmail}
                      onChange={(event) => setUserEmail(event.target.value)}
                      placeholder="correo@empresa.com"
                      autoComplete="email"
                      required
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-2 text-xs text-zinc-500">
                      Nombre
                      <input
                        className="input"
                        value={userName}
                        onChange={(event) => setUserName(event.target.value)}
                        placeholder="Nombre"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-xs text-zinc-500">
                      Rol
                      <select
                        className="input"
                        value={userRole}
                        onChange={(event) =>
                          setUserRole(
                            event.target.value as (typeof USER_MANAGEMENT_ROLE_OPTIONS)[number]
                          )
                        }
                      >
                        {USER_MANAGEMENT_ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="block space-y-2 text-xs text-zinc-500">
                    Contraseña
                    <input
                      className="input w-full"
                      type="password"
                      value={userPassword}
                      onChange={(event) => setUserPassword(event.target.value)}
                      placeholder="Contraseña"
                      autoComplete="new-password"
                    />
                  </label>
                  <button
                    type="submit"
                    className="btn btn-emerald w-full"
                    disabled={isUserSubmitting}
                  >
                    Crear usuario
                  </button>
                  {userStatus ? (
                    <p className="text-xs text-zinc-500">{userStatus}</p>
                  ) : null}
                </form>
              </div>
            </Details>
          </div>
            </Section>
          </div>
        </>
      ) : null}
    </div>
  );
}
