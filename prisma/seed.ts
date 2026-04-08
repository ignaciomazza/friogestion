import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function ensureOrganization(name: string) {
  const existing = await prisma.organization.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.organization.create({
    data: { name, receiptApprovalRoles: ["OWNER"] },
  });
}

async function ensureUser(email: string, password: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.user.create({
    data: { email, passwordHash, isActive: true },
  });
}

async function main() {
  const [org1, org2] = await Promise.all([
    ensureOrganization("Frio Gestion Demo 1"),
    ensureOrganization("Frio Gestion Demo 2"),
  ]);

  const user = await ensureUser("admin@friogestion.local", "admin1234");

  await prisma.membership.upsert({
    where: {
      organizationId_userId: { organizationId: org1.id, userId: user.id },
    },
    update: { role: "OWNER" },
    create: { organizationId: org1.id, userId: user.id, role: "OWNER" },
  });

  await prisma.membership.upsert({
    where: {
      organizationId_userId: { organizationId: org2.id, userId: user.id },
    },
    update: { role: "OWNER" },
    create: { organizationId: org2.id, userId: user.id, role: "OWNER" },
  });

  const orgs = [org1, org2];

  for (const org of orgs) {
    await prisma.financeCurrency.upsert({
      where: { organizationId_code: { organizationId: org.id, code: "ARS" } },
      update: { isDefault: true, isActive: true, name: "Peso Argentino" },
      create: {
        organizationId: org.id,
        code: "ARS",
        name: "Peso Argentino",
        symbol: "$",
        isDefault: true,
        isActive: true,
      },
    });

    await prisma.financeCurrency.upsert({
      where: { organizationId_code: { organizationId: org.id, code: "USD" } },
      update: { isDefault: false, isActive: true, name: "Dolar USA" },
      create: {
        organizationId: org.id,
        code: "USD",
        name: "Dolar USA",
        symbol: "US$",
        isDefault: false,
        isActive: true,
      },
    });

    const existingRate = await prisma.exchangeRate.findFirst({
      where: {
        organizationId: org.id,
        baseCode: "USD",
        quoteCode: "ARS",
      },
      orderBy: { asOf: "desc" },
    });

    if (!existingRate) {
      await prisma.exchangeRate.create({
        data: {
          organizationId: org.id,
          baseCode: "USD",
          quoteCode: "ARS",
          rate: "1200.00",
          source: "seed",
        },
      });
    }

    const accounts = [
      { name: "Caja ARS", type: "CASH" },
      { name: "Banco ARS", type: "BANK" },
    ];
    for (const account of accounts) {
      const existing = await prisma.financeAccount.findFirst({
        where: { organizationId: org.id, name: account.name },
      });
      if (!existing) {
        await prisma.financeAccount.create({
          data: {
            organizationId: org.id,
            name: account.name,
            type: account.type as "CASH" | "BANK",
            currencyCode: "ARS",
            isActive: true,
          },
        });
      }
    }

    const paymentMethods = [
      { name: "Efectivo", type: "CASH", requiresAccount: false },
      { name: "Transferencia", type: "TRANSFER", requiresAccount: true },
    ];

    for (const method of paymentMethods) {
      const existing = await prisma.paymentMethod.findFirst({
        where: { organizationId: org.id, name: method.name },
      });
      if (!existing) {
        await prisma.paymentMethod.create({
          data: {
            organizationId: org.id,
            name: method.name,
            type: method.type as "CASH" | "TRANSFER",
            requiresAccount: method.requiresAccount,
            requiresApproval: false,
            isActive: true,
          },
        });
      }
    }

    const priceList = await prisma.priceList.findFirst({
      where: { organizationId: org.id, name: "Lista General" },
    });

    if (!priceList) {
      await prisma.priceList.create({
        data: {
          organizationId: org.id,
          name: "Lista General",
          currencyCode: "ARS",
          isDefault: true,
          isActive: true,
        },
      });
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
