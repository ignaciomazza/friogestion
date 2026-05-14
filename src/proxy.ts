import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import { PRICE_PAGE_ENABLED } from "@/lib/features";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const isPdfEndpointRequest =
    pathname === "/api/pdf/quote" ||
    pathname === "/api/pdf/sale" ||
    /^\/api\/fiscal-invoices\/[^/]+\/pdf$/.test(pathname) ||
    /^\/api\/credit-notes\/[^/]+\/pdf$/.test(pathname);

  if (isPdfEndpointRequest) {
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
