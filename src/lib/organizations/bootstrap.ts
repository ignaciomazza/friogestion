import type { Prisma } from "@prisma/client";

type BootstrapSource = "admin" | "seed" | "developer-bootstrap";

export type CreateOrganizationInput = {
  name: string;
  legalName?: string;
  taxId?: string;
};

export async function ensureOrganizationDefaults(
  tx: Prisma.TransactionClient,
  organizationId: string,
  source: BootstrapSource
) {
  await tx.financeCurrency.upsert({
    where: { organizationId_code: { organizationId, code: "ARS" } },
    update: { isDefault: true, isActive: true, name: "Peso Argentino" },
    create: {
      organizationId,
      code: "ARS",
      name: "Peso Argentino",
      symbol: "$",
      isDefault: true,
      isActive: true,
    },
  });

  await tx.financeCurrency.upsert({
    where: { organizationId_code: { organizationId, code: "USD" } },
    update: { isDefault: false, isActive: true, name: "Dolar USA" },
    create: {
      organizationId,
      code: "USD",
      name: "Dolar USA",
      symbol: "US$",
      isDefault: false,
      isActive: true,
    },
  });

  const existingRate = await tx.exchangeRate.findFirst({
    where: {
      organizationId,
      baseCode: "USD",
      quoteCode: "ARS",
    },
    orderBy: { asOf: "desc" },
  });

  if (!existingRate) {
    await tx.exchangeRate.create({
      data: {
        organizationId,
        baseCode: "USD",
        quoteCode: "ARS",
        rate: "1200.00",
        source,
      },
    });
  }

  const accounts = [
    { name: "Caja ARS", type: "CASH" as const },
    { name: "Banco ARS", type: "BANK" as const },
  ];

  for (const account of accounts) {
    const existing = await tx.financeAccount.findFirst({
      where: { organizationId, name: account.name },
    });

    if (!existing) {
      await tx.financeAccount.create({
        data: {
          organizationId,
          name: account.name,
          type: account.type,
          currencyCode: "ARS",
          isActive: true,
        },
      });
    }
  }

  const paymentMethods = [
    { name: "Efectivo", type: "CASH" as const, requiresAccount: false },
    { name: "Transferencia", type: "TRANSFER" as const, requiresAccount: true },
  ];

  for (const method of paymentMethods) {
    const existing = await tx.paymentMethod.findFirst({
      where: { organizationId, name: method.name },
    });

    if (!existing) {
      await tx.paymentMethod.create({
        data: {
          organizationId,
          name: method.name,
          type: method.type,
          requiresAccount: method.requiresAccount,
          requiresApproval: false,
          requiresDoubleCheck: true,
          isActive: true,
        },
      });
    }
  }

  const priceList = await tx.priceList.findFirst({
    where: { organizationId, isDefault: true },
  });

  if (!priceList) {
    await tx.priceList.create({
      data: {
        organizationId,
        name: "Lista Default",
        currencyCode: "ARS",
        isDefault: true,
        isActive: true,
      },
    });
  }
}

export async function createOrganizationWithDefaults(
  tx: Prisma.TransactionClient,
  input: CreateOrganizationInput,
  source: BootstrapSource
) {
  const organization = await tx.organization.create({
    data: {
      name: input.name,
      legalName: input.legalName,
      taxId: input.taxId,
      receiptApprovalRoles: ["OWNER"],
    },
  });

  await ensureOrganizationDefaults(tx, organization.id, source);
  return organization;
}
