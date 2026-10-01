import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// Pembersihan log RUTIN yang lebih tua dari 30 hari (lihat fungsi
// bersihkan_log_rutin di migration-34). Dijalankan otomatis tiap hari oleh
// Vercel Cron (vercel.json), diautentikasi lewat CRON_SECRET seperti
// cron lain di aplikasi ini. Yang dihapus HANYA log rutin; riwayat
// penting, transaksi, kas, stok opname, dan sebagainya tidak disentuh.
export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });
  }

  try {
    const service = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await service.rpc("bersihkan_log_rutin", { p_hari: 30 });
    if (error) throw error;
    return NextResponse.json({ ok: true, ...data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
