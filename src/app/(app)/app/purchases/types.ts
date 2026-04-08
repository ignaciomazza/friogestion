export type ProductOption = {
  id: string;
  name: string;
  sku: string | null;
  brand: string | null;
  model: string | null;
  unit: string | null;
  cost: string | null;
  price: string | null;
};

export type SupplierOption = {
  id: string;
  displayName: string;
  taxId: string | null;
  arcaVerificationStatus?: string | null;
  arcaVerificationCheckedAt?: string | null;
  arcaVerificationMessage?: string | null;
};

export type PurchaseRow = {
  id: string;
  supplierId: string;
  supplierName: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  createdAt: string;
  total: string | null;
  paidTotal?: string | null;
  balance?: string | null;
  paymentStatus?: string | null;
  itemsCount: number;
  status: string;
  arcaValidationStatus?: string | null;
  arcaValidationMessage?: string | null;
  arcaValidationCheckedAt?: string | null;
};

export type PurchaseItemForm = {
  productId: string;
  productSearch: string;
  qty: string;
  unitCost: string;
  unitPrice: string;
};
