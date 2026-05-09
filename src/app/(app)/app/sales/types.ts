export type SaleRow = {
  id: string;
  customerName: string;
  customerPhone?: string | null;
  customerTaxId?: string | null;
  customerType?: string | null;
  customerFiscalTaxProfile?: string | null;
  saleNumber: string | null;
  saleDate: string | null;
  createdAt: string;
  subtotal?: string | null;
  taxes?: string | null;
  extraType?: string | null;
  extraValue?: string | null;
  extraAmount?: string | null;
  total: string | null;
  paidTotal?: string | null;
  balance?: string | null;
  paymentStatus?: string | null;
  hasPendingDoubleCheck?: boolean | null;
  status: string;
  billingStatus: string;
  items?: Array<{
    id?: string;
    productName: string;
    qty: string;
    unitPrice: string;
    total: string;
    taxRate?: string | null;
    taxAmount?: string | null;
  }>;
};

export type SaleEventRow = {
  id: string;
  saleId: string;
  saleNumber: string | null;
  customerName: string;
  action: string;
  note: string | null;
  actorName: string | null;
  actorEmail: string | null;
  createdAt: string;
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

export type SaleItemForm = {
  productId: string;
  productSearch: string;
  qty: string;
  unitPrice: string;
};
