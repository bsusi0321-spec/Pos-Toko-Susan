"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, formatNumber, formatRupiah } from "@/lib/format";
import { exportToCsv } from "@/lib/exportCsv";
import { Badge, Button, Card, EmptyState, Input } from "@/components/ui/kit";

const PAGE_SIZE = 100;

const TABLE_LABEL = {
  products: "Produk",
  product_branch_stock: "Stok cabang",
  product_wholesale_pricing: "Harga grosir",
  product_kg_pricing: "Harga per kg",
  product_out_of_town_pricing: "Harga luar kota",
  product_barcodes: "Barcode",
  profiles: "Pengguna",
  store_settings: "Pengaturan toko",
  customers: "Pelanggan",
  suppliers: "Supplier",
  branches: "Cabang",
  cash_movements: "Kas masuk/keluar",
  monthly_closings: "Tutup buku",
  transactions: "Transaksi",
  shifts: "Shift kas",
  kasbon: "Kasbon",
  kasbon_payments: "Bayar kasbon",
  supplier_payments: "Bayar hutang supplier",
  purchase_orders: "Pembelian",
  stock_opnames: "Stok opname",
  cashier_shortcuts: "Shortcut kasir",
  voice_dictionary: "Kamus suara",
  label_settings: "Pengaturan label",
  product_price_labels: "Label harga",
  product_units: "Satuan produk",
};

const ACTION_LABEL = { INSERT: "Tambah", UPDATE: "Ubah", DELETE: "Hapus" };
const ACTION_TONE = { INSERT: "primary", UPDATE: "default", DELETE: "danger" };

const FIELD_LABEL = {
  name: "Nama",
  full_name: "Nama",
  sku: "SKU",
  barcode: "Barcode",
  sell_price: "Harga jual",
  cost_price: "Harga modal",
  stock_qty: "Stok",
  min_stock: "Stok minimum",
  active: "Aktif",
  unit_type: "Jenis",
  unit_label: "Satuan",
  tax_rate: "Pajak",
  role: "Peran",
  username: "Username",
  branch_id: "Cabang",
  status: "Status",
  total: "Total",
  amount: "Jumlah",
  store_name: "Nama toko",
  telegram_bot_token: "Token Telegram",
  address: "Alamat",
  phone: "Telepon",
  notes: "Catatan",
  note: "Catatan",
  code: "Kode",
  period_key: "Periode",
  eceran_tambahan: "Tambahan eceran",
  min_qty: "Minimal beli",
  price: "Harga",
  default_opening_cash: "Modal awal bawaan",
};

const MONEY_KEY = (k) => /(_price|_cash|^price$|^amount$|^total$|^subtotal$|^eceran_tambahan$|_amount$|_total$)/.test(k);
const HIDDEN_KEYS = new Set(["id", "created_at", "updated_at", "last_low_stock_notified_at"]);

function fieldLabel(k) {
  return FIELD_LABEL[k] || k.replace(/_/g, " ");
}

