"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { formatRupiah, formatRupiahDec, formatDate, formatDateTime, formatThousands, formatNumber, handleThousandsInputChange } from "@/lib/format";
import { getBranchStock } from "@/lib/branchStock";
import SupplierItemsModal from "@/components/SupplierItemsModal";
import DecimalInput from "@/components/ui/DecimalInput";
import { logActivity } from "@/lib/logActivity";
import { Button, Card, Input, PriceInput, Modal, Select, Textarea, EmptyState, Badge } from "@/components/ui/kit";
import { useBarcodeScan } from "@/lib/useBarcodeScan";
import { useViewport } from "@/lib/useViewport";
import CameraScanButton from "@/components/CameraScanButton";
import ProductSearchInput from "@/components/ProductSearchInput";
import { findProductByCode } from "@/lib/barcode";
import { fetchAllRows, fetchAllRowsOrEmpty } from "@/lib/fetchAllRows";

// Susunan kolom tingkatan harga per tipe produk, lengkap dengan modal & harga jual
// yang sudah ada di data produk (jadi tidak perlu diketik ulang, cukup lihat sebagai
// pembanding "harga lama" saat mengisi "harga baru").
function tiersForProduct(product) {
  if (!product) return [];
  if (product.unit_type === "kg") {
    const k = product.product_kg_pricing?.[0] || product.product_kg_pricing || {};
    return [
      { price_type: "kg", label: "Per Kg", info: null, stockFactor: 1, oldCost: k.cost_per_kg, oldSell: k.price_per_kg },
      { price_type: "half_kg", label: "Per 1/2 Kg", info: null, stockFactor: 0.5, oldCost: k.cost_per_half_kg, oldSell: k.price_per_half_kg },
      { price_type: "ons", label: "Per Ons", info: null, stockFactor: 0.1, oldCost: k.cost_per_ons, oldSell: k.price_per_ons },
    ];
  }
  const w = product.product_wholesale_pricing?.[0] || product.product_wholesale_pricing || {};
  return [
    { price_type: "retail", label: "Eceran", info: null, stockFactor: 1, oldCost: product.cost_price, oldSell: product.sell_price },
    {
      price_type: "grosir",
      label: "Grosir",
      info: w.wholesale_qty ? `Isi ${w.wholesale_qty} pcs (dari data produk)` : "Isi belum diatur di data produk",
      stockFactor: w.wholesale_qty || 1,
      oldCost: w.wholesale_cost_price,
      oldSell: w.wholesale_price,
    },
    {
      price_type: "half_grosir",
      label: "Setengah Grosir",
      info: w.half_wholesale_qty ? `Isi ${w.half_wholesale_qty} pcs (dari data produk)` : "Isi belum diatur di data produk",
      stockFactor: w.half_wholesale_qty || 1,
      oldCost: w.half_wholesale_cost_price,
      oldSell: w.half_wholesale_price,
    },
  ];
}

function persenSelisih(lama, baru) {
  const a = Number(lama || 0);
  if (a <= 0) return null;
  return Math.round(((Number(baru || 0) - a) / a) * 1000) / 10;
}

// Margin dalam persen dari harga jual; null kalau harga jual belum ada.
function marginPersen(jual, beli) {
  const j = Number(jual || 0);
  if (j <= 0) return null;
  return Math.round(((j - Number(beli || 0)) / j) * 1000) / 10;
}

