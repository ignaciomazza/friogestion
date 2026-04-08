import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrg, requireRole } from "@/lib/auth/tenant";
import { parseOptionalDate } from "@/lib/validation";

const planSchema = z.object({
  saleId: z.string().min(1),
  type: z.enum(["CARD", "CREDIT"]),
  installmentsCount: z.coerce.number().int().min(1).max(60),
  interestRate: z.coerce.number().min(0).max(100).optional(),
  startDate: z.string().min(1),
  frequency: z.enum(["MONTHLY"]).optional(),
  principalAmount: z.coerce.number().positive().optional(),
});

const planUpdateSchema = planSchema;

const addMonths = (value: Date, months: number) => {
  const date = new Date(value);
  const day = date.getDate();
  date.setMonth(date.getMonth() + months);
  if (date.getDate() < day) {
    date.setDate(0);
  }
  return date;
};

const recalcSaleTotals = async (
  tx: Prisma.TransactionClient,
  saleId: string
) => {
  const sale = await tx.sale.findUnique({
    where: { id: saleId },
    select: { id: true, total: true },
  });
  if (!sale) return;
  const summary = await tx.receiptLine.aggregate({
    where: { receipt: { saleId, status: "CONFIRMED" } },
    _sum: { amountBase: true },
  });
  const paidTotal = Number(summary._sum.amountBase ?? 0);
  const total = Number(sale.total ?? 0);
  const balance = Math.max(total - paidTotal, 0);
  const paymentStatus =
    paidTotal <= 0 ? "UNPAID" : balance <= 0.005 ? "PAID" : "PARTIAL";

  await tx.sale.update({
    where: { id: saleId },
    data: {
      paidTotal: paidTotal.toFixed(2),
      balance: balance.toFixed(2),
      paymentStatus,
    },
  });
};

