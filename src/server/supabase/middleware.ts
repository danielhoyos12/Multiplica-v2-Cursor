import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { safeInternalPath } from "@/lib/safe-redirect";

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

  if (user && isAuthRoute && !pathname.startsWith("/recuperar")) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