function formatValue(k, v) {
  if (v === null || v === undefined || v === "") return "(kosong)";
  if (typeof v === "boolean") return v ? "Ya" : "Tidak";
  if (typeof v === "number" || (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v))) {
    return MONEY_KEY(k) ? formatRupiah(Number(v)) : formatNumber(Number(v), 3);
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// Kenali kejadian yang pantas dilihat lebih dulu oleh pemilik.
function flagsOf(r) {
  const flags = [];
  if (r.source === "database langsung") flags.push({ tone: "danger", text: "Lewat database langsung" });
  if (r.action === "DELETE" && r.importance === "penting") flags.push({ tone: "danger", text: "Data dihapus" });
  const o = r.old_data || {};
  const n = r.new_data || {};
  if (r.table_name === "products" && r.action === "UPDATE") {
    if ("sell_price" in n && Number(n.sell_price) < Number(o.sell_price)) flags.push({ tone: "warning", text: "Harga jual diturunkan" });
    if ("cost_price" in n) flags.push({ tone: "warning", text: "Harga modal diubah" });
  }
  if (r.table_name === "product_branch_stock" && r.action === "UPDATE" && "stock_qty" in n && !r.context) {
    flags.push({ tone: "warning", text: Number(n.stock_qty) < Number(o.stock_qty) ? "Stok dikurangi (di luar opname)" : "Stok diubah (di luar opname)" });
  }
  return flags;
}

function dateStartIso(d) {
  return new Date(`${d}T00:00:00+07:00`).toISOString();
}
function dateEndIso(d) {
  return new Date(`${d}T23:59:59.999+07:00`).toISOString();
}
function todayStr(offsetDays = 0) {
  const d = new Date(Date.now() + 7 * 3600 * 1000 - offsetDays * 86400000); // tanggal WIB
  return d.toISOString().slice(0, 10);
}

export default function RiwayatPerubahanPage() {
  const supabase = createClient();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState({ from: todayStr(7), to: todayStr(0), table: "", action: "", user: "", onlyFlagged: false });
  const [search, setSearch] = useState("");
  const [productFilter, setProductFilter] = useState(null); // { id, name }
  const [expanded, setExpanded] = useState(null);
  const [cleanup, setCleanup] = useState(null);
  const [cleaning, setCleaning] = useState(false);
  const [ready, setReady] = useState(false);

  // Dari tombol "Riwayat" di halaman Produk: /admin/riwayat-perubahan?produk=<id>
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("produk");
    if (id) {
      setFilters((f) => ({ ...f, from: todayStr(365) }));
      supabase
        .from("products")
        .select("id, name")
        .eq("id", id)
        .maybeSingle()
        .then(({ data }) => setProductFilter({ id, name: data?.name || null }));
    }
    supabase
      .from("profiles")
      .select("id, full_name")
      .order("full_name")
      .then(({ data }) => setUsers(data || []));
    setReady(true);
    loadCleanupInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ready) load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, filters.from, filters.to, filters.table, filters.action, filters.user, productFilter?.id]);

  function buildQuery() {
    let q = supabase.from("audit_log").select("*").order("id", { ascending: false });
    if (filters.from) q = q.gte("created_at", dateStartIso(filters.from));
    if (filters.to) q = q.lte("created_at", dateEndIso(filters.to));
    if (filters.table) q = q.eq("table_name", filters.table);
    if (filters.action) q = q.eq("action", filters.action);
    if (filters.user === "__db") q = q.neq("source", "aplikasi");
    else if (filters.user) q = q.eq("user_id", filters.user);
    if (productFilter?.id) q = q.eq("product_id", productFilter.id);
    return q;
  }

  async function load(reset) {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    const from = reset ? 0 : rows.length;
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) toast.error(error.message || "Gagal memuat riwayat. Sudah menjalankan migration-34?");
    const list = data || [];
    setRows(reset ? list : [...rows, ...list]);
    setHasMore(list.length === PAGE_SIZE);
    if (reset) setExpanded(null);
    setLoading(false);
    setLoadingMore(false);
  }

  async function loadCleanupInfo() {
    const { data } = await supabase.rpc("hitung_log_rutin", { p_hari: 30 });
    setCleanup(data || null);
  }

  async function runCleanup() {
    const total = (cleanup?.audit || 0) + (cleanup?.aktivitas || 0);
    if (total === 0) return toast("Tidak ada log rutin yang perlu dibersihkan.");
    if (!confirm(`Hapus PERMANEN ${total} catatan log rutin yang lebih tua dari 30 hari?\n\nRiwayat penting, transaksi, kas, dan stok opname tidak ikut terhapus.`)) return;
    setCleaning(true);
    const { data, error } = await supabase.rpc("bersihkan_log_rutin", { p_hari: 30 });
    setCleaning(false);
    if (error) return toast.error(error.message || "Gagal membersihkan log");
    toast.success(`Terhapus: ${data.audit_dihapus} riwayat rutin, ${data.aktivitas_dihapus} log aktivitas`);
    loadCleanupInfo();
    load(true);
  }

  const withFlags = useMemo(() => rows.map((r) => ({ ...r, flags: flagsOf(r) })), [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return withFlags.filter((r) => {
      if (filters.onlyFlagged && r.flags.length === 0) return false;
      if (!q) return true;
      return `${r.record_label || ""} ${r.user_name || ""} ${TABLE_LABEL[r.table_name] || r.table_name}`.toLowerCase().includes(q);
    });
  }, [withFlags, search, filters.onlyFlagged]);

  function exportRows() {
    exportToCsv(
      `riwayat-perubahan-${filters.from}_${filters.to}.csv`,
      visible.map((r, i) => ({
        No: i + 1,
        Waktu: formatDateTime(r.created_at),
        Pelaku: r.user_name || (r.source === "aplikasi" ? "-" : r.source),
        Sumber: r.source,
        Jenis: TABLE_LABEL[r.table_name] || r.table_name,
        Aksi: ACTION_LABEL[r.action],
        Data: r.record_label || "",
        Sebelum: describe(r.old_data),
        Sesudah: describe(r.new_data),
        Konteks: r.context || "",
      }))
    );
  }

  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Riwayat Perubahan</h1>
        <p className="text-sm text-ink-muted mt-1">
          Catatan otomatis dari database: siapa mengubah apa, kapan, dan nilai lamanya. Tidak bisa diubah atau dihapus dari aplikasi.
        </p>
      </div>

      {productFilter && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm">
          <span>
            Menampilkan riwayat produk: <b>{productFilter.name || "(produk sudah dihapus)"}</b>
          </span>
          <Button
            variant="ghost"
            onClick={() => {
              setProductFilter(null);
              window.history.replaceState(null, "", "/admin/riwayat-perubahan");
              set({ from: todayStr(7) });
            }}
          >
            Tampilkan semua
          </Button>
        </div>
      )}

      <Card className="mb-5">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Input label="Dari tanggal" type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} />
          <Input label="Sampai tanggal" type="date" value={filters.to} onChange={(e) => set({ to: e.target.value })} />
          <FilterSelect label="Jenis data" value={filters.table} onChange={(v) => set({ table: v })}>
            <option value="">Semua</option>
            {Object.entries(TABLE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Aksi" value={filters.action} onChange={(v) => set({ action: v })}>
            <option value="">Semua</option>
            <option value="INSERT">Tambah</option>
            <option value="UPDATE">Ubah</option>
            <option value="DELETE">Hapus</option>
          </FilterSelect>
          <FilterSelect label="Pelaku" value={filters.user} onChange={(v) => set({ user: v })}>
            <option value="">Semua</option>
            <option value="__db">Database langsung / server</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </FilterSelect>
          <Input label="Cari" placeholder="Nama barang / pelaku" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3 mt-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={filters.onlyFlagged} onChange={(e) => set({ onlyFlagged: e.target.checked })} />
            Hanya yang perlu diperiksa (hapus data, harga turun, stok diubah, lewat database langsung)
          </label>
          <Button variant="outline" onClick={exportRows} disabled={visible.length === 0}>
            Ekspor CSV
          </Button>
        </div>
      </Card>

      <Card>
        {loading ? (
          <p className="text-sm text-ink-muted py-8 text-center">Memuat...</p>
        ) : visible.length === 0 ? (
          <EmptyState text="Tidak ada perubahan pada filter ini." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-ink-muted border-b border-border">
                    <th className="text-left py-2 pr-3 font-medium w-10">No</th>
                    <th className="text-left py-2 pr-3 font-medium">Waktu</th>
                    <th className="text-left py-2 pr-3 font-medium">Pelaku</th>
                    <th className="text-left py-2 pr-3 font-medium">Jenis</th>
                    <th className="text-left py-2 pr-3 font-medium">Data</th>
                    <th className="text-left py-2 pr-3 font-medium">Aksi</th>
                    <th className="text-left py-2 pr-3 font-medium">Perubahan</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r, i) => (
                    <RowItem key={r.id} r={r} no={i + 1} open={expanded === r.id} onToggle={() => setExpanded(expanded === r.id ? null : r.id)} />
                  ))}
                </tbody>
              </table>
            </div>
            {hasMore && (
              <div className="pt-4 text-center">
                <Button variant="outline" onClick={() => load(false)} disabled={loadingMore}>
                  {loadingMore ? "Memuat..." : `Muat ${PAGE_SIZE} berikutnya`}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      <Card title="Pembersihan log rutin" className="mt-5">
        <p className="text-sm text-ink-muted mb-3">
          Log rutin (checkout, buka shift, pembuatan/penerimaan pesanan pembelian, dan perubahan pengaturan tampilan) otomatis dihapus
          permanen setelah 30 hari, tiap hari pukul 03.00 UTC. Riwayat penting seperti harga, stok, hapus data, dan pengguna
          tidak pernah dihapus otomatis.
        </p>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm">
            {cleanup
              ? `Siap dibersihkan sekarang: ${formatNumber(cleanup.audit)} riwayat rutin + ${formatNumber(cleanup.aktivitas)} log aktivitas`
              : "Menghitung..."}
          </p>
          <Button variant="outline" onClick={runCleanup} disabled={cleaning || !cleanup}>
            {cleaning ? "Membersihkan..." : "Bersihkan sekarang"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function describe(data) {
  if (!data) return "";
  return Object.entries(data)
    .filter(([k]) => !HIDDEN_KEYS.has(k))
    .map(([k, v]) => `${fieldLabel(k)}: ${formatValue(k, v)}`)
    .join("; ");
}

function FilterSelect({ label, value, onChange, children }) {
  return (
    <div>
      <label className="text-sm font-medium mb-1.5 block">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
      >
        {children}
      </select>
    </div>
  );
}

function RowItem({ r, no, open, onToggle }) {
  const keys = (r.changed_keys || []).filter((k) => !HIDDEN_KEYS.has(k));
  const summary =
    r.action === "UPDATE"
      ? keys.slice(0, 3).map((k) => (
          <span key={k} className="block">
            <span className="text-ink-muted">{fieldLabel(k)}:</span> {formatValue(k, r.old_data?.[k])} <span className="text-ink-muted">→</span>{" "}
            <b>{formatValue(k, r.new_data?.[k])}</b>
          </span>
        ))
      : r.action === "INSERT"
      ? <span className="text-ink-muted">Data baru ditambahkan</span>
      : <span className="text-ink-muted">Data dihapus</span>;

  return (
    <>
      <tr className="border-b border-border last:border-0 align-top cursor-pointer hover:bg-background/60" onClick={onToggle}>
        <td className="py-2.5 pr-3 text-ink-muted">{no}</td>
        <td className="py-2.5 pr-3 whitespace-nowrap">{formatDateTime(r.created_at)}</td>
        <td className="py-2.5 pr-3">
          {r.user_name || <span className="text-danger">{r.source === "aplikasi" ? "-" : r.source === "server" ? "Server" : "Database langsung"}</span>}
        </td>
        <td className="py-2.5 pr-3">{TABLE_LABEL[r.table_name] || r.table_name}</td>
        <td className="py-2.5 pr-3">
          {r.record_label || "-"}
          {r.context && <span className="block text-xs text-ink-muted">{r.context}</span>}
        </td>
        <td className="py-2.5 pr-3">
          <Badge tone={ACTION_TONE[r.action]}>{ACTION_LABEL[r.action]}</Badge>
        </td>
        <td className="py-2.5 pr-3">
          {summary}
          {keys.length > 3 && r.action === "UPDATE" && <span className="text-xs text-ink-muted">+{keys.length - 3} kolom lain</span>}
          {r.flags.length > 0 && (
            <span className="flex gap-1 flex-wrap mt-1">
              {r.flags.map((f) => (
                <Badge key={f.text} tone={f.tone}>
                  {f.text}
                </Badge>
              ))}
            </span>
          )}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-border bg-background/40">
          <td />
          <td colSpan={6} className="py-3 pr-3">
            <DetailTable r={r} />
          </td>
        </tr>
      )}
    </>
  );
}

function DetailTable({ r }) {
  const keys = (r.changed_keys || []).filter((k) => !HIDDEN_KEYS.has(k));
  const showBefore = r.action !== "INSERT";
  const showAfter = r.action !== "DELETE";
  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-muted">
        {r.source === "aplikasi" ? "Lewat aplikasi" : r.source === "server" ? "Dari server aplikasi" : "Lewat SQL Editor / Table Editor Supabase"}
        {r.record_id ? ` · ID ${r.record_id}` : ""}
      </p>
      <table className="text-sm">
        <thead>
          <tr className="text-ink-muted">
            <th className="text-left pr-6 font-medium">Kolom</th>
            {showBefore && <th className="text-left pr-6 font-medium">Sebelum</th>}
            {showAfter && <th className="text-left font-medium">Sesudah</th>}
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k}>
              <td className="pr-6 py-0.5">{fieldLabel(k)}</td>
              {showBefore && <td className="pr-6 py-0.5">{formatValue(k, r.old_data?.[k])}</td>}
              {showAfter && <td className="py-0.5 font-medium">{formatValue(k, r.new_data?.[k])}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
