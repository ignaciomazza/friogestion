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
  images: StorefrontProductImage[];
  category: string;
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

export type StorefrontProductsListDto = {
  items: StorefrontProductDto[];
  total: number;
  categories: string[];
  brands: string[];
};
