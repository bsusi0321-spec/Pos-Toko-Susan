# Update V46 — Menu digabung jadi 7 grup + daftar barang per supplier

Zip ini berisi semua isi V45 (persetujuan harga + tampilan stok di Stok & Barang Masuk) ditambah V46.
Tidak ada migration SQL dan tidak ada paket npm baru. Jangan jalankan apa pun di Supabase.

## 1. Menu digabung (22 menu → 7)

Sidebar sekarang hanya menampilkan kelompok. Halaman di dalam kelompok berpindah lewat **tab** di
atas isi halaman (di HP, tab bisa digeser ke samping). Alamat tiap halaman tidak berubah, jadi semua
tautan lama tetap berfungsi.

| Menu di sidebar | Tab di dalamnya |
|---|---|
| Dashboard | (satu halaman) |
| Buka Kasir | (satu halaman) |
| Penjualan | Transaksi · Retur Barang · Kasbon · Pelanggan |
| Produk & Stok | Produk & Harga · Kartu Stok · Stok Opname · Label & Barcode · Riwayat Perubahan |
| Pembelian | Stok & Barang Masuk · Supplier |
| Laporan & Kas | Shift & Kas · Tutup Buku Bulanan · Terlaris & Tidak Laris |
| Pengaturan | Toko · Cabang · Pengguna · Shortcut Kasir · Kamus Suara · Log Aktivitas · Arsip Data |

Catatan:
- **Kartu Stok** sekarang punya tab sendiri di Produk & Stok (sebelumnya hanya bisa dibuka dari tombol di baris produk).
- Halaman **Notifikasi** tetap dibuka lewat ikon lonceng, bukan lewat menu.
- Mau memindahkan halaman ke kelompok lain atau mengganti nama? Semuanya ada di satu daftar `NAV_GROUPS`
  di bagian atas file `app/admin/AdminShell.js`.

## 2. Klik nama supplier → daftar barang dari supplier itu

Nama supplier sekarang bisa diklik dan menampilkan barang yang **pernah dibeli dari supplier itu**
(diambil dari riwayat nota pembelian):
- tanggal terakhir dibeli, jumlah nota, harga beli terakhir per jenis (eceran/grosir/dst) beserta jumlahnya,
- stok sekarang dan batas minimum; barang **stok menipis ditaruh paling atas** dengan tanda merah,
- kolom pencarian dan kolom No.

Tempat yang bisa diklik:
- **Form "Pesanan Pembelian Baru"**: setelah supplier dipilih muncul tautan "Lihat daftar barang dari ...".
  Di sini tiap barang punya tombol **Tambah ke pesanan** yang langsung memilih barang itu di form,
  tinggal isi jumlah diterima.
- **Daftar nota** di Stok & Barang Masuk: nama supplier di tiap nota.
- **Halaman Supplier**: nama supplier dan tombol **Lihat Barang**.

Keterbatasan: produk di aplikasi belum punya kolom supplier, jadi barang yang **belum pernah dibeli**
dari supplier itu tidak muncul. Barang baru masuk daftar setelah dipesan satu kali. Barang yang dibeli
dari dua supplier muncul di daftar keduanya.

## File yang berubah
`app/admin/AdminShell.js` (menu), `app/admin/pembelian/page.js` (V45 + V46),
`app/admin/supplier/page.js`, `components/SupplierItemsModal.js` (baru), `PANDUAN-UPDATE-V45.md` dan
`PANDUAN-UPDATE-V46.md` (panduan).

---

## Langkah pemasangan (Windows, PowerShell)

### Langkah 1 — Ekstrak zip
Klik kanan `pos-app-v46-menu-ringkas-supplier.zip` → **Extract All...** → pilih folder sementara,
misalnya `C:\Users\NAMA_KAMU\Downloads\v46`. Hasilnya ada folder `pos-app` di dalamnya.

### Langkah 2 — Salin file ke project kamu
Ganti dua path di bawah sesuai lokasi di komputermu (`$TUJUAN` = folder project yang ada git-nya).

