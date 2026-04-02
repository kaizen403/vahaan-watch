import { NextRequest, NextResponse } from "next/server";

const API_BASE =
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3003";

const PUBLIC_PATHS = [
  "/_next",
  "/api",
  "/anpr",
  "/fonts",
  "/favicon.ico",
];

const SESSION_COOKIE_NAMES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
];

function getSessionCookie(req: NextRequest): string | undefined {
  for (const name of SESSION_COOKIE_NAMES) {
    const value = req.cookies.get(name)?.value;
    if (value) return value;
  }
  return undefined;
}

async function fetchRole(cookie: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/session`, {
      headers: { Cookie: cookie },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data?.user?.role ?? null;
  } catch {
    return null;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = getSessionCookie(req);

  if (pathname.startsWith("/scanner/login")) {
    if (!token) return NextResponse.next();
    const cookieHeader = req.headers.get("cookie") ?? "";
    const role = await fetchRole(cookieHeader);
    if (role === "scanner" || role === "admin") {
      return NextResponse.redirect(new URL("/scanner/scan", req.url));
    }
    if (role === "operator") {
      return NextResponse.redirect(new URL("/portal/dashboard", req.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/portal/login")) {
    if (!token) return NextResponse.next();
    const cookieHeader = req.headers.get("cookie") ?? "";
    const role = await fetchRole(cookieHeader);
    if (role === "scanner") {
      return NextResponse.redirect(new URL("/scanner/scan", req.url));
    }
    if (role) {
      return NextResponse.redirect(new URL("/portal/dashboard", req.url));
    }
    return NextResponse.next();
  }

  if (!token) {
    if (pathname.startsWith("/scanner")) {
      return NextResponse.redirect(new URL("/scanner/login", req.url));
    }
    const loginUrl = new URL("/portal/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const cookieHeader = req.headers.get("cookie") ?? "";
  const role = await fetchRole(cookieHeader);

  if (!role) {
    if (pathname.startsWith("/scanner")) {
      return NextResponse.redirect(new URL("/scanner/login", req.url));
    }
    const loginUrl = new URL("/portal/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (role === "scanner") {
    if (pathname.startsWith("/scanner")) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/scanner/scan", req.url));
  }

  if (pathname.startsWith("/scanner")) {
    return NextResponse.redirect(new URL("/portal/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
