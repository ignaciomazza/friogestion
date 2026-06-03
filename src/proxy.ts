import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import { PRICE_PAGE_ENABLED } from "@/lib/features";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublicStorefrontApi =
    pathname.startsWith("/api/storefront/") &&
    !pathname.startsWith("/api/storefront/admin/");

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const isPdfEndpointRequest =
    (pathname.startsWith("/api/pdf/") && pathname !== "/api/pdf/share-token") ||
    /^\/api\/.+\/pdf$/.test(pathname);

  if (isPdfEndpointRequest) {
    return NextResponse.next();
  }

  if (isPublicStorefrontApi) {
    console.info("[storefront][proxy] allowing public API route", {
      pathname,
      hasAuthCookie: Boolean(req.cookies.get(AUTH_COOKIE_NAME)?.value),
      hasBearerHeader: Boolean(req.headers.get("authorization")?.trim()),
      hasApiKeyHeader: Boolean(req.headers.get("x-friogestion-api-key")?.trim()),
    });
    return NextResponse.next();
  }

  if (
    !PRICE_PAGE_ENABLED &&
    (pathname.startsWith("/app/prices") || pathname.startsWith("/app/stock"))
  ) {
    const productsUrl = req.nextUrl.clone();
    productsUrl.pathname = "/app/products";
    productsUrl.search = "";
    return NextResponse.redirect(productsUrl);
  }

  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    if (pathname.startsWith("/api")) {
      if (pathname.startsWith("/api/storefront")) {
        console.warn("[storefront][proxy] blocked request without auth cookie", {
          pathname,
          hasBearerHeader: Boolean(req.headers.get("authorization")?.trim()),
          hasApiKeyHeader: Boolean(req.headers.get("x-friogestion-api-key")?.trim()),
        });
      }
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/api/:path*"],
};
