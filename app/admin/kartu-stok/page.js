"use client";

// KARTU STOK per produk.
//
// Dibuka dari tombol "Kartu Stok" di tiap baris halaman Produk & Harga:
//   /admin/kartu-stok?produk=<id>&cabang=<id>
//
// Sumber data: tabel stock_movements (dicatat otomatis oleh kasir, Stok &
// Barang Masuk, Retur, Stok Opname, dan edit stok manual di Produk & Harga).
// Tiap baris menunjukkan KAPAN stok berubah, DENGAN CARA APA, berapa yang
// masuk/keluar, dan saldo stok sesudahnya. Baris penjualan & pembelian punya
// tombol yang membuka struk/nota aslinya.
//
// Saldo dihitung MUNDUR dari stok cabang saat ini (bukan dijumlah dari nol),
// supaya angka terakhir selalu cocok dengan stok yang tampil di Produk &
// Harga. Kalau ada perubahan stok yang dulu tidak tercatat (mis. edit manual
// sebelum fitur ini ada), selisihnya muncul sebagai baris "Saldo sebelum
// catatan pertama" -- bukan disembunyikan.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { ArrowLeft, Download, Receipt, ShoppingCart, ClipboardCheck, Undo2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows, fetchAllRowsOrEmpty } from "@/lib/fetchAllRows";
import { formatRupiah, formatNumber, formatDateTime, txCode } from "@/lib/format";
import { exportToCsv } from "@/lib/exportCsv";
import { Button, Card, EmptyState, Input, Select, Badge, Modal, StatCard } from "@/components/ui/kit";
import ProductSearchInput from "@/components/ProductSearchInput";

const TYPE_FILTERS = [
  { value: "", label: "Semua jenis" },
  { value: "penjualan", label: "Penjualan (keluar)" },
  { value: "pembelian", label: "Pembelian dari supplier (masuk)" },
  { value: "retur", label: "Retur" },
  { value: "koreksi", label: "Koreksi / stok opname / edit manual" },
  { value: "masuk", label: "Barang masuk manual / stok awal" },
];

const PRICE_TYPE_LABELS = {
  retail: "Eceran",
  grosir: "Grosir",
  half_grosir: "1/2 Grosir",
  kg: "Per Kg",
  half_kg: "Per 1/2 Kg",
  ons: "Per Ons",
  out_of_town: "Antar Luar Kota",
};
const PAYMENT_LABELS = { tunai: "Tunai", transfer: "Transfer", qris: "QRIS", kasbon: "Kasbon" };
const STATUS_LABELS = { completed: "Selesai", pending: "Tertunda", void: "Dibatalkan" };
const STATUS_TONE = { completed: "primary", pending: "warning", void: "danger" };
const PO_STATUS_LABELS = { pending: "Belum diterima", diterima: "Sudah diterima" };

// numeric(14,3) di database -> bulatkan ke 3 desimal supaya hasil tambah/kurang
// pecahan (mis. 0.1 + 0.2) tidak menampilkan ekor angka aneh.
const r3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;

const poCode = (id) => `PO-${String(id || "").slice(0, 8).toUpperCase()}`;

