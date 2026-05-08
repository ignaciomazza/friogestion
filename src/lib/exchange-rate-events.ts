export const EXCHANGE_RATE_UPDATED_EVENT = "friogestion:exchange-rate-updated";

export type ExchangeRateUpdatedDetail = {
  baseCode: string;
  quoteCode: string;
  rate: string;
};

export function notifyExchangeRateUpdated(detail: ExchangeRateUpdatedDetail) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<ExchangeRateUpdatedDetail>(EXCHANGE_RATE_UPDATED_EVENT, {
      detail,
    })
  );
}

export function subscribeExchangeRateUpdated(
  listener: (detail: ExchangeRateUpdatedDetail) => void
) {
  if (typeof window === "undefined") return () => {};

  const handleExchangeRateUpdated = (event: Event) => {
    const detail = (event as CustomEvent<ExchangeRateUpdatedDetail>).detail;
    if (
      !detail ||
      typeof detail.baseCode !== "string" ||
      typeof detail.quoteCode !== "string" ||
      typeof detail.rate !== "string"
    ) {
      return;
    }

    listener(detail);
  };

  window.addEventListener(
    EXCHANGE_RATE_UPDATED_EVENT,
    handleExchangeRateUpdated
  );
  return () => {
    window.removeEventListener(
      EXCHANGE_RATE_UPDATED_EVENT,
      handleExchangeRateUpdated
    );
  };
}
