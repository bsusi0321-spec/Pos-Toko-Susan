import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

export async function updateSession(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthPage = path.startsWith("/login");
  const isScanRemote = path.startsWith("/scan-remote");
  // Halaman struk digital publik (dibuka pelanggan lewat scan QR di struk) --
  // sengaja TIDAK butuh login sama sekali, jadi harus masuk daftar publik di
  // sini juga. Tanpa baris ini, middleware selalu mengarahkan siapapun yang
  // belum login ke /login duluan, sebelum sempat sampai ke halaman struknya
  // (halaman & datanya sendiri sebenarnya sudah didesain publik lewat fungsi
  // database get_public_receipt, tapi kelempar balik ke /login di sini).
  const isPublicReceipt = path.startsWith("/struk/");
  const isPwaAsset = path === "/manifest.json" || path === "/sw.js" || path.startsWith("/icons/");
  const isPublic = isAuthPage || isScanRemote || isPublicReceipt || isPwaAsset || path.startsWith("/_next") || path.startsWith("/api/public");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}
