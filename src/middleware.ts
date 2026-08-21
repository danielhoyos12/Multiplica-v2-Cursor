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

const isAuthRoute = createRouteMatcher([
  "/login(.*)",
  "/sign-up(.*)",
  "/recuperar(.*)",
  "/bienvenida(.*)",
  "/acceso-denegado(.*)",
]);

export default clerkMiddleware(async (auth, request: NextRequest) => {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-multiplica-pathname", request.nextUrl.pathname);

  const pathname = request.nextUrl.pathname;
  const isPublicGanarForm = pathname.startsWith("/ganar/registro");
  const isAccesoDenegado = pathname.startsWith("/acceso-denegado");
  const isBienvenida = pathname.startsWith("/bienvenida");

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

  // Signed-in users on login/sign-up go to dashboard (layout will bounce
  // unprovisioned identities to /acceso-denegado). Keep /acceso-denegado
  // and password recovery reachable.
  if (
    userId &&
    isAuthRoute(request) &&
    !pathname.startsWith("/recuperar") &&
    !isBienvenida &&
    !isAccesoDenegado
  ) {
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
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    // Clerk auto-proxy
    "/__clerk/:path*",
  ],
};
