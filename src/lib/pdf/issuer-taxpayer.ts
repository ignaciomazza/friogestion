import { lookupTaxpayerByCuit } from "@/lib/arca/taxpayer-lookup";

type ResolveIssuerTaxpayerInput = {
  organizationId: string;
  taxId?: string | null;
};

type IssuerTaxpayerSummary = {
  fiscalCondition: string | null;
  activityStart: string | null;
};

function formatEsArDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("es-AR");
}

export async function resolveIssuerTaxpayerSummary(
  input: ResolveIssuerTaxpayerInput,
): Promise<IssuerTaxpayerSummary> {
  const normalizedTaxId = input.taxId?.trim();
  if (!normalizedTaxId) {
    return {
      fiscalCondition: null,
      activityStart: null,
    };
  }

  try {
    const result = await lookupTaxpayerByCuit({
      organizationId: input.organizationId,
      taxId: normalizedTaxId,
    });

    return {
      fiscalCondition: result.taxpayer.taxStatus?.trim() || null,
      activityStart: formatEsArDate(result.taxpayer.registeredAt),
    };
  } catch {
    return {
      fiscalCondition: null,
      activityStart: null,
    };
  }
}
