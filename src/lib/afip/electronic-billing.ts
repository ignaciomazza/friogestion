import { getAfipClient } from "@/lib/afip/client";

export async function getLastVoucher(
  organizationId: string,
  pointOfSale: number,
  voucherType: number
) {
  const afip = await getAfipClient(organizationId);
  return afip.ElectronicBilling.getLastVoucher(pointOfSale, voucherType);
}
