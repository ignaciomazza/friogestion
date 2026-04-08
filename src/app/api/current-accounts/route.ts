import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { requireOrg } from "@/lib/auth/tenant";
import { reconcileAgingWithBalance } from "@/lib/current-accounts/aging";
import { logServerError } from "@/lib/server/log";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";

const parseNumber = (value?: string | null) => {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const bucketForAge = (days: number) => {
  if (days <= 30) return "bucket0";
  if (days <= 60) return "bucket30";
  if (days <= 90) return "bucket60";
  return "bucket90";
};

export async function GET(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);
    const type = req.nextUrl.searchParams.get("type");
    const query = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    const balanceFilter =
      req.nextUrl.searchParams.get("balance")?.toLowerCase() ?? "all";
    const minBalance = parseNumber(req.nextUrl.searchParams.get("minBalance"));
    const maxBalance = parseNumber(req.nextUrl.searchParams.get("maxBalance"));

    if (type !== "customer" && type !== "supplier") {
      return NextResponse.json({ error: "Tipo invalido" }, { status: 400 });
    }

    if (type === "customer") {
      const customerWhere: Prisma.CustomerWhereInput = query
        ? {
            organizationId,
            OR: [
              { displayName: { contains: query, mode: "insensitive" } },
              { taxId: { contains: query, mode: "insensitive" } },
            ],
          }
        : { organizationId };

      const customers = await prisma.customer.findMany({
        where: customerWhere,
        select: { id: true, displayName: true, taxId: true },
        orderBy: { displayName: "asc" },
      });
      const customerIds = customers.map((customer) => customer.id);

      const entries = await prisma.currentAccountEntry.findMany({
        where: {
          organizationId,
          counterpartyType: "CUSTOMER",
          ...(customerIds.length ? { customerId: { in: customerIds } } : {}),
        },
        select: { customerId: true, direction: true, amount: true },
      });

      const totals = new Map<
        string,
        { debit: number; credit: number; balance: number }
      >();
      for (const entry of entries) {
        if (!entry.customerId) continue;
        const current = totals.get(entry.customerId) ?? {
          debit: 0,
          credit: 0,
          balance: 0,
        };
        const amount = Number(entry.amount ?? 0);
        if (entry.direction === "DEBIT") {
          current.debit += amount;
        } else {
          current.credit += amount;
        }
        current.balance = current.debit - current.credit;
        totals.set(entry.customerId, current);
      }

      const openSales = customerIds.length
        ? await prisma.sale.findMany({
            where: {
              organizationId,
              customerId: { in: customerIds },
              balance: { gt: 0 },
            },
            select: {
              customerId: true,
              balance: true,
              saleDate: true,
              createdAt: true,
              total: true,
              paidTotal: true,
            },
          })
        : [];

      const now = new Date();
      const aging = new Map<
        string,
        { bucket0: number; bucket30: number; bucket60: number; bucket90: number }
      >();

      for (const sale of openSales) {
        const date = sale.saleDate ?? sale.createdAt;
        const ageDays = Math.floor(
          (now.getTime() - date.getTime()) / 86_400_000
        );
        const bucket = bucketForAge(ageDays);
        const balance =
          Number(sale.balance ?? 0) ||
          Math.max(
            Number(sale.total ?? 0) - Number(sale.paidTotal ?? 0),
            0
          );
        if (!sale.customerId || balance <= 0) continue;
        const current = aging.get(sale.customerId) ?? {
          bucket0: 0,
          bucket30: 0,
          bucket60: 0,
          bucket90: 0,
        };
        current[bucket] += balance;
        aging.set(sale.customerId, current);
      }

      const rows = customers.map((customer) => {
        const current = totals.get(customer.id) ?? {
          debit: 0,
          credit: 0,
          balance: 0,
        };
        const agingRowBase = aging.get(customer.id) ?? {
          bucket0: 0,
          bucket30: 0,
          bucket60: 0,
          bucket90: 0,
        };
        const agingRow = reconcileAgingWithBalance(agingRowBase, current.balance);
        return {
          id: customer.id,
          displayName: customer.displayName,
          taxId: customer.taxId ?? null,
          debit: current.debit.toFixed(2),
          credit: current.credit.toFixed(2),
          balance: current.balance.toFixed(2),
          aging0: agingRow.bucket0.toFixed(2),
          aging30: agingRow.bucket30.toFixed(2),
          aging60: agingRow.bucket60.toFixed(2),
          aging90: agingRow.bucket90.toFixed(2),
        };
      });

      const filtered = rows.filter((row) => {
        const balance = Number(row.balance || 0);
        if (balanceFilter === "positive" && balance <= 0) return false;
        if (balanceFilter === "negative" && balance >= 0) return false;
        if (balanceFilter === "zero" && Math.abs(balance) > 0.005) return false;
        if (balanceFilter === "nonzero" && Math.abs(balance) <= 0.005)
          return false;
        if (minBalance !== null && balance < minBalance) return false;
        if (maxBalance !== null && balance > maxBalance) return false;
        return true;
      });

      return NextResponse.json(filtered);
    }

    const supplierWhere: Prisma.SupplierWhereInput = query
      ? {
          organizationId,
          OR: [
            { displayName: { contains: query, mode: "insensitive" } },
            { taxId: { contains: query, mode: "insensitive" } },
          ],
        }
      : { organizationId };

    const suppliers = await prisma.supplier.findMany({
      where: supplierWhere,
      select: { id: true, displayName: true, taxId: true },
      orderBy: { displayName: "asc" },
    });
    const supplierIds = suppliers.map((supplier) => supplier.id);

    const entries = await prisma.currentAccountEntry.findMany({
      where: {
        organizationId,
        counterpartyType: "SUPPLIER",
        ...(supplierIds.length ? { supplierId: { in: supplierIds } } : {}),
      },
      select: { supplierId: true, direction: true, amount: true },
    });

    const totals = new Map<
      string,
      { debit: number; credit: number; balance: number }
    >();
    for (const entry of entries) {
      if (!entry.supplierId) continue;
      const current = totals.get(entry.supplierId) ?? {
        debit: 0,
        credit: 0,
        balance: 0,
      };
      const amount = Number(entry.amount ?? 0);
      if (entry.direction === "DEBIT") {
        current.debit += amount;
      } else {
        current.credit += amount;
      }
      current.balance = current.credit - current.debit;
      totals.set(entry.supplierId, current);
    }

    const openPurchases = supplierIds.length
      ? await prisma.purchaseInvoice.findMany({
          where: {
            organizationId,
            supplierId: { in: supplierIds },
            status: "CONFIRMED",
            balance: { gt: 0 },
          },
          select: {
            supplierId: true,
            balance: true,
            invoiceDate: true,
            createdAt: true,
            total: true,
            paidTotal: true,
          },
        })
      : [];

    const now = new Date();
    const aging = new Map<
      string,
      { bucket0: number; bucket30: number; bucket60: number; bucket90: number }
    >();

    for (const purchase of openPurchases) {
      const date = purchase.invoiceDate ?? purchase.createdAt;
      const ageDays = Math.floor(
        (now.getTime() - date.getTime()) / 86_400_000
      );
      const bucket = bucketForAge(ageDays);
      const balance =
        Number(purchase.balance ?? 0) ||
        Math.max(
          Number(purchase.total ?? 0) - Number(purchase.paidTotal ?? 0),
          0
        );
      if (!purchase.supplierId || balance <= 0) continue;
      const current = aging.get(purchase.supplierId) ?? {
        bucket0: 0,
        bucket30: 0,
        bucket60: 0,
        bucket90: 0,
      };
      current[bucket] += balance;
      aging.set(purchase.supplierId, current);
    }

    const rows = suppliers.map((supplier) => {
      const current = totals.get(supplier.id) ?? {
        debit: 0,
        credit: 0,
        balance: 0,
      };
      const agingRowBase = aging.get(supplier.id) ?? {
        bucket0: 0,
        bucket30: 0,
        bucket60: 0,
        bucket90: 0,
      };
      const agingRow = reconcileAgingWithBalance(agingRowBase, current.balance);
      return {
        id: supplier.id,
        displayName: supplier.displayName,
        taxId: supplier.taxId ?? null,
        debit: current.debit.toFixed(2),
        credit: current.credit.toFixed(2),
        balance: current.balance.toFixed(2),
        aging0: agingRow.bucket0.toFixed(2),
        aging30: agingRow.bucket30.toFixed(2),
        aging60: agingRow.bucket60.toFixed(2),
        aging90: agingRow.bucket90.toFixed(2),
      };
    });

    const filtered = rows.filter((row) => {
      const balance = Number(row.balance || 0);
      if (balanceFilter === "positive" && balance <= 0) return false;
      if (balanceFilter === "negative" && balance >= 0) return false;
      if (balanceFilter === "zero" && Math.abs(balance) > 0.005) return false;
      if (balanceFilter === "nonzero" && Math.abs(balance) <= 0.005)
        return false;
      if (minBalance !== null && balance < minBalance) return false;
      if (maxBalance !== null && balance > maxBalance) return false;
      return true;
    });

    return NextResponse.json(filtered);
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: authErrorStatus(error) }
      );
    }
    logServerError("api.current-accounts.get", error);
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
