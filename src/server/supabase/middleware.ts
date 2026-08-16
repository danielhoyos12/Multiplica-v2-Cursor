import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import {
  MUST_CHANGE_PASSWORD_COOKIE,
  passwordGateCookieOptions,
  sessionRequiresPasswordChange,
} from "@/lib/password-change-gate";
import { isPasswordChangeAllowedPath, safeInternalPath } from "@/lib/safe-redirect";

const APP_PREFIXES = [
  "/dashboard",
  "/admin",
  "/ganar",
  "/celulas",
  "/liderazgo",
  "/proceso",
  "/destino",
  "/reencuentro",
  "/escuela-ministerial",
  "/enviar",
  "/transferencias",
  "/reportes",
  "/udv",
  "/cuenta",
];

export async function updateSession(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-multiplica-pathname", request.nextUrl.pathname);

  let supabaseResponse = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/recuperar");
  const isPublicGanarForm = pathname.startsWith("/ganar/registro");
  const isProtected =
    !isPublicGanarForm &&
    APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!user && isProtected) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", safeInternalPath(pathname));
    return NextResponse.redirect(redirectUrl);
  }

  const mustChange = sessionRequiresPasswordChange({
    user,
    cookieValue: request.cookies.get(MUST_CHANGE_PASSWORD_COOKIE)?.value,
  });

  if (user && mustChange && !isPasswordChangeAllowedPath(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/cuenta/cambiar-password";
    redirectUrl.search = "";
    const redirectResponse = NextResponse.redirect(redirectUrl);
    // Middleware may set cookies on the response (not during RSC render).
    redirectResponse.cookies.set(
      MUST_CHANGE_PASSWORD_COOKIE,
      "1",
      passwordGateCookieOptions(),
    );
    return redirectResponse;
  }

  if (user && mustChange) {
    supabaseResponse.cookies.set(
      MUST_CHANGE_PASSWORD_COOKIE,
      "1",
      passwordGateCookieOptions(),
    );
  }

  if (user && isAuthRoute && !pathname.startsWith("/recuperar")) {
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

  return supabaseResponse;
}
