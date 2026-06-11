import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
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

type CachedStorefrontAccessContext = StorefrontAccessContext & {
  expiresAt: number;
  lastUsedAt: Date | null;
};

const STOREFRONT_AUTH_CACHE_TTL_MS = 30_000;
const STOREFRONT_LAST_USED_TOUCH_MS = 5 * 60_000;

const storefrontAuthCache = globalThis as typeof globalThis & {
  __storefrontAuthCache?: Map<string, CachedStorefrontAccessContext>;
};

function getAuthCache() {
  storefrontAuthCache.__storefrontAuthCache ??= new Map();
  return storefrontAuthCache.__storefrontAuthCache;
}

const authHeaderToken = (request: NextRequest) => {
  const raw = request.headers.get("authorization")?.trim();
  if (!raw) return null;
  if (!raw.toLowerCase().startsWith("bearer ")) return null;
  const token = raw.slice(7).trim();
  return token || null;
};

const hashApiKey = (rawApiKey: string) =>
  createHash("sha256").update(rawApiKey).digest("hex");

const timingSafeStringEqual = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

const maskApiKey = (rawApiKey: string | null | undefined) => {
  if (!rawApiKey) return null;
  if (rawApiKey.length <= 12) return `${rawApiKey.slice(0, 4)}...`;
  return `${rawApiKey.slice(0, 10)}...${rawApiKey.slice(-4)}`;
};

export function buildStorefrontApiKeyHash(rawApiKey: string) {
  return hashApiKey(rawApiKey);
}

export function buildStorefrontApiKeyValue() {
  const token = randomBytes(32).toString("base64url");
  const value = `fgsf_${token}`;
  return {
    value,
    keyHash: hashApiKey(value),
    keyPrefix: value.slice(0, 10),
  };
}

function touchStorefrontApiKeyLastUsed(
  apiKeyId: string,
  lastUsedAt: Date | null,
  now: number,
) {
  if (lastUsedAt && now - lastUsedAt.getTime() < STOREFRONT_LAST_USED_TOUCH_MS) {
    return;
  }

  prisma.storefrontApiKey
    .update({
      where: { id: apiKeyId },
      data: { lastUsedAt: new Date(now) },
    })
    .catch(() => undefined);
}

export async function requireStorefrontAccess(
  request: NextRequest,
): Promise<StorefrontAccessContext> {
  const pathname = request.nextUrl.pathname;
  const bearerToken = authHeaderToken(request);
  const apiKeyHeader = request.headers.get("x-friogestion-api-key")?.trim();

  if (
    !bearerToken ||
    !apiKeyHeader ||
    !timingSafeStringEqual(bearerToken, apiKeyHeader)
  ) {
    console.warn("[storefront][auth] rejected request before DB lookup", {
      pathname,
      hasBearerToken: Boolean(bearerToken),
      hasApiKeyHeader: Boolean(apiKeyHeader),
      bearerPreview: maskApiKey(bearerToken),
      apiKeyPreview: maskApiKey(apiKeyHeader),
      headersMatch: false,
    });
    throw new StorefrontAuthError();
  }

  const keyHash = hashApiKey(apiKeyHeader);
  const now = Date.now();
  const cached = getAuthCache().get(keyHash);

  if (cached && cached.expiresAt > now) {
    touchStorefrontApiKeyLastUsed(cached.apiKeyId, cached.lastUsedAt, now);
    if (
      !cached.lastUsedAt ||
      now - cached.lastUsedAt.getTime() >= STOREFRONT_LAST_USED_TOUCH_MS
    ) {
      cached.lastUsedAt = new Date(now);
    }
    return {
      organizationId: cached.organizationId,
      channelId: cached.channelId,
      apiKeyId: cached.apiKeyId,
    };
  }

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
      lastUsedAt: true,
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

  getAuthCache().set(keyHash, {
    organizationId: apiKey.organizationId,
    channelId: apiKey.channelId,
    apiKeyId: apiKey.id,
    lastUsedAt: apiKey.lastUsedAt,
    expiresAt: now + STOREFRONT_AUTH_CACHE_TTL_MS,
  });

  touchStorefrontApiKeyLastUsed(apiKey.id, apiKey.lastUsedAt, now);

  return {
    organizationId: apiKey.organizationId,
    channelId: apiKey.channelId,
    apiKeyId: apiKey.id,
  };
}
