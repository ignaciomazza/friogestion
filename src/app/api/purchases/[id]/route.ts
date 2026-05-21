import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/tenant";
import { WRITE_ROLES } from "@/lib/auth/rbac";
import { parseOptionalDate } from "@/lib/validation";
import { recalcPurchaseTotals } from "@/lib/purchases";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";
import { logServerError } from "@/lib/server/log";

export const runtime = "nodejs";

const updatePaymentModeSchema = z.object({
  paymentMode: z.enum(["CURRENT_ACCOUNT", "IMMEDIATE_CASH_OUT", "OFF_BOOK"]),
  cashOutLines: z
    .array(
      z.object({
        paymentMethodId: z.string().min(1),
        accountId: z.string().min(1).optional(),
        amount: z.coerce.number().positive(),
      }),
    )
    .min(1)
    .optional(),
  cashOutPaymentMethodId: z.string().min(1).optional(),
  cashOutAccountId: z.string().min(1).optional(),
  paidAt: z.string().optional(),
});

const toAmount = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { membership } = await requireRole(req, [...WRITE_ROLES]);
    const params = await context.params;

    const purchase = await prisma.purchaseInvoice.findFirst({
      where: {
        id: params.id,
        organizationId: membership.organizationId,
      },
      select: {
        id: true,
        supplierId: true,
        invoiceNumber: true,
        invoiceDate: true,
        subtotal: true,
        taxes: true,
        total: true,
        netTaxed: true,
        netNonTaxed: true,
        exemptAmount: true,
        vatTotal: true,
        otherTaxesTotal: true,
        fiscalVoucherKind: true,
        fiscalVoucherType: true,
        authorizationCode: true,
        supplier: {
          select: {
            id: true,
            displayName: true,
            legalName: true,
            taxId: true,
            email: true,
            phone: true,
            address: true,
            arcaVerificationStatus: true,
            arcaVerificationCheckedAt: true,
            arcaVerificationMessage: true,
          },
        },
        items: {
          select: {
            id: true,
            productId: true,
            qty: true,
            unitCost: true,
            taxRate: true,
            stockMovement: {
              select: {
                id: true,
              },
            },
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                purchaseCode: true,
                brand: true,
                model: true,
                unit: true,
                cost: true,
                price: true,
              },
            },
          },
        },
        fiscalLines: {
          select: {
            type: true,
            jurisdiction: true,
            baseAmount: true,
            rate: true,
            amount: true,
            note: true,
          },
        },
        currentAccountEntries: {
          where: {
            sourceType: "PURCHASE",
          },
          select: {
            id: true,
          },
          take: 1,
        },
        allocations: {
          where: {
            supplierPayment: {
              status: "CONFIRMED",
            },
          },
          select: {
            amount: true,
          },
        },
      },
    });

    if (!purchase) {
      return NextResponse.json({ error: "Compra no encontrada" }, { status: 404 });
    }

    const confirmedAllocatedTotal = purchase.allocations.reduce(
      (sum, allocation) => sum + toAmount(allocation.amount),
      0,
    );

    return NextResponse.json({
      id: purchase.id,
      supplier: {
        id: purchase.supplier.id,
        displayName: purchase.supplier.displayName,
        legalName: purchase.supplier.legalName,
        taxId: purchase.supplier.taxId,
        email: purchase.supplier.email,
        phone: purchase.supplier.phone,
        address: purchase.supplier.address,
        arcaVerificationStatus: purchase.supplier.arcaVerificationStatus,
        arcaVerificationCheckedAt:
          purchase.supplier.arcaVerificationCheckedAt?.toISOString() ?? null,
        arcaVerificationMessage: purchase.supplier.arcaVerificationMessage,
      },
      invoiceNumber: purchase.invoiceNumber,
      invoiceDate: purchase.invoiceDate?.toISOString().slice(0, 10) ?? null,
      subtotal: purchase.subtotal?.toString() ?? null,
      taxes: purchase.taxes?.toString() ?? null,
      total: purchase.total?.toString() ?? null,
      netTaxed: purchase.netTaxed.toString(),
      netNonTaxed: purchase.netNonTaxed.toString(),
      exemptAmount: purchase.exemptAmount.toString(),
      vatTotal: purchase.vatTotal.toString(),
      otherTaxesTotal: purchase.otherTaxesTotal.toString(),
      fiscalVoucherKind: purchase.fiscalVoucherKind,
      fiscalVoucherType: purchase.fiscalVoucherType,
      authorizationCode: purchase.authorizationCode,
      items: purchase.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        qty: item.qty.toString(),
        unitCost: item.unitCost.toString(),
        taxRate: item.taxRate?.toString() ?? null,
        product: {
          id: item.product.id,
          name: item.product.name,
          sku: item.product.sku,
          purchaseCode: item.product.purchaseCode,
          brand: item.product.brand,
          model: item.product.model,
          unit: item.product.unit,
          cost: item.product.cost?.toString() ?? null,
          price: item.product.price?.toString() ?? null,
        },
      })),
      fiscalLines: purchase.fiscalLines.map((line) => ({
        type: line.type,
        jurisdiction: line.jurisdiction,
        baseAmount: line.baseAmount?.toString() ?? null,
        rate: line.rate?.toString() ?? null,
        amount: line.amount.toString(),
        note: line.note,
      })),
      impactsAccount: purchase.currentAccountEntries.length > 0,
      confirmedAllocatedTotal: confirmedAllocatedTotal.toFixed(2),
      hasStockMovements: purchase.items.some((item) => Boolean(item.stockMovement)),
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: authErrorStatus(error) },
      );
    }
    logServerError("api.purchases.id.get", error);
    return NextResponse.json(
      { error: "No se pudo cargar la compra" },
      { status: 400 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { membership } = await requireRole(req, [...WRITE_ROLES]);
    const params = await context.params;
    const body = updatePaymentModeSchema.parse(await req.json());

    const paidAtResult = parseOptionalDate(body.paidAt);
    if (paidAtResult.error) {
      return NextResponse.json({ error: "Fecha invalida" }, { status: 400 });
    }

    const purchase = await prisma.purchaseInvoice.findFirst({
      where: {
        id: params.id,
        organizationId: membership.organizationId,
      },
      select: {
        id: true,
        supplierId: true,
        status: true,
        invoiceNumber: true,
        invoiceDate: true,
        total: true,
        paidTotal: true,
        balance: true,
        paymentStatus: true,
        supplier: {
          select: {
            displayName: true,
          },
        },
        currentAccountEntries: {
          where: {
            sourceType: "PURCHASE",
          },
          select: {
            id: true,
          },
        },
        allocations: {
          where: {
            supplierPayment: {
              status: "CONFIRMED",
            },
          },
          select: {
            amount: true,
          },
        },
      },
    });

    if (!purchase) {
      return NextResponse.json({ error: "Compra no encontrada" }, { status: 404 });
    }

    if (purchase.status === "CANCELLED") {
      return NextResponse.json(
        { error: "No se puede ajustar una compra cancelada" },
        { status: 409 },
      );
    }

    const total = toAmount(purchase.total);
    if (total <= 0) {
      return NextResponse.json(
        { error: "La compra no tiene total valido para ajustar el pago" },
        { status: 409 },
      );
    }

    const hasCurrentAccountImpact = purchase.currentAccountEntries.length > 0;
    const allocatedTotal = purchase.allocations.reduce(
      (sum, allocation) => sum + toAmount(allocation.amount),
      0,
    );
    const hasConfirmedAllocations = allocatedTotal > 0.005;

    const switchingToCurrentAccount = body.paymentMode === "CURRENT_ACCOUNT";
    const switchingToImmediateCashOut =
      body.paymentMode === "IMMEDIATE_CASH_OUT";

    if (!switchingToCurrentAccount && hasConfirmedAllocations) {
      return NextResponse.json(
        {
          error:
            "No se puede quitar cuenta corriente porque la compra ya tiene pagos aplicados.",
        },
        { status: 409 },
      );
    }

    const requestedCashOutLines = switchingToImmediateCashOut
      ? body.cashOutLines?.length
        ? body.cashOutLines
        : body.cashOutPaymentMethodId
          ? [
              {
                paymentMethodId: body.cashOutPaymentMethodId,
                accountId: body.cashOutAccountId,
                amount: total,
              },
            ]
          : []
      : [];

    const normalizedCashOutLines: Array<{
      paymentMethodId: string;
      paymentMethodName: string;
      accountId: string | null;
      currencyCode: string;
      amount: number;
    }> = [];

    if (switchingToImmediateCashOut) {
      if (!requestedCashOutLines.length) {
        return NextResponse.json(
          { error: "Agrega al menos una linea para registrar egreso" },
          { status: 400 },
        );
      }

      const methodIds = Array.from(
        new Set(requestedCashOutLines.map((line) => line.paymentMethodId)),
      );
      const methods = await prisma.paymentMethod.findMany({
        where: {
          organizationId: membership.organizationId,
          id: { in: methodIds },
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          requiresAccount: true,
        },
      });
      if (methods.length !== methodIds.length) {
        return NextResponse.json(
          { error: "Metodo de pago invalido" },
          { status: 400 },
        );
      }
      const methodById = new Map(methods.map((method) => [method.id, method]));

      const accountIds = Array.from(
        new Set(
          requestedCashOutLines
            .map((line) => line.accountId)
            .filter((value): value is string => Boolean(value)),
        ),
      );
      const accounts = accountIds.length
        ? await prisma.financeAccount.findMany({
            where: {
              organizationId: membership.organizationId,
              id: { in: accountIds },
              isActive: true,
            },
            select: {
              id: true,
              currencyCode: true,
            },
          })
        : [];
      if (accounts.length !== accountIds.length) {
        return NextResponse.json({ error: "Cuenta invalida" }, { status: 400 });
      }
      const accountById = new Map(accounts.map((account) => [account.id, account]));

      let linesTotal = 0;
      for (const line of requestedCashOutLines) {
        const method = methodById.get(line.paymentMethodId);
        if (!method) {
          return NextResponse.json(
            { error: "Metodo de pago invalido" },
            { status: 400 },
          );
        }
        const accountId = line.accountId?.trim() || undefined;
        if (method.requiresAccount && !accountId) {
          return NextResponse.json(
            { error: "Selecciona cuenta para cada linea de pago" },
            { status: 400 },
          );
        }
        const account = accountId ? accountById.get(accountId) : null;
        if (accountId) {
          if (!account) {
            return NextResponse.json({ error: "Cuenta invalida" }, { status: 400 });
          }
          if (account.currencyCode !== "ARS") {
            return NextResponse.json(
              { error: "Por ahora el egreso inmediato solo admite cuentas en ARS" },
              { status: 400 },
            );
          }
        }

        const amount = Number(line.amount ?? 0);
        if (!Number.isFinite(amount) || amount <= 0) {
          return NextResponse.json(
            { error: "Importe invalido en lineas de pago" },
            { status: 400 },
          );
        }
        linesTotal += amount;
        normalizedCashOutLines.push({
          paymentMethodId: method.id,
          paymentMethodName: method.name,
          accountId: accountId ?? null,
          currencyCode: account?.currencyCode ?? "ARS",
          amount,
        });
      }

      if (Math.abs(linesTotal - total) > 0.01) {
        return NextResponse.json(
          { error: "La suma de lineas no coincide con el total de la compra" },
          { status: 400 },
        );
      }
    }

    const occurredAt = paidAtResult.date ?? purchase.invoiceDate ?? new Date();
    const purchaseLabel = purchase.invoiceNumber ?? purchase.id;
    const purchaseMovementNotePrefixes = Array.from(
      new Set(
        [purchase.invoiceNumber?.trim(), purchase.id].filter(
          (reference): reference is string => Boolean(reference),
        ),
      ),
    ).map((reference) => `Compra ${reference} · `);

    const updatedPurchase = await prisma.$transaction(async (tx) => {
      if (purchaseMovementNotePrefixes.length) {
        await tx.accountMovement.deleteMany({
          where: {
            organizationId: membership.organizationId,
            direction: "OUT",
            supplierPaymentLineId: null,
            OR: purchaseMovementNotePrefixes.map((prefix) => ({
              note: { startsWith: prefix },
            })),
          },
        });
      }

      if (switchingToCurrentAccount) {
        if (!hasCurrentAccountImpact) {
          await tx.currentAccountEntry.create({
            data: {
              organizationId: membership.organizationId,
              counterpartyType: "SUPPLIER",
              supplierId: purchase.supplierId,
              direction: "CREDIT",
              sourceType: "PURCHASE",
              purchaseInvoiceId: purchase.id,
              amount: total.toFixed(2),
              occurredAt,
              note: `Compra ${purchaseLabel}`,
            },
          });
        }

        if (hasConfirmedAllocations) {
          await recalcPurchaseTotals(tx, purchase.id);
        } else {
          await tx.purchaseInvoice.update({
            where: { id: purchase.id },
            data: {
              paidTotal: "0.00",
              balance: total.toFixed(2),
              paymentStatus: "UNPAID",
            },
          });
        }
      } else {
        if (hasCurrentAccountImpact) {
          await tx.currentAccountEntry.deleteMany({
            where: {
              organizationId: membership.organizationId,
              purchaseInvoiceId: purchase.id,
              sourceType: "PURCHASE",
            },
          });
        }

        await tx.purchaseInvoice.update({
          where: { id: purchase.id },
          data: {
            paidTotal: total.toFixed(2),
            balance: "0.00",
            paymentStatus: "PAID",
          },
        });

        if (switchingToImmediateCashOut && normalizedCashOutLines.length) {
          for (const line of normalizedCashOutLines) {
            if (!line.accountId) continue;
            await tx.accountMovement.create({
              data: {
                organizationId: membership.organizationId,
                accountId: line.accountId,
                occurredAt,
                direction: "OUT",
                amount: line.amount.toFixed(2),
                currencyCode: line.currencyCode,
                note: `Compra ${purchase.id} · ${line.paymentMethodName}`,
              },
            });
          }
        }
      }

      return tx.purchaseInvoice.findUnique({
        where: { id: purchase.id },
        select: {
          id: true,
          paidTotal: true,
          balance: true,
          paymentStatus: true,
          currentAccountEntries: {
            where: {
              sourceType: "PURCHASE",
            },
            select: {
              id: true,
            },
            take: 1,
          },
        },
      });
    });

    if (!updatedPurchase) {
      return NextResponse.json(
        { error: "No se pudo actualizar la compra" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      id: updatedPurchase.id,
      paidTotal: updatedPurchase.paidTotal.toString(),
      balance: updatedPurchase.balance.toString(),
      paymentStatus: updatedPurchase.paymentStatus,
      impactsAccount: updatedPurchase.currentAccountEntries.length > 0,
      mode: body.paymentMode,
      message:
        body.paymentMode === "CURRENT_ACCOUNT"
          ? "Compra configurada en cuenta corriente."
          : body.paymentMode === "IMMEDIATE_CASH_OUT"
            ? "Compra marcada como pagada y egresos registrados."
            : "Compra marcada como pagada sin impacto financiero.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: authErrorStatus(error) },
      );
    }
    logServerError("api.purchases.id.patch", error);
    return NextResponse.json(
      { error: "No se pudo actualizar la compra" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { membership } = await requireRole(req, [...WRITE_ROLES]);
    const params = await context.params;

    const purchase = await prisma.purchaseInvoice.findFirst({
      where: {
        id: params.id,
        organizationId: membership.organizationId,
      },
      select: {
        id: true,
        invoiceNumber: true,
        allocations: {
          select: {
            id: true,
          },
          take: 1,
        },
        deliveryNotes: {
          select: {
            id: true,
          },
          take: 1,
        },
      },
    });

    if (!purchase) {
      return NextResponse.json({ error: "Compra no encontrada" }, { status: 404 });
    }

    if (purchase.allocations.length > 0) {
      return NextResponse.json(
        { error: "No se puede eliminar: la compra tiene pagos aplicados." },
        { status: 409 },
      );
    }

    if (purchase.deliveryNotes.length > 0) {
      return NextResponse.json(
        { error: "No se puede eliminar: la compra tiene remitos asociados." },
        { status: 409 },
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.stockMovement.deleteMany({
        where: {
          organizationId: membership.organizationId,
          purchaseItem: {
            purchaseInvoiceId: purchase.id,
          },
        },
      });

      await tx.currentAccountEntry.deleteMany({
        where: {
          organizationId: membership.organizationId,
          purchaseInvoiceId: purchase.id,
        },
      });

      await tx.purchaseArcaValidation.deleteMany({
        where: {
          organizationId: membership.organizationId,
          purchaseInvoiceId: purchase.id,
        },
      });

      await tx.purchaseFiscalLine.deleteMany({
        where: {
          purchaseInvoiceId: purchase.id,
        },
      });

      await tx.purchaseItem.deleteMany({
        where: {
          purchaseInvoiceId: purchase.id,
        },
      });

      await tx.purchaseInvoice.delete({
        where: {
          id: purchase.id,
        },
      });
    });

    return NextResponse.json({
      ok: true,
      message: `Compra ${purchase.invoiceNumber ?? purchase.id} eliminada`,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: authErrorStatus(error) },
      );
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return NextResponse.json(
        { error: "La compra tiene movimientos asociados y no se puede eliminar." },
        { status: 409 },
      );
    }
    logServerError("api.purchases.id.delete", error);
    return NextResponse.json(
      { error: "No se pudo eliminar la compra" },
      { status: 400 },
    );
  }
}
