export type ApiShippingType =
  | "normal"
  | "pickup"
  | "own_delivery"
  | "quote"
  | "restricted";

export type ApiDeliveryMethod =
  | "normal"
  | "pickup"
  | "own_delivery"
  | "quote";

export type StorefrontProductImage = {
  url: string;
  alt: string;
  key?: string;
};

export type StorefrontTechnicalSheetItem = {
  label: string;
  value: string;
};

export type StorefrontProductDto = {
  id: string;
  sku?: string | null;
  slug: string;
  isPublishedToStorefront: boolean;
  publicationStatus: "PUBLISHED" | "PAUSED";
  stockMode: "STRICT" | "CONSULT" | "BACKORDER" | "OUT_OF_STOCK";
  pricingMode: "AUTO" | "FIXED";
  fixedFinalPrice: number | null;
  publicName: string;
  shortDescription: string;
  longDescription: string;
  seoTitle?: string | null;
  metaDescription?: string | null;
  images: StorefrontProductImage[];
  category: string;
  subcategory?: string | null;
  productType?: string | null;
  capacity?: string | null;
  energyEfficiency?: string | null;
  warranty?: string | null;
  origin?: string | null;
  relatedTerms?: string[];
  indexable: boolean;
  priority: number;
  brand?: string | null;
  model?: string | null;
  technicalSheet: StorefrontTechnicalSheetItem[];
  priceFinal: number;
  currencyCode: "ARS";
  webStockAvailable: number;
  unit: string;
  weightKg?: number | null;
  dimensions?: {
    widthCm?: number;
    heightCm?: number;
    depthCm?: number;
  } | null;
  shippingType: ApiShippingType;
  flags: {
    hasGas: boolean;
    hasPressure: boolean;
    isFlammable: boolean;
    hasSpecialLogistics: boolean;
  };
  featured: boolean;
};

export type StorefrontConfigDto = {
  storeName: string;
  supportEmail: string;
  supportPhone: string;
  pickupAddress: string;
  currencyCode: "ARS";
  defaultPriceListName: string;
  allowsCustomerAccounts: boolean;
  customerAccountsMode: "prepared" | "enabled";
};

export type StorefrontCartItemInput = {
  productId: string;
  quantity: number;
};

export type StorefrontCartValidationLine = {
  product: StorefrontProductDto;
  requestedQuantity: number;
  acceptedQuantity: number;
  available: boolean;
  canBuy: boolean;
  warnings: string[];
  lineTotal: number;
};

export type StorefrontCartValidationDto = {
  canCheckout: boolean;
  subtotal: number;
  currencyCode: "ARS";
  items: StorefrontCartValidationLine[];
  messages: string[];
};

export type StorefrontShippingQuoteInput = {
  items: StorefrontCartItemInput[];
  deliveryMethod: ApiDeliveryMethod;
  address?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    notes?: string;
  };
};

export type StorefrontShippingQuoteDto = {
  deliveryMethod: ApiDeliveryMethod;
  available: boolean;
  label: string;
  amount: number;
  currencyCode: "ARS";
  message?: string;
};

export type StorefrontOrderCustomerInput = {
  displayName: string;
  email: string;
  phone: string;
  taxId?: string;
  fiscalCondition:
    | "CONSUMIDOR_FINAL"
    | "MONOTRIBUTISTA"
    | "RESPONSABLE_INSCRIPTO";
};

export type StorefrontCreateOrderInput = {
  items: StorefrontCartItemInput[];
  customer: StorefrontOrderCustomerInput;
  deliveryMethod: ApiDeliveryMethod;
  deliveryAddress?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    notes?: string;
  };
  paymentMethod: string;
};

export type StorefrontOrderDto = {
  id: string;
  displayNumber: string | null;
  status: "pending_payment" | "confirmed" | "rejected" | "cancelled";
  paymentStatus: "pending" | "approved" | "rejected" | "cancelled" | "refunded";
  subtotal: number;
  shippingTotal: number;
  total: number;
  currencyCode: "ARS";
  items: StorefrontCartValidationLine[];
};

export type StorefrontPublicOrderItemDto = {
  id: string;
  productId: string;
  slug: string | null;
  sku: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type StorefrontPublicOrderSummaryDto = {
  id: string;
  friogestionOrderId: string;
  displayNumber: string | null;
  orderCode: string;
  status:
    | "PENDING_PAYMENT"
    | "CONFIRMED"
    | "REJECTED"
    | "CANCELLED"
    | "EXPIRED";
  paymentStatus:
    | "PENDING"
    | "APPROVED"
    | "REJECTED"
    | "CANCELLED"
    | "REFUNDED";
  customerName: string;
  maskedEmail: string;
  maskedPhone: string | null;
  maskedTaxId: string | null;
  deliveryMethod: ApiDeliveryMethod;
  subtotal: number;
  shippingTotal: number;
  total: number;
  mercadoPagoPaymentId: string | null;
  mercadoPagoStatus: string | null;
  createdAt: string;
  updatedAt: string;
  items: StorefrontPublicOrderItemDto[];
};

export type StorefrontOrderTrackingSearchInput = {
  reference?: string | null;
  contact?: string | null;
  email?: string | null;
  phone?: string | null;
  taxId?: string | null;
  name?: string | null;
  date?: string | null;
};

export type StorefrontProductsListDto = {
  items: StorefrontProductDto[];
  total: number;
  categories: string[];
  brands: string[];
};
