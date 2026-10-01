"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ArrowLeft, Plus, Trash2, X, Download, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, formatNumber, formatRupiah } from "@/lib/format";
import { exportToCsv } from "@/lib/exportCsv";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { findProductByCode } from "@/lib/barcode";
import { useBarcodeScan } from "@/lib/useBarcodeScan";
import { useViewport } from "@/lib/useViewport";
import CameraScanButton from "@/components/CameraScanButton";
import ProductSearchInput from "@/components/ProductSearchInput";
import { Badge, Button, Card, EmptyState, Input, Modal, Select, Textarea } from "@/components/ui/kit";

const STATUS_LABEL = { draft: "Sedang dihitung", selesai: "Selesai", batal: "Dibatalkan" };
const STATUS_TONE = { draft: "warning", selesai: "primary", batal: "danger" };
const REASONS = ["Rusak", "Kadaluarsa", "Hilang", "Salah input stok", "Salah catat pembelian/retur", "Lainnya"];

// Angka boleh diketik dengan koma atau titik desimal ("1,5" / "1.5").
function parseQty(text) {
  const t = String(text ?? "").trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export default function StokOpnamePage() {
  const [openId, setOpenId] = useState(null);
  return openId ? <OpnameDetail id={openId} onBack={() => setOpenId(null)} /> : <OpnameList onOpen={setOpenId} />;
}

// ------------------------------------------------------------------
// DAFTAR SESI OPNAME
// ------------------------------------------------------------------
function OpnameList({ onOpen }) {
  const supabase = createClient();
  const [rows, setRows] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ branch_id: "", notes: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
    supabase
      .from("branches")
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setBranches(data || []);
        setForm((f) => ({ ...f, branch_id: f.branch_id || data?.[0]?.id || "" }));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("stock_opnames")
      .select("*, branches(name), creator:profiles!created_by(full_name), stock_opname_items(count)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) toast.error(error.message || "Gagal memuat daftar opname");
    setRows(data || []);
    setLoading(false);
  }

  async function createSession() {
    if (!form.branch_id) return toast.error("Pilih cabang dulu");
    setSaving(true);
    const { data, error } = await supabase.rpc("opname_buat", { p_branch_id: form.branch_id, p_notes: form.notes });
    setSaving(false);
    if (error) return toast.error(error.message || "Gagal membuat sesi opname");
    setModalOpen(false);
    setForm((f) => ({ ...f, notes: "" }));
    toast.success("Sesi opname dibuat");
    onOpen(data);
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Stok Opname</h1>
          <p className="text-sm text-ink-muted mt-1">
            Cocokkan stok di sistem dengan hitungan barang asli di rak dan gudang. Selisihnya dikoreksi dan tercatat.
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="flex items-center gap-1.5">
          <Plus size={16} /> Opname Baru
        </Button>
      </div>

      <Card>
        {loading ? (
          <p className="text-sm text-ink-muted py-8 text-center">Memuat...</p>
        ) : rows.length === 0 ? (
          <EmptyState text="Belum ada sesi opname. Klik Opname Baru untuk mulai." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ink-muted border-b border-border">
                  <th className="text-left py-2 pr-3 font-medium w-10">No</th>
                  <th className="text-left py-2 pr-3 font-medium">Kode</th>
                  <th className="text-left py-2 pr-3 font-medium">Cabang</th>
                  <th className="text-left py-2 pr-3 font-medium">Dibuat</th>
                  <th className="text-right py-2 pr-3 font-medium">Barang</th>
                  <th className="text-left py-2 pr-3 font-medium">Status</th>
                  <th className="text-left py-2 pr-3 font-medium">Catatan</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((o, i) => (
                  <tr key={o.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 pr-3 text-ink-muted">{i + 1}</td>
                    <td className="py-2.5 pr-3 font-medium text-primary">{o.code}</td>
                    <td className="py-2.5 pr-3">{o.branches?.name || "-"}</td>
                    <td className="py-2.5 pr-3">
                      {formatDateTime(o.created_at)}
                      <span className="block text-xs text-ink-muted">{o.creator?.full_name || ""}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-right">{o.stock_opname_items?.[0]?.count ?? 0}</td>
                    <td className="py-2.5 pr-3">
                      <Badge tone={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status] || o.status}</Badge>
                    </td>
                    <td className="py-2.5 pr-3 text-ink-muted">{o.notes || "-"}</td>
                    <td className="py-2.5 text-right">
                      <Button variant="outline" onClick={() => onOpen(o.id)}>
                        {o.status === "draft" ? "Lanjutkan" : "Lihat"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modalOpen && (
        <Modal title="Opname Baru" onClose={() => setModalOpen(false)}>
          <div className="space-y-4">
            <Select label="Cabang yang dihitung" value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
            <Textarea
              label="Catatan (boleh kosong)"
              rows={2}
              placeholder="Contoh: Rak minuman, lorong 2"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
            <p className="text-xs text-ink-muted">
              Setelah sesi dibuat, kamu memilih barang yang mau dihitung: semua produk aktif, atau sebagian lewat scan/cari.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setModalOpen(false)}>
                Batal
              </Button>
              <Button onClick={createSession} disabled={saving}>
                {saving ? "Membuat..." : "Buat Sesi"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// DETAIL SESI: hitung barang, tinjau selisih, terapkan
// ------------------------------------------------------------------
function OpnameDetail({ id, onBack }) {
  const supabase = createClient();
  const { isMobile } = useViewport();
  const [opname, setOpname] = useState(null);
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inputs, setInputs] = useState({}); // itemId -> teks yang sedang diketik
  const [savingId, setSavingId] = useState(null);
  const [blind, setBlind] = useState(true);
  const [filter, setFilter] = useState("semua");
  const [search, setSearch] = useState("");
  const [pickerKey, setPickerKey] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const inputRefs = useRef({});
  const pendingFocus = useRef(null);

  const isDraft = opname?.status === "draft";
  const hideSystem = isDraft && blind;

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadAll() {
    setLoading(true);
    try {
      const { data: o, error } = await supabase
        .from("stock_opnames")
        .select("*, branches(name), creator:profiles!created_by(full_name), applier:profiles!applied_by(full_name)")
        .eq("id", id)
        .single();
      if (error) throw error;
      setOpname(o);
      await loadItems();
      if (o.status === "draft") {
        const list = await fetchAllRows(() =>
          supabase.from("products").select("id, name, sku, sell_price, product_barcodes(barcode)").eq("active", true).order("name")
        );
        setProducts(list);
      }
    } catch (err) {
      toast.error(err.message || "Gagal memuat sesi opname");
    } finally {
      setLoading(false);
    }
  }

  async function loadItems() {
    const list = await fetchAllRows(() =>
      supabase.from("stock_opname_items").select("*, counter:profiles!counted_by(full_name)").eq("opname_id", id).order("product_name")
    );
    setItems(list);
    setInputs({});
    if (pendingFocus.current) {
      const target = list.find((i) => i.product_id === pendingFocus.current);
      pendingFocus.current = null;
      if (target) setTimeout(() => focusItem(target.id), 60);
    }
  }

  function focusItem(itemId) {
    const el = inputRefs.current[itemId];
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.focus();
      el.select?.();
    }
  }

  // Tambah barang (scan / cari). Kalau sudah ada di daftar, langsung arahkan ke kolom hitungnya.
  async function addOrFocusProduct(product) {
    const existing = items.find((i) => i.product_id === product.id);
    if (existing) {
      setFilter("semua");
      setSearch("");
      setTimeout(() => focusItem(existing.id), 60);
      toast.success(`${product.name}: isi jumlah fisik`, { id: "opname-pick" });
      return;
    }
    const { error } = await supabase.rpc("opname_tambah_produk", { p_opname_id: id, p_product_ids: [product.id] });
    if (error) return toast.error(error.message || "Gagal menambah barang");
    pendingFocus.current = product.id;
    setFilter("semua");
    setSearch("");
    await loadItems();
    toast.success(`${product.name} ditambahkan`, { id: "opname-pick" });
  }

  useBarcodeScan((code) => {
    if (!isDraft) return;
    const match = findProductByCode(products, code);
    if (!match) return toast.error(`Barcode "${code}" tidak ditemukan`, { id: "opname-pick" });
    addOrFocusProduct(match);
  });

  async function addAllActive() {
    if (!confirm("Tambahkan SEMUA produk aktif ke sesi ini?\n\nBarang yang sudah ada tidak akan dobel.")) return;
    const { data, error } = await supabase.rpc("opname_tambah_produk", { p_opname_id: id, p_product_ids: null });
    if (error) return toast.error(error.message || "Gagal menambah barang");
    toast.success(`${data} barang ditambahkan`);
    loadItems();
  }

  async function saveCount(item) {
    const raw = inputs[item.id];
    if (raw === undefined) return; // tidak diubah
    const qty = parseQty(raw);
    if (Number.isNaN(qty)) return toast.error("Jumlah fisik harus berupa angka");
    if (qty !== null && qty < 0) return toast.error("Jumlah fisik tidak boleh minus");
    if (qty === null && item.physical_qty === null) {
      setInputs((m) => {
        const { [item.id]: _, ...rest } = m;
        return rest;
      });
      return;
    }
    if (qty !== null && Number(item.physical_qty) === qty) {
      setInputs((m) => {
        const { [item.id]: _, ...rest } = m;
        return rest;
      });
      return;
    }
    setSavingId(item.id);
    const { data, error } = await supabase.rpc("opname_hitung", {
      p_item_id: item.id,
      p_physical: qty,
      p_reason: qty === null ? null : item.reason,
      p_note: qty === null ? null : item.note,
    });
    setSavingId(null);
    if (error) return toast.error(error.message || "Gagal menyimpan hitungan");
    const res = Array.isArray(data) ? data[0] : data;
    setItems((list) =>
      list.map((i) =>
        i.id === item.id
          ? {
              ...i,
              system_qty: res?.stok_sistem ?? null,
              physical_qty: res?.stok_fisik ?? null,
              diff_qty: res?.stok_fisik == null ? null : Number(res.stok_fisik) - Number(res.stok_sistem),
              reason: qty === null ? null : i.reason,
              note: qty === null ? null : i.note,
            }
          : i
      )
    );
    setInputs((m) => {
      const { [item.id]: _, ...rest } = m;
      return rest;
    });
  }

  async function saveReason(item, reason) {
    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, reason: reason || null } : i)));
    const { error } = await supabase.rpc("opname_catatan", { p_item_id: item.id, p_reason: reason, p_note: item.note });
    if (error) {
      toast.error(error.message || "Gagal menyimpan alasan");
      loadItems();
    }
  }

  async function clearCount(item) {
    setInputs((m) => ({ ...m, [item.id]: "" }));
    setSavingId(item.id);
    const { error } = await supabase.rpc("opname_hitung", { p_item_id: item.id, p_physical: null, p_reason: null, p_note: null });
    setSavingId(null);
    if (error) return toast.error(error.message || "Gagal membatalkan hitungan");
    setItems((list) =>
      list.map((i) => (i.id === item.id ? { ...i, system_qty: null, physical_qty: null, diff_qty: null, reason: null, note: null } : i))
    );
    setInputs((m) => {
      const { [item.id]: _, ...rest } = m;
      return rest;
    });
  }

  async function deleteSession() {
    if (!confirm(`Hapus sesi ${opname.code}?\n\nHasil hitungan di sesi ini akan hilang. Stok tidak berubah.`)) return;
    const { error } = await supabase.rpc("opname_hapus", { p_opname_id: id });
    if (error) return toast.error(error.message || "Gagal menghapus");
    toast.success("Sesi dihapus");
    onBack();
  }

  async function applyAdjustments() {
    setApplying(true);
    const { data, error } = await supabase.rpc("opname_terapkan", { p_opname_id: id });
    setApplying(false);
    if (error) return toast.error(error.message || "Gagal menerapkan opname");
    setReviewOpen(false);
    toast.success(`Opname selesai: ${data.disesuaikan} barang disesuaikan`, { duration: 6000 });
    loadAll();
  }

  const counted = useMemo(() => items.filter((i) => i.physical_qty !== null), [items]);
  const withDiff = useMemo(() => counted.filter((i) => Number(i.diff_qty) !== 0), [counted]);
  const totals = useMemo(() => {
    let kurang = 0;
    let lebih = 0;
    for (const i of withDiff) {
      const v = Number(i.diff_qty) * Number(i.cost_price);
      if (v < 0) kurang += v;
      else lebih += v;
    }
    return { kurang, lebih };
  }, [withDiff]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (q && !i.product_name.toLowerCase().includes(q)) return false;
      if (filter === "belum") return i.physical_qty === null;
      if (filter === "sudah") return i.physical_qty !== null;
      if (filter === "selisih" && !hideSystem) return i.physical_qty !== null && Number(i.diff_qty) !== 0;
      return true;
    });
  }, [items, search, filter, hideSystem]);

  function exportSession() {
    exportToCsv(
      `${opname.code}.csv`,
      items.map((i, n) => ({
        No: n + 1,
        Barang: i.product_name,
        Satuan: i.unit_label || "",
        "Stok Sistem": i.system_qty ?? "",
        "Stok Fisik": i.physical_qty ?? "",
        Selisih: i.diff_qty ?? "",
        "Nilai Selisih": i.diff_qty == null ? "" : Number(i.diff_qty) * Number(i.cost_price),
        Alasan: i.reason || "",
        Catatan: i.note || "",
        Dihitung: i.counter?.full_name || "",
      }))
    );
  }

  if (loading || !opname) {
    return (
      <div>
        <Button variant="ghost" onClick={onBack} className="flex items-center gap-1.5 mb-4">
          <ArrowLeft size={16} /> Kembali
        </Button>
        <p className="text-sm text-ink-muted py-12 text-center">Memuat...</p>
      </div>
    );
  }

  const diffTone = (d) => (d < 0 ? "text-danger" : d > 0 ? "text-primary" : "text-ink-muted");

  return (
    <div>
      <Button variant="ghost" onClick={onBack} className="flex items-center gap-1.5 mb-4">
        <ArrowLeft size={16} /> Semua sesi opname
      </Button>

      <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2 flex-wrap">
            {opname.code} <Badge tone={STATUS_TONE[opname.status]}>{STATUS_LABEL[opname.status]}</Badge>
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            {opname.branches?.name} · dibuat {formatDateTime(opname.created_at)} oleh {opname.creator?.full_name || "-"}
            {opname.notes ? ` · ${opname.notes}` : ""}
          </p>
          {opname.status === "selesai" && (
            <p className="text-sm text-ink-muted">
              Diterapkan {formatDateTime(opname.applied_at)} oleh {opname.applier?.full_name || "-"}. Sesi ini terkunci.
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={exportSession} className="flex items-center gap-1.5" disabled={items.length === 0}>
            <Download size={16} /> Ekspor CSV
          </Button>
          {isDraft && (
            <>
              <Button variant="danger" onClick={deleteSession} className="flex items-center gap-1.5">
                <Trash2 size={16} /> Hapus Sesi
              </Button>
              <Button onClick={() => setReviewOpen(true)} disabled={counted.length === 0}>
                Tinjau & Terapkan
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <SmallStat label="Barang di sesi" value={formatNumber(items.length)} />
        <SmallStat label="Sudah dihitung" value={`${formatNumber(counted.length)} / ${formatNumber(items.length)}`} />
        <SmallStat label="Ada selisih" value={hideSystem ? "Disembunyikan" : formatNumber(withDiff.length)} />
        <SmallStat
          label="Nilai selisih (modal)"
          value={hideSystem ? "Disembunyikan" : formatRupiah(totals.kurang + totals.lebih)}
          tone={totals.kurang + totals.lebih < 0 ? "danger" : "default"}
        />
      </div>

      {isDraft && (
        <Card className="mb-5">
          <div className="flex flex-col md:flex-row gap-3 md:items-end">
            <div className="flex-1">
              <label className="text-sm font-medium mb-1.5 block">Tambah barang yang mau dihitung (scan atau ketik nama)</label>
              <div className="flex gap-2">
                <ProductSearchInput
                  key={pickerKey}
                  className="flex-1"
                  products={products}
                  value=""
                  onSelect={(p) => {
                    addOrFocusProduct(p);
                    setPickerKey((k) => k + 1);
                  }}
                />
                {isMobile && (
                  <CameraScanButton
                    onDetected={(code) => {
                      const m = findProductByCode(products, code);
                      if (!m) return toast.error(`Barcode "${code}" tidak ditemukan`, { id: "opname-pick" });
                      addOrFocusProduct(m);
                    }}
                  />
                )}
              </div>
            </div>
            <Button variant="outline" onClick={addAllActive}>
              Tambah semua produk aktif
            </Button>
            <button
              type="button"
              onClick={() => setBlind((b) => !b)}
              className="flex items-center gap-2 text-sm rounded-lg border border-border px-3 py-2 hover:bg-background"
              title="Mode hitung buta menyembunyikan stok sistem supaya hitungan jujur"
            >
              {blind ? <EyeOff size={16} /> : <Eye size={16} />}
              {blind ? "Hitung buta: aktif" : "Hitung buta: mati"}
            </button>
          </div>
          <p className="text-xs text-ink-muted mt-3">
            Stok sistem dicatat oleh database pada saat jumlah fisik disimpan (tekan Enter atau pindah kolom). Penjualan setelah itu tetap
            terhitung waktu opname diterapkan, jadi toko boleh tetap buka.
          </p>
        </Card>
      )}

      <Card>
        <div className="flex flex-col md:flex-row gap-3 mb-4">
          <Input placeholder="Cari nama barang di sesi ini..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="semua">Semua barang</option>
            <option value="belum">Belum dihitung</option>
            <option value="sudah">Sudah dihitung</option>
            {!hideSystem && <option value="selisih">Ada selisih</option>}
          </select>
        </div>

        {items.length === 0 ? (
          <EmptyState text={isDraft ? "Belum ada barang. Scan/cari barang di atas, atau klik Tambah semua produk aktif." : "Sesi ini tidak punya barang."} />
        ) : visible.length === 0 ? (
          <EmptyState text="Tidak ada barang yang cocok dengan filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ink-muted border-b border-border">
                  <th className="text-left py-2 pr-3 font-medium w-10">No</th>
                  <th className="text-left py-2 pr-3 font-medium">Barang</th>
                  {!hideSystem && <th className="text-right py-2 pr-3 font-medium">Stok Sistem</th>}
                  <th className="text-right py-2 pr-3 font-medium">Stok Fisik</th>
                  {!hideSystem && <th className="text-right py-2 pr-3 font-medium">Selisih</th>}
                  {!hideSystem && <th className="text-right py-2 pr-3 font-medium">Nilai</th>}
                  <th className="text-left py-2 pr-3 font-medium">Alasan</th>
                  {isDraft && <th />}
                </tr>
              </thead>
              <tbody>
                {visible.map((i, n) => {
                  const isCounted = i.physical_qty !== null;
                  const diff = isCounted ? Number(i.diff_qty) : 0;
                  const typed = inputs[i.id];
                  return (
                    <tr key={i.id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3 text-ink-muted">{n + 1}</td>
                      <td className="py-2 pr-3">
                        {i.product_name}
                        {i.unit_label && <span className="text-xs text-ink-muted"> ({i.unit_label})</span>}
                        {i.product_id === null && <span className="block text-xs text-danger">Produk sudah dihapus</span>}
                      </td>
                      {!hideSystem && <td className="py-2 pr-3 text-right">{isCounted ? formatNumber(i.system_qty, 3) : "-"}</td>}
                      <td className="py-2 pr-3 text-right">
                        {isDraft && i.product_id ? (
                          <input
                            ref={(el) => {
                              inputRefs.current[i.id] = el;
                            }}
                            type="text"
                            inputMode="decimal"
                            disabled={savingId === i.id}
                            placeholder="0"
                            value={typed !== undefined ? typed : isCounted ? String(Number(i.physical_qty)) : ""}
                            onChange={(e) => setInputs((m) => ({ ...m, [i.id]: e.target.value }))}
                            onBlur={() => saveCount(i)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                e.currentTarget.blur();
                              }
                            }}
                            className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-right outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary disabled:opacity-50"
                          />
                        ) : isCounted ? (
                          formatNumber(i.physical_qty, 3)
                        ) : (
                          "-"
                        )}
                      </td>
                      {!hideSystem && (
                        <td className={`py-2 pr-3 text-right font-medium ${isCounted ? diffTone(diff) : ""}`}>
                          {isCounted ? (diff > 0 ? "+" : "") + formatNumber(diff, 3) : "-"}
                        </td>
                      )}
                      {!hideSystem && (
                        <td className={`py-2 pr-3 text-right ${isCounted ? diffTone(diff) : ""}`}>
                          {isCounted ? formatRupiah(diff * Number(i.cost_price)) : "-"}
                        </td>
                      )}
                      <td className="py-2 pr-3">
                        {isDraft ? (
                          isCounted ? (
                            <select
                              value={i.reason || ""}
                              onChange={(e) => saveReason(i, e.target.value)}
                              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                            >
                              <option value="">-</option>
                              {REASONS.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-ink-muted">-</span>
                          )
                        ) : (
                          i.reason || "-"
                        )}
                      </td>
                      {isDraft && (
                        <td className="py-2 text-right">
                          {isCounted && (
                            <button
                              type="button"
                              title="Batalkan hitungan barang ini"
                              onClick={() => clearCount(i)}
                              className="text-ink-muted hover:text-danger p-1"
                            >
                              <X size={16} />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {reviewOpen && (
        <Modal title={`Tinjau & Terapkan ${opname.code}`} wide onClose={() => !applying && setReviewOpen(false)}>
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <SmallStat label="Barang dihitung" value={formatNumber(counted.length)} />
              <SmallStat label="Barang berselisih" value={formatNumber(withDiff.length)} />
              <SmallStat label="Nilai kurang (modal)" value={formatRupiah(totals.kurang)} tone="danger" />
              <SmallStat label="Nilai lebih (modal)" value={formatRupiah(totals.lebih)} tone="primary" />
            </div>

            {withDiff.length === 0 ? (
              <p className="text-ink-muted">Semua barang yang dihitung sudah cocok dengan stok sistem. Tidak ada stok yang diubah.</p>
            ) : (
              <div className="max-h-72 overflow-auto border border-border rounded-xl">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface">
                    <tr className="text-ink-muted border-b border-border">
                      <th className="text-left py-2 px-3 font-medium w-10">No</th>
                      <th className="text-left py-2 pr-3 font-medium">Barang</th>
                      <th className="text-right py-2 pr-3 font-medium">Sistem</th>
                      <th className="text-right py-2 pr-3 font-medium">Fisik</th>
                      <th className="text-right py-2 pr-3 font-medium">Selisih</th>
                      <th className="text-left py-2 pr-3 font-medium">Alasan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withDiff.map((i, n) => (
                      <tr key={i.id} className="border-b border-border last:border-0">
                        <td className="py-2 px-3 text-ink-muted">{n + 1}</td>
                        <td className="py-2 pr-3">{i.product_name}</td>
                        <td className="py-2 pr-3 text-right">{formatNumber(i.system_qty, 3)}</td>
                        <td className="py-2 pr-3 text-right">{formatNumber(i.physical_qty, 3)}</td>
                        <td className={`py-2 pr-3 text-right font-medium ${diffTone(Number(i.diff_qty))}`}>
                          {(Number(i.diff_qty) > 0 ? "+" : "") + formatNumber(i.diff_qty, 3)}
                        </td>
                        <td className="py-2 pr-3">{i.reason || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="rounded-xl bg-warning-soft text-warning px-4 py-3 space-y-1">
              <p className="font-medium">Sebelum menerapkan:</p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>Stok dikoreksi sebesar selisih di atas, dan tiap koreksi tercatat di riwayat stok.</li>
                <li>{formatNumber(items.length - counted.length)} barang yang belum dihitung dibiarkan, stoknya tidak berubah.</li>
                <li>Setelah diterapkan, sesi ini terkunci dan tidak bisa dibatalkan.</li>
              </ul>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReviewOpen(false)} disabled={applying}>
                Kembali
              </Button>
              <Button onClick={applyAdjustments} disabled={applying}>
                {applying ? "Menerapkan..." : "Terapkan Penyesuaian Stok"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SmallStat({ label, value, tone = "default" }) {
  const toneClass = tone === "danger" ? "text-danger" : tone === "primary" ? "text-primary" : "text-ink";
  return (
    <div className="bg-surface border border-border rounded-xl px-4 py-3">
      <p className="text-xs text-ink-muted mb-1">{label}</p>
      <p className={`text-base font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
