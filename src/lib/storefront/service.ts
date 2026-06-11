import { createHash } from "node:crypto";
import {
  BillingStatus,
  Prisma,
  StorefrontBillingMode,
  StorefrontOrderDeliveryMethod,
  StorefrontOrderPaymentStatus,
  StorefrontOrderStatus,
  StorefrontPaymentEventAction,
  StorefrontReservationStatus,
  StorefrontShippingType,
  type Product,
} from "@prisma/client";
import { PRICE_LIST_ORDER_BY } from "@/lib/price-lists";
import { prisma } from "@/lib/prisma";
import {
  normalizeSearchText,
  scoreProductSearchMatch,
} from "@/lib/products-search";
import { STOCK_ENABLED } from "@/lib/features";
import { buildSaleOutMovements } from "@/lib/stock";
import type {
  ApiDeliveryMethod,
  ApiShippingType,
  StorefrontCartItemInput,
  StorefrontCartValidationDto,
  StorefrontCartValidationLine,
  StorefrontConfigDto,
  StorefrontCreateOrderInput,
  StorefrontOrderDto,
  StorefrontOrderTrackingSearchInput,
  StorefrontPublicOrderSummaryDto,
  StorefrontProductDto,
  StorefrontProductsListDto,
  StorefrontShippingQuoteDto,
  StorefrontShippingQuoteInput,
  StorefrontTechnicalSheetItem,
} from "./types";
import { buildStorefrontApiKeyValue } from "./auth";

type StorefrontChannelWithRelations = Prisma.StorefrontChannelGetPayload<{
  include: {
    defaultPriceList: {
      select: {
        id: true;
        name: true;
      };
    };
    paymentAdjustments: {
      where: {
        isActive: true;
      };
    };
    organization: {
      select: {
        id: true;
        name: true;
        email: true;
        phone: true;
        address: true;
      };
    };
  };
}>;

type StorefrontPublicationWithProduct = Prisma.StorefrontPublicationGetPayload<{
  include: {
    product: {
      include: {
        priceItems: {
          select: {
            priceListId: true;
            price: true;
          };
        };
      };
    };
  };
}>;

type StorefrontOrderWithRelations = Prisma.StorefrontOrderGetPayload<{
  include: {
    channel: {
      include: {
        paymentAdjustments: {
          where: {
            isActive: true;
          };
        };
        defaultPriceList: {
          select: {
            id: true;
            name: true;
          };
        };
        organization: {
          select: {
            id: true;
            name: true;
            email: true;
            phone: true;
            address: true;
          };
        };
      };
    };
    items: true;
    reservations: true;
  };
}>;

type StorefrontTrackedOrderWithItems = Prisma.StorefrontOrderGetPayload<{
  include: {
    items: {
      include: {
        publication: {
          select: {
            slug: true;
          };
        };
      };
    };
  };
}>;

type StorefrontAdminPublicationRow = {
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

type StorefrontPaymentAdjustmentInput = {
  paymentMethod: string;
  percent: number;
};

type StorefrontChannelConfigInput = {
  name: string;
  storeName: string;
  supportEmail?: string | null;
  supportPhone?: string | null;
  pickupAddress?: string | null;
  currencyCode?: string;
  defaultPriceListId?: string | null;
  allowsCustomerAccounts: boolean;
  customerAccountsMode: "prepared" | "enabled";
  defaultPaymentMethod: string;
  globalPriceAdjustmentPercent: number;
  normalShippingAmount: number;
  reserveTtlMinutes: number;
  manualBillingByDefault: boolean;
  paymentAdjustments: StorefrontPaymentAdjustmentInput[];
};

type UpsertStorefrontPublicationInput = {
  productId: string;
  slug?: string | null;
  publicationStatus: "PUBLISHED" | "PAUSED";
  publicName: string;
  shortDescription: string;
  longDescription: string;
  category: string;
  featured: boolean;
  shippingType: "NORMAL" | "PICKUP" | "OWN_DELIVERY" | "QUOTE" | "RESTRICTED";
  stockMode: "STRICT" | "CONSULT" | "BACKORDER" | "OUT_OF_STOCK";
  webStockAvailable: number;
  pricingMode: "AUTO" | "FIXED";
  fixedFinalPrice?: number | null;
  priceAdjustmentPercent: number;
  billingMode: "DEFAULT" | "MANUAL" | "AUTO";
  flags?: {
    hasGas?: boolean;
    hasPressure?: boolean;
    isFlammable?: boolean;
    hasSpecialLogistics?: boolean;
  };
};

type PaymentMutationResult = {
  ok: true;
  alreadyProcessed: boolean;
  orderId: string;
  saleId: string | null;
};

const DEFAULT_CHANNEL_CODE = "default";
const DEFAULT_CHANNEL_NAME = "Storefront";
const DEFAULT_FALLBACK_EMAIL = "ventas@local.invalid";
const ORDER_COUNTER_KEY = "storefront-order-number";
const SALE_COUNTER_KEY = "sale-number";

const orderStatusToApi = (
  status: StorefrontOrderStatus,
): StorefrontOrderDto["status"] => {
  if (status === "CONFIRMED") return "confirmed";
  if (status === "REJECTED") return "rejected";
  return "cancelled";
};

const paymentStatusToApi = (
  status: StorefrontOrderPaymentStatus,
): StorefrontOrderDto["paymentStatus"] => {
  if (status === "APPROVED") return "approved";
  if (status === "REJECTED") return "rejected";
  if (status === "REFUNDED") return "refunded";
  if (status === "CANCELLED") return "cancelled";
  return "pending";
};

const shippingTypeToApi = (
  value: StorefrontShippingType,
): ApiShippingType => {
  if (value === "OWN_DELIVERY") return "own_delivery";
  return value.toLowerCase() as ApiShippingType;
};

const apiDeliveryMethodToDb = (
  value: ApiDeliveryMethod,
): StorefrontOrderDeliveryMethod => {
  if (value === "own_delivery") return "OWN_DELIVERY";
  return value.toUpperCase() as StorefrontOrderDeliveryMethod;
};

const toNumber = (value: unknown) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "object" && value !== null && "toString" in value) {
    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const roundMoney = (value: number) =>
  Number.isFinite(value) ? Number(value.toFixed(2)) : 0;

const compactSpaces = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 240);

const normalizeFreeText = (value?: string | null) => {
  const raw = value?.trim() ?? "";
  return raw ? compactSpaces(raw) : null;
};

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const onlyDigits = (value?: string | null) => {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits.length > 0 ? digits : null;
};

const maskEmail = (email: string) => {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return email;
  const visible = localPart.slice(0, Math.min(3, localPart.length));
  return `${visible}${localPart.length > 3 ? "***" : ""}@${domain}`;
};

const maskTrailingDigits = (value?: string | null) => {
  const digits = onlyDigits(value);
  if (!digits) return null;
  const visible = digits.slice(-4);
  return `${"*".repeat(Math.max(0, digits.length - 4))}${visible}`;
};

const storefrontDeliveryMethodToApi = (
  value: StorefrontOrderDeliveryMethod,
): ApiDeliveryMethod => {
  if (value === "OWN_DELIVERY") return "own_delivery";
  return value.toLowerCase() as ApiDeliveryMethod;
};

