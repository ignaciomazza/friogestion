import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export class StorefrontAuthError extends Error {
  constructor(message = "UNAUTHORIZED") {
    super(message);
  }
}

export type StorefrontAccessContext = {
  organizationId: string;
  channelId: string;
  apiKeyId: string;
};

const authHeaderToken = (request: NextRequest) => {
  const raw = request.headers.get("authorization")?.trim();
  if (!raw) return null;
  if (!raw.toLowerCase().startsWith("bearer ")) return null;
  const token = raw.slice(7).trim();
  return token || null;
};

const hashApiKey = (rawApiKey: string) =>
  createHash("sha256").update(rawApiKey).digest("hex");

const maskApiKey = (rawApiKey: string | null | undefined) => {
  if (!rawApiKey) return null;
  if (rawApiKey.length <= 12) return `${rawApiKey.slice(0, 4)}...`;
  return `${rawApiKey.slice(0, 10)}...${rawApiKey.slice(-4)}`;
};

export function buildStorefrontApiKeyHash(rawApiKey: string) {
  return hashApiKey(rawApiKey);
}

export function buildStorefrontApiKeyValue() {
  const token = createHash("sha256")
    .update(`${Date.now()}-${Math.random()}-${Math.random()}`)
    .digest("hex");
  const value = `fgsf_${token.slice(0, 44)}`;
  return {
    value,
    keyHash: hashApiKey(value),
    keyPrefix: value.slice(0, 10),
  };
}

export async function requireStorefrontAccess(
  request: NextRequest,
): Promise<StorefrontAccessContext> {
  const pathname = request.nextUrl.pathname;
  const bearerToken = authHeaderToken(request);
  const apiKeyHeader = request.headers.get("x-friogestion-api-key")?.trim();

  if (!bearerToken || !apiKeyHeader || bearerToken !== apiKeyHeader) {
    console.warn("[storefront][auth] rejected request before DB lookup", {
      pathname,
      hasBearerToken: Boolean(bearerToken),
      hasApiKeyHeader: Boolean(apiKeyHeader),
      bearerPreview: maskApiKey(bearerToken),
      apiKeyPreview: maskApiKey(apiKeyHeader),
      headersMatch:
        Boolean(bearerToken) &&
        Boolean(apiKeyHeader) &&
        bearerToken === apiKeyHeader,
    });
    throw new StorefrontAuthError();
  }

  const keyHash = hashApiKey(apiKeyHeader);
  const apiKey = await prisma.storefrontApiKey.findFirst({
    where: {
      keyHash,
      isActive: true,
      channel: { isActive: true },
    },
    select: {
      id: true,
      organizationId: true,
      channelId: true,
    },
  });

  if (!apiKey) {
    console.warn("[storefront][auth] API key not found or inactive", {
      pathname,
      apiKeyPreview: maskApiKey(apiKeyHeader),
      keyHashPrefix: keyHash.slice(0, 12),
    });
    throw new StorefrontAuthError();
  }

  console.info("[storefront][auth] access granted", {
    pathname,
    apiKeyId: apiKey.id,
    channelId: apiKey.channelId,
    organizationId: apiKey.organizationId,
    apiKeyPreview: maskApiKey(apiKeyHeader),
  });

  prisma.storefrontApiKey
    .update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => undefined);

  return {
    organizationId: apiKey.organizationId,
    channelId: apiKey.channelId,
    apiKeyId: apiKey.id,
  };
}
