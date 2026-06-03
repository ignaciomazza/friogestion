import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";
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
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }

  return NextResponse.json(
    {
      error:
        error instanceof Error ? error.message : "No se pudo procesar la solicitud",
    },
    { status: 500 },
  );
}
