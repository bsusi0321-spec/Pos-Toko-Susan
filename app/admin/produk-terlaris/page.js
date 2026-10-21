"use client";

// TERLARIS & TIDAK LARIS
//
// Menampilkan SEMUA produk aktif dari yang paling laku sampai yang tidak
// terjual sama sekali pada periode yang dipilih (Dashboard hanya menampilkan
// 8 produk terlaris bulan ini).
//
// Sumber data (semuanya dihitung di database lewat migration-37, jadi cepat
// walau transaksinya banyak):
//  - product_sales_summary : jumlah terjual, omset, laba per produk
//  - product_last_sale     : kapan terakhir produk itu terjual
// Aturan hitung sama dengan Dashboard: hanya transaksi "completed"; retur &
// tukar barang ikut mengurangi jumlah terjual.
//
// Barang menipis yang tidak terjual 3 hari terakhir disembunyikan dari
// notifikasi (lihat lib/lowStock.js) -- di halaman ini semuanya tetap terlihat.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { formatRupiah, formatNumber, formatDate } from "@/lib/format";
import { exportToCsv } from "@/lib/exportCsv";
import { LOW_STOCK_ACTIVE_DAYS, loadRecentSalePairs, shouldNotifyLowStock } from "@/lib/lowStock";
import { Button, Card, EmptyState, Input, Select, Badge, StatCard } from "@/components/ui/kit";

const PERIODS = [
  { value: "all", label: "Sejak toko buka (semua)" },
  { value: "today", label: "Hari ini" },
  { value: "7d", label: "7 hari terakhir" },
  { value: "30d", label: "30 hari terakhir" },
  { value: "month", label: "Bulan ini" },
  { value: "custom", label: "Pilih tanggal" },
];
const STATUS_FILTERS = [
  { value: "all", label: "Semua produk" },
  { value: "laku", label: "Yang terjual" },
  { value: "tidak", label: "Yang tidak terjual" },
  { value: "menipis", label: "Stok menipis" },
];
const SORTS = [
  { value: "terlaris", label: "Terlaris (jumlah terjual)" },
  { value: "omset", label: "Omset terbesar" },
  { value: "laba", label: "Laba terbesar" },
  { value: "lama", label: "Paling lama tidak terjual" },
  { value: "nama", label: "Nama A-Z" },
];
const PAGE = 100;

function dateValue(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseLocal(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}
// Mengembalikan { start, end } (end tidak ikut dihitung) sesuai pilihan periode.
function rangeFor(period, from, to) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  // Bawaan: SELURUH penjualan sejak toko mulai berjualan sampai hari ini.
  if (period === "all") return { start: new Date(2000, 0, 1), end: tomorrow };
  if (period === "today") return { start: today, end: tomorrow };
  if (period === "7d") {
    const s = new Date(today);
    s.setDate(s.getDate() - 6);
    return { start: s, end: tomorrow };
  }
  if (period === "30d") {
    const s = new Date(today);
    s.setDate(s.getDate() - 29);
    return { start: s, end: tomorrow };
  }
  if (period === "month") return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: tomorrow };
  const s = parseLocal(from || dateValue(today));
  const e = parseLocal(to || dateValue(today));
  e.setDate(e.getDate() + 1);
  return { start: s, end: e };
}

function lastSoldText(iso) {
  if (!iso) return "Belum pernah terjual";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  const days = Math.round((today - d) / 86400000);
  if (days <= 0) return "Hari ini";
  if (days === 1) return "Kemarin";
  return `${days} hari lalu`;
}

