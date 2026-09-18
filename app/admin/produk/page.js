"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { formatRupiah, formatNumber } from "@/lib/format";
import { Button, Card, Input, PriceInput, Modal, Select, Toggle, EmptyState, Badge } from "@/components/ui/kit";
import { Trash2 } from "lucide-react";
import { useBarcodeScan } from "@/lib/useBarcodeScan";
import { findBarcodeConflict } from "@/lib/checkBarcodeOwner";
import { useViewport } from "@/lib/useViewport";
import { getBranchStock } from "@/lib/branchStock";
import CameraScanButton from "@/components/CameraScanButton";
import { matchesProductQuery } from "@/lib/search";

const emptyForm = {
  id: null,
  name: "",
  sku: "",
  unit_type: "unit",
  unit_label: "",
  cost_price: "",
  sell_price: "",
  stock_qty: "",
  min_stock: "",
  tax_rate: "",
  active: true,
  wholesale_qty: "",
  wholesale_price: "",
  wholesale_cost_price: "",
  half_wholesale_qty: "",
  half_wholesale_price: "",
  half_wholesale_cost_price: "",
  cost_per_kg: "",
  price_per_kg: "",
  cost_per_half_kg: "",
  price_per_half_kg: "",
  cost_per_ons: "",
  price_per_ons: "",
  out_of_town_price: "",
  out_of_town_label: "Antar Luar Kota",
};