const buildStorefrontOrderDateRange = (date: string) => {
  const start = new Date(`${date}T00:00:00.000-03:00`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
};

const buildStorefrontOrderReferenceWhere = (
  reference: string,
): Prisma.StorefrontOrderWhereInput => {
  const digits = onlyDigits(reference);
  const filters: Prisma.StorefrontOrderWhereInput[] = [
    { id: { equals: reference } },
    { displayNumber: { contains: reference, mode: "insensitive" } },
    { paymentReference: { contains: reference, mode: "insensitive" } },
    { externalReference: { contains: reference, mode: "insensitive" } },
  ];

  if (digits && digits.length >= 4) {
    filters.push(
      { displayNumber: { contains: digits, mode: "insensitive" } },
      { paymentReference: { contains: digits, mode: "insensitive" } },
      { externalReference: { contains: digits, mode: "insensitive" } },
    );
  }

  return { OR: filters };
};

const getStorefrontOrderCode = (
  order: Pick<
    StorefrontTrackedOrderWithItems,
    "id" | "displayNumber" | "externalReference" | "paymentReference"
  >,
) => order.displayNumber ?? order.externalReference ?? order.paymentReference ?? order.id;

const toPublicStorefrontOrderSummary = (
  order: StorefrontTrackedOrderWithItems,
): StorefrontPublicOrderSummaryDto => ({
  id: order.id,
  friogestionOrderId: order.id,
  displayNumber: order.displayNumber,
  orderCode: getStorefrontOrderCode(order),
  status: order.status,
  paymentStatus: order.paymentStatus,
  customerName: order.customerDisplayName,
  maskedEmail: maskEmail(order.customerEmail),
  maskedPhone: maskTrailingDigits(order.customerPhone),
  maskedTaxId: maskTrailingDigits(order.customerTaxId),
  deliveryMethod: storefrontDeliveryMethodToApi(order.deliveryMethod),
  subtotal: roundMoney(toNumber(order.subtotal)),
  shippingTotal: roundMoney(toNumber(order.shippingTotal)),
  total: roundMoney(toNumber(order.total)),
  mercadoPagoPaymentId: order.paymentReference ?? null,
  mercadoPagoStatus: order.paymentStatus,
  createdAt: order.createdAt.toISOString(),
  updatedAt: order.updatedAt.toISOString(),
  items: order.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    slug: item.publication?.slug ?? null,
    sku: item.sku ?? null,
    name: item.publicName,
    quantity: item.quantity,
    unitPrice: roundMoney(toNumber(item.unitPriceFinal)),
    total: roundMoney(toNumber(item.lineTotal)),
  })),
});

const normalizeSlug = (value: string) =>
  compactSpaces(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "producto";

const parseTechnicalSheet = (
  value: Prisma.JsonValue | null,
): StorefrontTechnicalSheetItem[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const label = "label" in item ? compactSpaces(String(item.label ?? "")) : "";
      const text = "value" in item ? compactSpaces(String(item.value ?? "")) : "";
      if (!label || !text) return null;
      return { label, value: text };
    })
    .filter((item): item is StorefrontTechnicalSheetItem => item !== null);
};

const parseImages = (
  value: Prisma.JsonValue | null,
  slug: string,
  name: string,
) => {
  if (Array.isArray(value)) {
    const mapped = value
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const url = "url" in item ? String(item.url ?? "").trim() : "";
        const alt = "alt" in item ? String(item.alt ?? "").trim() : "";
        if (!url) return null;
        return {
          url,
          alt: alt || name,
        };
      })
      .filter((item): item is { url: string; alt: string } => item !== null);
    if (mapped.length) return mapped;
  }

  return [{ url: `/products/${slug}.svg`, alt: name }];
};

const normalizeCartItems = (items: StorefrontCartItemInput[]) => {
  const quantities = new Map<string, number>();
  for (const item of items) {
    const current = quantities.get(item.productId) ?? 0;
    quantities.set(item.productId, current + Math.max(0, Math.trunc(item.quantity)));
  }
  return Array.from(quantities.entries()).map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
};

const resolveBasePrice = (
  product: Product & {
    priceItems: Array<{ priceListId: string; price: Prisma.Decimal | null }>;
  },
  defaultPriceListId: string | null,
) => {
  if (defaultPriceListId) {
    const priceItem = product.priceItems.find(
      (candidate) => candidate.priceListId === defaultPriceListId,
    );
    if (priceItem && priceItem.price !== null) {
      return roundMoney(toNumber(priceItem.price));
    }
  }
  return roundMoney(toNumber(product.price));
};

const resolvePublicationAvailableStock = (
  publication: Pick<
    StorefrontPublicationWithProduct,
    "stockMode" | "webStockAvailable" | "webStockReserved"
  >,
) => {
  if (publication.stockMode === "OUT_OF_STOCK") return 0;
  if (publication.stockMode === "STRICT") {
    return Math.max(0, publication.webStockAvailable - publication.webStockReserved);
  }
  return Math.max(0, publication.webStockAvailable);
};

export function calculateStorefrontPricePreview(input: {
  basePrice: number;
  pricingMode: "AUTO" | "FIXED";
  fixedFinalPrice?: number | null;
  globalAdjustmentPercent?: number;
  paymentAdjustmentPercent?: number;
  publicationAdjustmentPercent?: number;
}) {
  if (input.pricingMode === "FIXED" && input.fixedFinalPrice !== null && input.fixedFinalPrice !== undefined) {
    return {
      adjustmentPercentTotal: 0,
      priceFinal: Math.max(0, roundMoney(input.fixedFinalPrice)),
    };
  }

  const adjustmentPercentTotal = roundMoney(
    (input.globalAdjustmentPercent ?? 0) +
      (input.paymentAdjustmentPercent ?? 0) +
      (input.publicationAdjustmentPercent ?? 0),
  );

  return {
    adjustmentPercentTotal,
    priceFinal: Math.max(
      0,
      roundMoney(input.basePrice * (1 + adjustmentPercentTotal / 100)),
    ),
  };
}

export function evaluateStorefrontAvailability(input: {
  publicationStatus: "PUBLISHED" | "PAUSED";
  stockMode: "STRICT" | "CONSULT" | "BACKORDER" | "OUT_OF_STOCK";
  webStockAvailable: number;
  webStockReserved?: number;
  requestedQuantity: number;
  priceFinal: number;
}) {
  const warnings: string[] = [];
  let acceptedQuantity = input.requestedQuantity;
  let canBuy = true;
  let available = true;
  const strictAvailable = Math.max(
    0,
    input.webStockAvailable - (input.webStockReserved ?? 0),
  );

  if (input.publicationStatus !== "PUBLISHED") {
    canBuy = false;
    available = false;
    acceptedQuantity = 0;
    warnings.push("La publicacion esta pausada.");
  } else if (input.stockMode === "CONSULT") {
    canBuy = false;
    available = false;
    acceptedQuantity = 0;
    warnings.push("Este producto se vende solo con consulta previa de stock.");
  } else if (input.stockMode === "OUT_OF_STOCK") {
    canBuy = false;
    available = false;
    acceptedQuantity = 0;
    warnings.push("El producto esta visible pero sin compra disponible.");
  } else if (input.stockMode === "STRICT") {
    if (strictAvailable <= 0) {
      canBuy = false;
      available = false;
      acceptedQuantity = 0;
      warnings.push("No hay cupo web disponible.");
    } else if (input.requestedQuantity > strictAvailable) {
      canBuy = false;
      acceptedQuantity = strictAvailable;
      warnings.push("La cantidad solicitada supera el cupo web disponible.");
    }
  } else if (input.stockMode === "BACKORDER") {
    warnings.push("Producto disponible por encargo o con entrega diferida.");
  }

  if (input.priceFinal <= 0) {
    canBuy = false;
    available = false;
    acceptedQuantity = 0;
    warnings.push("El producto no tiene un precio web valido.");
  }

  return {
    acceptedQuantity,
    available,
    canBuy,
    warnings,
  };
}

const resolvePublicationItemManualBilling = (
  channel: StorefrontChannelWithRelations,
  billingMode: StorefrontBillingMode,
) => {
  if (billingMode === "MANUAL") return true;
  if (billingMode === "AUTO") return false;
  return channel.manualBillingByDefault;
};

const resolvePublicationPrice = (
  channel: StorefrontChannelWithRelations,
  publication: StorefrontPublicationWithProduct,
  paymentMethod: string,
) => {
  const basePrice = resolveBasePrice(publication.product, channel.defaultPriceListId);
  const computed = calculateStorefrontPricePreview({
    basePrice,
    pricingMode: publication.pricingMode,
    fixedFinalPrice:
      publication.fixedFinalPrice === null
        ? null
        : roundMoney(toNumber(publication.fixedFinalPrice)),
    globalAdjustmentPercent: toNumber(channel.globalPriceAdjustmentPercent),
    paymentAdjustmentPercent: toNumber(
      channel.paymentAdjustments.find(
        (candidate) =>
          candidate.paymentMethod.trim().toLowerCase() ===
          paymentMethod.trim().toLowerCase(),
      )?.percent,
    ),
    publicationAdjustmentPercent: toNumber(publication.priceAdjustmentPercent),
  });

  return {
    basePrice,
    adjustmentPercentTotal: computed.adjustmentPercentTotal,
    priceFinal: computed.priceFinal,
  };
};

