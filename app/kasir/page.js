import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import KasirApp from "./KasirApp";

export default async function KasirPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile || !profile.active) redirect("/login");
  if (profile.role === "admin") redirect("/admin/dashboard");

  const { data: openShift } = await supabase
    .from("shifts")
    .select("*")
    .eq("cashier_id", user.id)
    .eq("status", "open")
    .order("opening_time", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [{ data: products }, { data: customers }, { data: settings }, { data: pendingTx }] =
    await Promise.all([
      supabase
        .from("products")
        .select(
          "*, product_wholesale_pricing(*), product_kg_pricing(*), product_out_of_town_pricing(*), product_barcodes(*)"
        )
        .eq("active", true)
        .order("name"),
      supabase.from("customers").select("*").eq("active", true).order("name"),
      supabase.from("store_settings").select("*").eq("id", 1).single(),
      supabase
        .from("transactions")
        .select("*, transaction_items(*, products(name))")
        .eq("cashier_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);

  return (
    <KasirApp
      profile={profile}
      initialShift={openShift || null}
      products={products || []}
      customers={customers || []}
      settings={settings || null}
      pendingTransactions={pendingTx || []}
    />
  );
}