// Daftar barang di kotak "Terima Barang": barang yang harganya berubah (dengan
// pilihan Ya/Tidak per barang) + stok lama -> stok sesudah diterima.
function ReceiveReview({ rows, choice, setChoice }) {
  const changed = rows.filter((r) => r.changed);
  const same = rows.filter((r) => !r.changed);
  const approved = changed.filter((r) => choice[r.item.id]).length;

  function setAll(value) {
    const next = {};
    for (const r of changed) next[r.item.id] = value;
    setChoice(next);
  }

  function stokText(r) {
    if (r.stokLama === null) return "-";
    return `${formatNumber(r.stokLama, 3)} → ${formatNumber(r.stokLama + r.tambah, 3)} ${r.unit} (+${formatNumber(r.tambah, 3)})`;
  }

  return (
    <div>
      {changed.length > 0 ? (
        <>
          <p className="text-sm text-ink-muted mb-3">
            Harga beli berubah pada {changed.length} barang. Pilih <b>Ya</b> untuk memperbarui harga di data produk, atau <b>Tidak</b> untuk membiarkan harga lama.
          </p>
          <div className="flex items-center justify-between bg-background rounded-lg pl-3 pr-1 mb-3">
            <span className="text-xs font-semibold">
              {changed.length} barang berubah harga · {approved} disetujui · {changed.length - approved} ditolak
            </span>
            <span className="flex">
              <button type="button" onClick={() => setAll(true)} className="px-3 py-2.5 text-xs font-semibold text-primary">Setujui semua</button>
              <button type="button" onClick={() => setAll(false)} className="px-3 py-2.5 text-xs font-semibold text-ink-muted">Tolak semua</button>
            </span>
          </div>
          <div className="space-y-2">
            {changed.map((r) => {
              const ya = !!choice[r.item.id];
              const pc = persenSelisih(r.oldCost, r.newCost);
              return (
                <div key={r.item.id} className="border border-border rounded-xl p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{r.name}</p>
                      <p className="text-xs text-ink-muted">{r.tier?.label || r.item.price_type} · {formatNumber(r.item.qty, 3)} diterima</p>
                    </div>
                    <div className="flex border border-border rounded-lg overflow-hidden shrink-0">
                      <button
                        type="button"
                        aria-pressed={ya}
                        onClick={() => setChoice({ ...choice, [r.item.id]: true })}
                        className={`px-4 py-2.5 text-sm ${ya ? "bg-primary text-white font-semibold" : "bg-surface text-ink"}`}
                      >
                        Ya
                      </button>
                      <button
                        type="button"
                        aria-pressed={!ya}
                        onClick={() => setChoice({ ...choice, [r.item.id]: false })}
                        className={`px-4 py-2.5 text-sm ${!ya ? "bg-ink-muted text-white font-semibold" : "bg-surface text-ink"}`}
                      >
                        Tidak
                      </button>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-3 gap-2 mt-2 text-sm">
                    <div>
                      <p className="text-[11px] text-ink-muted">Harga beli</p>
                      <p className="font-medium">{formatRupiahDec(r.oldCost, 6)} → {formatRupiahDec(r.newCost, 6)}</p>
                      {pc !== null && pc !== 0 && (
                        <span className={`text-[11px] rounded px-1.5 py-0.5 ${pc > 0 ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary"}`}>
                          {pc > 0 ? "naik" : "turun"} {formatNumber(Math.abs(pc), 1)}%
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-[11px] text-ink-muted">Harga jual</p>
                      <p className="font-medium">
                        {r.newSell !== null && r.newSell !== r.oldSell
                          ? `${formatRupiah(r.oldSell)} → ${formatRupiah(r.newSell)}`
                          : `${formatRupiah(r.oldSell)} (tetap)`}
                      </p>
                      {r.marginSesudah !== null && (
                        <p className={`text-[11px] ${r.rugi ? "text-danger font-semibold" : "text-ink-muted"}`}>
                          Margin {r.marginSebelum !== null ? `${formatNumber(r.marginSebelum, 1)}% → ` : ""}{formatNumber(r.marginSesudah, 1)}%{r.rugi ? " (rugi)" : ""}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-[11px] text-ink-muted">Stok (stok lama → sesudah diterima)</p>
                      <p className="font-medium">{stokText(r)}</p>
                    </div>
                  </div>
                  {r.rugi && (
                    <p className="mt-2 text-xs bg-warning-soft text-warning rounded-md px-2.5 py-1.5">
                      Kalau harga beli baru dipakai, harga jual saat ini jadi rugi. Isi harga jual baru di Produk &amp; Harga, atau pilih Tidak.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="text-sm text-ink-muted mb-3">Tidak ada perubahan harga di nota ini. Stok akan bertambah seperti di bawah.</p>
      )}

      {same.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-ink-muted mb-1">{changed.length > 0 ? "Barang tanpa perubahan harga" : "Stok yang akan bertambah"}</p>
          <div className="border border-border rounded-xl divide-y divide-border">
            {same.map((r) => (
              <div key={r.item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0">{r.name} <span className="text-xs text-ink-muted">({r.tier?.label || r.item.price_type})</span></span>
                <span className="text-xs text-ink-muted text-right shrink-0">{stokText(r)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-xs text-ink-muted mt-3">
        Stok semua barang tetap bertambah apa pun pilihannya. &quot;Tidak&quot; hanya membiarkan harga di data produk seperti semula.
      </p>
    </div>
  );
}

export default function PembelianPage() {
  const supabase = createClient();
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [receiveOrder, setReceiveOrder] = useState(null);
  const [supplierView, setSupplierView] = useState(null); // { id, name }: daftar barang dari supplier ini
  const [receiveRows, setReceiveRows] = useState(null); // data harga & stok terbaru untuk kotak Terima Barang
  const [receiveChoice, setReceiveChoice] = useState({}); // { [id item]: true = Ya (update harga), false = Tidak }
  const [payOrder, setPayOrder] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ supplier_id: "", branch_id: "", nota_number: "", due_date: "", notes: "", discount: "0", down_payment: "0", down_payment_method: "cash" });
  const [items, setItems] = useState([]);
  const [branches, setBranches] = useState([]);
  const [draftProductId, setDraftProductId] = useState("");
  const { isMobile } = useViewport();
  const [draftTiers, setDraftTiers] = useState({}); // { [price_type]: { qty, newCost, newSell } }

  // Koreksi / Rusak: kurangi jumlah barang yang SUDAH ditambahkan di daftar
  // "Barang Dipesan" karena ada yang rusak saat diterima -- bukan pilih barang
  // baru, tapi pilih dari barang yang sudah ada di daftar nota ini.
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionForm, setCorrectionForm] = useState({ itemIndex: "", qty: "", reason: "", linkSupplierReturn: false });

  useEffect(() => {
    load();
  }, []);

  function pickProductByCode(code) {
    const match = findProductByCode(products, code);
    if (!match) return toast.error(`Barcode "${code}" tidak ditemukan`, { id: "scan-pembelian" });
    setDraftProductId(match.id);
    setDraftTiers({});
    toast.success(`Terpilih: ${match.name}`, { id: "scan-pembelian" });
  }

  useBarcodeScan((code) => {
    if (!modalOpen) return;
    pickProductByCode(code);
  });

  async function load() {
    setLoading(true);
    const [o, s, { data: b }] = await Promise.all([
      // Nota pembelian & supplier lewat fetchAllRows supaya tidak kepotong 1000 baris.
      fetchAllRowsOrEmpty(() => supabase.from("purchase_orders").select("*, suppliers(name), branches(name), purchase_order_items(*, products(name))").order("created_at", { ascending: false })),
      fetchAllRowsOrEmpty(() => supabase.from("suppliers").select("id, name").eq("active", true).order("name")),
      supabase.from("branches").select("*").eq("active", true).order("created_at", { ascending: true }),
    ]);
    // Ditarik terpisah lewat fetchAllRows: Supabase membatasi maksimal 1000
    // baris per query, jadi kalau produk sudah lebih dari 1000, sebagian
    // tidak akan muncul di form pembelian kalau ditarik dengan cara biasa.
    const p = await fetchAllRows(() =>
      supabase
        .from("products")
        .select(
          "id, name, unit_type, cost_price, sell_price, sku, product_barcodes(barcode), product_wholesale_pricing(*), product_kg_pricing(*), product_branch_stock(*)"
        )
        .eq("active", true)
        .order("name")
    );
    setOrders(o || []);
    setSuppliers(s || []);
    setProducts(p || []);
    setBranches(b || []);
    setForm((f) => ({ ...f, branch_id: f.branch_id || b?.[0]?.id || "" }));
    setLoading(false);
  }

  const subtotal = useMemo(() => Math.round(items.reduce((s, i) => s + Number(i.qty) * Number(i.unit_cost), 0) * 100) / 100, [items]);
  const total = Math.max(0, subtotal - (Number(form.discount) || 0));
  const remaining = Math.max(0, total - (Number(form.down_payment) || 0));

  const selectedProduct = products.find((p) => p.id === draftProductId);
  const tiers = tiersForProduct(selectedProduct);

  // Stok sekarang barang yang sedang dipilih di cabang tujuan, dan stok sesudah diterima
  // (jumlah yang sedang diisi + barang yang sama yang sudah ditambahkan ke nota ini).
  const formBranchId = form.branch_id || branches[0]?.id || null;
  const selectedStock = selectedProduct ? getBranchStock(selectedProduct, formBranchId).stock_qty : 0;
  const selectedUnit = selectedProduct?.unit_type === "kg" ? "kg" : "pcs";
  const draftTambah = tiers.reduce((sum, t) => sum + (Number(draftTiers[t.price_type]?.qty) || 0) * (t.stockFactor || 1), 0);
  const notaTambah = selectedProduct
    ? items
        .filter((i) => i.product_id === draftProductId)
        .reduce((sum, i) => sum + Number(i.qty) * (tiers.find((t) => t.price_type === i.price_type)?.stockFactor || 1), 0)
    : 0;

  function updateDraftTier(priceType, field, value) {
    setDraftTiers((prev) => ({ ...prev, [priceType]: { ...prev[priceType], [field]: value } }));
  }

  function addItem() {
    if (!draftProductId) return toast.error("Pilih barang dahulu");
    const rowsToAdd = [];
    for (const tier of tiers) {
      const draft = draftTiers[tier.price_type];
      const qty = Number(draft?.qty) || 0;
      if (qty <= 0) continue; // tingkatan yang tidak diisi jumlahnya, dilewati
      const newCost = draft?.newCost !== undefined && draft?.newCost !== "" ? Number(draft.newCost) : null;
      const newSell = draft?.newSell !== undefined && draft?.newSell !== "" ? Number(draft.newSell) : null;
      const unitCost = newCost !== null ? newCost : Number(tier.oldCost || 0);
      rowsToAdd.push({
        product_id: draftProductId,
        name: selectedProduct.name,
        price_type: tier.price_type,
        price_type_label: tier.label,
        qty,
        unit_cost: unitCost,
        old_cost: Number(tier.oldCost || 0),
        new_sell_price: newSell,
        old_sell_price: Number(tier.oldSell || 0),
        note: null,
      });
    }
    if (rowsToAdd.length === 0) return toast.error("Isi jumlah diterima di minimal satu tingkatan harga");
    setItems([...items, ...rowsToAdd]);
    setDraftProductId("");
    setDraftTiers({});
  }

  function removeItem(idx) {
    setItems(items.filter((_, i) => i !== idx));
  }

  async function submitOrder() {
    if (!form.supplier_id || items.length === 0) return toast.error("Pilih supplier dan tambahkan minimal 1 barang");
    if (branches.length > 1 && !form.branch_id) return toast.error("Pilih cabang tujuan barang ini");
    if ((Number(form.down_payment) || 0) > total) {
      return toast.error("Uang muka tidak boleh lebih besar dari total pesanan");
    }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data: order, error } = await supabase
        .from("purchase_orders")
        .insert({
          supplier_id: form.supplier_id,
          branch_id: form.branch_id || branches[0]?.id || null,
          nota_number: form.nota_number || null,
          due_date: form.due_date || null,
          notes: form.notes || null,
          subtotal,
          discount: Number(form.discount) || 0,
          down_payment: Number(form.down_payment) || 0,
          total,
          remaining_debt: remaining,
          created_by: userData?.user?.id,
        })
        .select()
        .single();
      if (error) throw error;

      const rows = items.map((i) => ({
        purchase_order_id: order.id,
        product_id: i.product_id,
        price_type: i.price_type,
        qty: i.qty,
        unit_cost: i.unit_cost,
        new_sell_price: i.new_sell_price,
        subtotal: Math.round(Number(i.qty) * Number(i.unit_cost) * 100) / 100,
        note: i.note || null,
      }));
      await supabase.from("purchase_order_items").insert(rows);

      // Uang muka (kalau diisi) langsung dicatat sebagai pembayaran ke supplier,
      // supaya ikut terhitung di Dashboard "Sudah Dibayar (Transfer)"/"Sudah Dibayar (Cash)".
      const downPayment = Number(form.down_payment) || 0;
      if (downPayment > 0) {
        await supabase.from("supplier_payments").insert({
          purchase_order_id: order.id,
          amount: downPayment,
          method: form.down_payment_method,
          paid_by: userData?.user?.id,
        });
        if (remaining <= 0) {
          await supabase.from("purchase_orders").update({ payoff_method: form.down_payment_method }).eq("id", order.id);
        }
      }

      await logActivity(supabase, { userId: userData?.user?.id, action: "create_purchase_order", entity: "purchase_orders", entityId: order.id });

      toast.success("Pesanan pembelian dibuat");
      setModalOpen(false);
      setForm({ supplier_id: "", branch_id: form.branch_id, nota_number: "", due_date: "", notes: "", discount: "0", down_payment: "0", down_payment_method: "cash" });
      setItems([]);
      setCorrectionOpen(false);
      setCorrectionForm({ itemIndex: "", qty: "", reason: "", linkSupplierReturn: false });
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function submitSupplierPayment() {
    const amount = Number(payAmount) || 0;
    if (amount <= 0) return toast.error("Isi nominal pembayaran");
    if (amount > Number(payOrder.remaining_debt)) {
      return toast.error(`Nominal melebihi sisa hutang (${formatRupiah(payOrder.remaining_debt)}). Periksa kembali.`);
    }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from("supplier_payments").insert({
        purchase_order_id: payOrder.id,
        amount,
        method: payMethod,
        paid_by: userData?.user?.id,
      });
      const newRemaining = Number(payOrder.remaining_debt) - amount;
      const patch = { remaining_debt: newRemaining };
      if (newRemaining <= 0) patch.payoff_method = payMethod;
      await supabase.from("purchase_orders").update(patch).eq("id", payOrder.id);
      await logActivity(supabase, { userId: userData?.user?.id, action: "pay_supplier_debt", entity: "purchase_orders", entityId: payOrder.id, details: { amount, method: payMethod } });
      toast.success("Pembayaran hutang dicatat");
      setPayOrder(null);
      setPayAmount("");
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Menerima barang: stok bertambah dalam satuan dasar (pcs/kg), harga modal per
  // tingkatan diperbarui sesuai yang dibeli, dan harga jual ikut diperbarui HANYA
  // kalau admin mengisi "harga baru" saat membuat pesanan (kosong = tidak berubah).
  // Buka kotak "Terima Barang": ambil data TERBARU produk (harga, stok cabang) langsung
  // dari database, bandingkan dengan harga di nota, lalu siapkan daftar persetujuan.
  async function openReceive(order) {
    setReceiveOrder(order);
    setReceiveRows(null);
    setReceiveChoice({});
    try {
      const orderItems = order.purchase_order_items || [];
      const ids = [...new Set(orderItems.map((it) => it.product_id).filter(Boolean))];
      const fresh = [];
      for (let i = 0; i < ids.length; i += 100) {
        const { data, error } = await supabase
          .from("products")
          .select("id, name, unit_type, cost_price, sell_price, product_wholesale_pricing(*), product_kg_pricing(*), product_branch_stock(*)")
          .in("id", ids.slice(i, i + 100));
        if (error) throw error;
        fresh.push(...(data || []));
      }
      const branchId = order.branch_id || branches[0]?.id || null;
      const rows = orderItems.map((item) => {
        const product = fresh.find((p) => p.id === item.product_id) || null;
        const tier = product ? tiersForProduct(product).find((t) => t.price_type === item.price_type) : null;
        const oldCost = Number(tier?.oldCost || 0);
        const oldSell = Number(tier?.oldSell || 0);
        const newCost = Number(item.unit_cost || 0);
        const newSell = item.new_sell_price ? Number(item.new_sell_price) : null;
        const sellAfter = newSell !== null ? newSell : oldSell;
        const marginSesudah = marginPersen(sellAfter, newCost);
        return {
          item,
          product,
          tier,
          name: product?.name || item.products?.name || item.product_name || "(produk sudah dihapus)",
          unit: product?.unit_type === "kg" ? "kg" : "pcs",
          oldCost,
          newCost,
          oldSell,
          newSell,
          changed: oldCost !== newCost || (newSell !== null && newSell !== oldSell),
          stokLama: product ? getBranchStock(product, branchId).stock_qty : null,
          tambah: Number(item.qty) * (tier?.stockFactor || 1),
          marginSebelum: marginPersen(oldSell, oldCost),
          marginSesudah,
          rugi: marginSesudah !== null && marginSesudah < 0,
        };
      });
      // Pilihan awal: Ya, kecuali kalau harga beli baru membuat harga jual rugi.
      const choice = {};
      for (const r of rows) if (r.changed) choice[r.item.id] = !r.rugi;
      setReceiveRows(rows);
      setReceiveChoice(choice);
    } catch (err) {
      toast.error("Gagal memuat harga & stok terbaru: " + err.message);
      setReceiveOrder(null);
    }
  }

  async function markReceived(order, skipPriceIds = []) {
    const skipPrice = new Set(skipPriceIds);
    setSaving(true);
    try {
      // Cek status TERBARU di database: kalau nota ini sudah diterima dari tab/komputer
      // lain, jangan tambah stok dua kali.
      const { data: freshOrder } = await supabase.from("purchase_orders").select("status").eq("id", order.id).maybeSingle();
      if (!freshOrder) throw new Error("Nota pembelian tidak ditemukan di database");
      if (freshOrder.status === "diterima") {
        toast.error("Nota ini sudah pernah diterima. Stok tidak ditambah lagi.");
        setReceiveOrder(null);
        load();
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const branchId = order.branch_id || branches[0]?.id || null;

      // Siapkan SEMUA produk dulu sebelum mengubah apa pun. Daftar `products` di
      // halaman ini hanya berisi produk AKTIF, jadi barang yang dinonaktifkan sejak
      // nota dibuat dulu dilewati diam-diam padahal nota tetap ditandai "diterima"
      // (stok tidak bertambah, tanpa pemberitahuan). Sekarang diambil langsung dari
      // database, dan kalau benar-benar tidak ada, proses dihentikan dengan pesan jelas.
      const resolved = [];
      for (const item of order.purchase_order_items) {
        let product = products.find((p) => p.id === item.product_id);
        if (!product && item.product_id) {
          const { data } = await supabase
            .from("products")
            .select("id, name, unit_type, cost_price, sell_price, sku, product_barcodes(barcode), product_wholesale_pricing(*), product_kg_pricing(*), product_branch_stock(*)")
            .eq("id", item.product_id)
            .maybeSingle();
          product = data || null;
        }
        if (!product) {
          throw new Error(`Barang "${item.product_name || item.products?.name || "tanpa nama"}" di nota ini sudah tidak ada di database, jadi nota tidak diterima otomatis. Cek manual.`);
        }
        resolved.push({ item, product });
      }

      const moveFailed = [];
      for (const { item, product } of resolved) {
        const tier = tiersForProduct(product).find((t) => t.price_type === item.price_type);
        const stockIncrement = Number(item.qty) * (tier?.stockFactor || 1);

        // Barang yang harganya DITOLAK (Tidak) di kotak persetujuan: harga tidak diubah,
        // tapi stok tetap bertambah di bawah.
        if (!skipPrice.has(item.id)) {
        const productPatch = {};
        const w = product.product_wholesale_pricing?.[0] || product.product_wholesale_pricing || {};
        const k = product.product_kg_pricing?.[0] || product.product_kg_pricing || {};
        const newSell = item.new_sell_price;

        if (item.price_type === "retail") {
          productPatch.cost_price = item.unit_cost;
          if (newSell) productPatch.sell_price = newSell;
        } else if (item.price_type === "grosir") {
          await supabase.from("product_wholesale_pricing").upsert({
            product_id: product.id, ...w,
            wholesale_cost_price: item.unit_cost,
            ...(newSell ? { wholesale_price: newSell } : {}),
          });
        } else if (item.price_type === "half_grosir") {
          await supabase.from("product_wholesale_pricing").upsert({
            product_id: product.id, ...w,
            half_wholesale_cost_price: item.unit_cost,
            ...(newSell ? { half_wholesale_price: newSell } : {}),
          });
        } else if (item.price_type === "kg") {
          productPatch.cost_price = item.unit_cost;
          if (newSell) productPatch.sell_price = newSell;
          await supabase.from("product_kg_pricing").upsert({
            product_id: product.id, ...k,
            cost_per_kg: item.unit_cost,
            ...(newSell ? { price_per_kg: newSell } : {}),
          });
        } else if (item.price_type === "half_kg") {
          await supabase.from("product_kg_pricing").upsert({
            product_id: product.id, ...k,
            cost_per_half_kg: item.unit_cost,
            ...(newSell ? { price_per_half_kg: newSell } : {}),
          });
        } else if (item.price_type === "ons") {
          await supabase.from("product_kg_pricing").upsert({
            product_id: product.id, ...k,
            cost_per_ons: item.unit_cost,
            ...(newSell ? { price_per_ons: newSell } : {}),
          });
        }

        if (Object.keys(productPatch).length > 0) {
          await supabase.from("products").update(productPatch).eq("id", item.product_id);
        }
        }
        // Tambah stok lewat fungsi database (atomik) -- BUKAN baca stok dari layar lalu
        // timpa. Cara lama menghapus penjualan kasir yang terjadi antara halaman ini
        // dimuat dan tombol Terima ditekan.
        const { error: stockErr } = await supabase.rpc("adjust_branch_stock", {
          p_product_id: item.product_id,
          p_branch_id: branchId,
          p_delta: stockIncrement,
        });
        if (stockErr) throw new Error(`Stok "${product.name}" gagal ditambah: ${stockErr.message}`);
        const { error: moveErr } = await supabase.from("stock_movements").insert({
          product_id: item.product_id,
          branch_id: branchId,
          movement_type: "pembelian",
          qty: stockIncrement,
          unit_cost: item.unit_cost,
          supplier_id: order.supplier_id,
          note: `Pembelian PO ${order.id.slice(0, 8)} (${item.price_type})`,
          created_by: userData?.user?.id,
        });
        if (moveErr) moveFailed.push(product.name);
      }
      const { error: statusErr } = await supabase.from("purchase_orders").update({ status: "diterima", received_at: new Date().toISOString() }).eq("id", order.id);
      if (statusErr) throw statusErr;
      if (moveFailed.length > 0) {
        toast.error(`Stok sudah bertambah, tapi catatan Kartu Stok gagal dibuat untuk: ${moveFailed.join(", ")}`, { duration: 8000 });
      }
      await logActivity(supabase, { userId: userData?.user?.id, action: "receive_purchase_order", entity: "purchase_orders", entityId: order.id });
      toast.success(skipPrice.size > 0 ? `Barang diterima, stok bertambah. Harga ${skipPrice.size} barang tidak diubah sesuai pilihanmu.` : "Barang diterima, stok & harga diperbarui");
      setReceiveOrder(null);
      setReceiveRows(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Koreksi / Rusak: kurangi jumlah salah satu baris di "Barang Dipesan" (belum
  // tersimpan ke database) karena ada yang rusak saat diterima. Kalau jumlah
  // dikurangi sampai habis, baris itu dihapus dari daftar. Bisa juga ditandai
  // untuk diretur ke supplier nota ini (masuk daftar retur, belum diambil).
  async function applyCorrection() {
    const idx = correctionForm.itemIndex;
    if (idx === "" || idx === null) return toast.error("Pilih barang yang rusak dari daftar Barang Dipesan");
    const item = items[Number(idx)];
    if (!item) return toast.error("Barang tidak ditemukan di daftar");
    const qty = Number(correctionForm.qty);
    if (!qty || qty <= 0) return toast.error("Isi jumlah yang rusak/dikurangi");
    if (qty > Number(item.qty)) {
      return toast.error(`Jumlah koreksi (${qty}) melebihi jumlah di daftar (${item.qty}). Periksa kembali.`);
    }
    if (correctionForm.linkSupplierReturn && !form.supplier_id) {
      return toast.error("Pilih supplier pada form pesanan dahulu");
    }

    const newQty = Number(item.qty) - qty;
    setItems((prev) => {
      const next = [...prev];
      if (newQty <= 0) {
        next.splice(Number(idx), 1);
      } else {
        next[Number(idx)] = {
          ...next[Number(idx)],
          qty: newQty,
          note: [next[Number(idx)].note, `Dikurangi ${qty} (rusak${correctionForm.reason ? `: ${correctionForm.reason}` : ""})`]
            .filter(Boolean)
            .join("; "),
        };
      }
      return next;
    });

    if (correctionForm.linkSupplierReturn && form.supplier_id) {
      try {
        const { data: userData } = await supabase.auth.getUser();
        await supabase.from("returns").insert({
          return_type: "supplier",
          product_id: item.product_id,
          qty,
          reason: correctionForm.reason || null,
          reference_supplier_id: form.supplier_id,
          pickup_status: "belum_diambil",
          created_by: userData?.user?.id,
        });
        toast.success("Koreksi diterapkan & masuk daftar retur supplier");
      } catch (err) {
        toast.error("Koreksi diterapkan, tapi gagal mencatat ke daftar retur: " + err.message);
      }
    } else {
      toast.success("Koreksi diterapkan ke daftar Barang Dipesan");
    }

    setCorrectionForm({ itemIndex: "", qty: "", reason: "", linkSupplierReturn: false });
    setCorrectionOpen(false);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Stok & Barang Masuk</h1>
          <p className="text-sm text-ink-muted">Buat pesanan ke supplier, terima barang masuk, dan pantau sisa hutang tiap nota.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>Terima Barang</Button>
      </div>

      <Card>
        {loading ? <p className="text-sm text-ink-muted">Memuat...</p> : orders.length === 0 ? (
          <EmptyState text="Belum ada pesanan pembelian." />
        ) : (
          <div className="space-y-3">
            {orders.map((o) => (
              <div key={o.id} className="border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium">
                      {o.supplier_id ? (
                        <button
                          type="button"
                          onClick={() => setSupplierView({ id: o.supplier_id, name: o.suppliers?.name || "Supplier" })}
                          className="text-primary hover:underline text-left"
                          title="Lihat daftar barang dari supplier ini"
                        >
                          {o.suppliers?.name}
                        </button>
                      ) : (
                        o.suppliers?.name
                      )}
                      {o.nota_number && <span className="text-ink-muted font-normal"> · Nota {o.nota_number}</span>}
                    </p>
                    <p className="text-xs text-ink-muted">{formatDateTime(o.created_at)} {o.due_date ? `· Jatuh tempo ${formatDate(o.due_date)}` : ""}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <Badge tone={o.status === "diterima" ? "primary" : "warning"}>{o.status === "diterima" ? "Diterima" : "Menunggu"}</Badge>
                    {Number(o.remaining_debt) <= 0 && o.payoff_method && (
                      <Badge tone="primary">LUNAS-{o.payoff_method === "transfer" ? "Transfer" : "Cash"}</Badge>
                    )}
                  </div>
                </div>
                <div className="text-xs text-ink-muted mb-2">
                  {(o.purchase_order_items || []).map((it) => `${it.products?.name || it.product_name || "(produk sudah dihapus)"} x${it.qty}`).join(", ")}
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex gap-4">
                    <span>Total: <strong>{formatRupiah(o.total)}</strong></span>
                    {Number(o.remaining_debt) > 0 && (
                      <span className="text-danger">Sisa hutang: <strong>{formatRupiah(o.remaining_debt)}</strong></span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {Number(o.remaining_debt) > 0 && (
                      <Button variant="outline" onClick={() => { setPayOrder(o); setPayAmount(String(o.remaining_debt)); }}>Bayar Hutang</Button>
                    )}
                    {o.status !== "diterima" && (
                      <Button variant="outline" onClick={() => openReceive(o)}>Terima Barang</Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {modalOpen && (
        <Modal title="Pesanan Pembelian Baru" onClose={() => { setModalOpen(false); setCorrectionOpen(false); }} wide>
          <p className="text-xs text-ink-muted mb-3">
            Stok baru bertambah setelah barang diterima, bukan saat pesanan dibuat.
          </p>
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <div>
              <Select label="Supplier" value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
                <option value="">-- pilih --</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
              {form.supplier_id && (
                <button
                  type="button"
                  onClick={() => setSupplierView(suppliers.find((s) => s.id === form.supplier_id) || null)}
                  className="mt-1.5 text-xs font-medium text-primary hover:underline"
                >
                  Lihat daftar barang dari {suppliers.find((s) => s.id === form.supplier_id)?.name} →
                </button>
              )}
            </div>
            <Input label="Nomor Nota" placeholder="contoh: 0021" value={form.nota_number} onChange={(e) => setForm({ ...form, nota_number: e.target.value })} />
          </div>
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <Input label="Jatuh Tempo" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            {branches.length > 1 && (
              <Select label="Cabang Tujuan" value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })}>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            )}
          </div>
          <Textarea label="Catatan" placeholder="Kirim minggu depan, faktur menyusul" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="mb-4" />

          <div className="border border-border rounded-xl p-4 mb-4">
            <p className="text-sm font-medium mb-1">Barang Dipesan</p>
            <p className="text-xs text-ink-muted mb-3">Pilih barang, lalu isi jumlah yang diterima di tingkatan harga yang sesuai (bisa lebih dari satu). Kolom "Harga Baru" boleh dikosongkan kalau harga tidak berubah dari supplier.</p>

            <div className="flex items-center gap-2 mb-4">
              <ProductSearchInput
                products={products}
                value={draftProductId}
                onSelect={(p) => {
                  setDraftProductId(p.id);
                  setDraftTiers({});
                }}
                placeholder="Ketik nama barang, atau scan barcode..."
                className="flex-1"
              />
              {isMobile && (
                <CameraScanButton
                  onDetected={pickProductByCode}
                  title="Cari barang pakai kamera"
                />
              )}
            </div>

            {selectedProduct && (
              <div className="space-y-3 mb-4">
                <div className="rounded-lg bg-background border border-border px-3 py-2 text-sm flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span>
                    Stok sekarang{branches.length > 1 ? ` (${branches.find((b) => b.id === formBranchId)?.name || "cabang"})` : ""}:{" "}
                    <b>{formatNumber(selectedStock, 3)} {selectedUnit}</b>
                  </span>
                  {draftTambah + notaTambah > 0 && (
                    <span className="text-primary">
                      Setelah diterima: <b>{formatNumber(selectedStock + draftTambah + notaTambah, 3)} {selectedUnit}</b> (+{formatNumber(draftTambah + notaTambah, 3)})
                    </span>
                  )}
                </div>
                {tiers.map((tier) => (
                  <div key={tier.price_type} className="border border-border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium">{tier.label}</p>
                      {tier.info && <span className="text-[11px] text-ink-muted">{tier.info}</span>}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
                      <div>
                        <label className="block text-[11px] text-ink-muted mb-1">Jumlah Diterima</label>
                        <input
                          type="number"
                          placeholder="0"
                          value={draftTiers[tier.price_type]?.qty || ""}
                          onChange={(e) => updateDraftTier(tier.price_type, "qty", e.target.value)}
                          onWheel={(e) => e.currentTarget.blur()}
                          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-ink-muted mb-1">Harga Beli Lama</label>
                        <div className="px-2 py-1.5 text-sm text-ink-muted bg-background/50 rounded-md border border-border">{formatRupiahDec(tier.oldCost || 0, 6)}</div>
                      </div>
                      <div>
                        <label className="block text-[11px] text-ink-muted mb-1">Harga Beli Baru</label>
                        <DecimalInput
                          placeholder="kosongkan jika tetap"
                          value={draftTiers[tier.price_type]?.newCost}
                          onValueChange={(raw) => updateDraftTier(tier.price_type, "newCost", raw)}
                          onWheel={(e) => e.currentTarget.blur()}
                          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-ink-muted mb-1">Harga Jual Lama</label>
                        <div className="px-2 py-1.5 text-sm text-ink-muted bg-background/50 rounded-md border border-border">{formatRupiah(tier.oldSell || 0)}</div>
                      </div>
                      <div>
                        <label className="block text-[11px] text-ink-muted mb-1">Harga Jual Baru</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="kosongkan jika tetap"
                          value={formatThousands(draftTiers[tier.price_type]?.newSell)}
                          onChange={(e) => handleThousandsInputChange(e, (raw) => updateDraftTier(tier.price_type, "newSell", raw))}
                          onWheel={(e) => e.currentTarget.blur()}
                          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button variant="outline" onClick={addItem} disabled={!selectedProduct}>+ Tambah Barang</Button>

            {items.length > 0 && (
              <div className="mt-4 space-y-1.5">
                {items.map((it, idx) => (
                  <div key={idx} className="text-sm border-t border-border pt-1.5">
                    <div className="flex items-center justify-between">
                      <span>
                        {it.name} <span className="text-ink-muted text-xs">({it.price_type_label})</span> x{it.qty}
                        {it.unit_cost !== it.old_cost && <span className="text-primary text-xs ml-1">harga beli baru</span>}
                        {it.new_sell_price && <span className="text-primary text-xs ml-1">harga jual baru</span>}
                      </span>
                      <div className="flex items-center gap-3">
                        <span>{formatRupiah(it.qty * it.unit_cost)}</span>
                        <button onClick={() => removeItem(idx)} className="text-xs text-danger">Hapus</button>
                      </div>
                    </div>
                    {it.note && <p className="text-[11px] text-danger mt-0.5">{it.note}</p>}
                  </div>
                ))}
              </div>
            )}

            {items.length > 0 && (
              <div className="mt-4 pt-3 border-t border-border">
                {!correctionOpen ? (
                  <Button variant="outline" onClick={() => setCorrectionOpen(true)}>Koreksi / Rusak</Button>
                ) : (
                  <div className="border border-border rounded-lg p-3 space-y-3">
                    <p className="text-xs text-ink-muted">Kurangi jumlah salah satu barang di atas karena rusak saat diterima. Jumlah yang tersimpan di nota otomatis berkurang.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <Select
                        label="Barang yang Rusak"
                        value={correctionForm.itemIndex}
                        onChange={(e) => setCorrectionForm({ ...correctionForm, itemIndex: e.target.value })}
                      >
                        <option value="">-- pilih dari Barang Dipesan --</option>
                        {items.map((it, idx) => (
                          <option key={idx} value={idx}>{it.name} ({it.price_type_label}) - saat ini {it.qty}</option>
                        ))}
                      </Select>
                      <Input
                        label="Jumlah Rusak/Dikurangi"
                        type="number"
                        placeholder="contoh: 2"
                        value={correctionForm.qty}
                        onChange={(e) => setCorrectionForm({ ...correctionForm, qty: e.target.value })}
                      />
                    </div>
                    <Textarea
                      label="Alasan Kerusakan"
                      placeholder="Dus penyok / botol pecah / susut"
                      value={correctionForm.reason}
                      onChange={(e) => setCorrectionForm({ ...correctionForm, reason: e.target.value })}
                      rows={2}
                    />
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={correctionForm.linkSupplierReturn}
                        onChange={(e) => setCorrectionForm({ ...correctionForm, linkSupplierReturn: e.target.checked })}
                      />
                      Retur ke supplier ini (masuk daftar retur, belum diambil)
                    </label>
                    {correctionForm.linkSupplierReturn && !form.supplier_id && (
                      <p className="text-xs text-danger -mt-1.5">Pilih Supplier di form pesanan (atas) dulu sebelum menerapkan koreksi ini.</p>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => { setCorrectionOpen(false); setCorrectionForm({ itemIndex: "", qty: "", reason: "", linkSupplierReturn: false }); }}>Batal</Button>
                      <Button variant="danger" onClick={applyCorrection}>Terapkan Koreksi</Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid sm:grid-cols-3 gap-3 mb-4">
            <PriceInput label="Diskon" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} />
            <PriceInput label="Bayar Sekarang (Uang Muka)" value={form.down_payment} onChange={(e) => setForm({ ...form, down_payment: e.target.value })} />
            <Select label="Dibayar Cash / Transfer" value={form.down_payment_method} onChange={(e) => setForm({ ...form, down_payment_method: e.target.value })}>
              <option value="cash">Cash</option>
              <option value="transfer">Transfer</option>
            </Select>
          </div>

          <div className="bg-background rounded-xl p-4 space-y-1 text-sm mb-4">
            <div className="flex justify-between"><span className="text-ink-muted">Subtotal</span><span>{formatRupiah(subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-ink-muted">Diskon</span><span>{formatRupiah(form.discount)}</span></div>
            <div className="flex justify-between font-medium"><span>Total</span><span>{formatRupiah(total)}</span></div>
            <div className="flex justify-between text-danger"><span>Sisa Hutang</span><span>{formatRupiah(remaining)}</span></div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setModalOpen(false); setCorrectionOpen(false); }}>Batal</Button>
            <Button onClick={submitOrder} disabled={saving}>{saving ? "Menyimpan..." : "Buat Pesanan"}</Button>
          </div>
        </Modal>
      )}

      {supplierView && (
        <SupplierItemsModal
          supplier={supplierView}
          branchId={modalOpen ? formBranchId : null}
          onClose={() => setSupplierView(null)}
          onPick={
            modalOpen
              ? (productId) => {
                  setDraftProductId(productId);
                  setDraftTiers({});
                  setSupplierView(null);
                  toast.success("Barang dipilih. Isi jumlah diterima di form pesanan.");
                }
              : null
          }
        />
      )}

      {receiveOrder && (
        <Modal title="Konfirmasi Terima Barang" onClose={() => setReceiveOrder(null)} wide>
          {!receiveRows ? (
            <p className="text-sm text-ink-muted mb-4">Memuat harga &amp; stok terbaru...</p>
          ) : (
            <ReceiveReview rows={receiveRows} choice={receiveChoice} setChoice={setReceiveChoice} />
          )}
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setReceiveOrder(null)}>Batal</Button>
            <Button
              onClick={() =>
                markReceived(
                  receiveOrder,
                  (receiveRows || []).filter((r) => r.changed && !receiveChoice[r.item.id]).map((r) => r.item.id)
                )
              }
              disabled={saving || !receiveRows}
            >
              {saving ? "Memproses..." : receiveRows?.some((r) => r.changed) ? "Terima Barang & Simpan Pilihan" : "Konfirmasi Diterima"}
            </Button>
          </div>
        </Modal>
      )}

      {payOrder && (
        <Modal title={`Bayar Hutang - ${payOrder.suppliers?.name}`} onClose={() => setPayOrder(null)}>
          <p className="text-sm text-ink-muted mb-3">
            Sisa hutang saat ini: <span className="font-medium text-ink">{formatRupiah(payOrder.remaining_debt)}</span>
          </p>
          <PriceInput label="Jumlah Bayar" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="mb-3" />
          <Select label="Metode Pembayaran" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="transfer">Transfer</option>
          </Select>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setPayOrder(null)}>Batal</Button>
            <Button onClick={submitSupplierPayment} disabled={saving}>{saving ? "Menyimpan..." : "Simpan Pembayaran"}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