// Mengubah satu baris stock_movements jadi keterangan yang mudah dibaca.
function describeMovement(m) {
  const note = m.note || "";
  const qty = Number(m.qty) || 0;
  switch (m.movement_type) {
    case "penjualan":
      return { label: "Penjualan", way: "Dijual lewat kasir", tone: "danger" };
    case "pembelian": {
      const t = note.match(/\(([a-z_]+)\)\s*$/i)?.[1];
      return {
        label: "Barang masuk",
        way: "Pembelian dari supplier" + (t ? ` (per ${PRICE_TYPE_LABELS[t] || t})` : ""),
        tone: "primary",
      };
    }
    case "retur": {
      const reason = note.split(":").slice(1).join(":").trim();
      return qty >= 0
        ? { label: "Retur", way: "Retur dari pelanggan (barang kembali)", tone: "primary", detail: reason && reason !== "-" ? reason : "" }
        : { label: "Retur", way: "Retur ke supplier (barang keluar)", tone: "warning", detail: reason && reason !== "-" ? reason : "" };
    }
    case "koreksi":
      if (/^Opname/i.test(note)) {
        const reason = note.split(" - ").slice(1).join(" - ").trim();
        return { label: "Koreksi", way: "Stok opname (hitung fisik)", tone: "warning", detail: reason };
      }
      if (/^Edit manual/i.test(note)) {
        return { label: "Koreksi", way: "Edit stok manual di Produk & Harga", tone: "warning", detail: note.replace(/^Edit manual( stok)?[:\s-]*/i, "").trim() };
      }
      return { label: "Koreksi", way: "Koreksi stok", tone: "warning", detail: note };
    case "masuk":
      if (/^Stok awal/i.test(note)) return { label: "Barang masuk", way: "Stok awal produk baru", tone: "primary" };
      return { label: "Barang masuk", way: "Barang masuk manual", tone: "primary", detail: note };
    default:
      return { label: m.movement_type || "Lainnya", way: note || "-", tone: "default" };
  }
}

// Mencari "dokumen asal" dari catatan pergerakan stok.
function parseRef(m) {
  const note = m.note || "";
  if (m.movement_type === "penjualan") {
    const id = note.match(/^Transaksi\s+([0-9a-fA-F-]{36})/)?.[1];
    if (id) return { type: "trx", key: id.toLowerCase() };
  }
  if (m.movement_type === "pembelian") {
    const key = note.match(/^Pembelian PO\s+([0-9a-fA-F]{8})/)?.[1];
    if (key) return { type: "po", key: key.toLowerCase() };
  }
  if (m.movement_type === "koreksi") {
    const code = note.match(/^Opname\s+(\S+)/)?.[1];
    if (code) return { type: "opname", key: code };
  }
  if (m.movement_type === "retur") return { type: "retur", key: "" };
  return null;
}

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

