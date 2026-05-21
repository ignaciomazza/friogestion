export function assertManualBillingStatusAllowed(
  billingStatus: "NOT_BILLED" | "TO_BILL" | "BILLED",
) {
  if (billingStatus === "BILLED") {
    throw new Error("SALE_BILLING_STATUS_MANUAL_BILLED_NOT_ALLOWED");
  }
}