export async function GET(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);
    const saleId = req.nextUrl.searchParams.get("saleId");
    if (!saleId) {
      return NextResponse.json({ error: "Falta saleId" }, { status: 400 });
    }

    const plan = await prisma.installmentPlan.findFirst({
      where: { organizationId, saleId },
      include: {
        installments: {
          include: {
            payments: {
              include: {
                receipt: true,
              },
            },
          },
        },
      },
    });

    if (!plan) {
      return NextResponse.json({ plan: null, installments: [] });
    }

    return NextResponse.json({
      plan: {
        id: plan.id,
        type: plan.type,
        installmentsCount: plan.installmentsCount,
        interestRate: plan.interestRate?.toString() ?? null,
        principal: plan.principal.toString(),
        interestAmount: plan.interestAmount.toString(),
        total: plan.total.toString(),
        startDate: plan.startDate.toISOString(),
        frequency: plan.frequency,
      },
      installments: plan.installments.map((item) => ({
        id: item.id,
        number: item.number,
        dueDate: item.dueDate.toISOString(),
        amount: item.amount.toString(),
        paidAmount: item.paidAmount.toString(),
        status: item.status,
        paidAt: item.paidAt?.toISOString() ?? null,
        payments: item.payments.map((payment) => ({
          id: payment.id,
          receiptId: payment.receiptId,
          receivedAt: payment.receipt.receivedAt.toISOString(),
          amount: payment.amount.toString(),
        })),
      })),
    });
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, ["OWNER", "ADMIN", "SALES"]);
    const body = planSchema.parse(await req.json());

    const sale = await prisma.sale.findFirst({
      where: { id: body.saleId, organizationId: membership.organizationId },
      select: { id: true, total: true },
    });

    if (!sale) {
      return NextResponse.json(
        { error: "Venta no encontrada" },
        { status: 404 }
      );
    }

    const existing = await prisma.installmentPlan.findFirst({
      where: { organizationId: membership.organizationId, saleId: sale.id },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: "La venta ya tiene un plan" },
        { status: 409 }
      );
    }

    const startDateResult = parseOptionalDate(body.startDate);
    if (startDateResult.error || !startDateResult.date) {
      return NextResponse.json({ error: "Fecha invalida" }, { status: 400 });
    }

    const baseSaleTotal = Number(sale.total ?? 0);
    const principal = Number(body.principalAmount ?? baseSaleTotal);
    const interestRate = Number(body.interestRate ?? 0);
    const interestAmount = principal * (interestRate / 100);
    const financingTotal = principal + interestAmount;
    const saleTotalWithInterest = baseSaleTotal + interestAmount;
    const totalCents = Math.round(financingTotal * 100);
    const baseCents = Math.floor(totalCents / body.installmentsCount);
    const remainder = totalCents - baseCents * body.installmentsCount;

    const installments = Array.from({ length: body.installmentsCount }, (_, idx) => {
      const amountCents =
        idx === body.installmentsCount - 1 ? baseCents + remainder : baseCents;
      return {
        number: idx + 1,
        dueDate: addMonths(startDateResult.date as Date, idx),
        amount: (amountCents / 100).toFixed(2),
      };
    });

    const created = await prisma.$transaction(async (tx) => {
      const plan = await tx.installmentPlan.create({
        data: {
          organizationId: membership.organizationId,
          saleId: sale.id,
          type: body.type,
          installmentsCount: body.installmentsCount,
          interestRate: interestRate ? interestRate.toFixed(2) : undefined,
          principal: principal.toFixed(2),
          interestAmount: interestAmount.toFixed(2),
          total: financingTotal.toFixed(2),
          startDate: startDateResult.date as Date,
          frequency: body.frequency ?? "MONTHLY",
          installments: {
            create: installments.map((item) => ({
              number: item.number,
              dueDate: item.dueDate,
              amount: item.amount,
            })),
          },
        },
        include: { installments: true },
      });

      if (interestAmount > 0) {
        await tx.saleCharge.create({
          data: {
            organizationId: membership.organizationId,
            saleId: sale.id,
            type: "INTEREST",
            amount: interestAmount.toFixed(2),
            note:
              body.type === "CARD"
                ? `Interes tarjeta ${interestRate.toFixed(2)}%`
                : `Interes credito ${interestRate.toFixed(2)}%`,
          },
        });
      }

      await tx.sale.update({
        where: { id: sale.id },
        data: {
          total: saleTotalWithInterest.toFixed(2),
          balance: saleTotalWithInterest.toFixed(2),
        },
      });

      await recalcSaleTotals(tx, sale.id);

      return plan;
    });

    return NextResponse.json({
      plan: {
        id: created.id,
        type: created.type,
        installmentsCount: created.installmentsCount,
        interestRate: created.interestRate?.toString() ?? null,
        principal: created.principal.toString(),
        interestAmount: created.interestAmount.toString(),
        total: created.total.toString(),
        startDate: created.startDate.toISOString(),
        frequency: created.frequency,
      },
      installments: created.installments.map((item) => ({
        id: item.id,
        number: item.number,
        dueDate: item.dueDate.toISOString(),
        amount: item.amount.toString(),
        paidAmount: item.paidAmount?.toString() ?? "0",
        status: item.status,
        paidAt: item.paidAt?.toISOString() ?? null,
        payments: [],
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    return NextResponse.json({ error: "No se pudo crear" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, ["OWNER", "ADMIN", "SALES"]);
    const body = planUpdateSchema.parse(await req.json());

    const plan = await prisma.installmentPlan.findFirst({
      where: { organizationId: membership.organizationId, saleId: body.saleId },
      include: { installments: true, sale: true },
    });

    if (!plan) {
      return NextResponse.json({ error: "Plan no encontrado" }, { status: 404 });
    }

    const sale = plan.sale;
    if (Number(sale.paidTotal ?? 0) > 0) {
      return NextResponse.json(
        { error: "La venta ya tiene cobros registrados" },
        { status: 409 }
      );
    }

    const hasPayments = await prisma.installmentPayment.findFirst({
      where: { installment: { planId: plan.id } },
      select: { id: true },
    });
    if (hasPayments) {
      return NextResponse.json(
        { error: "Hay cuotas con pagos registrados" },
        { status: 409 }
      );
    }

    const startDateResult = parseOptionalDate(body.startDate);
    if (startDateResult.error || !startDateResult.date) {
      return NextResponse.json({ error: "Fecha invalida" }, { status: 400 });
    }

    const baseSaleTotal = Math.max(
      Number(sale.total ?? 0) - Number(plan.interestAmount ?? 0),
      0,
    );
    const principal = Number(body.principalAmount ?? plan.principal ?? 0);
    const interestRate = Number(body.interestRate ?? 0);
    const interestAmount = principal * (interestRate / 100);
    const financingTotal = principal + interestAmount;
    const saleTotalWithInterest = baseSaleTotal + interestAmount;
    const totalCents = Math.round(financingTotal * 100);
    const baseCents = Math.floor(totalCents / body.installmentsCount);
    const remainder = totalCents - baseCents * body.installmentsCount;

    const installments = Array.from({ length: body.installmentsCount }, (_, idx) => {
      const amountCents =
        idx === body.installmentsCount - 1 ? baseCents + remainder : baseCents;
      return {
        number: idx + 1,
        dueDate: addMonths(startDateResult.date as Date, idx),
        amount: (amountCents / 100).toFixed(2),
      };
    });

    const updated = await prisma.$transaction(async (tx) => {
      await tx.installment.deleteMany({ where: { planId: plan.id } });

      const updatedPlan = await tx.installmentPlan.update({
        where: { id: plan.id },
        data: {
          type: body.type,
          installmentsCount: body.installmentsCount,
          interestRate: interestRate ? interestRate.toFixed(2) : undefined,
          principal: principal.toFixed(2),
          interestAmount: interestAmount.toFixed(2),
          total: financingTotal.toFixed(2),
          startDate: startDateResult.date as Date,
          frequency: body.frequency ?? "MONTHLY",
          installments: {
            create: installments.map((item) => ({
              number: item.number,
              dueDate: item.dueDate,
              amount: item.amount,
            })),
          },
        },
        include: { installments: true },
      });

      await tx.saleCharge.deleteMany({
        where: { saleId: sale.id, type: "INTEREST" },
      });

      if (interestAmount > 0) {
        await tx.saleCharge.create({
          data: {
            organizationId: membership.organizationId,
            saleId: sale.id,
            type: "INTEREST",
            amount: interestAmount.toFixed(2),
            note:
              body.type === "CARD"
                ? `Interes tarjeta ${interestRate.toFixed(2)}%`
                : `Interes credito ${interestRate.toFixed(2)}%`,
          },
        });
      }

      await tx.sale.update({
        where: { id: sale.id },
        data: {
          total: saleTotalWithInterest.toFixed(2),
          balance: saleTotalWithInterest.toFixed(2),
        },
      });

      await recalcSaleTotals(tx, sale.id);

      return updatedPlan;
    });

    return NextResponse.json({
      plan: {
        id: updated.id,
        type: updated.type,
        installmentsCount: updated.installmentsCount,
        interestRate: updated.interestRate?.toString() ?? null,
        principal: updated.principal.toString(),
        interestAmount: updated.interestAmount.toString(),
        total: updated.total.toString(),
        startDate: updated.startDate.toISOString(),
        frequency: updated.frequency,
      },
      installments: updated.installments.map((item) => ({
        id: item.id,
        number: item.number,
        dueDate: item.dueDate.toISOString(),
        amount: item.amount.toString(),
        paidAmount: item.paidAmount?.toString() ?? "0",
        status: item.status,
        paidAt: item.paidAt?.toISOString() ?? null,
        payments: [],
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "No se pudo actualizar" },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, ["OWNER", "ADMIN", "SALES"]);
    const saleId = req.nextUrl.searchParams.get("saleId");
    if (!saleId) {
      return NextResponse.json({ error: "Falta saleId" }, { status: 400 });
    }

    const plan = await prisma.installmentPlan.findFirst({
      where: { organizationId: membership.organizationId, saleId },
      include: { sale: true },
    });
    if (!plan) {
      return NextResponse.json({ error: "Plan no encontrado" }, { status: 404 });
    }

    if (Number(plan.sale.paidTotal ?? 0) > 0) {
      return NextResponse.json(
        { error: "La venta ya tiene cobros registrados" },
        { status: 409 }
      );
    }

    const hasPayments = await prisma.installmentPayment.findFirst({
      where: { installment: { planId: plan.id } },
      select: { id: true },
    });
    if (hasPayments) {
      return NextResponse.json(
        { error: "Hay cuotas con pagos registrados" },
        { status: 409 }
      );
    }

    await prisma.$transaction(async (tx) => {
      const baseSaleTotal = Math.max(
        Number(plan.sale.total ?? 0) - Number(plan.interestAmount ?? 0),
        0,
      );
      await tx.installment.deleteMany({ where: { planId: plan.id } });
      await tx.installmentPlan.delete({ where: { id: plan.id } });
      await tx.saleCharge.deleteMany({
        where: { saleId: plan.saleId, type: "INTEREST" },
      });
      await tx.sale.update({
        where: { id: plan.saleId },
        data: {
          total: baseSaleTotal.toFixed(2),
          balance: baseSaleTotal.toFixed(2),
        },
      });
      await recalcSaleTotals(tx, plan.saleId);
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    return NextResponse.json({ error: "No se pudo eliminar" }, { status: 400 });
  }
}