const publicationMatchesSearch = (
  publication: StorefrontPublicationWithProduct,
  rawQuery: string,
) => {
  const normalized = normalizeSearchText(rawQuery);
  if (!normalized) return true;

  return (
    scoreProductSearchMatch(
      {
        id: publication.productId,
        name: publication.publicName,
        brand: publication.product.brand,
        model: publication.product.model,
        sku: publication.product.sku,
        purchaseCode: publication.product.purchaseCode,
      },
      rawQuery,
    ) !== null
  );
};

const storefrontProductFromPublication = (
  channel: StorefrontChannelWithRelations,
  publication: StorefrontPublicationWithProduct,
  paymentMethod: string,
): StorefrontProductDto => {
  const pricing = resolvePublicationPrice(channel, publication, paymentMethod);
  const slug = publication.slug || normalizeSlug(publication.publicName || publication.product.name);

  return {
    id: publication.productId,
    sku: publication.product.sku,
    slug,
    isPublishedToStorefront: publication.publicationStatus === "PUBLISHED",
    publicationStatus: publication.publicationStatus,
    stockMode: publication.stockMode,
    pricingMode: publication.pricingMode,
    fixedFinalPrice:
      publication.fixedFinalPrice === null
        ? null
        : roundMoney(toNumber(publication.fixedFinalPrice)),
    publicName: publication.publicName,
    shortDescription: publication.shortDescription,
    longDescription: publication.longDescription,
    images: parseImages(publication.images, slug, publication.publicName),
    category: publication.category,
    brand: publication.product.brand,
    model: publication.product.model,
    technicalSheet: parseTechnicalSheet(publication.technicalSheet),
    priceFinal: pricing.priceFinal,
    currencyCode: "ARS",
    webStockAvailable: resolvePublicationAvailableStock(publication),
    unit: publication.product.unit || "unidad",
    weightKg: null,
    dimensions: null,
    shippingType: shippingTypeToApi(publication.shippingType),
    flags: {
      hasGas: publication.hasGas,
      hasPressure: publication.hasPressure,
      isFlammable: publication.isFlammable,
      hasSpecialLogistics: publication.hasSpecialLogistics,
    },
    featured: publication.featured,
  };
};

const evaluateCartLine = (
  channel: StorefrontChannelWithRelations,
  publication: StorefrontPublicationWithProduct,
  requestedQuantity: number,
  paymentMethod: string,
): StorefrontCartValidationLine => {
  const product = storefrontProductFromPublication(channel, publication, paymentMethod);
  const availability = evaluateStorefrontAvailability({
    publicationStatus: publication.publicationStatus,
    stockMode: publication.stockMode,
    webStockAvailable: publication.webStockAvailable,
    webStockReserved: publication.webStockReserved,
    requestedQuantity,
    priceFinal: product.priceFinal,
  });

  return {
    product,
    requestedQuantity,
    acceptedQuantity: availability.acceptedQuantity,
    available: availability.available,
    canBuy: availability.canBuy,
    warnings: availability.warnings,
    lineTotal: roundMoney(product.priceFinal * availability.acceptedQuantity),
  };
};

const deliveryMethodLabel = (method: ApiDeliveryMethod) => {
  if (method === "pickup") return "Retiro en local";
  if (method === "normal") return "Envio por transporte";
  if (method === "own_delivery") return "Retiro con transporte del cliente";
  return "Coordinar despacho";
};

const shippingTypeAllowsDeliveryMethod = (
  shippingType: StorefrontShippingType,
  deliveryMethod: ApiDeliveryMethod,
) => {
  if (deliveryMethod === "quote") return true;
  if (shippingType === "NORMAL") return true;
  if (shippingType === "PICKUP") return deliveryMethod === "pickup";
  if (shippingType === "OWN_DELIVERY") {
    return deliveryMethod === "own_delivery" || deliveryMethod === "pickup";
  }
  return false;
};

const buildOrderEventKey = (payload: unknown, action: StorefrontPaymentEventAction) => {
  const raw =
    (payload &&
      typeof payload === "object" &&
      "id" in payload &&
      typeof payload.id !== "undefined" &&
      String(payload.id)) ||
    null;
  const status =
    payload &&
    typeof payload === "object" &&
    "status" in payload &&
    typeof payload.status !== "undefined"
      ? String(payload.status)
      : action.toLowerCase();

  if (raw) return `${action}:${raw}:${status}`;

  const hash = createHash("sha256")
    .update(JSON.stringify(payload ?? null))
    .digest("hex")
    .slice(0, 24);
  return `${action}:payload:${hash}`;
};

const parseSequenceNumber = (value?: string | null) => {
  if (!value) return null;
  const match = value.match(/(\d+)(?!.*\d)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
};

const reserveNextCounter = async (
  tx: Prisma.TransactionClient,
  organizationId: string,
  key: string,
  fallbackLast: () => Promise<number | null>,
) => {
  const counter = await tx.organizationCounter.findUnique({
    where: { organizationId_key: { organizationId, key } },
  });

  if (!counter) {
    const lastNumber = (await fallbackLast()) ?? 0;
    const nextValue = lastNumber + 1;
    await tx.organizationCounter.create({
      data: { organizationId, key, nextValue: nextValue + 1 },
    });
    return nextValue;
  }

  const updated = await tx.organizationCounter.update({
    where: { organizationId_key: { organizationId, key } },
    data: { nextValue: { increment: 1 } },
    select: { nextValue: true },
  });

  return updated.nextValue - 1;
};

const buildOrderDisplayNumber = (sequence: number) =>
  `WEB-${String(sequence).padStart(6, "0")}`;

const billingStatusForOrder = (manualBillingRequired: boolean): BillingStatus =>
  manualBillingRequired ? "TO_BILL" : "NOT_BILLED";

const getChannelInclude = {
  include: {
    defaultPriceList: {
      select: {
        id: true,
        name: true,
      },
    },
    paymentAdjustments: {
      where: {
        isActive: true,
      },
    },
    organization: {
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
      },
    },
  },
} satisfies Prisma.StorefrontChannelDefaultArgs;

const storefrontOrderChannelRelationInclude = {
  paymentAdjustments: {
    where: {
      isActive: true,
    },
  },
  defaultPriceList: {
    select: {
      id: true,
      name: true,
    },
  },
  organization: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      address: true,
    },
  },
} satisfies Prisma.StorefrontChannelInclude;

const productInclude = {
  include: {
    product: {
      include: {
        priceItems: {
          select: {
            priceListId: true,
            price: true,
          },
        },
      },
    },
  },
} satisfies Prisma.StorefrontPublicationDefaultArgs;

export class StorefrontDomainError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function isStorefrontDomainError(error: unknown): error is StorefrontDomainError {
  return error instanceof StorefrontDomainError;
}

const loadChannel = async (channelId: string) => {
  const channel = await prisma.storefrontChannel.findUnique({
    where: { id: channelId },
    ...getChannelInclude,
  });
  if (!channel || !channel.isActive) {
    throw new StorefrontDomainError("Canal storefront no disponible.", 404);
  }
  return channel;
};

const ensureDefaultChannelForOrganizationTx = async (
  tx: Prisma.TransactionClient,
  organizationId: string,
) => {
  const existing = await tx.storefrontChannel.findUnique({
    where: {
      organizationId_code: {
        organizationId,
        code: DEFAULT_CHANNEL_CODE,
      },
    },
    ...getChannelInclude,
  });

  if (existing) return existing;

  const [organization, defaultPriceList] = await Promise.all([
    tx.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
      },
    }),
    tx.priceList.findFirst({
      where: { organizationId, isActive: true },
      orderBy: [
        { isConsumerFinal: "desc" },
        ...PRICE_LIST_ORDER_BY,
      ],
      select: { id: true, name: true },
    }),
  ]);

  if (!organization) {
    throw new StorefrontDomainError("Organizacion no encontrada.", 404);
  }

  return tx.storefrontChannel.create({
    data: {
      organizationId,
      code: DEFAULT_CHANNEL_CODE,
      name: DEFAULT_CHANNEL_NAME,
      storeName: organization.name,
      supportEmail: organization.email || DEFAULT_FALLBACK_EMAIL,
      supportPhone: organization.phone,
      pickupAddress: organization.address,
      defaultPriceListId: defaultPriceList?.id,
      allowsCustomerAccounts: true,
      customerAccountsMode: "prepared",
      defaultPaymentMethod: "mercadopago_checkout_api",
      globalPriceAdjustmentPercent: "0",
      normalShippingAmount: "0",
      reserveTtlMinutes: 30,
      manualBillingByDefault: true,
    },
    ...getChannelInclude,
  });
};

