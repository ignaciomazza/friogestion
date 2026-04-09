import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import {
  createOrganizationWithDefaults,
  ensureOrganizationDefaults,
} from "../src/lib/organizations/bootstrap";

const prisma = new PrismaClient();

async function ensureOrganization(name: string) {
  const existing = await prisma.organization.findFirst({ where: { name } });
  if (existing) {
    await prisma.$transaction(
      async (tx) => {
        await ensureOrganizationDefaults(tx, existing.id, "seed");
      },
      { maxWait: 10_000, timeout: 60_000 }
    );
    return existing;
  }
  return prisma.$transaction(
    async (tx) => {
      return createOrganizationWithDefaults(
        tx,
        {
          name,
        },
        "seed"
      );
    },
    { maxWait: 10_000, timeout: 60_000 }
  );
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

}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
