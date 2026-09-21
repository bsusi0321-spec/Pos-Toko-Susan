"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Input, Select, Textarea, Toggle } from "@/components/ui/kit";
import ImageUploadField from "@/components/ui/ImageUploadField";
import { LOGIN_FONTS, LOGIN_FONT_WEIGHTS } from "@/lib/loginFonts";
import PrinterBluetoothControl from "@/components/PrinterBluetoothControl";
import PrinterUsbControl from "@/components/PrinterUsbControl";

function NotifTestButtons() {
  const [loading, setLoading] = useState(null);

  async function test(kind) {
    setLoading(kind);
    try {
      const res = await fetch(`/api/notify/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengirim");
      if (data.sent) toast.success(data.message || "Terkirim! Cek Telegram Anda.");
      else toast(data.message || "Tidak ada yang dikirim");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => test("low-stock")} disabled={loading !== null}>
        {loading === "low-stock" ? "Mengirim..." : "Tes Kirim: Stok Menipis"}
      </Button>
      <Button variant="outline" onClick={() => test("daily-report")} disabled={loading !== null}>
        {loading === "daily-report" ? "Mengirim..." : "Tes Kirim: Laporan Harian"}
      </Button>
      <p className="w-full text-xs text-ink-muted mt-1">Simpan pengaturan di atas dulu sebelum menekan tombol tes.</p>
    </div>
  );
}

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

  const bgType = form.login_bg_type || "color";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Pengaturan Toko</h1>
        <p className="text-sm text-ink-muted">Identitas toko untuk struk, modal awal laci, tema aplikasi, tampilan halaman login, dan info pembayaran.</p>
      </div>

      <Card title="Identitas Toko">
        <div className="grid sm:grid-cols-2 gap-3">
          <Input label="Nama Toko" value={form.store_name || ""} onChange={(e) => setForm({ ...form, store_name: e.target.value })} />
          <Input label="Telepon Toko" value={form.store_phone || ""} onChange={(e) => setForm({ ...form, store_phone: e.target.value })} />
        </div>
        <Textarea label="Alamat Toko" value={form.store_address || ""} onChange={(e) => setForm({ ...form, store_address: e.target.value })} rows={2} className="mt-3" />
        <Textarea label="Catatan Kaki Struk" value={form.receipt_footer || ""} onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })} rows={2} className="mt-3" />
        <ImageUploadField
          label="Ikon Aplikasi"
          folder="app-icon"
          value={form.app_icon_url || ""}
          onChange={(url) => setForm({ ...form, app_icon_url: url })}
          hint="Ikon yang muncul saat aplikasi dipasang/diinstal ke HP. Gunakan gambar persegi (disarankan 512x512px), latar mengisi penuh sampai tepi. Kosongkan untuk pakai ikon bawaan."
          className="mt-3"
        />
      </Card>

      <Card title="Pengaturan Struk">
        <p className="text-xs text-ink-muted mb-3">
          Sambungkan printer struk di sini SEKALI SAJA (Bluetooth atau USB, boleh dua-duanya sekaligus kalau perlu) --
          setelah tersambung, printernya akan diingat dan otomatis nyambung lagi sendiri setiap aplikasi dibuka (tidak
          perlu disambungkan ulang tiap transaksi atau tiap ganti halaman), dan hanya akan berhenti kalau tombol
          &quot;Putuskan Printer&quot; ditekan. Setelah tersambung, di halaman kasir tombol cetaknya akan langsung
          mengirim struk ke printer ini tanpa dialog cetak apa pun. <strong>Catatan:</strong> koneksi ini melekat ke
          perangkat/browser yang dipakai menyambungkan, jadi kalau kasir mencetak dari HP/tablet/laptop yang berbeda
          dengan yang dipakai di sini, printernya perlu disambungkan lagi dari perangkat kasir itu sendiri (tersedia
          juga di menu sidebar halaman Kasir) -- ini normal, bukan error, dan tidak masalah kalau ada beberapa kasir
          sekaligus menyambungkan printer yang sama dari perangkat masing-masing.
        </p>
        <div className="mb-3 rounded-xl border border-border p-3">
          <PrinterBluetoothControl />
        </div>
        <div className="mb-4 rounded-xl border border-border p-3">
          <PrinterUsbControl />
        </div>
        <Select
          label="Ukuran Kertas Printer"
          value={form.receipt_paper_size || "58mm"}
          onChange={(e) => setForm({ ...form, receipt_paper_size: e.target.value })}
          className="max-w-xs mb-4"
        >
          <option value="58mm">58mm</option>
          <option value="80mm">80mm</option>
        </Select>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
          <Toggle
            checked={form.receipt_show_cashier !== false}
            onChange={(v) => setForm({ ...form, receipt_show_cashier: v })}
            label="Tampilkan nama kasir"
          />
          <Toggle
            checked={form.receipt_show_customer !== false}
            onChange={(v) => setForm({ ...form, receipt_show_customer: v })}
            label="Tampilkan nama pelanggan"
          />
          <Toggle
            checked={form.receipt_show_address !== false}
            onChange={(v) => setForm({ ...form, receipt_show_address: v })}
            label="Tampilkan alamat toko"
          />
          <Toggle
            checked={form.receipt_show_phone !== false}
            onChange={(v) => setForm({ ...form, receipt_show_phone: v })}
            label="Tampilkan telepon toko"
          />
        </div>
      </Card>

      <Card title="Info Pembayaran (Transfer & QRIS Manual)">
        <p className="text-xs text-ink-muted mb-3">
          Ditampilkan ke kasir saat memilih metode Transfer atau QRIS di layar pembayaran,
          supaya kasir bisa memberi tahu nomor rekening / menunjukkan QRIS ke pembeli.
        </p>
        <Textarea
          label="Info Rekening Transfer"
          placeholder={"BCA 1234567890 a.n. Toko Susan"}
          value={form.bank_transfer_info || ""}
          onChange={(e) => setForm({ ...form, bank_transfer_info: e.target.value })}
          rows={2}
        />
        <ImageUploadField
          label="Gambar QRIS (opsional)"
          folder="qris"
          value={form.qris_image_url || ""}
          onChange={(url) => setForm({ ...form, qris_image_url: url })}
          hint="Upload foto/screenshot QRIS toko dari bank/merchant Anda, atau tempel link gambar manual."
          className="mt-3"
        />
      </Card>

      <Card title="Pajak / PPN">
        <p className="text-xs text-ink-muted mb-3">
          Tarif pajak diatur PER PRODUK di halaman Produk & Harga (0% = produk itu tidak kena pajak).
          Di sini hanya mengatur label & cara hitungnya.
        </p>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <Input label="Label Pajak di Struk" placeholder="PPN" value={form.tax_label || ""} onChange={(e) => setForm({ ...form, tax_label: e.target.value })} />
        </div>
        <Toggle
          checked={!!form.tax_price_inclusive}
          onChange={(v) => setForm({ ...form, tax_price_inclusive: v })}
          label="Harga jual sudah termasuk pajak (pajak cuma dipisah di struk, tidak menambah total bayar)"
        />
      </Card>

      <Card title="Notifikasi Otomatis (Telegram)">
        <p className="text-xs text-ink-muted mb-3">
          Kirim notifikasi stok menipis & ringkasan penjualan harian otomatis ke Telegram (gratis, tanpa
          verifikasi bisnis seperti WhatsApp Business API). Cara ambil Bot Token & Chat ID: chat{" "}
          <span className="font-medium">@BotFather</span> di Telegram untuk buat bot & dapat token, lalu chat{" "}
          <span className="font-medium">@userinfobot</span> untuk tahu Chat ID Anda (atau ID grup kalau notifikasi
          mau masuk ke grup toko).
        </p>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <Input
            label="Telegram Bot Token"
            placeholder="123456:ABC-DEF..."
            value={form.telegram_bot_token || ""}
            onChange={(e) => setForm({ ...form, telegram_bot_token: e.target.value })}
          />
          <Input
            label="Telegram Chat ID"
            placeholder="123456789"
            value={form.telegram_chat_id || ""}
            onChange={(e) => setForm({ ...form, telegram_chat_id: e.target.value })}
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 mb-4">
          <Toggle
            checked={!!form.notif_low_stock_enabled}
            onChange={(v) => setForm({ ...form, notif_low_stock_enabled: v })}
            label="Kirim notifikasi saat stok barang menipis"
          />
          <Toggle
            checked={!!form.notif_daily_report_enabled}
            onChange={(v) => setForm({ ...form, notif_daily_report_enabled: v })}
            label="Kirim ringkasan penjualan tiap hari (±21:00 WIB)"
          />
        </div>
        <NotifTestButtons />
      </Card>

      <Card title="Tema Aplikasi">
        <Select label="Mode Tampilan Default" value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })} className="max-w-xs">
          <option value="light">Terang</option>
          <option value="dark">Gelap</option>
        </Select>
      </Card>

      <Card title="Tampilan Halaman Login">
        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <Input label="Judul Halaman Login" value={form.login_title || ""} onChange={(e) => setForm({ ...form, login_title: e.target.value })} />
          <Select label="Pilihan Font" value={form.login_font_family || "Inter"} onChange={(e) => setForm({ ...form, login_font_family: e.target.value })}>
            {LOGIN_FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </Select>
          <Select label="Ketebalan Font" value={form.login_font_weight || "600"} onChange={(e) => setForm({ ...form, login_font_weight: e.target.value })}>
            {LOGIN_FONT_WEIGHTS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
          </Select>
          <div>
            <label className="text-sm font-medium mb-1.5 leading-snug flex items-end min-h-[2.5rem]">Warna Judul</label>
            <input type="color" value={form.login_font_color || "#111827"} onChange={(e) => setForm({ ...form, login_font_color: e.target.value })} className="h-10 w-full rounded-lg border border-border" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 leading-snug flex items-end min-h-[2.5rem]">Warna Aksen Tombol</label>
            <input type="color" value={form.login_accent_color || "#2563eb"} onChange={(e) => setForm({ ...form, login_accent_color: e.target.value })} className="h-10 w-full rounded-lg border border-border" />
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <Select label="Tipe Latar Belakang" value={bgType} onChange={(e) => setForm({ ...form, login_bg_type: e.target.value })} className="max-w-xs mb-3">
            <option value="color">Warna Gradasi Polos</option>
            <option value="image">Gambar (bisa GIF animasi)</option>
            <option value="video">Video (bergerak, paling "hidup")</option>
            <option value="full_design">Desain Penuh (1 gambar utuh, form menimpa persis di atasnya)</option>
          </Select>

          {bgType === "color" && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1.5">Warna Gradasi Awal</label>
                <input type="color" value={form.login_gradient_from || "#0f6d4f"} onChange={(e) => setForm({ ...form, login_gradient_from: e.target.value })} className="h-10 w-full rounded-lg border border-border" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Warna Gradasi Akhir</label>
                <input type="color" value={form.login_gradient_to || "#0b1f19"} onChange={(e) => setForm({ ...form, login_gradient_to: e.target.value })} className="h-10 w-full rounded-lg border border-border" />
              </div>
            </div>
          )}

          {bgType === "image" && (
            <ImageUploadField
              label="Gambar Latar (mendukung GIF animasi)"
              folder="login-bg"
              accept="image/*"
              maxSizeMB={8}
              value={form.login_bg_url || ""}
              onChange={(url) => setForm({ ...form, login_bg_url: url })}
            />
          )}

          {bgType === "video" && (
            <ImageUploadField
              label="Video Latar (.mp4)"
              folder="login-bg"
              accept="video/mp4"
              maxSizeMB={20}
              isVideo
              value={form.login_bg_video_url || ""}
              onChange={(url) => setForm({ ...form, login_bg_video_url: url })}
              hint="Video akan diputar otomatis, diulang terus, dan tanpa suara — supaya halaman login terasa hidup. Maks. 20MB."
            />
          )}

          {bgType === "full_design" && (
            <ImageUploadField
              label="Gambar Desain Penuh (background + logo + dekorasi jadi 1 gambar)"
              folder="login-bg"
              accept="image/*"
              maxSizeMB={8}
              value={form.login_bg_url || ""}
              onChange={(url) => setForm({ ...form, login_bg_url: url })}
              hint={
                'Mode ini menimpakan kolom Username/Password/tombol Login yang SUNGGUHAN ' +
                'persis di atas kotak-kotak yang sudah digambar di gambar ini (seperti contoh ' +
                'desain "Toko Susan"). Posisi kotaknya sudah dikalibrasi khusus untuk tata letak ' +
                'seperti contoh itu (gambar portrait 1024x1536: logo di atas, lalu 2 kotak putih ' +
                'Username & Password, lalu tombol pil merah "Login", lalu tulisan "Lupa Password?" ' +
                'di bawahnya). Kalau pakai gambar desain lain dengan tata letak berbeda, hubungi ' +
                'developer supaya posisinya disesuaikan ulang (FULL_DESIGN_LAYOUT di app/login/LoginForm.js).'
              }
            />
          )}
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>{saving ? "Menyimpan..." : "Simpan Pengaturan"}</Button>
      </div>
    </div>
  );
}
