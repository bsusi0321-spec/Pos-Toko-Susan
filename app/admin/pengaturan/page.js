"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Input, Select, Textarea } from "@/components/ui/kit";

export default function PengaturanPage() {
  const supabase = createClient();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data } = await supabase.from("store_settings").select("*").eq("id", 1).single();
    setForm(data);
  }

  async function save() {
    setSaving(true);
    try {
      const { id, updated_at, ...payload } = form;
      const { error } = await supabase.from("store_settings").update(payload).eq("id", 1);
      if (error) throw error;
      toast.success("Pengaturan disimpan");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!form) return <p className="text-sm text-ink-muted">Memuat...</p>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Pengaturan Toko</h1>
        <p className="text-sm text-ink-muted">Identitas toko untuk struk, modal awal laci, tema aplikasi, dan tampilan halaman login.</p>
      </div>

      <Card title="Identitas Toko">
        <div className="grid sm:grid-cols-2 gap-3">
          <Input label="Nama Toko" value={form.store_name || ""} onChange={(e) => setForm({ ...form, store_name: e.target.value })} />
          <Input label="Telepon Toko" value={form.store_phone || ""} onChange={(e) => setForm({ ...form, store_phone: e.target.value })} />
        </div>
        <Textarea label="Alamat Toko" value={form.store_address || ""} onChange={(e) => setForm({ ...form, store_address: e.target.value })} rows={2} className="mt-3" />
        <Textarea label="Catatan Kaki Struk" value={form.receipt_footer || ""} onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })} rows={2} className="mt-3" />
      </Card>

      <Card title="Tema Aplikasi">
        <Select label="Mode Tampilan Default" value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })} className="max-w-xs">
          <option value="light">Terang</option>
          <option value="dark">Gelap</option>
        </Select>
      </Card>

      <Card title="Tampilan Halaman Login">
        <div className="grid sm:grid-cols-2 gap-3">
          <Input label="Judul Halaman Login" value={form.login_title || ""} onChange={(e) => setForm({ ...form, login_title: e.target.value })} />
          <Input label="URL Gambar Latar" placeholder="https://..." value={form.login_bg_url || ""} onChange={(e) => setForm({ ...form, login_bg_url: e.target.value })} />
          <Input label="Nama Font (font-family)" placeholder="mis. Inter, Poppins" value={form.login_font_family || ""} onChange={(e) => setForm({ ...form, login_font_family: e.target.value })} />
          <Input label="Ketebalan Font (font-weight)" placeholder="mis. 400, 600, 700" value={form.login_font_weight || ""} onChange={(e) => setForm({ ...form, login_font_weight: e.target.value })} />
          <div>
            <label className="block text-sm font-medium mb-1.5">Warna Judul</label>
            <input type="color" value={form.login_font_color || "#111827"} onChange={(e) => setForm({ ...form, login_font_color: e.target.value })} className="h-10 w-full rounded-lg border border-border" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Warna Aksen Tombol</label>
            <input type="color" value={form.login_accent_color || "#2563eb"} onChange={(e) => setForm({ ...form, login_accent_color: e.target.value })} className="h-10 w-full rounded-lg border border-border" />
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>{saving ? "Menyimpan..." : "Simpan Pengaturan"}</Button>
      </div>
    </div>
  );
}
