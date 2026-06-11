import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";
import { logServerError } from "@/lib/server/log";
import { StorefrontAuthError } from "./auth";
import { isStorefrontDomainError } from "./service";

export function storefrontErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Datos invalidos", issues: error.flatten() },
      { status: 400 },
    );
  }

  if (error instanceof StorefrontAuthError) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (isAuthError(error)) {
    return NextResponse.json(
      { error: "No autorizado" },
      { status: authErrorStatus(error) },
    );
  }

  if (isStorefrontDomainError(error)) {
    if (error.status >= 500) {
      logServerError("storefront.domain", error);
      return NextResponse.json(
        { error: "No se pudo procesar la solicitud" },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }

  logServerError("storefront.unhandled", error);
  return NextResponse.json(
    { error: "No se pudo procesar la solicitud" },
    { status: 500 },
  );
}
