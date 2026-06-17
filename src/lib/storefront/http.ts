import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";
import { logServerError } from "@/lib/server/log";
import { StorefrontAuthError } from "./auth";
import { isStorefrontDomainError } from "./service";

const STOREFRONT_NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0, s-maxage=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
} as const;

function withStorefrontNoStoreHeaders(headers?: HeadersInit) {
  const merged = new Headers(headers);
  Object.entries(STOREFRONT_NO_STORE_HEADERS).forEach(([key, value]) => {
    merged.set(key, value);
  });
  return merged;
}

export function storefrontJson<JsonBody>(
  body: JsonBody,
  init?: ResponseInit,
) {
  return NextResponse.json(body, {
    ...init,
    headers: withStorefrontNoStoreHeaders(init?.headers),
  });
}

export function storefrontErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return storefrontJson(
      { error: "Datos invalidos", issues: error.flatten() },
      { status: 400 },
    );
  }

  if (error instanceof StorefrontAuthError) {
    return storefrontJson({ error: "No autorizado" }, { status: 401 });
  }

  if (isAuthError(error)) {
    return storefrontJson(
      { error: "No autorizado" },
      { status: authErrorStatus(error) },
    );
  }

  if (isStorefrontDomainError(error)) {
    if (error.status >= 500) {
      logServerError("storefront.domain", error);
      return storefrontJson(
        { error: "No se pudo procesar la solicitud" },
        { status: 500 },
      );
    }

    return storefrontJson(
      { error: error.message },
      { status: error.status },
    );
  }

  logServerError("storefront.unhandled", error);
  return storefrontJson(
    { error: "No se pudo procesar la solicitud" },
    { status: 500 },
  );
}