```powershell
$SUMBER = "C:\Users\NAMA_KAMU\Downloads\v46\pos-app"
$TUJUAN = "C:\Users\NAMA_KAMU\Documents\pos-app"
Copy-Item "$SUMBER\app\admin\AdminShell.js" "$TUJUAN\app\admin\AdminShell.js" -Force
Copy-Item "$SUMBER\app\admin\pembelian\page.js" "$TUJUAN\app\admin\pembelian\page.js" -Force
Copy-Item "$SUMBER\app\admin\supplier\page.js" "$TUJUAN\app\admin\supplier\page.js" -Force
Copy-Item "$SUMBER\components\SupplierItemsModal.js" "$TUJUAN\components\SupplierItemsModal.js" -Force
Copy-Item "$SUMBER\PANDUAN-UPDATE-V45.md" "$TUJUAN\PANDUAN-UPDATE-V45.md" -Force
Copy-Item "$SUMBER\PANDUAN-UPDATE-V46.md" "$TUJUAN\PANDUAN-UPDATE-V46.md" -Force
```

### Langkah 3 — Masuk ke folder project
```powershell
cd $TUJUAN
```

### Langkah 4 — Periksa perubahan
```powershell
git status
git diff --stat
```
Harus muncul 3 file `modified` (`AdminShell.js`, `pembelian/page.js`, `supplier/page.js`) dan 3 file
baru (`components/SupplierItemsModal.js`, `PANDUAN-UPDATE-V45.md`, `PANDUAN-UPDATE-V46.md`).
Kalau muncul file lain, atau baris yang dihapus jauh lebih banyak dari yang ditambah di `AdminShell.js`
(wajar sekitar 100 baris berubah) atau di halaman lain, berarti project-mu berbeda dari V44; jangan
lanjut dulu dan kirim hasilnya ke Claude.

### Langkah 5 — Tes build (wajib sebelum kirim)
```powershell
npm install
npm run build
```
Berhasil kalau tidak ada tulisan `Failed to compile`. Kalau gagal, salin seluruh pesan error dan
kirim ke Claude.

### Langkah 6 — Kirim ke GitHub (Vercel otomatis deploy)
```powershell
git add .
git commit -m "V46: menu digabung jadi 7 grup, daftar barang per supplier"
git push
```

### Langkah 7 — Tunggu deploy lalu muat ulang
Vercel → project → **Deployments** → tunggu **Ready**. Buka aplikasi, tekan `Ctrl + F5`.
Di HP: tutup aplikasi sepenuhnya lalu buka lagi.

---

## Cara mengecek hasilnya (urut)

1. **Menu**: sidebar harus berisi 7 menu. Klik **Produk & Stok** → muncul 5 tab; klik tiap tab, isinya
   halaman yang sama seperti sebelumnya. Coba **Pengaturan** (7 tab) di HP: tab bisa digeser ke samping.
2. **Tautan lama**: dari Produk & Harga, klik **Kartu Stok** pada satu produk; halamannya terbuka dan tab
   **Kartu Stok** menyala di atas.
3. **Halaman Supplier**: klik nama salah satu supplier (atau **Lihat Barang**). Harus muncul daftar barang
   dengan stok. Supplier yang belum punya nota menampilkan pesan "Belum ada barang...".
4. **Form pesanan**: **Stok & Barang Masuk** → **Terima Barang** (tombol buat pesanan), pilih supplier →
   klik "Lihat daftar barang dari ...". Klik **Tambah ke pesanan** pada satu barang; jendela menutup dan
   barang itu sudah terpilih di form, tinggal isi jumlah.
5. **Daftar nota**: klik nama supplier di salah satu nota; daftar barangnya muncul (tanpa tombol Tambah).

## Kalau ada kendala
- **Menu terasa kurang pas** → kirim ke Claude halaman mana yang ingin dipindah kelompoknya.
- **Daftar barang supplier kosong padahal sudah pernah beli** → nota lama mungkin tersimpan tanpa
  supplier. Cek di Stok & Barang Masuk apakah nota itu menampilkan nama supplier.
- **Muncul pesan merah di jendela daftar barang** → salin isinya dan kirim ke Claude.

## Untuk belajar
Menu digabung tanpa memindahkan kode halaman: sidebar membaca daftar kelompok, dan tab dibuat dari
daftar halaman milik kelompok yang sedang aktif (dicocokkan dari alamat halaman). Karena alamat tidak
diubah, tombol dan tautan di halaman lain tidak ikut rusak.
