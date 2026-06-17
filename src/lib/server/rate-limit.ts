import { NextResponse, type NextRequest } from "next/server";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

const globalRateLimit = globalThis as typeof globalThis & {
  __fgRateLimitBuckets?: Map<string, RateLimitBucket>;
  __fgRateLimitLastCleanup?: number;
};

function getBuckets() {
  globalRateLimit.__fgRateLimitBuckets ??= new Map();
  return globalRateLimit.__fgRateLimitBuckets;
}

export function getClientIp(request: NextRequest | Request) {
  const vercelForwardedFor = request.headers.get("x-vercel-forwarded-for");
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const cloudflareIp = request.headers.get("cf-connecting-ip");

  return (
    vercelForwardedFor?.split(",")[0]?.trim() ||
    forwardedFor?.split(",")[0]?.trim() ||
    realIp?.trim() ||
    cloudflareIp?.trim() ||
    "unknown"
  );
}

export function checkRateLimit(
  request: NextRequest | Request,
  { key, limit, windowMs }: RateLimitOptions,
) {
  const now = Date.now();
  const buckets = getBuckets();

  if (
    !globalRateLimit.__fgRateLimitLastCleanup ||
    now - globalRateLimit.__fgRateLimitLastCleanup > 60_000
  ) {
    for (const [bucketKey, bucket] of buckets.entries()) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
    globalRateLimit.__fgRateLimitLastCleanup = now;
  }

  const bucketKey = `${key}:${getClientIp(request)}`;
  const bucket = buckets.get(bucketKey);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(bucketKey, {
      count: 1,
      resetAt: now + windowMs,
    });
    return { limited: false, remaining: limit - 1, retryAfter: 0 };
  }

  bucket.count += 1;

  if (bucket.count > limit) {
    return {
      limited: true,
      remaining: 0,
      retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  return {
    limited: false,
    remaining: Math.max(0, limit - bucket.count),
    retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
  };
}

export function rateLimitResponse(retryAfter: number) {
  return NextResponse.json(
    { error: "Demasiadas solicitudes. Intenta nuevamente en unos minutos." },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0, s-maxage=0",
        "CDN-Cache-Control": "no-store",
        "Vercel-CDN-Cache-Control": "no-store",
        "retry-after": String(Math.max(1, retryAfter)),
      },
    },
  );
}