const expirePendingOrdersTx = async (
  tx: Prisma.TransactionClient,
  channelId: string,
  now: Date,
) => {
  const expiredOrders = await tx.storefrontOrder.findMany({
    where: {
      channelId,
      status: "PENDING_PAYMENT",
      expiresAt: { lte: now },
    },
    select: { id: true },
  });

  for (const order of expiredOrders) {
    const reservations = await tx.storefrontStockReservation.findMany({
      where: {
        orderId: order.id,
        status: "RESERVED",
      },
      select: {
        id: true,
        publicationId: true,
        quantity: true,
      },
    });

    for (const reservation of reservations) {
      const claimed = await tx.storefrontStockReservation.updateMany({
        where: {
          id: reservation.id,
          status: "RESERVED",
        },
        data: {
          status: "EXPIRED",
          releasedAt: now,
          releaseReason: "expired",
        },
      });

      if (claimed.count !== 1) continue;

      await tx.storefrontPublication.updateMany({
        where: {
          id: reservation.publicationId,
          webStockReserved: { gte: reservation.quantity },
        },
        data: {
          webStockReserved: { decrement: reservation.quantity },
        },
      });
    }
  }

  await tx.storefrontOrder.updateMany({
    where: {
      channelId,
      status: "PENDING_PAYMENT",
      expiresAt: { lte: now },
    },
    data: {
      status: "EXPIRED",
      paymentStatus: "CANCELLED",
      cancelledAt: now,
    },
  });
};

const expirePendingOrders = async (channelId: string) => {
  await prisma.$transaction((tx) => expirePendingOrdersTx(tx, channelId, new Date()));
};

const loadPublicationsByProductIds = async (
  channelId: string,
  productIds: string[],
) =>
  prisma.storefrontPublication.findMany({
    where: {
      channelId,
      productId: { in: productIds },
    },
    ...productInclude,
  });

const findOrCreateStorefrontCustomerTx = async (
  tx: Prisma.TransactionClient,
  organizationId: string,
  input: StorefrontCreateOrderInput["customer"],
) => {
  const normalizedTaxId = input.taxId?.replace(/\D/g, "") || null;
  const email = input.email.trim().toLowerCase();

  if (normalizedTaxId) {
    const byTaxId = await tx.customer.findFirst({
      where: { organizationId, taxId: normalizedTaxId },
      select: { id: true },
    });
    if (byTaxId) return byTaxId.id;
  }

  const byEmail = await tx.customer.findFirst({
    where: { organizationId, email },
    select: { id: true },
  });
  if (byEmail) return byEmail.id;

  const fiscalTaxProfile =
    input.fiscalCondition === "RESPONSABLE_INSCRIPTO"
      ? "RESPONSABLE_INSCRIPTO"
      : input.fiscalCondition === "MONOTRIBUTISTA"
        ? "MONOTRIBUTISTA"
        : "CONSUMIDOR_FINAL";

  const created = await tx.customer.create({
    data: {
      organizationId,
      displayName: compactSpaces(input.displayName),
      email,
      phone: compactSpaces(input.phone),
      taxId: normalizedTaxId,
      type: "CONSUMER_FINAL",
      fiscalTaxProfile,
    },
    select: { id: true },
  });

  return created.id;
};

const orderToDto = (
  order: Pick<
    StorefrontOrderWithRelations,
    | "id"
    | "displayNumber"
    | "status"
    | "paymentStatus"
    | "subtotal"
    | "shippingTotal"
    | "total"
    | "items"
    | "channel"
  >,
  publicationsByProductId: Map<string, StorefrontPublicationWithProduct>,
  paymentMethod: string,
): StorefrontOrderDto => {
  const items = order.items.flatMap((item) => {
      const publication = publicationsByProductId.get(item.productId);
      if (!publication) return [];
      const product = storefrontProductFromPublication(order.channel, publication, paymentMethod);
      return [{
        product,
        requestedQuantity: item.quantity,
        acceptedQuantity: item.quantity,
        available: true,
        canBuy: true,
        warnings: [],
        lineTotal: roundMoney(toNumber(item.lineTotal)),
      } satisfies StorefrontCartValidationLine];
    });

  return {
    id: order.id,
    displayNumber: order.displayNumber,
    status: order.status === "PENDING_PAYMENT" ? "pending_payment" : orderStatusToApi(order.status),
    paymentStatus: paymentStatusToApi(order.paymentStatus),
    subtotal: roundMoney(toNumber(order.subtotal)),
    shippingTotal: roundMoney(toNumber(order.shippingTotal)),
    total: roundMoney(toNumber(order.total)),
    currencyCode: "ARS",
    items,
  };
};

export async function ensureDefaultStorefrontChannel(organizationId: string) {
  return prisma.$transaction((tx) => ensureDefaultChannelForOrganizationTx(tx, organizationId));
}

export async function getStorefrontConfig(channelId: string): Promise<StorefrontConfigDto> {
  const channel = await loadChannel(channelId);
  await expirePendingOrders(channelId);

  return {
    storeName: channel.storeName,
    supportEmail:
      channel.supportEmail || channel.organization.email || DEFAULT_FALLBACK_EMAIL,
    supportPhone: channel.supportPhone || channel.organization.phone || "",
    pickupAddress: channel.pickupAddress || channel.organization.address || "",
    currencyCode: "ARS",
    defaultPriceListName: channel.defaultPriceList?.name || "Lista general",
    allowsCustomerAccounts: channel.allowsCustomerAccounts,
    customerAccountsMode:
      channel.customerAccountsMode === "enabled" ? "enabled" : "prepared",
  };
}

export async function listStorefrontProducts(
  channelId: string,
  filters: {
    q?: string;
    category?: string;
    brand?: string;
    shippingType?: ApiShippingType;
    onlyAvailable?: boolean;
    featured?: boolean;
    limit?: number;
  },
): Promise<StorefrontProductsListDto> {
  const channel = await loadChannel(channelId);
  await expirePendingOrders(channelId);

  const publications = await prisma.storefrontPublication.findMany({
    where: {
      channelId,
      publicationStatus: "PUBLISHED",
    },
    orderBy: [
      { featured: "desc" },
      { publicName: "asc" },
      { createdAt: "desc" },
    ],
    ...productInclude,
  });

  const allProducts = publications.map((publication) =>
    storefrontProductFromPublication(
      channel,
      publication,
      channel.defaultPaymentMethod,
    ),
  );

  const categories = Array.from(
    new Set(allProducts.map((item) => item.category).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "es-AR"));
  const brands = Array.from(
    new Set(allProducts.map((item) => item.brand).filter(Boolean)),
  )
    .map((item) => item ?? "")
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "es-AR"));

  const q = filters.q?.trim() ?? "";
  const limited = Number.isFinite(filters.limit) ? Math.min(filters.limit ?? 48, 100) : 48;

  const filteredPublications = publications.filter((publication) => {
    if (filters.category && publication.category !== filters.category) return false;
    if (filters.brand && publication.product.brand !== filters.brand) return false;
    if (filters.shippingType && shippingTypeToApi(publication.shippingType) !== filters.shippingType) {
      return false;
    }
    if (filters.featured && !publication.featured) return false;
    if (filters.onlyAvailable) {
      const availableStock = resolvePublicationAvailableStock(publication);
      if (
        publication.stockMode === "STRICT" &&
        publication.publicationStatus === "PUBLISHED" &&
        availableStock <= 0
      ) {
        return false;
      }
      if (publication.stockMode === "OUT_OF_STOCK") {
        return false;
      }
    }
    return publicationMatchesSearch(publication, q);
  });

  return {
    items: filteredPublications
      .slice(0, limited)
      .map((publication) =>
        storefrontProductFromPublication(
          channel,
          publication,
          channel.defaultPaymentMethod,
        ),
      ),
    total: filteredPublications.length,
    categories,
    brands,
  };
}

