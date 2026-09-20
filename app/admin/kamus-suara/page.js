"use client";

// Halaman khusus admin untuk mengelola "kamus" singkatan yang dipakai suara
// kasir (Text-to-Speech) saat scan/pilih barang. Nama produk yang tersimpan
// di halaman Produk & Harga TIDAK diubah sama sekali oleh halaman ini --
// kamus ini cuma dipakai untuk "menerjemahkan" teks sesaat sebelum dibacakan
// di layar Kasir (lihat lib/voiceDictionary.js).
//
// Cara kerja pencocokannya: nama produk dipecah per kata, tiap kata dicek ke
// kamus ini (tidak peduli huruf besar/kecil). Kalau ada ANGKA nempel
// langsung di depan singkatannya (mis. "1500ML"), angkanya dipisah otomatis
// jadi "1500 mili liter" -- tidak perlu didaftarkan satu-satu per angka.

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Input, Modal, EmptyState } from "@/components/ui/kit";

const empty = { id: null, abbreviation: "", spoken_as: "" };

export default function KamusSuaraPage() {
  const supabase = createClient();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("voice_dictionary").select("*").order("abbreviation", { ascending: true });
    setRows(data || []);
    setLoading(false);
  }

  async function save() {
    const abbreviation = form.abbreviation.trim().toUpperCase();
    const spoken_as = form.spoken_as.trim();
    if (!abbreviation) return toast.error("Singkatan wajib diisi");
    if (!spoken_as) return toast.error('Kolom "Dibaca Sebagai" wajib diisi');
    setSaving(true);
    try {
      if (form.id) {
        const { error } = await supabase.from("voice_dictionary").update({ abbreviation, spoken_as }).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("voice_dictionary").insert({ abbreviation, spoken_as });
        if (error) throw error;
      }
      toast.success("Kamus suara disimpan");
      setModalOpen(false);
      load();
    } catch (err) {
      toast.error(err.code === "23505" ? `Singkatan "${abbreviation}" sudah ada di daftar` : err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id, abbreviation) {
    if (!confirm(`Hapus singkatan "${abbreviation}" dari kamus suara?`)) return;
    const { error } = await supabase.from("voice_dictionary").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Dihapus");
    load();
  }

  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return r.abbreviation.toLowerCase().includes(q) || r.spoken_as.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold">Kamus Suara</h1>
          <p className="text-sm text-ink-muted">
            Singkatan di nama produk (mis. SCHT, ML, KG) yang dibacakan salah oleh suara kasir. Nama produk di halaman
            Produk & Harga tidak berubah -- kamus ini cuma dipakai saat dibacakan di layar Kasir.
          </p>
        </div>
        <Button onClick={() => { setForm(empty); setModalOpen(true); }}>+ Tambah Singkatan</Button>
      </div>

      <Card>
        <p className="text-xs text-ink-muted mb-3">
          Contoh: singkatan <b>SCHT</b> dibaca sebagai <b>saset</b> -- maka "Indomie Goreng SCHT" akan dibacakan
          "Indomie Goreng saset". Kalau ada angka nempel langsung di depan singkatannya (mis. "1500ML", "5KG"),
          otomatis dibacakan "1500 mili liter", "5 kilogram" tanpa perlu didaftarkan satu-satu per angka. Huruf
          besar/kecil tidak masalah (SCHT sama dengan scht).
        </p>
        <Input
          placeholder="Cari singkatan..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-3 max-w-xs"
        />
        {loading ? (
          <p className="text-sm text-ink-muted">Memuat...</p>
        ) : filtered.length === 0 ? (
          <EmptyState text={rows.length === 0 ? "Belum ada singkatan di kamus." : "Tidak ada yang cocok dicari."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-muted border-b border-border">
                  <th className="px-3 py-2 font-medium">Singkatan</th>
                  <th className="px-3 py-2 font-medium">Dibaca Sebagai</th>
                  <th className="px-3 py-2 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-background">
                    <td className="px-3 py-2 font-mono font-medium">{r.abbreviation}</td>
                    <td className="px-3 py-2">{r.spoken_as}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">
                        <Button variant="outline" onClick={() => { setForm(r); setModalOpen(true); }}>Edit</Button>
                        <button
                          onClick={() => remove(r.id, r.abbreviation)}
                          title="Hapus"
                          className="rounded-lg border border-border px-2.5 py-1.5 text-danger hover:bg-danger/10"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modalOpen && (
        <Modal title={form.id ? "Edit Singkatan" : "Singkatan Baru"} onClose={() => setModalOpen(false)}>
          <div className="space-y-3">
            <Input
              label="Singkatan"
              placeholder="SCHT"
              value={form.abbreviation}
              onChange={(e) => setForm({ ...form, abbreviation: e.target.value })}
            />
            <Input
              label="Dibaca Sebagai"
              placeholder="saset"
              value={form.spoken_as}
              onChange={(e) => setForm({ ...form, spoken_as: e.target.value })}
            />
            <p className="text-xs text-ink-muted">
              Tulis "Dibaca Sebagai" dengan ejaan yang bunyinya paling pas kalau dibaca suara Indonesia -- tidak harus
              kata baku, mis. "saset" (bukan "sachet") supaya bunyinya benar.
            </p>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
