# Update V34 — Produk nonaktif bisa dihapus permanen (transaksi tetap aman)

Zip ini sekaligus berisi V33 (semua data tanpa batas 1000 baris). Panduannya ada
di `PANDUAN-UPDATE-V33.md`. Pasang keduanya sekaligus dengan langkah di bawah.

## Masalah
Produk yang sudah pernah terjual tidak bisa dihapus: database menolaknya karena
riwayat transaksi masih menunjuk ke produk itu. Jadi cuma bisa dinonaktifkan dan
daftarnya menumpuk.

## Hasil sekarang
- Tombol **Hapus** di *Produk & Harga*:
  - Produk **aktif** → muncul pertanyaan "Nonaktifkan dulu?" (supaya tidak
    terhapus tidak sengaja). Setelah nonaktif, tekan **Hapus** sekali lagi.
  - Produk **nonaktif** → dihapus permanen, walau sudah ada transaksinya.
- **Transaksi tidak dihapus.** Nama produk sekarang disimpan di setiap baris
  riwayat (transaksi, pembelian, retur, pergerakan stok), jadi struk, laporan,
  dan riwayat lama tetap menampilkan nama barangnya. Kalau namanya tidak
  tersimpan (sangat jarang), tampil "(produk sudah dihapus)".
- Ikut terhapus bersama produk: stok per cabang, barcode, harga bertingkat, dan
  shortcut kasir yang menunjuk produk itu.
- Transaksi **tertahan** (F7) yang berisi produk yang sudah dihapus: barang itu
  dilewati saat transaksi dipanggil lagi, dan kasir diberi peringatan.
- Laporan "Produk Terlaris" tetap menghitung produk yang sudah dihapus, dikelompokkan
  berdasarkan namanya.

## Yang berubah
| Bagian | File |
|---|---|
| Database (jalankan sekali) | `supabase/migration-32-hapus-produk-nonaktif.sql` (baru) |
| Tombol & aturan hapus | `app/admin/produk/page.js` |
| Nama produk cadangan di riwayat | `app/admin/transaksi/page.js`, `app/admin/pembelian/page.js`, `app/admin/retur/page.js`, `app/admin/dashboard/page.js` |
| Transaksi tertahan | `app/kasir/KasirApp.js` |

---

## Langkah pemasangan (Windows, PowerShell)

### Langkah 1 — Ekstrak zip
Klik kanan `pos-app-hapus-produk-v34.zip` → **Extract All...** → pilih folder
sementara, misalnya `C:\Users\NAMA_KAMU\Downloads\v34`.

### Langkah 2 — Jalankan migration di Supabase (WAJIB, sekali saja)
Lakukan ini **sebelum** deploy kode, supaya tombol Hapus langsung berfungsi.

1. Buka https://supabase.com/dashboard → pilih project toko kamu.
2. Menu kiri → **SQL Editor** → **New query**.
3. Buka file `supabase\migration-32-hapus-produk-nonaktif.sql` dari folder hasil
   ekstrak dengan Notepad, tekan `Ctrl + A`, `Ctrl + C`.
4. Tempel di SQL Editor (`Ctrl + V`), lalu klik **Run**.
5. Hasil yang benar: tulisan **Success. No rows returned**. Kalau muncul error
   merah, salin pesannya dan kirim ke Claude — jangan jalankan berulang-ulang.

Aman dijalankan ulang kalau ragu: semua perintahnya memakai `if not exists` /
`drop ... if exists`.

### Langkah 3 — Timpa file ke folder project kamu
**Ganti dua path di bawah sesuai lokasi di komputermu.**

```powershell
$SUMBER = "C:\Users\NAMA_KAMU\Downloads\v34\pos-app"
$TUJUAN = "C:\Users\NAMA_KAMU\Documents\pos-app"
Copy-Item -Path "$SUMBER\*" -Destination $TUJUAN -Recurse -Force
```

`node_modules`, `.next`, dan `.env.local` milikmu tidak tersentuh.

### Langkah 4 — Masuk ke folder project dan cek perubahan
```powershell
cd $TUJUAN
git status
```
Lihat penjelasan jumlah file di `PANDUAN-UPDATE-V33.md` (Langkah 4).

### Langkah 5 (disarankan) — Tes build
```powershell
npm install
npm run build
```
Berhasil kalau tidak ada tulisan `Failed to compile`.

### Langkah 6 — Kirim ke GitHub (Vercel otomatis deploy)
```powershell
git add .
git commit -m "V33+V34: data tanpa batas 1000 baris, hapus produk nonaktif"
git push
```

### Langkah 7 — Tunggu deploy lalu muat ulang
Vercel → project → **Deployments** → tunggu **Ready**. Buka aplikasi lalu tekan
`Ctrl + F5`. Di HP: tutup aplikasi sepenuhnya, buka lagi.

---

## Cara mengecek
1. Buka *Produk & Harga*, pilih 1 produk **yang sudah pernah terjual** dan
   tidak dipakai lagi, lalu tekan **Hapus**.
2. Jawab **OK** untuk "Nonaktifkan dulu?", lalu tekan **Hapus** lagi dan **OK**.
   Harus muncul "Produk dihapus. Riwayat transaksinya tetap tersimpan."
3. Buka *Transaksi*, cari transaksi lama yang berisi produk itu, buka detailnya:
   nama barangnya masih tampil.
4. Dashboard: omset dan laba bulan ini **tidak berubah** setelah penghapusan.

## Kalau ada kendala
- **Muncul "Belum bisa dihapus: jalankan dulu migration-32..."** → migration di
  Langkah 2 belum dijalankan. Jalankan, lalu coba lagi.
- **"Produk gagal dihapus (tidak ada izin...)"** → pastikan login sebagai akun
  **admin**, lalu muat ulang halaman.
- **Salah hapus produk** → tidak bisa dikembalikan dari aplikasi. Tambah ulang
  lewat *Tambah Produk*; riwayat lama tidak akan tersambung ke produk baru itu
  (hanya namanya yang tetap tampil).

## Untuk belajar
`on delete set null` artinya: kalau baris induk (produk) dihapus, kolom penunjuk
di baris anak (riwayat) diisi kosong, bukan ikut dihapus dan bukan ditolak.
Karena penunjuknya jadi kosong, nama produk perlu "difoto" dulu di baris anak
supaya riwayat tetap terbaca. Ini pola yang sama dengan `cost_price_snapshot`.