export async function getStorefrontProduct(
  channelId: string,
  slug: string,
): Promise<StorefrontProductDto | null> {
  const channel = await loadChannel(channelId);
  await expirePendingOrders(channelId);

  const publication = await prisma.storefrontPublication.findFirst({
    where: {
      channelId,
      slug,
      publicationStatus: "PUBLISHED",
    },
    ...productInclude,
  });

  if (!publication) return null;

  return storefrontProductFromPublication(
    channel,
    publication,
    channel.defaultPaymentMethod,
  );
}

export async function validateStorefrontCart(
  channelId: string,
  items: StorefrontCartItemInput[],
  paymentMethod?: string,
): Promise<StorefrontCartValidationDto> {
  const channel = await loadChannel(channelId);
  await expirePendingOrders(channelId);

  const normalizedItems = normalizeCartItems(items);
  const publications = await loadPublicationsByProductIds(
    channelId,
    normalizedItems.map((item) => item.productId),
  );
  const publicationByProductId = new Map(
    publications.map((publication) => [publication.productId, publication]),
  );

  const messages: string[] = [];
  const lines: StorefrontCartValidationLine[] = [];
  const resolvedPaymentMethod =
    paymentMethod?.trim() || channel.defaultPaymentMethod;

  for (const item of normalizedItems) {
    const publication = publicationByProductId.get(item.productId);
    if (!publication) {
      messages.push(`El producto ${item.productId} no esta publicado en la tienda.`);
      continue;
    }
    lines.push(
      evaluateCartLine(
        channel,
        publication,
        item.quantity,
        resolvedPaymentMethod,
      ),
    );
  }

  const canCheckout =
    messages.length === 0 &&
    lines.length === normalizedItems.length &&
    lines.every(
      (line) => line.canBuy && line.acceptedQuantity === line.requestedQuantity,
    );

  return {
    canCheckout,
    subtotal: roundMoney(lines.reduce((total, line) => total + line.lineTotal, 0)),
    currencyCode: "ARS",
    items: lines,
    messages,
  };
}

export async function quoteStorefrontShipping(
  channelId: string,
  input: StorefrontShippingQuoteInput,
): Promise<StorefrontShippingQuoteDto> {
  const channel = await loadChannel(channelId);
  await expirePendingOrders(channelId);

  const normalizedItems = normalizeCartItems(input.items);
  const publications = await loadPublicationsByProductIds(
    channelId,
    normalizedItems.map((item) => item.productId),
  );
  const publicationByProductId = new Map(
    publications.map((publication) => [publication.productId, publication]),
  );

  for (const item of normalizedItems) {
    const publication = publicationByProductId.get(item.productId);
    if (!publication || publication.publicationStatus !== "PUBLISHED") {
      return {
        deliveryMethod: input.deliveryMethod,
        available: false,
        label: deliveryMethodLabel(input.deliveryMethod),
        amount: 0,
        currencyCode: "ARS",
        message: "El pedido incluye productos no publicados para la tienda.",
      };
    }

    if (
      !shippingTypeAllowsDeliveryMethod(
        publication.shippingType,
        input.deliveryMethod,
      )
    ) {
      return {
        deliveryMethod: input.deliveryMethod,
        available: false,
        label: deliveryMethodLabel(input.deliveryMethod),
        amount: 0,
        currencyCode: "ARS",
        message: `El producto ${publication.publicName} no admite esa modalidad de entrega.`,
      };
    }
  }

  if (input.deliveryMethod === "pickup") {
    return {
      deliveryMethod: input.deliveryMethod,
      available: true,
      label: "Retiro en local",
      amount: 0,
      currencyCode: "ARS",
      message: "Opcional",
    };
  }

  if (input.deliveryMethod === "normal") {
    return {
      deliveryMethod: input.deliveryMethod,
      available: true,
      label: "Envio por transporte",
      amount: roundMoney(toNumber(channel.normalShippingAmount)),
      currencyCode: "ARS",
      message: "Monto fijo configurable del canal storefront.",
    };
  }

  if (input.deliveryMethod === "own_delivery") {
    return {
      deliveryMethod: input.deliveryMethod,
      available: true,
      label: "Retiro con transporte del cliente",
      amount: 0,
      currencyCode: "ARS",
      message: "Se coordina con el cliente o transportista habilitado.",
    };
  }

  return {
    deliveryMethod: input.deliveryMethod,
    available: true,
    label: "Coordinar despacho",
    amount: 0,
    currencyCode: "ARS",
    message: "La logistica se confirma luego de validar destino, peso y tipo de carga.",
  };
}

export async function createStorefrontOrder(
  channelId: string,
  input: StorefrontCreateOrderInput,
): Promise<StorefrontOrderDto> {
  const channel = await loadChannel(channelId);
  await expirePendingOrders(channelId);

  const normalizedItems = normalizeCartItems(input.items);
  if (!normalizedItems.length) {
    throw new StorefrontDomainError("El pedido no tiene items validos.", 400);
  }

  return prisma.$transaction(async (tx) => {
    await expirePendingOrdersTx(tx, channelId, new Date());

    const publications = await tx.storefrontPublication.findMany({
      where: {
        channelId,
        productId: { in: normalizedItems.map((item) => item.productId) },
      },
      ...productInclude,
    });

    const publicationByProductId = new Map(
      publications.map((publication) => [publication.productId, publication]),
    );
    const strictIds = publications
      .filter((publication) => publication.stockMode === "STRICT")
      .map((publication) => publication.id);

    if (strictIds.length) {
      await tx.$queryRaw`
        SELECT id
        FROM "StorefrontPublication"
        WHERE id IN (${Prisma.join(strictIds)})
        FOR UPDATE
      `;
    }

    const lockedPublications = strictIds.length
      ? await tx.storefrontPublication.findMany({
          where: { id: { in: strictIds } },
          ...productInclude,
        })
      : [];
    for (const publication of lockedPublications) {
      publicationByProductId.set(publication.productId, publication);
    }

    const validation = await Promise.resolve(
      normalizedItems.map((item) => {
        const publication = publicationByProductId.get(item.productId);
        if (!publication) {
          throw new StorefrontDomainError(
            `El producto ${item.productId} no esta publicado en el storefront.`,
            409,
          );
        }
        return evaluateCartLine(channel, publication, item.quantity, input.paymentMethod);
      }),
    );

    const invalidLine = validation.find(
      (line) => !line.canBuy || line.acceptedQuantity !== line.requestedQuantity,
    );
    if (invalidLine) {
      throw new StorefrontDomainError(
        invalidLine.warnings[0] || "El carrito no esta disponible para checkout.",
        409,
      );
    }

    const shipping = await quoteStorefrontShipping(channelId, {
      items: normalizedItems,
      deliveryMethod: input.deliveryMethod,
      address: input.deliveryAddress,
    });
    if (!shipping.available) {
      throw new StorefrontDomainError(
        shipping.message || "La modalidad de entrega no esta disponible.",
        409,
      );
    }

    const subtotal = roundMoney(
      validation.reduce((total, line) => total + line.lineTotal, 0),
    );
    const shippingTotal = roundMoney(shipping.amount);
    const total = roundMoney(subtotal + shippingTotal);
    const manualBillingRequired = validation.some((line) => {
      const publication = publicationByProductId.get(line.product.id);
      if (!publication) return true;
      return resolvePublicationItemManualBilling(channel, publication.billingMode);
    });

    const sequence = await reserveNextCounter(
      tx,
      channel.organizationId,
      ORDER_COUNTER_KEY,
      async () => {
        const lastOrder = await tx.storefrontOrder.findFirst({
          where: {
            organizationId: channel.organizationId,
            displayNumber: { not: null },
          },
          orderBy: { createdAt: "desc" },
          select: { displayNumber: true },
        });
        return parseSequenceNumber(lastOrder?.displayNumber);
      },
    );

    const expiresAt = new Date(Date.now() + channel.reserveTtlMinutes * 60_000);

    const created = await tx.storefrontOrder.create({
      data: {
        organizationId: channel.organizationId,
        channelId: channel.id,
        displayNumber: buildOrderDisplayNumber(sequence),
        status: "PENDING_PAYMENT",
        paymentStatus: "PENDING",
        currencyCode: "ARS",
        subtotal: subtotal.toFixed(2),
        shippingTotal: shippingTotal.toFixed(2),
        total: total.toFixed(2),
        deliveryMethod: apiDeliveryMethodToDb(input.deliveryMethod),
        deliveryAddress: input.deliveryAddress as Prisma.InputJsonValue | undefined,
        paymentMethod: input.paymentMethod.trim(),
        manualBillingRequired,
        customerDisplayName: compactSpaces(input.customer.displayName),
        customerEmail: input.customer.email.trim().toLowerCase(),
        customerPhone: compactSpaces(input.customer.phone),
        customerTaxId: input.customer.taxId?.replace(/\D/g, "") || undefined,
        customerFiscalCondition: input.customer.fiscalCondition,
        expiresAt,
        rawRequest: input as unknown as Prisma.InputJsonValue,
        items: {
          create: validation.map((line) => {
            const publication = publicationByProductId.get(line.product.id);
            if (!publication) {
              throw new StorefrontDomainError("No se pudo materializar el pedido.", 500);
            }
            const pricing = resolvePublicationPrice(channel, publication, input.paymentMethod);
            return {
              organizationId: channel.organizationId,
              publicationId: publication.id,
              productId: publication.productId,
              sku: publication.product.sku,
              publicName: publication.publicName,
              quantity: line.acceptedQuantity,
              unitPriceFinal: line.product.priceFinal.toFixed(2),
              lineTotal: line.lineTotal.toFixed(2),
              stockMode: publication.stockMode,
              shippingType: publication.shippingType,
              pricingMode: publication.pricingMode,
              fixedFinalPrice:
                publication.fixedFinalPrice === null
                  ? undefined
                  : roundMoney(toNumber(publication.fixedFinalPrice)).toFixed(2),
              basePrice: pricing.basePrice.toFixed(2),
              adjustmentPercentTotal: pricing.adjustmentPercentTotal.toFixed(4),
              manualBilling: resolvePublicationItemManualBilling(
                channel,
                publication.billingMode,
              ),
            };
          }),
        },
      },
      include: {
        items: true,
      },
    });

    for (const line of validation) {
      const publication = publicationByProductId.get(line.product.id);
      if (!publication || publication.stockMode !== "STRICT") continue;

      await tx.storefrontPublication.update({
        where: { id: publication.id },
        data: {
          webStockReserved: { increment: line.acceptedQuantity },
        },
      });

      await tx.storefrontStockReservation.create({
        data: {
          organizationId: channel.organizationId,
          channelId: channel.id,
          orderId: created.id,
          publicationId: publication.id,
          productId: publication.productId,
          quantity: line.acceptedQuantity,
          status: "RESERVED",
          expiresAt,
        },
      });
    }

    return orderToDto(
      { ...created, channel },
      publicationByProductId,
      input.paymentMethod,
    );
  });
}

