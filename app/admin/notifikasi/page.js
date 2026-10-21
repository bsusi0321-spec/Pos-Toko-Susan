"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRowsOrEmpty } from "@/lib/fetchAllRows";
import { debounce } from "@/lib/debounce";
import { LOW_STOCK_ACTIVE_DAYS, loadRecentSalePairs, shouldNotifyLowStock } from "@/lib/lowStock";
import { formatRupiah, formatDateTime, formatNumber } from "@/lib/format";
import { Card, EmptyState, Badge } from "@/components/ui/kit";

export default function NotifikasiPage() {
  const supabase = createClient();
  const router = useRouter();
  const [lowStockItems, setLowStockItems] = useState([]);
  const [recentTx, setRecentTx] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
    const reload = debounce(load, 1500); // gabungkan rentetan event jadi satu muat ulang
    const channel = supabase
      .channel("notifikasi-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "product_branch_stock" }, reload)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "transactions" }, reload)
      .subscribe();
    return () => {
      reload.cancel();
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    const [stock, { data: tx }] = await Promise.all([
      fetchAllRowsOrEmpty(
        () => supabase.from("product_branch_stock").select("product_id, branch_id, stock_qty, min_stock, products(name), branches(name)").gt("min_stock", 0),
        { orderBy: ["product_id", "branch_id"] }
      ),
      supabase
        .from("transactions")
        .select("*, profiles(full_name)")
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(15),
    ]);

    // Aturan 3 hari: hanya barang menipis yang masih ada penjualan dalam beberapa hari terakhir.
    const recentPairs = await loadRecentSalePairs(supabase);
    const low = (stock || [])
      .filter((row) => Number(row.stock_qty) <= Number(row.min_stock) && Number(row.min_stock) > 0)
      .filter((row) => shouldNotifyLowStock(recentPairs, row.product_id, row.branch_id))
      .map((row) => ({ name: row.products?.name || "(barang)", branchName: row.branches?.name, stock_qty: row.stock_qty, min_stock: row.min_stock }));

    setLowStockItems(low);
    setRecentTx(tx || []);
    setLoading(false);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-lg hover:bg-background">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-semibold">Notifikasi</h1>
          <p className="text-sm text-ink-muted">Stok menipis dan transaksi terbaru, diperbarui langsung.</p>
        </div>
      </div>

      <Card title={`Stok Menipis (${lowStockItems.length})`}>
        <p className="text-xs text-ink-muted mb-3">
          Hanya barang yang masih terjual dalam {LOW_STOCK_ACTIVE_DAYS} hari terakhir. Barang menipis yang tidak laku disembunyikan
          supaya notifikasi tidak menumpuk, dan muncul lagi otomatis begitu terjual. Lihat semuanya di{" "}
          <Link href="/admin/produk-terlaris" className="text-primary font-medium">Terlaris &amp; Tidak Laris</Link>.
        </p>
        {loading ? (
          <p className="text-sm text-ink-muted">Memuat...</p>
        ) : lowStockItems.length === 0 ? (
          <EmptyState text="Tidak ada barang menipis yang masih laku." />
        ) : (
          <div className="space-y-2">
            {lowStockItems.map((p, idx) => (
              <div key={idx} className="flex items-center justify-between border border-danger/30 bg-danger-soft rounded-lg px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">{p.name}</p>
                  {p.branchName && <p className="text-xs text-ink-muted">{p.branchName}</p>}
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-danger">{formatNumber(p.stock_qty, 2)}</p>
                  <p className="text-xs text-ink-muted">min {formatNumber(p.min_stock, 2)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Transaksi Terbaru">
        {loading ? (
          <p className="text-sm text-ink-muted">Memuat...</p>
        ) : recentTx.length === 0 ? (
          <EmptyState text="Belum ada transaksi." />
        ) : (
          <div className="space-y-2">
            {recentTx.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between text-sm py-2 border-b border-border last:border-0">
                <div>
                  <p className="font-medium">TRX-{tx.id.slice(0, 8).toUpperCase()}</p>
                  <p className="text-xs text-ink-muted">{tx.profiles?.full_name} · {formatDateTime(tx.created_at)}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">{formatRupiah(tx.total)}</p>
                  <Badge tone="default">{tx.payment_method}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
