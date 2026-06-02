import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function normalizePathname(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Edge middleware must not throw — missing Vercel env vars caused MIDDLEWARE_INVOCATION_FAILED
  if (!supabaseUrl?.trim() || !supabaseAnonKey?.trim()) {
    return supabaseResponse;
  }

  const pathname = normalizePathname(request.nextUrl.pathname);

  try {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const isPublicRoute =
      pathname === "/login" ||
      pathname.startsWith("/auth/callback") ||
      pathname.startsWith("/api/");

    if (!user && !isPublicRoute) {
      const loginUrl = new URL("/login", request.nextUrl.origin);
      const nextPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
      loginUrl.searchParams.set("next", nextPath);
      return NextResponse.redirect(loginUrl);
    }

    if (user && pathname === "/login") {
      return NextResponse.redirect(new URL("/map", request.nextUrl.origin));
    }
  } catch {
    return NextResponse.next({ request });
  }

  return supabaseResponse;
}