const claimReservationTx = async (
  tx: Prisma.TransactionClient,
  reservationId: string,
  targetStatus: StorefrontReservationStatus,
  releaseReason: string,
  now: Date,
) =>
  tx.storefrontStockReservation.updateMany({
    where: {
      id: reservationId,
      status: "RESERVED",
    },
    data: {
      status: targetStatus,
      releasedAt: now,
      releaseReason,
    },
  });

export async function markStorefrontOrderPaymentApproved(
  channelId: string,
  orderId: string,
  payload: unknown,
): Promise<PaymentMutationResult> {
  const now = new Date();
  const eventKey = buildOrderEventKey(payload, "APPROVED");

  return prisma.$transaction(async (tx) => {
    const order = await tx.storefrontOrder.findFirst({
      where: {
        id: orderId,
        channelId,
      },
      include: {
        channel: {
          include: storefrontOrderChannelRelationInclude,
        },
        items: true,
        reservations: true,
      },
    });

    if (!order) {
      throw new StorefrontDomainError("Pedido storefront no encontrado.", 404);
    }

    const existingEvent = await tx.storefrontPaymentEvent.findUnique({
      where: {
        channelId_eventKey: {
          channelId,
          eventKey,
        },
      },
      select: {
        id: true,
        processedAt: true,
      },
    });

    if (existingEvent?.processedAt) {
      return {
        ok: true,
        alreadyProcessed: true,
        orderId: order.id,
        saleId: order.saleId,
      };
    }

    if (!existingEvent) {
      await tx.storefrontPaymentEvent.create({
        data: {
          organizationId: order.organizationId,
          channelId,
          orderId: order.id,
          action: "APPROVED",
          eventKey,
          paymentId:
            payload && typeof payload === "object" && "id" in payload
              ? String(payload.id)
              : undefined,
          externalReference:
            payload &&
            typeof payload === "object" &&
            "external_reference" in payload
              ? String(payload.external_reference ?? "")
              : undefined,
          payload: payload as Prisma.InputJsonValue,
        },
      });
    }

    if (order.paymentStatus === "APPROVED" && order.saleId) {
      await tx.storefrontPaymentEvent.update({
        where: { channelId_eventKey: { channelId, eventKey } },
        data: { processedAt: now },
      });
      return {
        ok: true,
        alreadyProcessed: true,
        orderId: order.id,
        saleId: order.saleId,
      };
    }

    for (const reservation of order.reservations) {
      const claimed = await claimReservationTx(
        tx,
        reservation.id,
        "CONSUMED",
        "payment_approved",
        now,
      );
      if (claimed.count !== 1) continue;

      await tx.storefrontPublication.updateMany({
        where: {
          id: reservation.publicationId,
          webStockReserved: { gte: reservation.quantity },
          webStockAvailable: { gte: reservation.quantity },
        },
        data: {
          webStockReserved: { decrement: reservation.quantity },
          webStockAvailable: { decrement: reservation.quantity },
        },
      });
    }

    const customerId = await findOrCreateStorefrontCustomerTx(
      tx,
      order.organizationId,
      {
        displayName: order.customerDisplayName,
        email: order.customerEmail,
        phone: order.customerPhone || "",
        taxId: order.customerTaxId || undefined,
        fiscalCondition:
          order.customerFiscalCondition === "RESPONSABLE_INSCRIPTO"
            ? "RESPONSABLE_INSCRIPTO"
            : order.customerFiscalCondition === "MONOTRIBUTISTA"
              ? "MONOTRIBUTISTA"
              : "CONSUMIDOR_FINAL",
      },
    );

    const saleSequence = await reserveNextCounter(
      tx,
      order.organizationId,
      SALE_COUNTER_KEY,
      async () => {
        const lastSale = await tx.sale.findFirst({
          where: {
            organizationId: order.organizationId,
            saleNumber: { not: null },
          },
          orderBy: { createdAt: "desc" },
          select: { saleNumber: true },
        });
        return parseSequenceNumber(lastSale?.saleNumber);
      },
    );

    const sale = await tx.sale.create({
      data: {
        organizationId: order.organizationId,
        customerId,
        status: "CONFIRMED",
        billingStatus: billingStatusForOrder(order.manualBillingRequired),
        paymentStatus: "PAID",
        saleNumber: String(saleSequence),
        saleDate: now,
        subtotal: roundMoney(toNumber(order.subtotal)).toFixed(2),
        taxes: "0.00",
        total: roundMoney(toNumber(order.total)).toFixed(2),
        paidTotal: roundMoney(toNumber(order.total)).toFixed(2),
        balance: "0.00",
        items: {
          create: order.items.map((item) => ({
            productId: item.productId,
            qty: item.quantity.toFixed(3),
            unitPrice: roundMoney(toNumber(item.unitPriceFinal)).toFixed(2),
            total: roundMoney(toNumber(item.lineTotal)).toFixed(2),
            taxRate: "0.00",
            taxAmount: "0.00",
          })),
        },
      },
      include: {
        items: true,
      },
    });

    if (STOCK_ENABLED && sale.items.length) {
      const movements = buildSaleOutMovements({
        organizationId: order.organizationId,
        occurredAt: now,
        note: `Venta web ${order.displayNumber || order.id}`,
        items: sale.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          qty: item.qty.toString(),
        })),
      });
      await tx.stockMovement.createMany({ data: movements });
    }

    await tx.saleEvent.create({
      data: {
        organizationId: order.organizationId,
        saleId: sale.id,
        action: "storefront_payment_approved",
        note: `Pedido web ${order.displayNumber || order.id} confirmado por Mercado Pago.`,
      },
    });

    await tx.storefrontOrder.update({
      where: { id: order.id },
      data: {
        saleId: sale.id,
        status: "CONFIRMED",
        paymentStatus: "APPROVED",
        approvedAt: now,
        paymentReference:
          payload && typeof payload === "object" && "id" in payload
            ? String(payload.id)
            : undefined,
      },
    });

    await tx.storefrontPaymentEvent.update({
      where: { channelId_eventKey: { channelId, eventKey } },
      data: { processedAt: now },
    });

    return {
      ok: true,
      alreadyProcessed: false,
      orderId: order.id,
      saleId: sale.id,
    };
  });
}

