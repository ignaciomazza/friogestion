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
  systemKey: string | null;
};

export type ProductOption = {
  id: string;
  name: string;
  sku: string | null;
  brand: string | null;
  model: string | null;
  unit: string | null;
  price: string | null;
};

export type QuoteItemForm = {
  productId: string;
  productSearch: string;
  qty: string;
  unitPrice: string;
  taxRate: string;
};
