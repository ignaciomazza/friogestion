import type { CustomerFiscalTaxProfile } from "@/lib/customers/fiscal-profile";

export type QuoteRow = {
  id: string;
  customerName: string;
  quoteNumber: string | null;
  validUntil: string | null;
  createdAt: string;
  subtotal: string | null;
  taxes: string | null;
  extraType?: string | null;
  extraValue?: string | null;
  extraAmount?: string | null;
  total: string | null;
  status: string;
  saleId: string | null;
  priceListId?: string | null;
  priceListName?: string | null;
};

export type CustomerOption = {
  id: string;
  displayName: string;
  legalName: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  type: string;
  fiscalTaxProfile?: CustomerFiscalTaxProfile | null;
  systemKey: string | null;
  defaultPriceListId?: string | null;
};

export type ProductOption = {
  id: string;
  name: string;
  sku: string | null;
  purchaseCode: string | null;
  brand: string | null;
  model: string | null;
  unit: string | null;
  cost: string | null;
  costUsd: string | null;
  price: string | null;
  prices?: Array<{
    priceListId: string;
    price: string;
    percentage?: string | null;
  }>;
};

export type PriceListOption = {
  id: string;
  name: string;
  currencyCode: string;
  isDefault: boolean;
  isConsumerFinal: boolean;
  isActive: boolean;
  sortOrder: number;
};

export type QuoteItemForm = {
  productId: string;
  productSearch: string;
  qty: string;
  unitPrice: string;
  taxRate: string;
};
