type SalePaymentMethodSource = {
  paymentStatus?: string | null;
  receipts?: Array<{
    lines?: Array<{
      paymentMethod?: {
        name?: string | null;
      } | null;
    }> | null;
  }> | null;
};

const UNPAID_PAYMENT_LABEL = "Cuenta corriente";
const UNKNOWN_PAYMENT_LABEL = "No informado";

export function resolveSalePaymentMethodLabel(
  source?: SalePaymentMethodSource | null,
) {
  if (!source) return UNKNOWN_PAYMENT_LABEL;

  const methodNames = (source.receipts ?? [])
    .flatMap((receipt) => receipt?.lines ?? [])
    .map((line) => line?.paymentMethod?.name?.trim() ?? "")
    .filter(Boolean);

  const uniqueNames = Array.from(new Set(methodNames));
  if (uniqueNames.length > 0) {
    return uniqueNames.join(" + ");
  }

  const paymentStatus = source.paymentStatus?.toUpperCase();
  if (paymentStatus === "UNPAID") {
    return UNPAID_PAYMENT_LABEL;
  }

  return UNKNOWN_PAYMENT_LABEL;
}
