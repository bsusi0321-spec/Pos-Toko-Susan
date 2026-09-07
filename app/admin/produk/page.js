"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { formatRupiah, formatNumber } from "@/lib/format";
import { Button, Card, Input, Modal, Select, Toggle, EmptyState, Badge } from "@/components/ui/kit";

const emptyForm = {
  id: null,
  name: "",
  sku: "",
  unit_type: "unit",
  cost_price: "",
  sell_price: "",
  stock_qty: "",
  min_stock: "",
  active: true,
  wholesale_qty: "",
  wholesale_price: "",
  half_wholesale_qty: "",
  half_wholesale_price: "",
  price_per_kg: "",
  price_per_half_kg: "",
  price_per_ons: "",
  out_of_town_price: "",
};

export default function ProdukPage() {
  const supabase = createClient();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("products")
      .select(
        "*, product_wholesale_pricing(*), product_kg_pricing(*), product_out_of_town_pricing(*)"
      )
      .order("created_at", { ascending: false });
    setProducts(data || []);
    setLoading(false);
  }

  function openNew() {
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(p) {
    const w = p.product_wholesale_pricing?.[0] || p.product_wholesale_pricing || {};
    const k = p.product_kg_pricing?.[0] || p.product_kg_pricing || {};
    const oot = p.product_out_of_town_pricing?.[0] || p.product_out_of_town_pricing || {};
    setForm({
      id: p.id,
      name: p.name,
      sku: p.sku || "",
      unit_type: p.unit_type,
      cost_price: p.cost_price,
      sell_price: p.sell_price,
      stock_qty: p.stock_qty,
      min_stock: p.min_stock,
      active: p.active,
      wholesale_qty: w.wholesale_qty || "",
      wholesale_price: w.wholesale_price || "",
      half_wholesale_qty: w.half_wholesale_qty || "",
      half_wholesale_price: w.half_wholesale_price || "",
      price_per_kg: k.price_per_kg || "",
      price_per_half_kg: k.price_per_half_kg || "",
      price_per_ons: k.price_per_ons || "",
      out_of_town_price: oot.price || "",
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.name || form.sell_price === "") {
      toast.error("Nama dan harga jual wajib diisi");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        sku: form.sku || null,
        unit_type: form.unit_type,
        cost_price: Number(form.cost_price) || 0,
        sell_price: Number(form.sell_price) || 0,
        stock_qty: Number(form.stock_qty) || 0,
        min_stock: Number(form.min_stock) || 0,
        active: form.active,
      };

      let productId = form.id;
      if (productId) {
        const { error } = await supabase.from("products").update(payload).eq("id", productId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("products").insert(payload).select().single();
        if (error) throw error;
        productId = data.id;
      }

      if (form.unit_type === "unit" && (form.wholesale_qty || form.half_wholesale_qty)) {
        await supabase.from("product_wholesale_pricing").upsert({
          product_id: productId,
          wholesale_qty: Number(form.wholesale_qty) || null,
          wholesale_price: Number(form.wholesale_price) || null,
          half_wholesale_qty: Number(form.half_wholesale_qty) || null,
          half_wholesale_price: Number(form.half_wholesale_price) || null,
        });
      }

      if (form.unit_type === "kg" && (form.price_per_kg || form.price_per_half_kg || form.price_per_ons)) {
        await supabase.from("product_kg_pricing").upsert({
          product_id: productId,
          price_per_kg: Number(form.price_per_kg) || null,
          price_per_half_kg: Number(form.price_per_half_kg) || null,
          price_per_ons: Number(form.price_per_ons) || null,
        });
      }

      if (form.out_of_town_price) {
        await supabase.from("product_out_of_town_pricing").upsert({
          product_id: productId,
          price: Number(form.out_of_town_price),
        });
      }

      toast.success("Produk disimpan");
      setModalOpen(false);
      load();
    } catch (err) {
      toast.error(err.message || "Gagal menyimpan produk");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Hapus produk ini?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Produk dihapus");
      load();
    }
  }

  const filtered = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Produk & Harga</h1>
          <p className="text-sm text-ink-muted">Kelola produk umum (grosir/setengah grosir), kiloan, dan harga antar luar kota.</p>
        </div>
        <Button onClick={openNew}>+ Tambah Produk</Button>
      </div>

      <Input placeholder="Cari produk..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />

      <Card>
        {loading ? (
          <p className="text-sm text-ink-muted">Memuat...</p>
        ) : filtered.length === 0 ? (
          <EmptyState text="Belum ada produk." />
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-ink-muted border-b border-border">
                <tr>
                  <th className="text-left py-2 pr-3 font-medium">Nama</th>
                  <th className="text-left py-2 pr-3 font-medium">Tipe</th>
                  <th className="text-right py-2 pr-3 font-medium">Harga Jual</th>
                  <th className="text-right py-2 pr-3 font-medium">Stok</th>
                  <th className="text-left py-2 pr-3 font-medium">Status</th>
                  <th className="text-right py-2 font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 pr-3">{p.name}</td>
                    <td className="py-2.5 pr-3 text-ink-muted">{p.unit_type === "kg" ? "Kiloan" : "Satuan"}</td>
                    <td className="py-2.5 pr-3 text-right">{formatRupiah(p.sell_price)}</td>
                    <td className="py-2.5 pr-3 text-right">
                      {formatNumber(p.stock_qty, 2)}
                      {Number(p.stock_qty) <= Number(p.min_stock) && (
                        <Badge tone="danger" className="ml-2">Menipis</Badge>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      <Badge tone={p.active ? "primary" : "default"}>{p.active ? "Aktif" : "Nonaktif"}</Badge>
                    </td>
                    <td className="py-2.5 text-right space-x-2">
                      <Button variant="ghost" onClick={() => openEdit(p)}>Edit</Button>
                      <Button variant="danger" onClick={() => handleDelete(p.id)}>Hapus</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modalOpen && (
        <Modal title={form.id ? "Edit Produk" : "Tambah Produk"} onClose={() => setModalOpen(false)} wide>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Nama Produk" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Input label="SKU / Kode (opsional)" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </div>

            <Select label="Tipe Produk" value={form.unit_type} onChange={(e) => setForm({ ...form, unit_type: e.target.value })}>
              <option value="unit">Produk Umum (satuan / grosir)</option>
              <option value="kg">Produk Berat / Kiloan</option>
            </Select>

            <div className="grid grid-cols-3 gap-3">
              <Input label="Harga Modal" type="number" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} />
              <Input label="Harga Jual Eceran" type="number" value={form.sell_price} onChange={(e) => setForm({ ...form, sell_price: e.target.value })} />
              <Input label="Stok Saat Ini" type="number" value={form.stock_qty} onChange={(e) => setForm({ ...form, stock_qty: e.target.value })} />
            </div>
            <Input label="Stok Minimum (peringatan menipis)" type="number" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} className="max-w-xs" />

            {form.unit_type === "unit" && (
              <div className="border border-border rounded-xl p-4">
                <p className="text-sm font-medium mb-3">Harga Grosir & Setengah Grosir</p>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Isi per Grosir (pcs)" type="number" value={form.wholesale_qty} onChange={(e) => setForm({ ...form, wholesale_qty: e.target.value })} />
                  <Input label="Harga Jual Grosir" type="number" value={form.wholesale_price} onChange={(e) => setForm({ ...form, wholesale_price: e.target.value })} />
                  <Input label="Isi per Setengah Grosir (pcs)" type="number" value={form.half_wholesale_qty} onChange={(e) => setForm({ ...form, half_wholesale_qty: e.target.value })} />
                  <Input label="Harga Jual Setengah Grosir" type="number" value={form.half_wholesale_price} onChange={(e) => setForm({ ...form, half_wholesale_price: e.target.value })} />
                </div>
              </div>
            )}

            {form.unit_type === "kg" && (
              <div className="border border-border rounded-xl p-4">
                <p className="text-sm font-medium mb-3">Harga per Kg / Setengah Kg / Ons</p>
                <div className="grid grid-cols-3 gap-3">
                  <Input label="Harga per Kg" type="number" value={form.price_per_kg} onChange={(e) => setForm({ ...form, price_per_kg: e.target.value })} />
                  <Input label="Harga per 1/2 Kg" type="number" value={form.price_per_half_kg} onChange={(e) => setForm({ ...form, price_per_half_kg: e.target.value })} />
                  <Input label="Harga per Ons (peronan)" type="number" value={form.price_per_ons} onChange={(e) => setForm({ ...form, price_per_ons: e.target.value })} />
                </div>
              </div>
            )}

            <Input
              label="Harga Antar Luar Kota (opsional — harga khusus barang ini, bukan biaya kirim)"
              type="number"
              value={form.out_of_town_price}
              onChange={(e) => setForm({ ...form, out_of_town_price: e.target.value })}
            />

            <Toggle checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label="Produk aktif (tampil di kasir)" />

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
