import { CheckIcon } from "@/components/icons";
import { formatCurrencyARS } from "@/lib/format";

type ConfirmationRow = {
  label: string;
  value: string;
};

type PendingPurchasePreview = {
  total: number;
};

type PurchaseConfirmModalProps = {
  pendingPurchase: PendingPurchasePreview | null;
  editingPurchaseId: string | null;
  confirmationRows: ConfirmationRow[];
  status: string | null;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function PurchaseConfirmModal({
  pendingPurchase,
  editingPurchaseId,
  confirmationRows,
  status,
  isSubmitting,
  onCancel,
  onConfirm,
}: PurchaseConfirmModalProps) {
  if (!pendingPurchase) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/25">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-purchase-title"
        className="mx-4 my-6 w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_24px_80px_-40px_rgba(24,24,27,0.55)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="confirm-purchase-title" className="text-lg font-semibold text-zinc-900">
              {editingPurchaseId ? "Confirmar cambios" : "Confirmar compra"}
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              {editingPurchaseId
                ? "Revisa los datos principales antes de actualizar."
                : "Revisa los datos principales antes de registrar."}
            </p>
          </div>
          <span className="rounded-full border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700">
            {formatCurrencyARS(pendingPurchase.total)}
          </span>
        </div>

        <div className="mt-4 divide-y divide-zinc-200/70 rounded-xl border border-zinc-200/70">
          {confirmationRows.map((row) => (
            <div
              key={row.label}
              className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[150px_minmax(0,1fr)]"
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {row.label}
              </span>
              <span className="min-w-0 break-words text-zinc-900">{row.value}</span>
            </div>
          ))}
        </div>

        {status ? <p className="mt-3 text-xs text-rose-600">{status}</p> : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn w-full sm:w-auto" onClick={onCancel} disabled={isSubmitting}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-emerald w-full sm:w-auto"
            onClick={onConfirm}
            disabled={isSubmitting}
          >
            <CheckIcon className="size-4" />
            {isSubmitting
              ? "Confirmando..."
              : editingPurchaseId
                ? "Confirmar cambios"
                : "Confirmar compra"}
          </button>
        </div>
      </div>
    </div>
  );
}
