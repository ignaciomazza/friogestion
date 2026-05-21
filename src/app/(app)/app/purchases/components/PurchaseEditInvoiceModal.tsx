type PurchaseSummary = {
  supplierName: string;
  invoiceNumber: string | null;
};

type PurchaseEditInvoiceModalProps = {
  editingInvoicePurchase: PurchaseSummary | null;
  editingVoucherKind: "A" | "B" | "C";
  editingInvoiceDate: string;
  editingInvoiceNumber: string;
  editingAuthorizationCode: string;
  isSavingInvoiceEdit: boolean;
  revalidateAfterInvoiceEdit: boolean;
  onSetEditingVoucherKind: (value: "A" | "B" | "C") => void;
  onSetEditingInvoiceDate: (value: string) => void;
  onSetEditingInvoiceNumber: (value: string) => void;
  onSetEditingAuthorizationCode: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
};

export default function PurchaseEditInvoiceModal({
  editingInvoicePurchase,
  editingVoucherKind,
  editingInvoiceDate,
  editingInvoiceNumber,
  editingAuthorizationCode,
  isSavingInvoiceEdit,
  revalidateAfterInvoiceEdit,
  onSetEditingVoucherKind,
  onSetEditingInvoiceDate,
  onSetEditingInvoiceNumber,
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
            <span className="input-label">Tipo de comprobante</span>
            <select
              className="input cursor-pointer"
              value={editingVoucherKind}
              onChange={(event) => onSetEditingVoucherKind(event.target.value as "A" | "B" | "C")}
              disabled={isSavingInvoiceEdit}
            >
              <option value="A">Factura A</option>
              <option value="B">Factura B</option>
              <option value="C">Factura C</option>
            </select>
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
          <label className="field-stack sm:col-span-2">
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
          <label className="field-stack sm:col-span-2">
            <span className="input-label">CAE/CAEA</span>
            <input
              className="input"
              value={editingAuthorizationCode}
              onChange={(event) => onSetEditingAuthorizationCode(event.target.value)}
              placeholder="Codigo de autorizacion"
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
