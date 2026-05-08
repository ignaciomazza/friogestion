import type { Prisma } from "@prisma/client";

export const PRICE_LIST_ORDER_BY = [
  { sortOrder: "asc" },
  { createdAt: "asc" },
  { id: "asc" },
] satisfies Prisma.PriceListOrderByWithRelationInput[];