export async function markStorefrontOrderPaymentRejected(
  channelId: string,
  orderId: string,
  payload: unknown,
): Promise<PaymentMutationResult> {
  const now = new Date();
  const eventKey = buildOrderEventKey(payload, "REJECTED");

  return prisma.$transaction(async (tx) => {
    const order = await tx.storefrontOrder.findFirst({
      where: {
        id: orderId,
        channelId,
      },
      include: {
        channel: {
          include: storefrontOrderChannelRelationInclude,
        },
        items: true,
        reservations: true,
      },
    });

    if (!order) {
      throw new StorefrontDomainError("Pedido storefront no encontrado.", 404);
    }

    const existingEvent = await tx.storefrontPaymentEvent.findUnique({
      where: {
        channelId_eventKey: {
          channelId,
          eventKey,
        },
      },
      select: { id: true, processedAt: true },
    });

    if (existingEvent?.processedAt) {
      return {
        ok: true,
        alreadyProcessed: true,
        orderId: order.id,
        saleId: order.saleId,
      };
    }

    if (!existingEvent) {
      await tx.storefrontPaymentEvent.create({
        data: {
          organizationId: order.organizationId,
          channelId,
          orderId: order.id,
          action: "REJECTED",
          eventKey,
          paymentId:
            payload && typeof payload === "object" && "id" in payload
              ? String(payload.id)
              : undefined,
          externalReference:
            payload &&
            typeof payload === "object" &&
            "external_reference" in payload
              ? String(payload.external_reference ?? "")
              : undefined,
          payload: payload as Prisma.InputJsonValue,
        },
      });
    }

    if (order.paymentStatus === "APPROVED") {
      await tx.storefrontPaymentEvent.update({
        where: { channelId_eventKey: { channelId, eventKey } },
        data: { processedAt: now },
      });
      return {
        ok: true,
        alreadyProcessed: true,
        orderId: order.id,
        saleId: order.saleId,
      };
    }

    for (const reservation of order.reservations) {
      const claimed = await claimReservationTx(
        tx,
        reservation.id,
        "RELEASED",
        "payment_rejected",
        now,
      );
      if (claimed.count !== 1) continue;

      await tx.storefrontPublication.updateMany({
        where: {
          id: reservation.publicationId,
          webStockReserved: { gte: reservation.quantity },
        },
        data: {
          webStockReserved: { decrement: reservation.quantity },
        },
      });
    }

    await tx.storefrontOrder.update({
      where: { id: order.id },
      data: {
        status: "REJECTED",
        paymentStatus: "REJECTED",
        rejectedAt: now,
        paymentReference:
          payload && typeof payload === "object" && "id" in payload
            ? String(payload.id)
            : undefined,
      },
    });

    await tx.storefrontPaymentEvent.update({
      where: { channelId_eventKey: { channelId, eventKey } },
      data: { processedAt: now },
    });

    return {
      ok: true,
      alreadyProcessed: false,
      orderId: order.id,
      saleId: order.saleId,
    };
  });
}

export async function getStorefrontAdminChannel(organizationId: string) {
  return ensureDefaultStorefrontChannel(organizationId);
}

export async function updateStorefrontAdminChannel(
  organizationId: string,
  input: StorefrontChannelConfigInput,
) {
  const channel = await ensureDefaultStorefrontChannel(organizationId);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.storefrontChannel.update({
      where: { id: channel.id },
      data: {
        name: compactSpaces(input.name),
        storeName: compactSpaces(input.storeName),
        supportEmail: input.supportEmail?.trim() || null,
        supportPhone: input.supportPhone?.trim() || null,
        pickupAddress: input.pickupAddress?.trim() || null,
        currencyCode: input.currencyCode?.trim() || "ARS",
        defaultPriceListId: input.defaultPriceListId || null,
        allowsCustomerAccounts: input.allowsCustomerAccounts,
        customerAccountsMode: input.customerAccountsMode,
        defaultPaymentMethod: input.defaultPaymentMethod.trim(),
        globalPriceAdjustmentPercent: roundMoney(
          input.globalPriceAdjustmentPercent,
        ).toFixed(4),
        normalShippingAmount: roundMoney(input.normalShippingAmount).toFixed(2),
        reserveTtlMinutes: Math.max(1, Math.trunc(input.reserveTtlMinutes)),
        manualBillingByDefault: input.manualBillingByDefault,
      },
      ...getChannelInclude,
    });

    await tx.storefrontPaymentAdjustment.deleteMany({
      where: { channelId: channel.id },
    });

    if (input.paymentAdjustments.length) {
      await tx.storefrontPaymentAdjustment.createMany({
        data: input.paymentAdjustments.map((item) => ({
          organizationId,
          channelId: channel.id,
          paymentMethod: item.paymentMethod.trim(),
          percent: roundMoney(item.percent).toFixed(4),
          isActive: true,
        })),
      });
    }

    return tx.storefrontChannel.findUniqueOrThrow({
      where: { id: updated.id },
      ...getChannelInclude,
    });
  });
}

export async function createStorefrontAdminApiKey(
  organizationId: string,
  label: string,
) {
  const channel = await ensureDefaultStorefrontChannel(organizationId);
  const generated = buildStorefrontApiKeyValue();

  const apiKey = await prisma.storefrontApiKey.create({
    data: {
      organizationId,
      channelId: channel.id,
      label: compactSpaces(label),
      keyHash: generated.keyHash,
      keyPrefix: generated.keyPrefix,
      isActive: true,
    },
    select: {
      id: true,
      label: true,
      keyPrefix: true,
      createdAt: true,
    },
  });

  return {
    ...apiKey,
    value: generated.value,
  };
}

export async function deactivateStorefrontAdminApiKey(
  organizationId: string,
  apiKeyId: string,
) {
  const apiKey = await prisma.storefrontApiKey.findFirst({
    where: {
      id: apiKeyId,
      organizationId,
    },
    select: {
      id: true,
      label: true,
      isActive: true,
    },
  });

  if (!apiKey) {
    throw new StorefrontDomainError("Clave de conexion no encontrada.", 404);
  }

  if (!apiKey.isActive) {
    return apiKey;
  }

  return prisma.storefrontApiKey.update({
    where: { id: apiKey.id },
    data: { isActive: false },
    select: {
      id: true,
      label: true,
      isActive: true,
    },
  });
}

export async function listStorefrontAdminPublications(
  organizationId: string,
  query?: string,
): Promise<StorefrontAdminPublicationRow[]> {
  const channel = await ensureDefaultStorefrontChannel(organizationId);
  const [products, publications] = await Promise.all([
    prisma.product.findMany({
      where: { organizationId },
      include: {
        priceItems: {
          select: {
            priceListId: true,
            price: true,
          },
        },
      },
      orderBy: [{ name: "asc" }, { createdAt: "desc" }],
    }),
    prisma.storefrontPublication.findMany({
      where: { organizationId, channelId: channel.id },
      ...productInclude,
    }),
  ]);

  const publicationByProductId = new Map(
    publications.map((publication) => [publication.productId, publication]),
  );
  const rawQuery = query?.trim() || "";

  return products
    .filter((product) => {
      if (!rawQuery) return true;
      return (
        scoreProductSearchMatch(
          {
            id: product.id,
            name: product.name,
            brand: product.brand,
            model: product.model,
            sku: product.sku,
            purchaseCode: product.purchaseCode,
          },
          rawQuery,
        ) !== null
      );
    })
    .map((product) => {
      const publication = publicationByProductId.get(product.id) ?? null;
      const derivedSlug = normalizeSlug(publication?.publicName || product.name);
      const pricing =
        publication === null
          ? {
              priceFinal: resolveBasePrice(product, channel.defaultPriceListId),
            }
          : resolvePublicationPrice(channel, publication, channel.defaultPaymentMethod);

      return {
        publicationId: publication?.id ?? null,
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        brand: product.brand,
        unit: product.unit,
        slug: publication?.slug ?? derivedSlug,
        publicName: publication?.publicName ?? product.name,
        shortDescription:
          publication?.shortDescription ?? (product.model ? compactSpaces(product.model) : ""),
        longDescription: publication?.longDescription ?? "",
        category: publication?.category ?? "General",
        publicationStatus: publication?.publicationStatus ?? "PAUSED",
        stockMode: publication?.stockMode ?? "STRICT",
        webStockAvailable: publication?.webStockAvailable ?? 0,
        webStockReserved: publication?.webStockReserved ?? 0,
        shippingType: publication?.shippingType ?? "NORMAL",
        pricingMode: publication?.pricingMode ?? "AUTO",
        fixedFinalPrice:
          publication?.fixedFinalPrice === null || publication?.fixedFinalPrice === undefined
            ? null
            : roundMoney(toNumber(publication.fixedFinalPrice)),
        priceAdjustmentPercent: roundMoney(
          toNumber(publication?.priceAdjustmentPercent ?? 0),
        ),
        billingMode: publication?.billingMode ?? "DEFAULT",
        featured: publication?.featured ?? false,
        computedPriceFinal: pricing.priceFinal,
      };
    });
}

