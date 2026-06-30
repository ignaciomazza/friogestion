import {
  PURCHASE_AUTHORIZATION_MODES,
  type PurchaseAuthorizationMode,
  type PurchaseDocumentType,
  type PurchaseVoucherKind,
} from "@/lib/purchases/fiscal";
import { PurchaseSelect } from "./PurchaseSelect";

type PurchaseSummary = {
  supplierName: string;
  invoiceNumber: string | null;
};

const DOCUMENT_TYPE_OPTIONS: Array<{
  value: PurchaseDocumentType;
  label: string;
}> = [
  { value: "INVOICE", label: "Factura" },
  { value: "CREDIT_NOTE", label: "Nota credito" },
  { value: "DEBIT_NOTE", label: "Nota debito" },
];

const VOUCHER_KIND_OPTIONS: Array<{
  value: PurchaseVoucherKind;
  label: string;
}> = [
  { value: "A", label: "A" },
  { value: "B", label: "B" },
  { value: "C", label: "C" },
];

const AUTHORIZATION_MODE_OPTIONS: Array<{
  value: PurchaseAuthorizationMode;
  label: string;
}> = PURCHASE_AUTHORIZATION_MODES.map((mode) => ({
  value: mode,
  label: mode,
}));

type PurchaseEditInvoiceModalProps = {
  editingInvoicePurchase: PurchaseSummary | null;
  editingDocumentType: PurchaseDocumentType;
  editingVoucherKind: PurchaseVoucherKind;
  editingInvoiceDate: string;
  editingInvoiceNumber: string;
  editingAuthorizationMode: PurchaseAuthorizationMode;
  editingAuthorizationCode: string;
  isSavingInvoiceEdit: boolean;
  revalidateAfterInvoiceEdit: boolean;
  onSetEditingDocumentType: (value: PurchaseDocumentType) => void;
  onSetEditingVoucherKind: (value: PurchaseVoucherKind) => void;
  onSetEditingInvoiceDate: (value: string) => void;
  onSetEditingInvoiceNumber: (value: string) => void;
  onSetEditingAuthorizationMode: (value: PurchaseAuthorizationMode) => void;
  onSetEditingAuthorizationCode: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
};

export default function PurchaseEditInvoiceModal({
  editingInvoicePurchase,
  editingDocumentType,
  editingVoucherKind,
  editingInvoiceDate,
  editingInvoiceNumber,
  editingAuthorizationMode,
  editingAuthorizationCode,
  isSavingInvoiceEdit,
  revalidateAfterInvoiceEdit,
  onSetEditingDocumentType,
  onSetEditingVoucherKind,
  onSetEditingInvoiceDate,
  onSetEditingInvoiceNumber,
  onSetEditingAuthorizationMode,
  onSetEditingAuthorizationCode,
  onClose,
  onSave,
}: PurchaseEditInvoiceModalProps) {
  if (!editingInvoicePurchase) return null;

  return (
    <div className="fixed inset-0 z-[126] flex items-center justify-center bg-zinc-950/35">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="purchase-edit-invoice-title"
        className="mx-4 my-6 w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_24px_80px_-40px_rgba(24,24,27,0.55)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="purchase-edit-invoice-title" className="text-lg font-semibold text-zinc-900">
              Editar datos del comprobante
            </h2>
            <p className="mt-1 truncate text-xs text-zinc-500">
              {editingInvoicePurchase.supplierName} · {editingInvoicePurchase.invoiceNumber ?? "Sin comprobante fiscal"}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="field-stack">
            <span className="input-label">Comprobante</span>
            <PurchaseSelect
              value={editingDocumentType}
              options={DOCUMENT_TYPE_OPTIONS}
              onValueChange={onSetEditingDocumentType}
              disabled={isSavingInvoiceEdit}
            />
          </label>
          <label className="field-stack">
            <span className="input-label">Tipo fiscal</span>
            <PurchaseSelect
              value={editingVoucherKind}
              options={VOUCHER_KIND_OPTIONS}
              onValueChange={onSetEditingVoucherKind}
              disabled={isSavingInvoiceEdit}
            />
          </label>
          <label className="field-stack">
            <span className="input-label">Fecha comprobante</span>
            <input
              type="date"
              className="input w-full min-w-0 cursor-pointer"
              value={editingInvoiceDate}
              onChange={(event) => onSetEditingInvoiceDate(event.target.value)}
              disabled={isSavingInvoiceEdit}
            />
          </label>
          <label className="field-stack">
            <span className="input-label">Numero comprobante</span>
            <input
              className="input"
              value={editingInvoiceNumber}
              onChange={(event) => onSetEditingInvoiceNumber(event.target.value)}
              placeholder="0001-00001234"
              disabled={isSavingInvoiceEdit}
            />
            <p className="text-[11px] text-zinc-500">Formato obligatorio: 0001-00001234 (con guion).</p>
          </label>
          <label className="field-stack">
            <span className="input-label">Autorizacion</span>
            <PurchaseSelect
              value={editingAuthorizationMode}
              options={AUTHORIZATION_MODE_OPTIONS}
              onValueChange={onSetEditingAuthorizationMode}
              disabled={isSavingInvoiceEdit}
            />
          </label>
          <label className="field-stack">
            <span className="input-label">{editingAuthorizationMode}</span>
            <input
              className="input"
              value={editingAuthorizationCode}
              onChange={(event) => onSetEditingAuthorizationCode(event.target.value)}
              placeholder={`Codigo ${editingAuthorizationMode}`}
              disabled={isSavingInvoiceEdit}
            />
          </label>
        </div>

        <p className="mt-3 text-xs text-zinc-500">Lo que guardes aca se usa para la proxima revalidacion ARCA.</p>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn w-full sm:w-auto" onClick={onClose} disabled={isSavingInvoiceEdit}>
            Cancelar
          </button>
          <button type="button" className="btn btn-emerald w-full sm:w-auto" onClick={onSave} disabled={isSavingInvoiceEdit}>
            {isSavingInvoiceEdit
              ? "Guardando..."
              : revalidateAfterInvoiceEdit
                ? "Guardar y revalidar"
                : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
