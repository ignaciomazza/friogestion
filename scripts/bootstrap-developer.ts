import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import {
  createOrganizationWithDefaults,
  ensureOrganizationDefaults,
} from "../src/lib/organizations/bootstrap";

type Args = {
  email?: string;
  password?: string;
  name?: string;
  organizationName?: string;
  organizationLegalName?: string;
  organizationTaxId?: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    const next = argv[i + 1];

    if (!current.startsWith("--")) continue;
    if (!next || next.startsWith("--")) continue;

    if (current === "--email") args.email = next;
    if (current === "--password") args.password = next;
    if (current === "--name") args.name = next;
    if (current === "--organization-name") args.organizationName = next;
    if (current === "--organization-legal-name") args.organizationLegalName = next;
    if (current === "--organization-tax-id") args.organizationTaxId = next;
  }

  return args;
}

function usage() {
  console.log(`
Uso:
  npm run bootstrap:developer -- --email developer@friogestion.com --organization-name "Frio Gestion Developer Lab" [--password "tu-password"] [--name "Developer"]
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = args.email?.trim().toLowerCase();
  const organizationName = args.organizationName?.trim();
  const name = args.name?.trim() || "Developer";
  const organizationLegalName = args.organizationLegalName?.trim() || undefined;
  const organizationTaxId = args.organizationTaxId?.trim() || undefined;

  if (!email || !organizationName) {
    usage();
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, isActive: true },
    });

    const generatedPassword =
      !existingUser && !args.password ? randomBytes(12).toString("base64url") : null;
    const password = args.password ?? generatedPassword;

    if (!existingUser && !password) {
      console.error("No se pudo resolver una contraseña para el usuario developer.");
      process.exit(1);
    }

    const result = await prisma.$transaction(
      async (tx) => {
        let user = existingUser;
        if (!user) {
          user = await tx.user.create({
            data: {
              email,
              name,
              passwordHash: await hashPassword(password as string),
              isActive: true,
            },
            select: { id: true, email: true, name: true, isActive: true },
          });
        } else if (!user.isActive || (name && name !== user.name)) {
          user = await tx.user.update({
            where: { id: user.id },
            data: {
              ...(user.isActive ? {} : { isActive: true }),
              ...(name ? { name } : {}),
            },
            select: { id: true, email: true, name: true, isActive: true },
          });
        }

        let organization = await tx.organization.findFirst({
          where: { name: organizationName },
          select: {
            id: true,
            name: true,
            legalName: true,
            taxId: true,
          },
        });

        if (!organization) {
          const created = await createOrganizationWithDefaults(
            tx,
            {
              name: organizationName,
              legalName: organizationLegalName,
              taxId: organizationTaxId,
            },
            "developer-bootstrap"
          );
          organization = {
            id: created.id,
            name: created.name,
            legalName: created.legalName,
            taxId: created.taxId,
          };
        } else {
          await ensureOrganizationDefaults(tx, organization.id, "developer-bootstrap");
        }

        await tx.membership.upsert({
          where: {
            organizationId_userId: {
              organizationId: organization.id,
              userId: user.id,
            },
          },
          update: { role: "OWNER" },
          create: {
            organizationId: organization.id,
            userId: user.id,
            role: "OWNER",
          },
        });

        return {
          user,
          organization,
          wasUserCreated: !existingUser,
        };
      },
      { maxWait: 10_000, timeout: 60_000 }
    );

    console.log("Bootstrap developer completado.");
    console.log(`Usuario: ${result.user.email} (${result.wasUserCreated ? "nuevo" : "existente"})`);
    console.log(`Empresa testing: ${result.organization.name} (${result.organization.id})`);
    if (generatedPassword) {
      console.log(`Contrasena autogenerada: ${generatedPassword}`);
      console.log("Guardala ahora; no se vuelve a mostrar.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Fallo bootstrap developer:", error);
  process.exit(1);
});