const ensureUniquePublicationSlug = async (
  organizationId: string,
  channelId: string,
  productId: string,
  requestedSlug: string,
) => {
  const base = normalizeSlug(requestedSlug);

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const existing = await prisma.storefrontPublication.findFirst({
      where: {
        organizationId,
        channelId,
        slug: candidate,
        NOT: { productId },
      },
      select: { id: true },
    });
    if (!existing) return candidate;
  }

  throw new StorefrontDomainError("No se pudo generar un slug unico.", 409);
};

export async function upsertStorefrontAdminPublication(
  organizationId: string,
  input: UpsertStorefrontPublicationInput,
) {
  const channel = await ensureDefaultStorefrontChannel(organizationId);
  const product = await prisma.product.findFirst({
    where: {
      organizationId,
      id: input.productId,
    },
    select: {
      id: true,
      name: true,
      model: true,
    },
  });

  if (!product) {
    throw new StorefrontDomainError("Producto no encontrado.", 404);
  }

  const slug = await ensureUniquePublicationSlug(
    organizationId,
    channel.id,
    input.productId,
    input.slug || input.publicName || product.name,
  );

  const data: Prisma.StorefrontPublicationUncheckedCreateInput = {
    organizationId,
    channelId: channel.id,
    productId: input.productId,
    slug,
    publicationStatus: input.publicationStatus,
    publicName: compactSpaces(input.publicName),
    shortDescription: compactSpaces(input.shortDescription),
    longDescription: input.longDescription.trim(),
    category: compactSpaces(input.category),
    featured: input.featured,
    shippingType: input.shippingType,
    stockMode: input.stockMode,
    webStockAvailable: Math.max(0, Math.trunc(input.webStockAvailable)),
    pricingMode: input.pricingMode,
    fixedFinalPrice:
      input.pricingMode === "FIXED" && input.fixedFinalPrice !== null && input.fixedFinalPrice !== undefined
        ? roundMoney(input.fixedFinalPrice).toFixed(2)
        : null,
    priceAdjustmentPercent: roundMoney(input.priceAdjustmentPercent).toFixed(4),
    billingMode: input.billingMode,
    hasGas: Boolean(input.flags?.hasGas),
    hasPressure: Boolean(input.flags?.hasPressure),
    isFlammable: Boolean(input.flags?.isFlammable),
    hasSpecialLogistics: Boolean(input.flags?.hasSpecialLogistics),
  };

  const existing = await prisma.storefrontPublication.findFirst({
    where: {
      organizationId,
      channelId: channel.id,
      productId: input.productId,
    },
    select: {
      id: true,
      webStockReserved: true,
    },
  });

  if (existing) {
    await prisma.storefrontPublication.update({
      where: { id: existing.id },
      data: {
        ...data,
        webStockReserved: existing.webStockReserved,
      },
    });
  } else {
    await prisma.storefrontPublication.create({ data });
  }

  return prisma.storefrontPublication.findFirstOrThrow({
    where: {
      organizationId,
      channelId: channel.id,
      productId: input.productId,
    },
    ...productInclude,
  });
}

export async function listStorefrontAdminOrders(
  organizationId: string,
  status?: StorefrontOrderStatus,
) {
  const channel = await ensureDefaultStorefrontChannel(organizationId);
  await expirePendingOrders(channel.id);

  const orders = await prisma.storefrontOrder.findMany({
    where: {
      organizationId,
      channelId: channel.id,
      ...(status ? { status } : {}),
    },
    include: {
      items: true,
    },
    orderBy: [{ createdAt: "desc" }],
    take: 100,
  });

  return orders.map((order) => ({
    id: order.id,
    displayNumber: order.displayNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    customerDisplayName: order.customerDisplayName,
    customerEmail: order.customerEmail,
    total: roundMoney(toNumber(order.total)),
    itemCount: order.items.length,
    createdAt: order.createdAt.toISOString(),
    expiresAt: order.expiresAt?.toISOString() ?? null,
  }));
}

export async function searchStorefrontOrders(
  channelId: string,
  input: StorefrontOrderTrackingSearchInput,
): Promise<StorefrontPublicOrderSummaryDto[]> {
  const channel = await loadChannel(channelId);
  await expirePendingOrders(channel.id);

  const reference = normalizeFreeText(input.reference);
  const contact = normalizeFreeText(input.contact);
  const directEmail = normalizeFreeText(input.email);
  const directPhone = normalizeFreeText(input.phone);
  const contactEmail = directEmail
    ? normalizeEmail(directEmail)
    : contact?.includes("@")
      ? normalizeEmail(contact)
      : null;
  const contactPhone = directPhone
    ? onlyDigits(directPhone)
    : contact && !contactEmail
      ? onlyDigits(contact)
      : null;
  const taxId = onlyDigits(input.taxId);
  const name = normalizeFreeText(input.name);
  const date = normalizeFreeText(input.date);
  const dateRange = date ? buildStorefrontOrderDateRange(date) : null;
  const usableNonDateCriteriaCount = [
    Boolean(contactEmail || (contactPhone && contactPhone.length >= 6)),
    Boolean(taxId && taxId.length >= 6),
    Boolean(name && name.length >= 3),
  ].filter(Boolean).length;

  if (!reference && !dateRange && usableNonDateCriteriaCount === 0) {
    throw new StorefrontDomainError(
      "Ingresa un codigo de pedido o comprobante, o completa la fecha de compra junto con otro dato.",
      400,
    );
  }

  if (!reference && !dateRange) {
    throw new StorefrontDomainError(
      "Sin codigo o comprobante, la fecha de compra es obligatoria.",
      400,
    );
  }

  if (!reference && usableNonDateCriteriaCount < 1) {
    throw new StorefrontDomainError(
      "Sin codigo o comprobante, completa la fecha de compra y al menos otro dato.",
      400,
    );
  }

  const and: Prisma.StorefrontOrderWhereInput[] = [];

  if (reference) {
    and.push(buildStorefrontOrderReferenceWhere(reference));
  }

  if (contactEmail) {
    and.push({
      customerEmail: { equals: contactEmail, mode: "insensitive" },
    });
  }

  if (contactPhone && contactPhone.length >= 6) {
    and.push({ customerPhone: { contains: contactPhone } });
  }

  if (taxId && taxId.length >= 6) {
    and.push({ customerTaxId: { contains: taxId } });
  }

  if (name && name.length >= 3) {
    and.push({
      customerDisplayName: { contains: name, mode: "insensitive" },
    });
  }

  if (dateRange) {
    and.push({
      createdAt: { gte: dateRange.start, lt: dateRange.end },
    });
  }

  if (and.length === 0) {
    throw new StorefrontDomainError("Agrega mas datos para ubicar el pedido.", 400);
  }

  const orders = await prisma.storefrontOrder.findMany({
    where: {
      organizationId: channel.organizationId,
      channelId: channel.id,
      AND: and,
    },
    include: {
      items: {
        include: {
          publication: {
            select: {
              slug: true,
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 8,
  });

  return orders.map(toPublicStorefrontOrderSummary);
}