export default function ProdukPage() {
  const supabase = createClient();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeChoiceOpen, setTypeChoiceOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [branches, setBranches] = useState([]);
  const [activeBranch, setActiveBranch] = useState("");
  // Daftar "Satuan Barang" (PCS, DUS, LUSIN, dll) yang bisa ditambah/dihapus
  // sendiri oleh admin langsung dari form produk -- lihat SatuanField di bawah.
  const [units, setUnits] = useState([]);
  const [addingUnit, setAddingUnit] = useState(false);
  const [newUnitName, setNewUnitName] = useState("");
  // Daftar "Label Harga Khusus" (Antar Luar Kota / nama promo, dll) yang
  // pernah diketik admin -- muncul lagi sebagai pilihan dropdown buat
  // produk lain (lihat savePriceLabel/deletePriceLabel). Harganya sendiri
  // TETAP input angka bebas -- yang di-dropdown cuma labelnya.
  const [priceLabels, setPriceLabels] = useState([]);
  const [addingPriceLabel, setAddingPriceLabel] = useState(false);
  const [newPriceLabel, setNewPriceLabel] = useState("");
  const { isMobile } = useViewport();

  useEffect(() => {
    load();
    supabase.from("branches").select("*").eq("active", true).order("created_at", { ascending: true }).then(({ data }) => {
      setBranches(data || []);
      setActiveBranch((prev) => prev || data?.[0]?.id || "");
    });
    supabase.from("product_units").select("*").order("name", { ascending: true }).then(({ data }) => setUnits(data || []));
    supabase.from("product_price_labels").select("*").order("name", { ascending: true }).then(({ data }) => setPriceLabels(data || []));
  }, []);

  async function saveNewUnit() {
    const name = newUnitName.trim();
    if (!name) return;
    const { data, error } = await supabase.from("product_units").insert({ name }).select().single();
    if (error) {
      if (error.code === "23505") {
        // Sudah ada di daftar (unique constraint) -- tidak perlu dianggap
        // error, langsung pakai saja yang sudah ada.
        setForm((f) => ({ ...f, unit_label: name }));
        setAddingUnit(false);
        setNewUnitName("");
        return;
      }
      toast.error(error.message || "Gagal menambah satuan");
      return;
    }
    setUnits((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setForm((f) => ({ ...f, unit_label: data.name }));
    setAddingUnit(false);
    setNewUnitName("");
    toast.success(`Satuan "${name}" ditambahkan`);
  }

  async function deleteUnit(name) {
    const unit = units.find((u) => u.name === name);
    if (!unit) return;
    if (!confirm(`Hapus "${name}" dari daftar pilihan satuan?\n\nProduk yang sudah memakai label ini tidak akan berubah -- cuma pilihannya yang hilang untuk produk berikutnya.`)) return;
    const { error } = await supabase.from("product_units").delete().eq("id", unit.id);
    if (error) return toast.error(error.message || "Gagal menghapus satuan");
    setUnits((prev) => prev.filter((u) => u.id !== unit.id));
    setForm((f) => (f.unit_label === name ? { ...f, unit_label: "" } : f));
    toast.success(`Satuan "${name}" dihapus dari daftar`);
  }

  async function savePriceLabel() {
    const name = newPriceLabel.trim();
    if (!name) return;
    const { data, error } = await supabase.from("product_price_labels").insert({ name }).select().single();
    if (error) {
      if (error.code === "23505") {
        // Sudah ada di daftar (unique constraint) -- tidak perlu dianggap
        // error, langsung pakai saja yang sudah ada.
        setForm((f) => ({ ...f, out_of_town_label: name }));
        setAddingPriceLabel(false);
        setNewPriceLabel("");
        return;
      }
      toast.error(error.message || "Gagal menambah label");
      return;
    }
    setPriceLabels((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setForm((f) => ({ ...f, out_of_town_label: data.name }));
    setAddingPriceLabel(false);
    setNewPriceLabel("");
    toast.success(`Label "${name}" ditambahkan`);
  }

  async function deletePriceLabel(name) {
    const item = priceLabels.find((l) => l.name === name);
    if (!item) return;
    if (!confirm(`Hapus "${name}" dari daftar pilihan label?\n\nProduk yang sudah memakai label ini tidak akan berubah -- cuma pilihannya yang hilang untuk produk berikutnya.`)) return;
    const { error } = await supabase.from("product_price_labels").delete().eq("id", item.id);
    if (error) return toast.error(error.message || "Gagal menghapus label");
    setPriceLabels((prev) => prev.filter((l) => l.id !== item.id));
    setForm((f) => (f.out_of_town_label === name ? { ...f, out_of_town_label: "" } : f));
    toast.success(`Label "${name}" dihapus dari daftar`);
  }

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("products")
      .select(
        "*, product_wholesale_pricing(*), product_kg_pricing(*), product_out_of_town_pricing(*), product_barcodes(*), product_branch_stock(*)"
      )
      .order("created_at", { ascending: false });
    setProducts(data || []);
    setLoading(false);
  }

  // Scan barcode global: kalau form sedang terbuka, isi kolom Barcode Utama.
  // Kalau tertutup, pakai untuk langsung mencari produk di daftar.
  useBarcodeScan((code) => {
    if (modalOpen) {
      setForm((f) => ({ ...f, sku: code }));
      toast.success(`Kode "${code}" dimasukkan ke Barcode Utama`, { id: "scan-fill" });
    } else {
      setSearch(code);
    }
  });

  function startAddPcs() {
    setForm({ ...emptyForm, unit_type: "unit" });
    setTypeChoiceOpen(false);
    setModalOpen(true);
  }

  function startAddTimbang() {
    setForm({ ...emptyForm, unit_type: "kg" });
    setTypeChoiceOpen(false);
    setModalOpen(true);
  }

  function openEdit(p) {
    const w = p.product_wholesale_pricing?.[0] || p.product_wholesale_pricing || {};
    const k = p.product_kg_pricing?.[0] || p.product_kg_pricing || {};
    const oot = p.product_out_of_town_pricing?.[0] || p.product_out_of_town_pricing || {};
    const branchStock = getBranchStock(p, activeBranch);
    setForm({
      id: p.id,
      name: p.name,
      sku: p.sku || "",
      unit_type: p.unit_type,
      unit_label: p.unit_label || "",
      cost_price: p.cost_price,
      sell_price: p.sell_price,
      stock_qty: branchStock.stock_qty,
      min_stock: branchStock.min_stock,
      tax_rate: p.tax_rate || "",
      active: p.active,
      wholesale_qty: w.wholesale_qty || "",
      wholesale_price: w.wholesale_price || "",
      wholesale_cost_price: w.wholesale_cost_price || "",
      half_wholesale_qty: w.half_wholesale_qty || "",
      half_wholesale_price: w.half_wholesale_price || "",
      half_wholesale_cost_price: w.half_wholesale_cost_price || "",
      cost_per_kg: k.cost_per_kg || "",
      price_per_kg: k.price_per_kg || "",
      cost_per_half_kg: k.cost_per_half_kg || "",
      price_per_half_kg: k.price_per_half_kg || "",
      cost_per_ons: k.cost_per_ons || "",
      price_per_ons: k.price_per_ons || "",
      out_of_town_price: oot.price || "",
      out_of_town_label: oot.label || "Antar Luar Kota",
    });
    setModalOpen(true);
  }

  async function handleSave() {
    const isKg = form.unit_type === "kg";

    if (!form.name) return toast.error("Nama produk wajib diisi");
    if (!isKg && form.sell_price === "") return toast.error("Harga jual eceran wajib diisi");
    if (isKg && !form.price_per_kg) return toast.error("Harga jual per Kg wajib diisi");

    if (!isKg && Number(form.sell_price) < Number(form.cost_price || 0)) {
      return toast.error("Harga jual eceran tidak boleh lebih rendah dari harga modal (akan rugi)");
    }
    if (form.wholesale_price && form.wholesale_cost_price && Number(form.wholesale_price) < Number(form.wholesale_cost_price)) {
      return toast.error("Harga jual grosir tidak boleh lebih rendah dari harga beli grosir (akan rugi)");
    }
    if (form.half_wholesale_price && form.half_wholesale_cost_price && Number(form.half_wholesale_price) < Number(form.half_wholesale_cost_price)) {
      return toast.error("Harga jual setengah grosir tidak boleh lebih rendah dari harga beli setengah grosir (akan rugi)");
    }
    if (isKg && form.price_per_kg && form.cost_per_kg && Number(form.price_per_kg) < Number(form.cost_per_kg)) {
      return toast.error("Harga jual per Kg tidak boleh lebih rendah dari harga beli per Kg (akan rugi)");
    }

    if (form.name.trim()) {
      const nameTrimmed = form.name.trim();
      let nameQuery = supabase.from("products").select("id, name").ilike("name", nameTrimmed);
      if (form.id) nameQuery = nameQuery.neq("id", form.id);
      const { data: nameMatches } = await nameQuery;
      if (nameMatches && nameMatches.length > 0) {
        return toast.error(`Nama produk "${nameTrimmed}" sudah dipakai oleh produk lain. Gunakan nama lain, atau edit produk yang sudah ada.`);
      }
    }

    if (form.sku) {
      const conflict = await findBarcodeConflict(supabase, form.sku, { excludeProductId: form.id });
      if (conflict) {
        return toast.error(`Barcode "${form.sku}" sudah dipakai oleh produk "${conflict.name}". Satu barcode hanya untuk satu produk.`);
      }
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name,
        sku: form.sku.trim() || null,
        unit_type: form.unit_type,
        unit_label: form.unit_label || null,
        cost_price: isKg ? Number(form.cost_per_kg) || 0 : Number(form.cost_price) || 0,
        sell_price: isKg ? Number(form.price_per_kg) || 0 : Number(form.sell_price) || 0,
        tax_rate: Math.min(100, Math.max(0, Number(form.tax_rate) || 0)),
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

      // Stok disimpan PER CABANG (product_branch_stock), bukan lagi di tabel
      // products — supaya cabang lain tidak ikut berubah stoknya.
      if (activeBranch) {
        await supabase.from("product_branch_stock").upsert(
          {
            product_id: productId,
            branch_id: activeBranch,
            stock_qty: Number(form.stock_qty) || 0,
            min_stock: Number(form.min_stock) || 0,
          },
          { onConflict: "product_id,branch_id" }
        );
      }

      if (form.unit_type === "unit" && (form.wholesale_qty || form.half_wholesale_qty)) {
        await supabase.from("product_wholesale_pricing").upsert({
          product_id: productId,
          wholesale_qty: Number(form.wholesale_qty) || null,
          wholesale_price: Number(form.wholesale_price) || null,
          wholesale_cost_price: Number(form.wholesale_cost_price) || null,
          half_wholesale_qty: Number(form.half_wholesale_qty) || null,
          half_wholesale_price: Number(form.half_wholesale_price) || null,
          half_wholesale_cost_price: Number(form.half_wholesale_cost_price) || null,
        });
      }

      if (form.unit_type === "kg") {
        await supabase.from("product_kg_pricing").upsert({
          product_id: productId,
          price_per_kg: Number(form.price_per_kg) || null,
          cost_per_kg: Number(form.cost_per_kg) || null,
          price_per_half_kg: Number(form.price_per_half_kg) || null,
          cost_per_half_kg: Number(form.cost_per_half_kg) || null,
          price_per_ons: Number(form.price_per_ons) || null,
          cost_per_ons: Number(form.cost_per_ons) || null,
        });
      }

      if (form.out_of_town_price) {
        await supabase.from("product_out_of_town_pricing").upsert({
          product_id: productId,
          price: Number(form.out_of_town_price),
          label: form.out_of_town_label?.trim() || "Antar Luar Kota",
        });
      } else {
        // Kolomnya dikosongkan lagi di form -- baris lama di database perlu
        // ikut dihapus, kalau tidak, harga lama akan tetap "nyangkut" dan
        // masih dipakai di kasir walau di form sudah kelihatan kosong.
        await supabase.from("product_out_of_town_pricing").delete().eq("product_id", productId);
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
    if (error) {
      if (error.code === "23503") {
        // FK ke transaction_items -- produk ini sudah pernah terjual,
        // menghapusnya akan merusak riwayat transaksi lama. Tawarkan
        // nonaktifkan saja supaya hilang dari kasir tanpa hapus data.
        if (confirm("Produk ini sudah pernah terjual, jadi tidak bisa dihapus (riwayat transaksinya butuh data produk ini tetap ada).\n\nNonaktifkan produk ini saja supaya tidak muncul lagi di kasir?")) {
          const { error: updErr } = await supabase.from("products").update({ active: false }).eq("id", id);
          if (updErr) toast.error(updErr.message);
          else {
            toast.success("Produk dinonaktifkan (bukan dihapus)");
            load();
          }
        }
      } else {
        toast.error(error.message);
      }
    } else {
      toast.success("Produk dihapus");
      load();
    }
  }

  // Kata kunci boleh diketik sebagian & urutannya bebas, mis. "kecap
  // banteng" tetap menemukan "Kecap Asin Banteng" — lihat lib/search.js.
  const filtered = products.filter((p) => matchesProductQuery(p, search));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Produk & Harga</h1>
          <p className="text-sm text-ink-muted">Kelola produk PCS (eceran/grosir/setengah grosir) dan produk timbangan (kiloan).</p>
        </div>
        <Button onClick={() => setTypeChoiceOpen(true)}>+ Tambah Produk</Button>
      </div>

      <div className="flex items-center gap-2 max-w-xs">
        <Input placeholder="Cari produk / barcode..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1" />
        {isMobile && <CameraScanButton onDetected={(code) => setSearch(code)} title="Cari produk pakai kamera" />}
      </div>

      {branches.length > 1 && (
        <Select label="Menampilkan & mengedit stok untuk cabang" value={activeBranch} onChange={(e) => setActiveBranch(e.target.value)} className="max-w-xs">
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
      )}

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
                {filtered.map((p) => {
                  const branchStock = getBranchStock(p, activeBranch);
                  return (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 pr-3">{p.name}</td>
                    <td className="py-2.5 pr-3 text-ink-muted">
                      {p.unit_label ? p.unit_label : (p.unit_type === "kg" ? "Timbangan" : "PCS")}
                    </td>
                    <td className="py-2.5 pr-3 text-right">{formatRupiah(p.sell_price)}{p.unit_type === "kg" ? "/kg" : ""}</td>
                    <td className="py-2.5 pr-3 text-right">
                      {formatNumber(branchStock.stock_qty, 2)}
                      {branchStock.stock_qty <= branchStock.min_stock && (
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {typeChoiceOpen && (
        <Modal title="Tambah Produk — Pilih Jenis" onClose={() => setTypeChoiceOpen(false)}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              onClick={startAddPcs}
              className="rounded-xl border-2 border-border hover:border-primary hover:bg-primary-soft transition p-5 text-center"
            >
              <p className="text-base font-semibold mb-1">Produk PCS</p>
              <p className="text-xs text-ink-muted">Eceran, grosir, setengah grosir</p>
            </button>
            <button
              onClick={startAddTimbang}
              className="rounded-xl border-2 border-border hover:border-primary hover:bg-primary-soft transition p-5 text-center"
            >
              <p className="text-base font-semibold mb-1">Produk Timbang</p>
              <p className="text-xs text-ink-muted">Per Kg, 1/2 Kg, Ons</p>
            </button>
          </div>
        </Modal>
      )}

      {modalOpen && (
        <Modal title={form.id ? "Edit Produk" : form.unit_type === "kg" ? "Tambah Produk Timbang" : "Tambah Produk PCS"} onClose={() => setModalOpen(false)} wide>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input alignRow label="Nama Produk" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} hint="Tidak boleh sama dengan produk lain yang sudah ada." />
              <div className="grid row-span-3 [grid-template-rows:subgrid]">
                <label className="text-sm font-medium mb-1.5 leading-snug self-end">Barcode Utama / SKU</label>
                <div className="flex items-center gap-2 self-start">
                  <input
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                  />
                  {isMobile && <CameraScanButton onDetected={(code) => setForm((f) => ({ ...f, sku: code }))} title="Isi barcode pakai kamera" />}
                </div>
                <p className="text-xs text-ink-muted mt-1 self-start">Dicocokkan saat scan barcode di kasir.</p>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Satuan (opsional — PCS, DUS, LUSIN, dll)</label>
              <div className="flex items-center gap-2">
                <select
                  value={form.unit_label || ""}
                  onChange={(e) => {
                    if (e.target.value === "__new__") setAddingUnit(true);
                    else setForm({ ...form, unit_label: e.target.value });
                  }}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                >
                  <option value="">— Tidak diisi —</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.name}>{u.name}</option>
                  ))}
                  <option value="__new__">+ Tambah satuan baru…</option>
                </select>
                {form.unit_label && (
                  <button
                    type="button"
                    onClick={() => deleteUnit(form.unit_label)}
                    title="Hapus satuan ini dari daftar pilihan"
                    className="shrink-0 rounded-lg border border-border p-2 text-danger hover:bg-danger-soft"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              {addingUnit && (
                <div className="flex items-center gap-2 mt-2">
                  <input
                    autoFocus
                    value={newUnitName}
                    onChange={(e) => setNewUnitName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        saveNewUnit();
                      }
                    }}
                    placeholder="mis. DUS, LUSIN, KARTON"
                    className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <Button variant="outline" onClick={saveNewUnit}>Simpan</Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setAddingUnit(false);
                      setNewUnitName("");
                    }}
                  >
                    Batal
                  </Button>
                </div>
              )}
              <p className="text-xs text-ink-muted mt-1">
                Cuma label tampilan (mis. di struk/label harga) — tidak memengaruhi perhitungan harga atau stok. Sekali
                ditambahkan, satuan ini muncul jadi pilihan buat produk lain juga.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input
                alignRow
                label={`Stok Saat Ini${branches.length > 1 ? ` — ${branches.find((b) => b.id === activeBranch)?.name || ""}` : ""}`}
                type="number"
                value={form.stock_qty}
                onChange={(e) => setForm({ ...form, stock_qty: e.target.value })}
              />
              <Input alignRow label="Stok Minimum (peringatan menipis)" type="number" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} />
              <Input
                alignRow
                label="Pajak/PPN (%) — kosongkan/0 jika tidak kena pajak"
                type="number"
                value={form.tax_rate}
                onChange={(e) => setForm({ ...form, tax_rate: e.target.value })}
              />
            </div>

            {form.unit_type === "unit" ? (
              <>
                <div className="border border-border rounded-xl p-4">
                  <p className="text-sm font-medium mb-3">Harga Eceran</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <PriceInput alignRow label="Harga Beli / Modal (per pcs)"  value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} />
                    <PriceInput alignRow label="Harga Jual Eceran (per pcs)"  value={form.sell_price} onChange={(e) => setForm({ ...form, sell_price: e.target.value })} />
                  </div>
                </div>

                <div className="border border-border rounded-xl p-4">
                  <p className="text-sm font-medium mb-3">Harga Grosir</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Input alignRow label="Isi per Grosir (pcs)" type="number" value={form.wholesale_qty} onChange={(e) => setForm({ ...form, wholesale_qty: e.target.value })} />
                    <PriceInput alignRow label="Harga Beli Grosir (per paket)"  value={form.wholesale_cost_price} onChange={(e) => setForm({ ...form, wholesale_cost_price: e.target.value })} />
                    <PriceInput alignRow label="Harga Jual Grosir (per paket)"  value={form.wholesale_price} onChange={(e) => setForm({ ...form, wholesale_price: e.target.value })} />
                  </div>
                </div>

                <div className="border border-border rounded-xl p-4">
                  <p className="text-sm font-medium mb-3">Harga Setengah Grosir</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Input alignRow label="Isi per Setengah Grosir (pcs)" type="number" value={form.half_wholesale_qty} onChange={(e) => setForm({ ...form, half_wholesale_qty: e.target.value })} />
                    <PriceInput alignRow label="Harga Beli 1/2 Grosir (per paket)"  value={form.half_wholesale_cost_price} onChange={(e) => setForm({ ...form, half_wholesale_cost_price: e.target.value })} />
                    <PriceInput alignRow label="Harga Jual 1/2 Grosir (per paket)"  value={form.half_wholesale_price} onChange={(e) => setForm({ ...form, half_wholesale_price: e.target.value })} />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="border border-border rounded-xl p-4">
                  <p className="text-sm font-medium mb-3">Harga per Kg</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <PriceInput alignRow label="Harga Beli per Kg"  value={form.cost_per_kg} onChange={(e) => setForm({ ...form, cost_per_kg: e.target.value })} />
                    <PriceInput alignRow label="Harga Jual per Kg"  value={form.price_per_kg} onChange={(e) => setForm({ ...form, price_per_kg: e.target.value })} />
                  </div>
                </div>
                <div className="border border-border rounded-xl p-4">
                  <p className="text-sm font-medium mb-3">Harga per 1/2 Kg</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <PriceInput alignRow label="Harga Beli per 1/2 Kg"  value={form.cost_per_half_kg} onChange={(e) => setForm({ ...form, cost_per_half_kg: e.target.value })} />
                    <PriceInput alignRow label="Harga Jual per 1/2 Kg"  value={form.price_per_half_kg} onChange={(e) => setForm({ ...form, price_per_half_kg: e.target.value })} />
                  </div>
                </div>
                <div className="border border-border rounded-xl p-4">
                  <p className="text-sm font-medium mb-3">Harga per Ons (peronan)</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <PriceInput alignRow label="Harga Beli per Ons"  value={form.cost_per_ons} onChange={(e) => setForm({ ...form, cost_per_ons: e.target.value })} />
                    <PriceInput alignRow label="Harga Jual per Ons"  value={form.price_per_ons} onChange={(e) => setForm({ ...form, price_per_ons: e.target.value })} />
                  </div>
                </div>
              </>
            )}

            <div className="border border-border rounded-xl p-4 space-y-3">
              <p className="text-sm font-medium">Harga Khusus (Antar Luar Kota / Promo, dll — opsional)</p>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Label</label>
                <div className="flex items-center gap-2">
                  <select
                    value={form.out_of_town_label || ""}
                    onChange={(e) => {
                      if (e.target.value === "__new__") setAddingPriceLabel(true);
                      else setForm({ ...form, out_of_town_label: e.target.value });
                    }}
                    className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                  >
                    <option value="">— Pilih label —</option>
                    {form.out_of_town_label && !priceLabels.some((l) => l.name === form.out_of_town_label) && (
                      <option value={form.out_of_town_label}>{form.out_of_town_label}</option>
                    )}
                    {priceLabels.map((l) => (
                      <option key={l.id} value={l.name}>{l.name}</option>
                    ))}
                    <option value="__new__">+ Tambah label baru…</option>
                  </select>
                  {form.out_of_town_label && (
                    <button
                      type="button"
                      onClick={() => deletePriceLabel(form.out_of_town_label)}
                      title="Hapus label ini dari daftar pilihan"
                      className="shrink-0 rounded-lg border border-border p-2 text-danger hover:bg-danger-soft"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                {addingPriceLabel && (
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      autoFocus
                      value={newPriceLabel}
                      onChange={(e) => setNewPriceLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          savePriceLabel();
                        }
                      }}
                      placeholder="mis. Promo Lebaran, Antar Luar Kota"
                      className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <Button variant="outline" onClick={savePriceLabel}>Simpan</Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setAddingPriceLabel(false);
                        setNewPriceLabel("");
                      }}
                    >
                      Batal
                    </Button>
                  </div>
                )}
                <p className="text-xs text-ink-muted mt-1">
                  Pilih label yang pernah dipakai, atau tambah baru -- sekali ditambahkan, label ini muncul jadi
                  pilihan buat produk lain juga. Cocok dipakai buat harga permanen (mis. "Antar Luar Kota") maupun
                  harga promo sementara (mis. "Promo Lebaran").
                </p>
              </div>

              <PriceInput
                label="Harga"
                value={form.out_of_town_price}
                onChange={(e) => setForm({ ...form, out_of_town_price: e.target.value })}
              />
              <p className="text-xs text-ink-muted">
                Kosongkan kolom Harga lalu Simpan untuk menghapus label & harga khusus ini dari produk (mis. kalau
                promonya sudah habis) -- produknya sendiri tidak ikut terhapus.
              </p>
            </div>

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
