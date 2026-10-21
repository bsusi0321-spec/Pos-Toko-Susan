"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { formatRupiah, formatDateTime, txCode } from "@/lib/format";
import { getPriceVariants, priceTypeLabel } from "@/lib/pricing";
import { getBranchStock } from "@/lib/branchStock";
import ProductSearchInput from "@/components/ProductSearchInput";
import DecimalInput from "@/components/ui/DecimalInput";

function localDateValue(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function dayRange(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return {
    start: new Date(y, m - 1, d, 0, 0, 0, 0).toISOString(),
    end: new Date(y, m - 1, d + 1, 0, 0, 0, 0).toISOString(),
  };
}

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40";

// RETUR + TUKAR BARANG dari akun kasir.
// Kasir TIDAK mengetik harga dan TIDAK menyentuh data produk:
//  - barang yang dikembalikan = harga saat pelanggan membeli (dari struk)
//  - barang pengganti        = harga produk hari ini
// Semua perhitungan akhir & perubahan stok dilakukan di database lewat fungsi
// process_exchange (satu paket: gagal satu = batal semua).
export default function ExchangeModal({ cashierId, shift, branchId, products, onClose, onDone }) {
  const supabase = createClient();

  // ---- 1. cari struk (lewat nama barang / tanggal) atau "tanpa struk" ----
  const [noReceipt, setNoReceipt] = useState(false);
  const [findKey, setFindKey] = useState(0);
  const [findWindow, setFindWindow] = useState("today"); // hour | today | week | month
  const [findProduct, setFindProduct] = useState(null);
  const [found, setFound] = useState(null); // null = belum cari, [] = tidak ketemu
  const [findLoading, setFindLoading] = useState(false);
  const [showByDate, setShowByDate] = useState(false);
  const [date, setDate] = useState(localDateValue());
  const [txs, setTxs] = useState([]);
  const [txLoading, setTxLoading] = useState(true);
  const [txSearch, setTxSearch] = useState("");
  const [selectedTx, setSelectedTx] = useState(null);

  // ---- 2. barang dikembalikan ----
  const [items, setItems] = useState([]); // baris struk + sisa yang boleh diretur
  const [itemsLoading, setItemsLoading] = useState(false);
  const [retQty, setRetQty] = useState({}); // { transaction_item_id: "2" }
  const [retCond, setRetCond] = useState({}); // { transaction_item_id: "bagus" | "rusak" }

  // mode TANPA STRUK: barang yang dikembalikan dipilih langsung
  const [retLines, setRetLines] = useState([]); // { key, product, price_type, qty, condition, price }
  const [retPickerKey, setRetPickerKey] = useState(0);

  // ---- 3. barang pengganti ----
  const [newLines, setNewLines] = useState([]); // { key, product, price_type, qty }
  const [pickerKey, setPickerKey] = useState(0);

  // ---- 4. bayar selisih ----
  const [payMethod, setPayMethod] = useState("tunai");
  const [reason, setReason] = useState("");

  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  // Muat daftar struk milik kasir ini pada tanggal terpilih.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setTxLoading(true);
      const { start, end } = dayRange(date);
      const { data, error } = await supabase
        .from("transactions")
        .select("id, total, payment_method, created_at")
        .eq("cashier_id", cashierId)
        .eq("status", "completed")
        .eq("is_exchange", false)
        .gte("created_at", start)
        .lt("created_at", end)
        .order("created_at", { ascending: false })
        .limit(150);
      if (cancelled) return;
      if (error) toast.error("Gagal memuat struk: " + error.message);
      setTxs(data || []);
      setTxLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const filteredTxs = useMemo(() => {
    const q = txSearch.trim().toLowerCase();
    if (!q) return txs;
    return txs.filter((t) => txCode(t.id).toLowerCase().includes(q) || String(t.total).includes(q.replace(/\D/g, "") || "###"));
  }, [txs, txSearch]);

  async function pickTx(tx) {
    setSelectedTx(tx);
    setItems([]);
    setRetQty({});
    setRetCond({});
    setItemsLoading(true);
    const { data: rows, error } = await supabase
      .from("transaction_items")
      .select("id, product_id, price_type, qty, unit_price, products(name)")
      .eq("transaction_id", tx.id);
    if (error) {
      toast.error("Gagal memuat isi struk: " + error.message);
      setItemsLoading(false);
      return;
    }
    const ids = (rows || []).map((r) => r.id);
    let prev = {};
    if (ids.length > 0) {
      const { data: done } = await supabase
        .from("exchange_items")
        .select("transaction_item_id, qty")
        .eq("kind", "return")
        .in("transaction_item_id", ids);
      for (const d of done || []) prev[d.transaction_item_id] = (prev[d.transaction_item_id] || 0) + Number(d.qty);
    }
    setItems(
      (rows || []).map((r) => ({
        ...r,
        qty: Number(r.qty),
        unit_price: Number(r.unit_price),
        remaining: Math.max(0, Number(r.qty) - (prev[r.id] || 0)),
      }))
    );
    setItemsLoading(false);
  }

  function sinceFor(w) {
    const now = Date.now();
    const ms = { hour: 3600e3, today: null, week: 7 * 86400e3, month: 30 * 86400e3 }[w];
    if (ms === null) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    return new Date(now - ms).toISOString();
  }

  // Cari struk milik kasir ini yang berisi barang tertentu (terbaru di atas).
  async function findByProduct(p, windowKey = findWindow) {
    setFindProduct(p);
    setFindLoading(true);
    const { data, error } = await supabase
      .from("transaction_items")
      .select("qty, unit_price, price_type, transactions!inner(id, total, created_at, status, cashier_id)")
      .eq("product_id", p.id)
      .eq("transactions.status", "completed")
      .eq("transactions.is_exchange", false)
      .eq("transactions.cashier_id", cashierId)
      .gte("transactions.created_at", sinceFor(windowKey))
      .limit(150);
    setFindLoading(false);
    if (error) {
      toast.error("Gagal mencari struk: " + error.message);
      setFound([]);
      return;
    }
    const list = (data || [])
      .map((r) => ({ id: r.transactions.id, total: r.transactions.total, created_at: r.transactions.created_at, qty: Number(r.qty), price_type: r.price_type }))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, 30);
    setFound(list);
  }

  function changeFindWindow(w) {
    setFindWindow(w);
    if (findProduct) findByProduct(findProduct, w);
  }

  function startNoReceipt() {
    setNoReceipt(true);
    setSelectedTx(null);
    setItems([]);
    setRetQty({});
    setRetCond({});
  }

  async function fetchNoReceiptPrice(productId, priceType) {
    const { data, error } = await supabase.rpc("exchange_no_receipt_price", { p_product_id: productId, p_price_type: priceType });
    if (error) throw error;
    return Number(data);
  }

  async function addRetProduct(p) {
    const variants = getPriceVariants(p);
    if (variants.length === 0) return toast.error(`Harga "${p.name}" belum diatur oleh admin`);
    const key = `${p.id}-${Date.now()}`;
    const price_type = variants[0].price_type;
    setRetLines((l) => [...l, { key, product: p, price_type, qty: "1", condition: "bagus", price: null }]);
    setRetPickerKey((k) => k + 1);
    try {
      const price = await fetchNoReceiptPrice(p.id, price_type);
      setRetLines((l) => l.map((x) => (x.key === key ? { ...x, price } : x)));
    } catch (e) {
      toast.error(e.message || "Gagal membaca harga");
      setRetLines((l) => l.filter((x) => x.key !== key));
    }
  }

  async function changeRetVariant(key, productId, price_type) {
    setRetLines((l) => l.map((x) => (x.key === key ? { ...x, price_type, price: null } : x)));
    try {
      const price = await fetchNoReceiptPrice(productId, price_type);
      setRetLines((l) => l.map((x) => (x.key === key ? { ...x, price } : x)));
    } catch (e) {
      toast.error(e.message || "Gagal membaca harga");
    }
  }

  function patchRet(key, patch) {
    setRetLines((l) => l.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  }

  function changeTx() {
    setNoReceipt(false);
    setRetLines([]);
    setSelectedTx(null);
    setItems([]);
    setRetQty({});
    setRetCond({});
  }

  function addNewProduct(p) {
    const variants = getPriceVariants(p);
    if (variants.length === 0) {
      toast.error(`Harga "${p.name}" belum diatur oleh admin`);
      return;
    }
    setNewLines((l) => [...l, { key: `${p.id}-${Date.now()}`, product: p, price_type: variants[0].price_type, qty: "1" }]);
    setPickerKey((k) => k + 1);
  }

  function patchLine(key, patch) {
    setNewLines((l) => l.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  }

  function lineVariant(line) {
    return getPriceVariants(line.product).find((v) => v.price_type === line.price_type);
  }

  // ---- hitungan tampilan (hitungan resmi tetap dibuat ulang oleh database) ----
  const returnTotal = noReceipt
    ? retLines.reduce((s, l) => s + (Number(l.qty) > 0 && l.price != null ? Number(l.qty) * l.price : 0), 0)
    : items.reduce((s, it) => s + (Number(retQty[it.id]) > 0 ? Number(retQty[it.id]) * it.unit_price : 0), 0);
  const newTotal = newLines.reduce((s, l) => s + (Number(l.qty) > 0 ? Number(l.qty) * (lineVariant(l)?.unit_price || 0) : 0), 0);
  const difference = Math.round((newTotal - returnTotal) * 100) / 100;
  const returnCount = noReceipt
    ? retLines.filter((l) => Number(l.qty) > 0 && l.price != null).length
    : items.filter((it) => Number(retQty[it.id]) > 0).length;

  async function submit() {
    if (saving) return;
    if (returnCount === 0) return toast.error("Isi jumlah barang yang dikembalikan");
    if (noReceipt && reason.trim().length < 3) return toast.error("Retur tanpa struk: isi alasan dahulu");
    if (!noReceipt) {
      for (const it of items) {
        const q = Number(retQty[it.id]);
        if (q > it.remaining + 1e-9) return toast.error(`${it.products?.name || "Barang"}: maksimal bisa diretur ${it.remaining}`);
      }
    }
    for (const l of newLines) {
      if (!(Number(l.qty) > 0)) return toast.error(`Isi jumlah untuk ${l.product.name}`);
    }
    if (!branchId) return toast.error("Cabang kasir belum dipilih");

    const returnPayload = noReceipt
      ? retLines
          .filter((l) => Number(l.qty) > 0)
          .map((l) => ({ kind: "return", product_id: l.product.id, price_type: l.price_type, qty: Number(l.qty), condition: l.condition }))
      : items
          .filter((it) => Number(retQty[it.id]) > 0)
          .map((it) => ({
            kind: "return",
            transaction_item_id: it.id,
            qty: Number(retQty[it.id]),
            condition: retCond[it.id] || "bagus",
          }));

    const payload = [
      ...returnPayload,
      ...newLines.map((l) => ({ kind: "new", product_id: l.product.id, price_type: l.price_type, qty: Number(l.qty) })),
    ];

    setSaving(true);
    try {
      const { error } = await supabase.rpc("process_exchange", {
        p_shift_id: shift?.id || null,
        p_branch_id: branchId,
        p_reference_transaction_id: noReceipt ? null : selectedTx.id,
        p_reason: reason || null,
        p_payment_method: difference === 0 ? null : payMethod,
        p_items: payload,
      });
      if (error) {
        if (error.code === "PGRST202" || /process_exchange/.test(error.message || "")) {
          throw new Error("Fitur belum aktif: minta admin menjalankan migration-36 di Supabase dahulu.");
        }
        throw error;
      }
      setResult({ difference, payMethod: difference === 0 ? null : payMethod });
      onDone?.();
    } catch (err) {
      toast.error(err.message || "Gagal memproses, coba lagi. Stok belum berubah.", { duration: 6000 });
    } finally {
      setSaving(false);
    }
  }

  // ---- layar selesai ----
  if (result) {
    const d = result.difference;
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="bg-surface border border-border rounded-2xl w-full max-w-sm p-6 text-center">
          <h2 className="text-lg font-semibold mb-2">Retur &amp; Tukar Berhasil</h2>
          {d > 0 && (
            <p className="text-sm mb-4">
              Terima dari pelanggan <b className="text-lg block mt-1">{formatRupiah(d)}</b>
              <span className="text-ink-muted">({result.payMethod === "tunai" ? "Tunai" : "Transfer"})</span>
            </p>
          )}
          {d < 0 && (
            <p className="text-sm mb-4">
              Kembalikan ke pelanggan <b className="text-lg block mt-1">{formatRupiah(Math.abs(d))}</b>
              <span className="text-ink-muted">({result.payMethod === "tunai" ? "Tunai" : "Transfer"})</span>
            </p>
          )}
          {d === 0 && <p className="text-sm mb-4">Nilai barang sama, tidak ada uang yang perlu dibayar atau dikembalikan.</p>}
          <p className="text-xs text-ink-muted mb-4">Stok sudah diperbarui otomatis.</p>
          <button onClick={onClose} className="w-full bg-primary text-white rounded-lg py-2.5 text-sm font-medium hover:bg-primary-hover">
            Selesai
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Retur &amp; Tukar Barang</h2>
            <p className="text-xs text-ink-muted">Ikuti langkah 1 sampai 4 dari atas ke bawah.</p>
          </div>
          <button onClick={onClose} className="text-ink-muted text-xl leading-none px-2" aria-label="Tutup">×</button>
        </div>

        <div className="p-4 overflow-y-auto space-y-5">
          {/* LANGKAH 1 */}
          <section>
            <h3 className="text-sm font-semibold mb-2">1. Cari struk pelanggan</h3>
            {noReceipt ? (
              <div className="rounded-xl bg-background p-3 flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium">Tanpa struk</p>
                  <p className="text-xs text-ink-muted">Alasan wajib diisi di langkah 4.</p>
                </div>
                <button onClick={changeTx} className="text-xs font-medium text-primary">Cari struk lagi</button>
              </div>
            ) : selectedTx ? (
              <div className="rounded-xl bg-background p-3 flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium">{txCode(selectedTx.id)}</p>
                  <p className="text-xs text-ink-muted">{formatDateTime(selectedTx.created_at)} · {formatRupiah(selectedTx.total)}</p>
                </div>
                <button onClick={changeTx} className="text-xs font-medium text-primary">Ganti struk</button>
              </div>
            ) : (
              <>
                <p className="text-xs text-ink-muted mb-2">Tanya pelanggan &quot;tadi beli apa?&quot;, lalu ketik nama barangnya. Struk yang berisi barang itu akan muncul.</p>
                <ProductSearchInput key={findKey} products={products} value={findProduct?.id || ""} onSelect={(p) => findByProduct(p)} placeholder="Ketik nama barang yang dibeli pelanggan..." />

                <div className="flex gap-1.5 mt-2 text-xs font-medium">
                  {[["hour", "1 jam"], ["today", "Hari ini"], ["week", "7 hari"], ["month", "30 hari"]].map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => changeFindWindow(id)}
                      className={`flex-1 rounded-lg border py-1.5 ${findWindow === id ? "bg-primary text-white border-primary" : "border-border hover:bg-background"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {findProduct && (
                  <div className="rounded-xl border border-border max-h-48 overflow-y-auto mt-2">
                    {findLoading ? (
                      <p className="p-3 text-sm text-ink-muted">Mencari struk...</p>
                    ) : !found || found.length === 0 ? (
                      <p className="p-3 text-sm text-ink-muted">Tidak ada struk berisi &quot;{findProduct.name}&quot; pada waktu ini. Coba waktu lebih lama, atau pilih &quot;Tidak ada struk&quot; di bawah.</p>
                    ) : (
                      found.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => pickTx({ id: t.id, total: t.total, created_at: t.created_at })}
                          className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-left border-b border-border last:border-b-0 hover:bg-primary-soft"
                        >
                          <span>
                            <span className="font-medium">{formatDateTime(t.created_at)}</span>
                            <span className="block text-xs text-ink-muted">{txCode(t.id)} · beli {findProduct.name} x{t.qty}</span>
                          </span>
                          <span className="font-medium">{formatRupiah(t.total)}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between mt-3 gap-2">
                  <button type="button" onClick={() => setShowByDate((v) => !v)} className="text-xs font-medium text-primary">
                    {showByDate ? "Sembunyikan daftar per tanggal" : "Atau lihat semua struk per tanggal"}
                  </button>
                  <button type="button" onClick={startNoReceipt} className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-background">
                    Tidak ada struk
                  </button>
                </div>

                {showByDate && (
                  <div className="mt-2">
                    <div className="flex gap-2 mb-2">
                      <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className={inputCls} />
                      <input value={txSearch} onChange={(e) => setTxSearch(e.target.value)} placeholder="Cari kode / total" className={inputCls} />
                    </div>
                    <div className="rounded-xl border border-border max-h-48 overflow-y-auto">
                      {txLoading ? (
                        <p className="p-3 text-sm text-ink-muted">Memuat struk...</p>
                      ) : filteredTxs.length === 0 ? (
                        <p className="p-3 text-sm text-ink-muted">Tidak ada struk di tanggal ini.</p>
                      ) : (
                        filteredTxs.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => pickTx(t)}
                            className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-left border-b border-border last:border-b-0 hover:bg-primary-soft"
                          >
                            <span>
                              <span className="font-medium">{txCode(t.id)}</span>
                              <span className="block text-xs text-ink-muted">{formatDateTime(t.created_at)}</span>
                            </span>
                            <span className="font-medium">{formatRupiah(t.total)}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          {/* LANGKAH 2 (TANPA STRUK) */}
          {noReceipt && (
            <section>
              <h3 className="text-sm font-semibold mb-2">2. Barang yang dikembalikan pelanggan</h3>
              <ProductSearchInput key={retPickerKey} products={products} value="" onSelect={addRetProduct} placeholder="Ketik nama barang yang dikembalikan..." />
              <div className="space-y-2 mt-2">
                {retLines.map((l) => {
                  const variants = getPriceVariants(l.product);
                  return (
                    <div key={l.key} className="rounded-xl border border-border p-3">
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="font-medium">{l.product.name}</span>
                        <button onClick={() => setRetLines((x) => x.filter((y) => y.key !== l.key))} className="text-xs text-danger shrink-0">Hapus</button>
                      </div>
                      <p className="text-xs text-ink-muted mb-2">
                        Harga retur: {l.price == null ? "menghitung..." : formatRupiah(l.price)}
                      </p>
                      <div className="flex items-center gap-2 mb-2">
                        {variants.length > 1 ? (
                          <select value={l.price_type} onChange={(e) => changeRetVariant(l.key, l.product.id, e.target.value)} className={`${inputCls} flex-1`}>
                            {variants.map((x) => (
                              <option key={x.price_type} value={x.price_type}>{x.label}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="flex-1 text-sm">{variants[0]?.label}</span>
                        )}
                        <DecimalInput value={l.qty} onValueChange={(val) => patchRet(l.key, { qty: val })} placeholder="Jumlah" className={`${inputCls} w-24 text-right`} />
                      </div>
                      <div className="flex rounded-lg border border-border overflow-hidden text-xs font-medium">
                        {["bagus", "rusak"].map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => patchRet(l.key, { condition: c })}
                            className={`flex-1 px-3 py-2 ${l.condition === c ? (c === "bagus" ? "bg-primary text-white" : "bg-danger text-white") : "bg-background"}`}
                          >
                            {c === "bagus" ? "Masih bagus" : "Rusak"}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-ink-muted mt-2">
                Tanpa struk, harga retur otomatis memakai yang paling kecil antara harga hari ini dan harga terakhir barang itu terjual. Barang juga harus tercatat terjual dalam 30 hari terakhir.
              </p>
            </section>
          )}

          {/* LANGKAH 2 */}
          {selectedTx && !noReceipt && (
            <section>
              <h3 className="text-sm font-semibold mb-2">2. Barang yang dikembalikan pelanggan</h3>
              {itemsLoading ? (
                <p className="text-sm text-ink-muted">Memuat isi struk...</p>
              ) : (
                <div className="space-y-2">
                  {items.map((it) => (
                    <div key={it.id} className={`rounded-xl border border-border p-3 ${it.remaining <= 0 ? "opacity-50" : ""}`}>
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="font-medium">{it.products?.name || "(produk dihapus)"}</span>
                        <span className="shrink-0">{formatRupiah(it.unit_price)}</span>
                      </div>
                      <p className="text-xs text-ink-muted mb-2">
                        {priceTypeLabel(it.price_type)} · dibeli {it.qty} · {it.remaining <= 0 ? "sudah diretur semua" : `bisa diretur ${it.remaining}`}
                      </p>
                      {it.remaining > 0 && (
                        <div className="flex items-center gap-2">
                          <DecimalInput
                            value={retQty[it.id] ?? ""}
                            onValueChange={(v) => setRetQty((m) => ({ ...m, [it.id]: v }))}
                            placeholder="Jumlah"
                            className={`${inputCls} w-24 text-right`}
                          />
                          <div className="flex rounded-lg border border-border overflow-hidden text-xs font-medium">
                            {["bagus", "rusak"].map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setRetCond((m) => ({ ...m, [it.id]: c }))}
                                className={`px-3 py-2 ${(retCond[it.id] || "bagus") === c ? (c === "bagus" ? "bg-primary text-white" : "bg-danger text-white") : "bg-background"}`}
                              >
                                {c === "bagus" ? "Masih bagus" : "Rusak"}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  <p className="text-xs text-ink-muted">
                    &quot;Masih bagus&quot; = stok bertambah lagi. &quot;Rusak&quot; = stok tidak bertambah. Harga mengikuti harga saat pelanggan membeli.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* LANGKAH 3 */}
          {(selectedTx || noReceipt) && !itemsLoading && (
            <section>
              <h3 className="text-sm font-semibold mb-2">3. Barang pengganti yang diambil pelanggan</h3>
              <ProductSearchInput key={pickerKey} products={products} value="" onSelect={addNewProduct} placeholder="Ketik nama barang pengganti..." />
              <div className="space-y-2 mt-2">
                {newLines.map((l) => {
                  const variants = getPriceVariants(l.product);
                  const v = lineVariant(l);
                  const stock = getBranchStock(l.product, branchId).stock_qty;
                  return (
                    <div key={l.key} className="rounded-xl border border-border p-3">
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="font-medium">{l.product.name}</span>
                        <button onClick={() => setNewLines((x) => x.filter((y) => y.key !== l.key))} className="text-xs text-danger shrink-0">Hapus</button>
                      </div>
                      <p className="text-xs text-ink-muted mb-2">Stok tercatat: {stock}</p>
                      <div className="flex items-center gap-2">
                        {variants.length > 1 ? (
                          <select value={l.price_type} onChange={(e) => patchLine(l.key, { price_type: e.target.value })} className={`${inputCls} flex-1`}>
                            {variants.map((x) => (
                              <option key={x.price_type} value={x.price_type}>{x.label} · {formatRupiah(x.unit_price)}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="flex-1 text-sm">{v?.label} · {formatRupiah(v?.unit_price)}</span>
                        )}
                        <DecimalInput value={l.qty} onValueChange={(val) => patchLine(l.key, { qty: val })} placeholder="Jumlah" className={`${inputCls} w-24 text-right`} />
                      </div>
                    </div>
                  );
                })}
                {newLines.length === 0 && <p className="text-xs text-ink-muted">Kalau pelanggan hanya mengembalikan barang tanpa mengambil barang lain, lewati langkah ini.</p>}
              </div>
            </section>
          )}

          {/* LANGKAH 4 */}
          {(selectedTx || noReceipt) && !itemsLoading && (
            <section>
              <h3 className="text-sm font-semibold mb-2">4. Selisih &amp; cara bayar</h3>
              <div className="rounded-xl bg-background p-4 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-ink-muted">Nilai barang dikembalikan</span><span>{formatRupiah(returnTotal)}</span></div>
                <div className="flex justify-between"><span className="text-ink-muted">Nilai barang pengganti</span><span>{formatRupiah(newTotal)}</span></div>
                <div className="flex justify-between font-semibold border-t border-border pt-1.5">
                  <span>{difference > 0 ? "Pelanggan harus bayar" : difference < 0 ? "Toko kembalikan uang" : "Selisih"}</span>
                  <span className={difference > 0 ? "text-primary" : difference < 0 ? "text-danger" : ""}>{difference === 0 ? "Impas" : formatRupiah(Math.abs(difference))}</span>
                </div>
              </div>

              {difference !== 0 && (
                <div className="flex gap-2 mt-3">
                  {[["tunai", "Tunai"], ["transfer", "Transfer"]].map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPayMethod(id)}
                      className={`flex-1 rounded-lg border py-2.5 text-sm font-medium ${payMethod === id ? "bg-primary text-white border-primary" : "border-border hover:bg-background"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={noReceipt ? "Alasan WAJIB diisi, mis. struk hilang / salah beli" : "Alasan (opsional), mis. salah beli / cacat"} className={`${inputCls} mt-3`} />
            </section>
          )}
        </div>

        <div className="p-4 border-t border-border flex gap-2">
          <button onClick={onClose} className="flex-1 border border-border rounded-lg py-2.5 text-sm font-medium hover:bg-background">Batal</button>
          <button
            onClick={submit}
            disabled={saving || (!selectedTx && !noReceipt) || itemsLoading || returnCount === 0}
            className="flex-1 bg-primary text-white rounded-lg py-2.5 text-sm font-medium hover:bg-primary-hover disabled:opacity-50"
          >
            {saving ? "Memproses..." : "Proses Retur & Tukar"}
          </button>
        </div>
      </div>
    </div>
  );
}