export default function KartuStokPage() {
  const supabase = createClient();

  const [productId, setProductId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [branches, setBranches] = useState([]);
  const [pickerProducts, setPickerProducts] = useState([]);
  const [product, setProduct] = useState(null);
  const [moves, setMoves] = useState([]);
  const [txMap, setTxMap] = useState({});
  const [poMap, setPoMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);

  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const [detail, setDetail] = useState(null); // { type: "trx" | "po", data }
  const [detailItems, setDetailItems] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Baca ?produk= & ?cabang= dari alamat halaman, lalu siapkan daftar cabang
  // dan daftar produk untuk kolom pencarian di atas.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pid = params.get("produk") || "";
    const cid = params.get("cabang") || "";
    (async () => {
      const [{ data: b }, plist] = await Promise.all([
        supabase.from("branches").select("*").eq("active", true).order("created_at", { ascending: true }),
        fetchAllRowsOrEmpty(() =>
          supabase.from("products").select("id, name, sku, sell_price, product_barcodes(barcode)").order("name")
        ),
      ]);
      setBranches(b || []);
      setPickerProducts(plist);
      setBranchId(cid && (b || []).some((x) => x.id === cid) ? cid : b?.[0]?.id || "");
      setProductId(pid);
      setBooting(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (booting) return;
    if (!productId) {
      setProduct(null);
      setMoves([]);
      return;
    }
    loadCard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booting, productId, branchId]);

  async function loadCard() {
    setLoading(true);
    try {
      const { data: prod, error: prodErr } = await supabase
        .from("products")
        .select("id, name, sku, unit_type, unit_label, active, product_branch_stock(*)")
        .eq("id", productId)
        .maybeSingle();
      if (prodErr) throw prodErr;
      setProduct(prod || null);
      if (!prod) {
        setMoves([]);
        return;
      }

      const list = await fetchAllRows(() => {
        let q = supabase
          .from("stock_movements")
          .select("*, profiles(full_name), suppliers(name)")
          .eq("product_id", productId)
          .order("created_at", { ascending: true });
        if (branchId) q = q.eq("branch_id", branchId);
        return q;
      });
      setMoves(list);

      // Dokumen asal: struk penjualan & nota pembelian.
      const refs = list.map(parseRef).filter(Boolean);
      const trxIds = [...new Set(refs.filter((r) => r.type === "trx").map((r) => r.key))];
      const hasPo = refs.some((r) => r.type === "po");

      const txRows = [];
      for (const ids of chunk(trxIds, 50)) {
        const { data } = await supabase.from("transactions").select("*, customers(name), profiles(full_name)").in("id", ids);
        txRows.push(...(data || []));
      }
      setTxMap(Object.fromEntries(txRows.map((t) => [String(t.id).toLowerCase(), t])));

      const poRows = [];
      if (hasPo) {
        const poItems = await fetchAllRowsOrEmpty(() =>
          supabase.from("purchase_order_items").select("purchase_order_id").eq("product_id", productId)
        );
        const poIds = [...new Set(poItems.map((i) => i.purchase_order_id))];
        for (const ids of chunk(poIds, 50)) {
          const { data } = await supabase
            .from("purchase_orders")
            .select("*, suppliers(name), branches(name), purchase_order_items(*, products(name))")
            .in("id", ids);
          poRows.push(...(data || []));
        }
      }
      // Catatan pembelian hanya menyimpan 8 huruf pertama id nota -> dicocokkan per awalan.
      setPoMap(Object.fromEntries(poRows.map((p) => [String(p.id).slice(0, 8).toLowerCase(), p])));
    } catch (err) {
      toast.error(err.message || "Gagal memuat kartu stok");
    } finally {
      setLoading(false);
    }
  }

  function pickProduct(p) {
    setProductId(p.id);
    const qs = new URLSearchParams({ produk: p.id });
    if (branchId) qs.set("cabang", branchId);
    window.history.replaceState(null, "", `?${qs.toString()}`);
  }

  function changeBranch(id) {
    setBranchId(id);
    const qs = new URLSearchParams(window.location.search);
    qs.set("cabang", id);
    window.history.replaceState(null, "", `?${qs.toString()}`);
  }

  const currentStock = useMemo(() => {
    const row = (product?.product_branch_stock || []).find((s) => s.branch_id === branchId);
    return r3(row?.stock_qty || 0);
  }, [product, branchId]);

  // Saldo sesudah tiap baris, dihitung mundur dari stok sekarang.
  const { rows: allRows, opening } = useMemo(() => {
    const out = new Array(moves.length);
    let bal = currentStock;
    for (let i = moves.length - 1; i >= 0; i--) {
      const q = r3(moves[i].qty);
      out[i] = { ...moves[i], qtyN: q, after: bal };
      bal = r3(bal - q);
    }
    return { rows: out, opening: bal };
  }, [moves, currentStock]);

  const shown = useMemo(() => {
    const from = dateStart ? new Date(`${dateStart}T00:00:00`).getTime() : null;
    const to = dateEnd ? new Date(`${dateEnd}T23:59:59.999`).getTime() : null;
    return allRows
      .filter((r) => {
        const t = new Date(r.created_at).getTime();
        if (from !== null && t < from) return false;
        if (to !== null && t > to) return false;
        if (typeFilter && r.movement_type !== typeFilter) return false;
        return true;
      })
      .reverse(); // terbaru di atas
  }, [allRows, dateStart, dateEnd, typeFilter]);

  const totalIn = r3(shown.reduce((s, r) => s + (r.qtyN > 0 ? r.qtyN : 0), 0));
  const totalOut = r3(shown.reduce((s, r) => s + (r.qtyN < 0 ? -r.qtyN : 0), 0));
  const unitText = product?.unit_type === "kg" ? "kg" : product?.unit_label || "pcs";
  const branchName = branches.find((b) => b.id === branchId)?.name || "";

  async function openDetail(ref) {
    if (ref.type === "trx") {
      const tx = txMap[ref.key];
      if (!tx) return;
      setDetail({ type: "trx", data: tx });
      setDetailItems([]);
      setDetailLoading(true);
      const { data } = await supabase.from("transaction_items").select("*, products(name)").eq("transaction_id", tx.id);
      setDetailItems(data || []);
      setDetailLoading(false);
    } else if (ref.type === "po") {
      const po = poMap[ref.key];
      if (!po) return;
      setDetail({ type: "po", data: po });
      setDetailItems(po.purchase_order_items || []);
      setDetailLoading(false);
    }
  }

  function downloadCsv() {
    if (shown.length === 0) return toast.error("Tidak ada data untuk diunduh");
    const data = [...shown].reverse().map((r) => {
      const d = describeMovement(r);
      const ref = parseRef(r);
      let refText = "";
      if (ref?.type === "trx") refText = txCode(ref.key);
      else if (ref?.type === "po") refText = poCode(ref.key);
      else if (ref?.type === "opname") refText = ref.key;
      return {
        Tanggal: formatDateTime(r.created_at),
        Jenis: d.label,
        Cara: d.way,
        Referensi: refText,
        Masuk: r.qtyN > 0 ? r.qtyN : "",
        Keluar: r.qtyN < 0 ? -r.qtyN : "",
        "Saldo Stok": r.after,
        Oleh: r.profiles?.full_name || "",
        Catatan: d.detail || "",
      };
    });
    exportToCsv(`kartu-stok-${(product?.name || "produk").replace(/[^\w-]+/g, "_")}.csv`, data);
  }

  function renderRef(r) {
    const ref = parseRef(r);
    if (!ref) return <span className="text-ink-muted">-</span>;
    const btn =
      "inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary-soft transition";
    if (ref.type === "trx") {
      const tx = txMap[ref.key];
      if (!tx) {
        return (
          <span className="text-xs text-ink-muted" title="Struk tidak ditemukan di database">
            {txCode(ref.key)} (struk tidak ditemukan)
          </span>
        );
      }
      return (
        <button type="button" onClick={() => openDetail(ref)} className={btn} title="Lihat struk pembelian ini">
          <Receipt size={14} /> {txCode(tx.id)}
        </button>
      );
    }
    if (ref.type === "po") {
      const po = poMap[ref.key];
      if (!po) {
        return (
          <span className="text-xs text-ink-muted" title="Nota pembelian tidak ditemukan di database">
            {poCode(ref.key)} (nota tidak ditemukan)
          </span>
        );
      }
      return (
        <button type="button" onClick={() => openDetail(ref)} className={btn} title="Lihat nota pembelian ini">
          <ShoppingCart size={14} /> {poCode(po.id)}
        </button>
      );
    }
    if (ref.type === "opname") {
      return (
        <Link href="/admin/stok-opname" className={btn} title="Buka halaman Stok Opname">
          <ClipboardCheck size={14} /> {ref.key}
        </Link>
      );
    }
    if (ref.type === "retur") {
      return (
        <Link href="/admin/retur" className={btn} title="Buka halaman Retur Barang">
          <Undo2 size={14} /> Retur
        </Link>
      );
    }
    return <span className="text-ink-muted">-</span>;
  }

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/produk" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink mb-2">
          <ArrowLeft size={14} /> Kembali ke Produk & Harga
        </Link>
        <h1 className="text-xl font-semibold">Kartu Stok{product ? ` — ${product.name}` : ""}</h1>
        <p className="text-sm text-ink-muted">
          Riwayat barang masuk dan keluar satu produk: kapan terjual, kapan ditambahkan, dan dengan cara apa. Klik nomor struk/nota untuk
          membukanya.
        </p>
      </div>

      <Card>
        <div className="grid sm:grid-cols-2 gap-3 items-end">
          <div className="flex flex-col">
            <label className="text-sm font-medium mb-1.5">Produk</label>
            <ProductSearchInput products={pickerProducts} value={productId} onSelect={pickProduct} />
          </div>
          {branches.length > 1 && (
            <Select label="Cabang" value={branchId} onChange={(e) => changeBranch(e.target.value)}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          )}
        </div>
      </Card>

      {!productId ? (
        <Card>
          <EmptyState text="Pilih produk di atas, atau klik tombol Kartu Stok pada baris produk di halaman Produk & Harga." />
        </Card>
      ) : loading && !product ? (
        <Card>
          <p className="text-sm text-ink-muted">Memuat kartu stok...</p>
        </Card>
      ) : !product ? (
        <Card>
          <EmptyState text="Produk tidak ditemukan (mungkin sudah dihapus)." />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              label={`Stok sekarang${branchName && branches.length > 1 ? ` — ${branchName}` : ""}`}
              value={`${formatNumber(currentStock, 3)} ${unitText}`}
              tone={currentStock < 0 ? "danger" : "primary"}
              hint={currentStock < 0 ? "Stok minus: ada penjualan melebihi stok tercatat" : undefined}
            />
            <StatCard label="Total masuk (sesuai filter)" value={formatNumber(totalIn, 3)} />
            <StatCard label="Total keluar (sesuai filter)" value={formatNumber(totalOut, 3)} />
            <StatCard label="Jumlah catatan" value={formatNumber(shown.length)} />
          </div>

          <Card>
            <div className="grid sm:grid-cols-4 gap-3 items-end">
              <Input label="Dari Tanggal" type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
              <Input label="Sampai Tanggal" type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
              <Select label="Jenis" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                {TYPE_FILTERS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
              <Button variant="outline" onClick={downloadCsv} className="inline-flex items-center justify-center gap-2">
                <Download size={15} /> Unduh CSV
              </Button>
            </div>
          </Card>

          <Card>
            {loading ? (
              <p className="text-sm text-ink-muted">Memuat...</p>
            ) : shown.length === 0 && Math.abs(opening) < 0.0005 ? (
              <EmptyState text="Belum ada catatan stok untuk produk ini pada filter yang dipilih." />
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-ink-muted border-b border-border">
                    <tr>
                      <th className="text-left py-2 pr-3 font-medium w-10">No</th>
                      <th className="text-left py-2 pr-3 font-medium">Tanggal & Jam</th>
                      <th className="text-left py-2 pr-3 font-medium">Cara</th>
                      <th className="text-left py-2 pr-3 font-medium">Struk / Nota</th>
                      <th className="text-right py-2 pr-3 font-medium">Masuk</th>
                      <th className="text-right py-2 pr-3 font-medium">Keluar</th>
                      <th className="text-right py-2 pr-3 font-medium">Saldo</th>
                      <th className="text-left py-2 font-medium">Oleh</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r, i) => {
                      const d = describeMovement(r);
                      return (
                        <tr key={r.id} className="border-b border-border last:border-0 align-top">
                          <td className="py-2.5 pr-3 text-ink-muted">{i + 1}</td>
                          <td className="py-2.5 pr-3 whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                          <td className="py-2.5 pr-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge tone={d.tone}>{d.label}</Badge>
                              <span>{d.way}</span>
                            </div>
                            {r.movement_type === "pembelian" && r.suppliers?.name && (
                              <p className="text-xs text-ink-muted mt-0.5">Supplier: {r.suppliers.name}</p>
                            )}
                            {d.detail && <p className="text-xs text-ink-muted mt-0.5">{d.detail}</p>}
                          </td>
                          <td className="py-2.5 pr-3">{renderRef(r)}</td>
                          <td className="py-2.5 pr-3 text-right font-medium text-primary">{r.qtyN > 0 ? `+${formatNumber(r.qtyN, 3)}` : ""}</td>
                          <td className="py-2.5 pr-3 text-right font-medium text-danger">{r.qtyN < 0 ? `-${formatNumber(-r.qtyN, 3)}` : ""}</td>
                          <td className={`py-2.5 pr-3 text-right font-semibold ${r.after < 0 ? "text-danger" : ""}`}>{formatNumber(r.after, 3)}</td>
                          <td className="py-2.5 text-ink-muted">{r.profiles?.full_name || "-"}</td>
                        </tr>
                      );
                    })}
                    {Math.abs(opening) >= 0.0005 && !dateStart && !dateEnd && !typeFilter && (
                      <tr className="bg-background">
                        <td className="py-2.5 pr-3"></td>
                        <td className="py-2.5 pr-3 text-ink-muted">—</td>
                        <td className="py-2.5 pr-3" colSpan={4}>
                          <p className="font-medium">Saldo sebelum catatan pertama</p>
                          <p className="text-xs text-ink-muted">
                            Stok yang sudah ada sebelum kartu stok mencatat, atau perubahan stok manual lama yang tidak tercatat.
                          </p>
                        </td>
                        <td className="py-2.5 pr-3 text-right font-semibold">{formatNumber(opening, 3)}</td>
                        <td className="py-2.5"></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {detail?.type === "trx" && (
        <Modal title={`Struk ${txCode(detail.data.id)}`} onClose={() => setDetail(null)}>
          <div className="text-sm text-ink-muted mb-3 space-y-0.5">
            <p className="flex items-center gap-2">
              {formatDateTime(detail.data.created_at)}
              <Badge tone={STATUS_TONE[detail.data.status] || "default"}>{STATUS_LABELS[detail.data.status] || detail.data.status}</Badge>
            </p>
            <p>
              Kasir: {detail.data.profiles?.full_name || "-"} · Pelanggan: {detail.data.customers?.name || "Umum"}
            </p>
            <p>Pembayaran: {PAYMENT_LABELS[detail.data.payment_method] || detail.data.payment_method || "-"}</p>
          </div>

          {detailLoading ? (
            <p className="text-sm text-ink-muted">Memuat barang...</p>
          ) : (
            <div className="space-y-1.5 mb-3">
              {detailItems.map((it) => (
                <div
                  key={it.id}
                  className={`flex items-center justify-between gap-3 text-sm border-b border-border pb-1.5 ${
                    it.product_id === productId ? "bg-primary-soft rounded-lg px-2 py-1.5" : ""
                  }`}
                >
                  <div>
                    <p>
                      {it.products?.name || it.product_name || "(produk sudah dihapus)"}{" "}
                      <span className="text-xs text-ink-muted">({it.price_type_label || PRICE_TYPE_LABELS[it.price_type] || it.price_type})</span>
                    </p>
                    <p className="text-xs text-ink-muted">
                      {formatNumber(it.qty, 3)} x {formatRupiah(it.unit_price)}
                    </p>
                  </div>
                  <p className="font-medium">{formatRupiah(it.subtotal)}</p>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-border pt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-muted">Subtotal</span>
              <span>{formatRupiah(detail.data.subtotal)}</span>
            </div>
            {Number(detail.data.discount) > 0 && (
              <div className="flex justify-between">
                <span className="text-ink-muted">Diskon</span>
                <span>-{formatRupiah(detail.data.discount)}</span>
              </div>
            )}
            {Number(detail.data.delivery_fee) > 0 && (
              <div className="flex justify-between">
                <span className="text-ink-muted">Biaya Antar</span>
                <span>{formatRupiah(detail.data.delivery_fee)}</span>
              </div>
            )}
            {Number(detail.data.tax_amount) > 0 && (
              <div className="flex justify-between">
                <span className="text-ink-muted">Pajak</span>
                <span>{formatRupiah(detail.data.tax_amount)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold">
              <span>Total Belanja</span>
              <span>{formatRupiah(detail.data.total)}</span>
            </div>
            {Number(detail.data.paid_amount) > 0 && (
              <div className="flex justify-between">
                <span className="text-ink-muted">Dibayar</span>
                <span>{formatRupiah(detail.data.paid_amount)}</span>
              </div>
            )}
            {Number(detail.data.change_amount) > 0 && (
              <div className="flex justify-between">
                <span className="text-ink-muted">Kembalian</span>
                <span>{formatRupiah(detail.data.change_amount)}</span>
              </div>
            )}
          </div>

          {detail.data.status === "completed" && (
            <div className="mt-4">
              <a
                href={`/struk/${detail.data.id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-sm font-medium hover:bg-background transition"
              >
                <Receipt size={15} /> Buka halaman struk
              </a>
            </div>
          )}
        </Modal>
      )}

      {detail?.type === "po" && (
        <Modal title={`Nota Pembelian ${poCode(detail.data.id)}`} onClose={() => setDetail(null)} wide>
          <div className="text-sm text-ink-muted mb-3 space-y-0.5">
            <p className="flex items-center gap-2">
              Dipesan: {formatDateTime(detail.data.created_at)}
              <Badge tone={detail.data.status === "diterima" ? "primary" : "warning"}>
                {PO_STATUS_LABELS[detail.data.status] || detail.data.status}
              </Badge>
            </p>
            {detail.data.received_at && <p>Diterima: {formatDateTime(detail.data.received_at)}</p>}
            <p>
              Supplier: {detail.data.suppliers?.name || "-"}
              {detail.data.branches?.name ? ` · Cabang: ${detail.data.branches.name}` : ""}
            </p>
            {detail.data.nota_number && <p>No. nota supplier: {detail.data.nota_number}</p>}
            {detail.data.notes && <p>Catatan: {detail.data.notes}</p>}
          </div>

          <div className="space-y-1.5 mb-3">
            {detailItems.map((it) => (
              <div
                key={it.id}
                className={`flex items-center justify-between gap-3 text-sm border-b border-border pb-1.5 ${
                  it.product_id === productId ? "bg-primary-soft rounded-lg px-2 py-1.5" : ""
                }`}
              >
                <div>
                  <p>
                    {it.products?.name || it.product_name || "(produk sudah dihapus)"}{" "}
                    <span className="text-xs text-ink-muted">({PRICE_TYPE_LABELS[it.price_type] || it.price_type || "Eceran"})</span>
                  </p>
                  <p className="text-xs text-ink-muted">
                    {formatNumber(it.qty, 3)} x {formatRupiah(it.unit_cost)}
                  </p>
                </div>
                <p className="font-medium">{formatRupiah(it.subtotal)}</p>
              </div>
            ))}
          </div>

          <div className="border-t border-border pt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-muted">Subtotal</span>
              <span>{formatRupiah(detail.data.subtotal)}</span>
            </div>
            {Number(detail.data.discount) > 0 && (
              <div className="flex justify-between">
                <span className="text-ink-muted">Diskon</span>
                <span>-{formatRupiah(detail.data.discount)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span>{formatRupiah(detail.data.total)}</span>
            </div>
            {Number(detail.data.down_payment) > 0 && (
              <div className="flex justify-between">
                <span className="text-ink-muted">Uang muka / dibayar</span>
                <span>{formatRupiah(detail.data.down_payment)}</span>
              </div>
            )}
            {Number(detail.data.remaining_debt) > 0 && (
              <div className="flex justify-between">
                <span className="text-ink-muted">Sisa hutang</span>
                <span>{formatRupiah(detail.data.remaining_debt)}</span>
              </div>
            )}
          </div>

          <div className="mt-4">
            <Link
              href="/admin/pembelian"
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-sm font-medium hover:bg-background transition"
            >
              <ShoppingCart size={15} /> Buka halaman Stok & Barang Masuk
            </Link>
          </div>
        </Modal>
      )}
    </div>
  );
}
