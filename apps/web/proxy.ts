import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  if (
    process.env.BLINDPASS_ENV === "production" &&
    /^\/(admin|demo|presentation)(\/|$)/.test(request.nextUrl.pathname)
  ) {
    // The privacy explanation remains available to customers.
    if (request.nextUrl.pathname !== "/demo/privacy")
      return new NextResponse("Not found", { status: 404 });
  }
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const development = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    ...(process.env.BLINDPASS_ENV === "production"
      ? ["upgrade-insecure-requests"]
      : []),
  ].join("; ");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
export const config = {
  matcher: [
    "/((?!api|webhooks|\\.well-known|_next/static|_next/image|favicon.ico).*)",
  ],
};
