"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { formatRupiah, formatDate, formatDateTime } from "@/lib/format";
import { logActivity } from "@/lib/logActivity";
import { Button, Card, Input, Modal, Select, Textarea, EmptyState, Badge } from "@/components/ui/kit";
import { useBarcodeScan } from "@/lib/useBarcodeScan";

export default function PembelianPage() {
  const supabase = createClient();
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [receiveOrder, setReceiveOrder] = useState(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ supplier_id: "", due_date: "", notes: "", discount: "0", down_payment: "0" });
  const [items, setItems] = useState([]);
  const [itemDraft, setItemDraft] = useState({ product_id: "", qty: "1", unit_cost: "0" });

  useEffect(() => {
    load();
  }, []);

  // Scan barcode global: kalau form pesanan sedang terbuka, pilihkan barang di kolom "tambah barang".
  useBarcodeScan((code) => {
    if (!modalOpen) return;
    const match = products.find(
      (p) => p.sku === code || (p.product_barcodes || []).some((b) => b.barcode === code)
    );
    if (!match) return toast.error(`Barcode "${code}" tidak ditemukan`, { id: "scan-pembelian" });
    setItemDraft((d) => ({ ...d, product_id: match.id }));
    toast.success(`Terpilih: ${match.name}`, { id: "scan-pembelian" });
  });


  async function load() {
    setLoading(true);
    const [{ data: o }, { data: s }, { data: p }] = await Promise.all([
      supabase.from("purchase_orders").select("*, suppliers(name), purchase_order_items(*, products(name))").order("created_at", { ascending: false }),
      supabase.from("suppliers").select("id, name").eq("active", true).order("name"),
      supabase.from("products").select("id, name, stock_qty, cost_price, sku, product_barcodes(barcode)").eq("active", true).order("name"),
    ]);
    setOrders(o || []);
    setSuppliers(s || []);
    setProducts(p || []);
    setLoading(false);
  }

  const subtotal = useMemo(() => items.reduce((s, i) => s + Number(i.qty) * Number(i.unit_cost), 0), [items]);
  const total = Math.max(0, subtotal - (Number(form.discount) || 0));
  const remaining = Math.max(0, total - (Number(form.down_payment) || 0));

  function addItem() {
    if (!itemDraft.product_id || !itemDraft.qty) return toast.error("Pilih barang dan isi jumlah");
    const product = products.find((p) => p.id === itemDraft.product_id);
    setItems([...items, { product_id: itemDraft.product_id, name: product?.name, qty: Number(itemDraft.qty), unit_cost: Number(itemDraft.unit_cost) }]);
    setItemDraft({ product_id: "", qty: "1", unit_cost: "0" });
  }

  function removeItem(idx) {
    setItems(items.filter((_, i) => i !== idx));
  }

  async function submitOrder() {
    if (!form.supplier_id || items.length === 0) return toast.error("Pilih supplier dan tambahkan minimal 1 barang");
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data: order, error } = await supabase
        .from("purchase_orders")
        .insert({
          supplier_id: form.supplier_id,
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
        qty: i.qty,
        unit_cost: i.unit_cost,
        subtotal: i.qty * i.unit_cost,
      }));
      await supabase.from("purchase_order_items").insert(rows);
      await logActivity(supabase, { userId: userData?.user?.id, action: "create_purchase_order", entity: "purchase_orders", entityId: order.id });

      toast.success("Pesanan pembelian dibuat");
      setModalOpen(false);
      setForm({ supplier_id: "", due_date: "", notes: "", discount: "0", down_payment: "0" });
      setItems([]);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function markReceived(order) {
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      for (const item of order.purchase_order_items) {
        const product = products.find((p) => p.id === item.product_id);
        const newStock = Number(product?.stock_qty || 0) + Number(item.qty);
        await supabase.from("products").update({ stock_qty: newStock, cost_price: item.unit_cost }).eq("id", item.product_id);
        await supabase.from("stock_movements").insert({
          product_id: item.product_id,
          movement_type: "pembelian",
          qty: item.qty,
          unit_cost: item.unit_cost,
          supplier_id: order.supplier_id,
          note: `Pembelian PO ${order.id.slice(0, 8)}`,
          created_by: userData?.user?.id,
        });
      }
      await supabase.from("purchase_orders").update({ status: "diterima", received_at: new Date().toISOString() }).eq("id", order.id);
      await logActivity(supabase, { userId: userData?.user?.id, action: "receive_purchase_order", entity: "purchase_orders", entityId: order.id });
      toast.success("Barang diterima, stok diperbarui");
      setReceiveOrder(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Pembelian</h1>
          <p className="text-sm text-ink-muted">Buat pesanan ke supplier, terima barang masuk, dan pantau sisa hutang tiap nota pembelian.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>+ Pesanan Baru</Button>
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
                    <p className="text-sm font-medium">{o.suppliers?.name}</p>
                    <p className="text-xs text-ink-muted">{formatDateTime(o.created_at)} {o.due_date ? `· Jatuh tempo ${formatDate(o.due_date)}` : ""}</p>
                  </div>
                  <Badge tone={o.status === "diterima" ? "primary" : "warning"}>{o.status === "diterima" ? "Diterima" : "Menunggu"}</Badge>
                </div>
                <div className="text-xs text-ink-muted mb-2">
                  {(o.purchase_order_items || []).map((it) => it.products?.name + " x" + it.qty).join(", ")}
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex gap-4">
                    <span>Total: <strong>{formatRupiah(o.total)}</strong></span>
                    <span className="text-danger">Sisa hutang: <strong>{formatRupiah(o.remaining_debt)}</strong></span>
                  </div>
                  {o.status !== "diterima" && (
                    <Button variant="outline" onClick={() => setReceiveOrder(o)}>Terima Barang</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {modalOpen && (
        <Modal title="Pesanan Pembelian Baru" onClose={() => setModalOpen(false)} wide>
          <p className="text-xs text-ink-muted mb-3">Stok baru bertambah setelah barang diterima, bukan saat pesanan dibuat.</p>
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <Select label="Supplier" value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
              <option value="">-- pilih --</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Input label="Jatuh Tempo" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
          </div>
          <Textarea label="Catatan" placeholder="Kirim minggu depan, faktur menyusul" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="mb-4" />

          <div className="border border-border rounded-xl p-4 mb-4">
            <p className="text-sm font-medium mb-3">Barang Dipesan</p>
            <div className="grid sm:grid-cols-4 gap-2 mb-3">
              <Select value={itemDraft.product_id} onChange={(e) => setItemDraft({ ...itemDraft, product_id: e.target.value })} className="sm:col-span-2">
                <option value="">-- pilih barang --</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
              <Input type="number" placeholder="Qty" value={itemDraft.qty} onChange={(e) => setItemDraft({ ...itemDraft, qty: e.target.value })} />
              <Input type="number" placeholder="Modal/unit" value={itemDraft.unit_cost} onChange={(e) => setItemDraft({ ...itemDraft, unit_cost: e.target.value })} />
            </div>
            <Button variant="outline" onClick={addItem}>+ Tambah Barang</Button>

            {items.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {items.map((it, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm border-t border-border pt-1.5">
                    <span>{it.name} x{it.qty}</span>
                    <div className="flex items-center gap-3">
                      <span>{formatRupiah(it.qty * it.unit_cost)}</span>
                      <button onClick={() => removeItem(idx)} className="text-xs text-danger">Hapus</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-3 mb-4">
            <Input label="Diskon" type="number" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} />
            <Input label="Bayar Sekarang (Uang Muka)" type="number" value={form.down_payment} onChange={(e) => setForm({ ...form, down_payment: e.target.value })} />
          </div>

          <div className="bg-background rounded-xl p-4 space-y-1 text-sm mb-4">
            <div className="flex justify-between"><span className="text-ink-muted">Subtotal</span><span>{formatRupiah(subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-ink-muted">Diskon</span><span>{formatRupiah(form.discount)}</span></div>
            <div className="flex justify-between font-medium"><span>Total</span><span>{formatRupiah(total)}</span></div>
            <div className="flex justify-between text-danger"><span>Sisa Hutang</span><span>{formatRupiah(remaining)}</span></div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button onClick={submitOrder} disabled={saving}>{saving ? "Menyimpan..." : "Buat Pesanan"}</Button>
          </div>
        </Modal>
      )}

      {receiveOrder && (
        <Modal title="Konfirmasi Terima Barang" onClose={() => setReceiveOrder(null)}>
          <p className="text-sm text-ink-muted mb-4">
            Stok untuk {receiveOrder.purchase_order_items?.length} jenis barang akan otomatis bertambah dan harga modal akan diperbarui sesuai nota ini.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setReceiveOrder(null)}>Batal</Button>
            <Button onClick={() => markReceived(receiveOrder)} disabled={saving}>{saving ? "Memproses..." : "Konfirmasi Diterima"}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
