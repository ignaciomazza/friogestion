import { prisma } from "@/lib/prisma";

export type ReceiptLineInput = {
  paymentMethodId: string;
  accountId?: string;
  currencyCode: string;
  amount: number;
  fxRateUsed?: number;
};

export async function buildReceiptLines(
  organizationId: string,
  inputLines: ReceiptLineInput[],
) {
  const paymentMethodIds = Array.from(
    new Set(inputLines.map((line) => line.paymentMethodId)),
  );
  const methods = await prisma.paymentMethod.findMany({
    where: { organizationId, id: { in: paymentMethodIds } },
  });
  if (methods.length !== paymentMethodIds.length) {
    throw new Error("INVALID_METHOD");
  }
  const methodById = new Map(methods.map((method) => [method.id, method]));

  const accountIds = Array.from(
    new Set(inputLines.map((line) => line.accountId?.trim()).filter(Boolean)),
  ) as string[];
  const accounts = accountIds.length
    ? await prisma.financeAccount.findMany({
        where: { organizationId, id: { in: accountIds } },
      })
    : [];
  if (accounts.length !== accountIds.length) {
    throw new Error("INVALID_ACCOUNT");
  }
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  let totalBase = 0;
  const lines = inputLines.map((line) => {
    const method = methodById.get(line.paymentMethodId);
    if (!method) {
      throw new Error("INVALID_METHOD");
    }

    const accountId = line.accountId?.trim() || undefined;
    if (method.requiresAccount && !accountId) {
      throw new Error("ACCOUNT_REQUIRED");
    }
    if (accountId) {
      const account = accountById.get(accountId);
      if (!account) {
        throw new Error("INVALID_ACCOUNT");
      }
      if (account.currencyCode !== line.currencyCode.toUpperCase()) {
        throw new Error("ACCOUNT_CURRENCY_MISMATCH");
      }
    }

    const currencyCode = line.currencyCode.toUpperCase();
    if (currencyCode !== "ARS" && !line.fxRateUsed) {
      throw new Error("FX_REQUIRED");
    }
    const amountBase =
      currencyCode === "ARS"
        ? line.amount
        : line.amount * (line.fxRateUsed ?? 0);
    totalBase += amountBase;
    return {
      paymentMethodId: line.paymentMethodId,
      accountId: accountId ?? null,
      currencyCode,
      amount: line.amount.toFixed(2),
      amountBase: amountBase.toFixed(2),
      fxRateUsed: line.fxRateUsed ? line.fxRateUsed.toFixed(6) : undefined,
    };
  });

  return { lines, totalBase };
}
