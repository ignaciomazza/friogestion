import { getAfipClient } from "@/lib/afip/client";

export async function getLastVoucher(
  organizationId: string,
  pointOfSale: number,
  voucherType: number
) {
  const afip = await getAfipClient(organizationId);
  return afip.ElectronicBilling.getLastVoucher(pointOfSale, voucherType);
}

function toPositiveInteger(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
}

function readPointNumber(entry: unknown) {
  if (typeof entry === "number" || typeof entry === "string") {
    return toPositiveInteger(entry);
  }
  if (!entry || typeof entry !== "object") return null;

  const record = entry as Record<string, unknown>;
  return (
    toPositiveInteger(record.Nro) ??
    toPositiveInteger(record.nro) ??
    toPositiveInteger(record.PtoVta) ??
    toPositiveInteger(record.ptoVta) ??
    toPositiveInteger(record.pto_vta) ??
    null
  );
}

export async function getSalesPoints(organizationId: string) {
  const afip = await getAfipClient(organizationId);
  const pointsRaw = await afip.ElectronicBilling.getSalesPoints();
  if (!Array.isArray(pointsRaw)) return [];

  return Array.from(
    new Set(
      pointsRaw
        .map((entry) => readPointNumber(entry))
        .filter((point): point is number => point !== null)
    )
  ).sort((a, b) => a - b);
}
