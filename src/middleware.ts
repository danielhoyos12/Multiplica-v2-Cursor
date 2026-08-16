import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

import {
  MUST_CHANGE_PASSWORD_COOKIE,
  passwordGateCookieOptions,
  sessionRequiresPasswordChange,
} from "@/lib/password-change-gate";
import { isPasswordChangeAllowedPath, safeInternalPath } from "@/lib/safe-redirect";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/admin(.*)",
  "/ganar(.*)",
  "/celulas(.*)",
  "/liderazgo(.*)",
  "/proceso(.*)",
  "/destino(.*)",
  "/reencuentro(.*)",
  "/escuela-ministerial(.*)",
  "/enviar(.*)",
  "/transferencias(.*)",
  "/reportes(.*)",
  "/udv(.*)",
  "/cuenta(.*)",
]);

const isAuthRoute = createRouteMatcher(["/login(.*)", "/recuperar(.*)"]);

export default clerkMiddleware(async (auth, request: NextRequest) => {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-multiplica-pathname", request.nextUrl.pathname);

  const pathname = request.nextUrl.pathname;
  const isPublicGanarForm = pathname.startsWith("/ganar/registro");

  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  const session = await auth();
  const userId = session.userId;

  if (!userId && isProtectedRoute(request) && !isPublicGanarForm) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", safeInternalPath(pathname));
    return NextResponse.redirect(redirectUrl);
  }

  const claims = session.sessionClaims as
    | { publicMetadata?: Record<string, unknown>; metadata?: Record<string, unknown> }
    | undefined;
  const mustChange = sessionRequiresPasswordChange({
    user: {
      publicMetadata: {
        mustChangePassword:
          claims?.publicMetadata?.mustChangePassword === true ||
          claims?.metadata?.mustChangePassword === true,
      },
    },
    cookieValue: request.cookies.get(MUST_CHANGE_PASSWORD_COOKIE)?.value,
  });

  if (userId && mustChange && !isPasswordChangeAllowedPath(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/cuenta/cambiar-password";
    redirectUrl.search = "";
    const redirectResponse = NextResponse.redirect(redirectUrl);
    redirectResponse.cookies.set(
      MUST_CHANGE_PASSWORD_COOKIE,
      "1",
      passwordGateCookieOptions(),
    );
    return redirectResponse;
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  if (userId && mustChange) {
    response.cookies.set(
      MUST_CHANGE_PASSWORD_COOKIE,
      "1",
      passwordGateCookieOptions(),
    );
  }

  if (userId && isAuthRoute(request) && !pathname.startsWith("/recuperar")) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = mustChange ? "/cuenta/cambiar-password" : "/dashboard";
    redirectUrl.search = "";
    const redirectResponse = NextResponse.redirect(redirectUrl);
    if (mustChange) {
      redirectResponse.cookies.set(
        MUST_CHANGE_PASSWORD_COOKIE,
        "1",
        passwordGateCookieOptions(),
      );
    }
    return redirectResponse;
  }

  return response;
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
