"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Input, Select, EmptyState } from "@/components/ui/kit";

export default function KasirShortcutPage() {
  const supabase = createClient();
  const [shortcuts, setShortcuts] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [productId, setProductId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [{ data: sc }, { data: p }] = await Promise.all([
      supabase.from("cashier_shortcuts").select("*, products(name)").order("sort_order"),
      supabase.from("products").select("id, name, sell_price").eq("active", true).order("name"),
    ]);
    setShortcuts(sc || []);
    setProducts(p || []);
    setLoading(false);
  }

  async function addShortcut() {
    if (!label || !productId) return toast.error("Isi nama tombol dan pilih barang");
    setSaving(true);
    try {
      await supabase.from("cashier_shortcuts").insert({
        label,
        product_id: productId,
        sort_order: shortcuts.length,
      });
      toast.success("Shortcut ditambahkan");
      setLabel("");
      setProductId("");
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeShortcut(id) {
    if (!confirm("Hapus shortcut ini?")) return;
    await supabase.from("cashier_shortcuts").delete().eq("id", id);
    load();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Tampilan Kasir & Shortcut</h1>
        <p className="text-sm text-ink-muted">
          Atur tombol pintasan (shortcut) yang tampil di sidebar halaman kasir. Kasir hanya melihat sidebar ini dan keranjang belanja.
        </p>
      </div>

      <Card title="Tambah Shortcut">
        <div className="grid sm:grid-cols-3 gap-3">
          <Input label="Nama Tombol" placeholder="mis. Gula 1kg" value={label} onChange={(e) => setLabel(e.target.value)} />
          <Select label="Barang" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">-- pilih barang --</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <div className="flex items-end">
            <Button onClick={addShortcut} disabled={saving} className="w-full">{saving ? "Menyimpan..." : "+ Tambah"}</Button>
          </div>
        </div>
      </Card>

      <Card title="Daftar Shortcut Aktif">
        {loading ? <p className="text-sm text-ink-muted">Memuat...</p> : shortcuts.length === 0 ? (
          <EmptyState text="Belum ada shortcut. Tambahkan di atas." />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {shortcuts.map((s) => (
              <div key={s.id} className="border border-border rounded-lg px-3 py-2.5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{s.label}</p>
                  <p className="text-xs text-ink-muted">{s.products?.name}</p>
                </div>
                <button onClick={() => removeShortcut(s.id)} className="text-xs text-danger hover:underline">Hapus</button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