export default function ProdukTerlarisPage() {
  const supabase = createClient();

  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState("");
  const [period, setPeriod] = useState("all"); // bawaan: sejak toko buka sampai hari ini
  const [from, setFrom] = useState(dateValue(new Date()));
  const [to, setTo] = useState(dateValue(new Date()));
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("terlaris");
  const [visible, setVisible] = useState(PAGE);

  const [products, setProducts] = useState([]);
  const [stockRows, setStockRows] = useState([]);
  const [summary, setSummary] = useState([]);
  const [lastSales, setLastSales] = useState([]);
  const [recentPairs, setRecentPairs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [setupError, setSetupError] = useState(false);

  useEffect(() => {
    supabase
      .from("branches")
      .select("id, name")
      .eq("active", true)
      .order("created_at", { ascending: true })
      .then(({ data }) => setBranches(data || []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    setSetupError(false);
    const { start, end } = rangeFor(period, from, to);
    try {
      const [prods, stock, sum, last, recent] = await Promise.all([
        fetchAllRows(() => supabase.from("products").select("id, name, sku").eq("active", true), { orderBy: ["name", "id"] }),
        fetchAllRows(
          () => {
            const q = supabase.from("product_branch_stock").select("product_id, branch_id, stock_qty, min_stock");
            return branchId ? q.eq("branch_id", branchId) : q;
          },
          { orderBy: ["product_id", "branch_id"] }
        ),
        fetchAllRows(
          () => supabase.rpc("product_sales_summary", { p_from: start.toISOString(), p_to: end.toISOString(), p_branch: branchId || null }),
          { orderBy: ["product_id"] }
        ),
        fetchAllRows(() => supabase.rpc("product_last_sale", { p_branch: branchId || null }), { orderBy: ["product_id"] }),
        loadRecentSalePairs(supabase),
      ]);
      setProducts(prods);
      setStockRows(stock);
      setSummary(sum);
      setLastSales(last);
      setRecentPairs(recent);
    } catch (err) {
      if (err?.code === "PGRST202" || /product_sales_summary|product_last_sale/.test(err?.message || "")) {
        setSetupError(true);
      } else {
        toast.error("Gagal memuat data: " + (err?.message || "coba lagi"));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    setVisible(PAGE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, from, to, branchId]);

  useEffect(() => setVisible(PAGE), [search, status, sort]);

  // Gabungkan semua data menjadi 1 baris per produk.
  const rows = useMemo(() => {
    const sumMap = new Map(summary.map((r) => [r.product_id, r]));
    const lastMap = new Map(lastSales.map((r) => [r.product_id, r.last_sold_at]));
    const stockMap = new Map();
    for (const r of stockRows) {
      if (!stockMap.has(r.product_id)) stockMap.set(r.product_id, []);
      stockMap.get(r.product_id).push(r);
    }
    return products.map((p) => {
      const s = sumMap.get(p.id);
      const st = stockMap.get(p.id) || [];
      const lowRows = st.filter((r) => Number(r.min_stock) > 0 && Number(r.stock_qty) <= Number(r.min_stock));
      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        qty: s ? Number(s.qty_sold) : 0,
        revenue: s ? Number(s.revenue) : 0,
        profit: s ? Number(s.profit) : 0,
        lastSold: lastMap.get(p.id) || null,
        stock: st.reduce((a, r) => a + Number(r.stock_qty), 0),
        low: lowRows.length > 0,
        // menipis tapi tidak terjual 3 hari terakhir -> tidak muncul di notifikasi
        hiddenFromNotif: lowRows.length > 0 && !lowRows.some((r) => shouldNotifyLowStock(recentPairs, p.id, r.branch_id)),
      };
    });
  }, [products, stockRows, summary, lastSales, recentPairs]);

  const stats = useMemo(
    () => ({
      total: rows.length,
      laku: rows.filter((r) => r.qty > 0).length,
      tidak: rows.filter((r) => r.qty <= 0).length,
      menipis: rows.filter((r) => r.low).length,
    }),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows.filter((r) => {
      if (q && !(r.name || "").toLowerCase().includes(q) && !(r.sku || "").toLowerCase().includes(q)) return false;
      if (status === "laku") return r.qty > 0;
      if (status === "tidak") return r.qty <= 0;
      if (status === "menipis") return r.low;
      return true;
    });
    const byName = (a, b) => (a.name || "").localeCompare(b.name || "", "id");
    list = [...list];
    if (sort === "terlaris") list.sort((a, b) => b.qty - a.qty || b.revenue - a.revenue || byName(a, b));
    else if (sort === "omset") list.sort((a, b) => b.revenue - a.revenue || b.qty - a.qty || byName(a, b));
    else if (sort === "laba") list.sort((a, b) => b.profit - a.profit || b.qty - a.qty || byName(a, b));
    else if (sort === "lama")
      list.sort((a, b) => {
        const ta = a.lastSold ? new Date(a.lastSold).getTime() : -Infinity;
        const tb = b.lastSold ? new Date(b.lastSold).getTime() : -Infinity;
        return ta - tb || byName(a, b);
      });
    else list.sort(byName);
    return list;
  }, [rows, search, status, sort]);

  const periodLabel = useMemo(() => {
    if (period === "all") return "sejak toko buka sampai hari ini";
    const { start, end } = rangeFor(period, from, to);
    const last = new Date(end);
    last.setDate(last.getDate() - 1);
    return `${formatDate(start)} - ${formatDate(last)}`;
  }, [period, from, to]);

  function handleExport() {
    if (filtered.length === 0) return toast.error("Tidak ada data untuk diunduh");
    exportToCsv(
      `terlaris-${dateValue(new Date())}.csv`,
      filtered.map((r, i) => ({
        No: i + 1,
        Produk: r.name,
        SKU: r.sku || "",
        Terjual: r.qty,
        Omset: r.revenue,
        Laba: r.profit,
        "Terakhir Terjual": r.lastSold ? formatDate(r.lastSold) : "Belum pernah",
        Stok: r.stock,
        Status: r.qty > 0 ? "Terjual" : "Tidak terjual",
        "Stok Menipis": r.low ? "Ya" : "",
      }))
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Terlaris &amp; Tidak Laris</h1>
        <p className="text-sm text-ink-muted">
          Semua produk aktif dari yang paling laku sampai yang tidak terjual. Periode: {periodLabel}. Pilih periode lain atau tanggal tertentu untuk menyaring.
        </p>
      </div>

      {setupError && (
        <div className="rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm">
          <p className="font-medium text-danger">Menu ini belum aktif.</p>
          <p className="text-ink-muted mt-1">
            Jalankan dulu file <b>migration-37-terlaris-dan-notifikasi-3-hari.sql</b> di Supabase (SQL Editor), lalu muat ulang halaman ini.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Produk" value={formatNumber(stats.total)} />
        <StatCard label="Terjual" value={formatNumber(stats.laku)} hint="pernah terjual di periode ini" tone="primary" />
        <StatCard label="Tidak Terjual" value={formatNumber(stats.tidak)} hint="belum terjual di periode ini" tone="danger" />
        <StatCard label="Stok Menipis" value={formatNumber(stats.menipis)} />
      </div>

      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Select label="Periode" value={period} onChange={(e) => setPeriod(e.target.value)}>
            {PERIODS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
          {branches.length > 1 && (
            <Select label="Cabang" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">Semua cabang</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          )}
          <Select label="Tampilkan" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_FILTERS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
          <Select label="Urutkan" value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </div>
        {period === "custom" && (
          <div className="grid grid-cols-2 gap-3 mt-3 max-w-md">
            <Input label="Dari tanggal" type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
            <Input label="Sampai tanggal" type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} />
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-3 mt-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama produk atau SKU..."
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
          <Button variant="outline" onClick={handleExport}>
            <Download size={16} className="mr-1.5 inline" />
            Unduh CSV
          </Button>
        </div>
      </Card>

      <Card title={`Daftar Produk (${formatNumber(filtered.length)})`}>
        <p className="text-xs text-ink-muted mb-3">
          Barang menipis yang tidak terjual {LOW_STOCK_ACTIVE_DAYS} hari terakhir tidak muncul di Notifikasi (supaya tidak menumpuk),
          tapi tetap tampil di sini dan muncul lagi di Notifikasi begitu terjual. Hasil retur/tukar barang ikut mengurangi jumlah terjual.
        </p>
        {loading ? (
          <p className="text-sm text-ink-muted">Memuat...</p>
        ) : filtered.length === 0 ? (
          <EmptyState text="Tidak ada produk yang cocok." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-muted border-b border-border">
                    <th className="py-2 pr-3 w-10">No</th>
                    <th className="py-2 pr-3">Produk</th>
                    <th className="py-2 pr-3 text-right">Terjual</th>
                    <th className="py-2 pr-3 text-right">Omset</th>
                    <th className="py-2 pr-3 text-right">Laba</th>
                    <th className="py-2 pr-3">Terakhir Terjual</th>
                    <th className="py-2 text-right">Stok</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, visible).map((r, i) => (
                    <tr key={r.id} className="border-b border-border last:border-0 align-top">
                      <td className="py-2 pr-3 text-ink-muted">{i + 1}</td>
                      <td className="py-2 pr-3">
                        <p className="font-medium">{r.name}</p>
                        {r.sku && <p className="text-xs text-ink-muted">{r.sku}</p>}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {r.qty > 0 ? formatNumber(r.qty, 2) : <Badge tone="danger">Tidak terjual</Badge>}
                      </td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">{r.qty > 0 ? formatRupiah(r.revenue) : "-"}</td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap text-primary">{r.qty > 0 ? formatRupiah(r.profit) : "-"}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <p>{lastSoldText(r.lastSold)}</p>
                        {r.lastSold && <p className="text-xs text-ink-muted">{formatDate(r.lastSold)}</p>}
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <p>{formatNumber(r.stock, 2)}</p>
                        {r.low && <Badge tone="warning">Menipis</Badge>}
                        {r.hiddenFromNotif && <p className="text-[11px] text-ink-muted mt-0.5">tidak di notifikasi</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {visible < filtered.length && (
              <div className="flex gap-2 justify-center mt-4">
                <Button variant="outline" onClick={() => setVisible((v) => v + PAGE)}>Tampilkan {PAGE} lagi</Button>
                <Button variant="outline" onClick={() => setVisible(filtered.length)}>Tampilkan semua ({formatNumber(filtered.length)})</Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
