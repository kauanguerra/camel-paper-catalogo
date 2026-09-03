import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type Role = "admin" | "commercial" | "seller" | "viewer";

type Profile = {
  id: string;
  role: Role;
  active: boolean;
};

const PUBLIC_PREFIXES = [
  "/login",
  "/catalogo-cliente",
  "/api/catalogo-cliente",
];

function isPublicPath(pathname: string) {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isApiPath(pathname: string) {
  return pathname.startsWith("/api/");
}

function isAllowedForRole(pathname: string, role: Role) {
  if (role === "admin") {
    return true;
  }

  if (role === "commercial") {
    return !(
      pathname === "/usuarios" ||
      pathname.startsWith("/usuarios/") ||
      pathname === "/api/usuarios" ||
      pathname.startsWith("/api/usuarios/")
    );
  }

  if (role === "seller" || role === "viewer") {
    return pathname === "/catalogo" || pathname.startsWith("/catalogo/");
  }

  return false;
}

function roleHome(role: Role) {
  if (role === "seller" || role === "viewer") {
    return "/catalogo";
  }

  return "/";
}

function unauthorizedResponse(request: NextRequest, message: string) {
  if (isApiPath(request.nextUrl.pathname)) {
    return NextResponse.json({ error: message }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

function forbiddenResponse(request: NextRequest, role: Role) {
  if (isApiPath(request.nextUrl.pathname)) {
    return NextResponse.json(
      { error: "Você não possui permissão para esta operação." },
      { status: 403 }
    );
  }

  const url = request.nextUrl.clone();
  url.pathname = roleHome(role);
  url.search = "";
  return NextResponse.redirect(url);
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          response = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: claimsData,
    error: claimsError,
  } = await supabase.auth.getClaims();

  const userId = claimsData?.claims?.sub;
  const pathname = request.nextUrl.pathname;

  if (isPublicPath(pathname)) {
    if (pathname === "/login" && userId && !claimsError) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, role, active")
        .eq("id", userId)
        .maybeSingle<Profile>();

      if (profile?.active && profile.role) {
        const url = request.nextUrl.clone();
        url.pathname = roleHome(profile.role);
        url.search = "";
        return NextResponse.redirect(url);
      }
    }

    return response;
  }

  if (claimsError || !userId) {
    return unauthorizedResponse(request, "Faça login para continuar.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, active")
    .eq("id", userId)
    .maybeSingle<Profile>();

  if (profileError || !profile) {
    if (isApiPath(pathname)) {
      return NextResponse.json(
        { error: "Perfil interno não encontrado." },
        { status: 403 }
      );
    }

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("erro", "perfil");
    return NextResponse.redirect(url);
  }

  if (!profile.active) {
    if (isApiPath(pathname)) {
      return NextResponse.json(
        { error: "Este usuário está desativado." },
        { status: 403 }
      );
    }

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("erro", "desativado");
    return NextResponse.redirect(url);
  }

  if (!isAllowedForRole(pathname, profile.role)) {
    return forbiddenResponse(request, profile.role);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
