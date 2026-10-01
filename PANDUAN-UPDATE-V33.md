# Update V33 — Semua data tanpa batas 1000 baris

## Masalah
Supabase (PostgREST) diam-diam membatasi **maksimal 1000 baris per query**. Kalau
datanya lebih dari itu, sisanya tidak dibaca dan tidak ada pesan error. Sebagian
halaman sudah memakai `fetchAllRows` (tarik data per halaman sampai habis), tapi
banyak daftar lain masih memakai query biasa, dan ada 2 tempat yang punya batas
buatan sendiri (maksimal 10 halaman = 10.000 baris).

## Perbaikan
1. **`lib/fetchAllRows.js` diperkuat**
   - Otomatis menambah urutan `id` di paling akhir, supaya baris tidak terlewat
     atau dobel di batas antar-halaman (penting kalau banyak baris punya
     `created_at` yang sama).
   - Tabel tanpa kolom `id` (`product_branch_stock`) memakai
     `{ orderBy: ["product_id", "branch_id"] }`.
   - Fungsi baru `fetchAllRowsOrEmpty`: sama, tapi kalau gagal tidak crash
     (mengembalikan daftar kosong), sesuai perilaku lama di halaman-halaman itu.
2. **Daftar yang sebelumnya kena batas 1000, sekarang tanpa batas**

   | Data | File |
   |---|---|
   | Produk aktif (cache scan barcode di halaman admin) | `components/GlobalScanToast.js` |
   | Pelanggan & Kamus Suara di kasir | `app/kasir/page.js` |
   | Penjualan tunai per shift (tutup shift) | `app/kasir/components/CloseShiftModal.js` |
   | Stok per cabang (cek stok menipis) | `app/admin/AdminShell.js`, `app/admin/notifikasi/page.js`, `app/admin/dashboard/page.js` |
   | Nota pembelian & supplier | `app/admin/pembelian/page.js`, `app/admin/retur/page.js` |
   | Pelanggan | `app/admin/pelanggan/page.js` |
   | Supplier | `app/admin/supplier/page.js` |
   | Kasbon | `app/admin/kasbon/page.js` |
   | Kamus Suara | `app/admin/kamus-suara/page.js` |
   | Daftar barcode | `app/admin/label-barcode/page.js` |
   | Hutang supplier, retur belum diambil, kas masuk/keluar bulan ini | `app/admin/dashboard/page.js` |
   | Riwayat tutup buku & kas bulan yang dikunci | `app/admin/tutup-buku/page.js` |
   | Laporan Telegram harian & notif stok menipis | `app/api/notify/daily-report/route.js`, `app/api/notify/low-stock/route.js` |
   | Jumlah transaksi yang diarsipkan | `app/api/archive/run/route.js` (dihitung pakai `count: "exact"`) |

3. **Batas buatan 10 halaman (10.000 baris) dihapus**
   - `app/kasir/components/MySalesModal.js` (Penjualan Saya)
   - `app/admin/transaksi/page.js` (rekap per metode bayar). Pesan
     "Transaksi terlalu banyak..." ikut dihapus karena sudah tidak mungkin muncul.

## Sengaja TIDAK diubah
Daftar "terbaru saja" yang memang dibatasi dengan `.limit(...)` (bukan batas
1000), karena itu bagian dari tampilan, bukan kekurangan data:
Transaksi (300 terbaru), Retur (100 terbaru), Log Aktivitas (200), Shift (50),
Kas Masuk/Keluar di halaman Shift & Kas (50), Arsip (20/50), Notifikasi (15),
Transaksi Terbaru di Dashboard (8).
Tabel kecil yang tidak mungkin sampai 1000 baris juga dibiarkan: cabang,
satuan produk, label harga, akun kasir/pengguna.

## Tidak perlu migration SQL
Perubahan ini murni kode. Jangan jalankan apa pun di Supabase SQL Editor.

---

## Langkah pemasangan (Windows, PowerShell)

### Langkah 1 — Ekstrak zip
Klik kanan `pos-app-limit-1000-v33.zip` → **Extract All...** → pilih folder
sementara, misalnya `C:\Users\NAMA_KAMU\Downloads\v33`.
Hasilnya ada folder `pos-app` di dalamnya.

### Langkah 2 — Timpa file ke folder project kamu
Cara paling aman: buka PowerShell, lalu salin isi folder hasil ekstrak ke folder
project. **Ganti dua path di bawah sesuai lokasi di komputermu** (`SUMBER` =
folder hasil ekstrak, `TUJUAN` = folder project yang sudah ada git-nya).

```powershell
$SUMBER = "C:\Users\NAMA_KAMU\Downloads\v33\pos-app"
$TUJUAN = "C:\Users\NAMA_KAMU\Documents\pos-app"
Copy-Item -Path "$SUMBER\*" -Destination $TUJUAN -Recurse -Force
```

Perintah ini hanya menimpa file yang ada di zip. Folder `node_modules`, `.next`,
dan file `.env.local` milikmu **tidak tersentuh**.

### Langkah 3 — Masuk ke folder project
```powershell
cd $TUJUAN
```

### Langkah 4 — Lihat file apa saja yang berubah
```powershell
git status
```
Zip ini berisi V33 (tanpa batas 1000 baris) DAN V34 (hapus produk nonaktif),
jadi harus muncul sekitar 22 file `modified` plus file baru (`untracked`):
`PANDUAN-UPDATE-V33.md`, `PANDUAN-UPDATE-V34.md`, dan
`supabase/migration-32-hapus-produk-nonaktif.sql`. Kalau muncul jauh lebih banyak dari itu, kemungkinan path
`$TUJUAN` salah atau versi project kamu berbeda dari zip ini — jangan lanjut
dulu.

### Langkah 5 (opsional tapi disarankan) — Tes di komputer sendiri
```powershell
npm install
npm run build
```
Kalau berhasil, di akhir muncul daftar route tanpa tulisan `Failed to compile`.
Untuk mencoba langsung di browser:
```powershell
npm run dev
```
lalu buka `http://localhost:3000`. Hentikan dengan `Ctrl + C`.

### Langkah 6 — Kirim ke GitHub (Vercel otomatis deploy)
```powershell
git add .
git commit -m "V33: semua data tanpa batas 1000 baris"
git push
```

### Langkah 7 — Tunggu deploy selesai
Buka https://vercel.com → project kamu → tab **Deployments**. Tunggu status
**Ready** (biasanya 1–3 menit), lalu buka aplikasi dan tekan `Ctrl + F5` supaya
browser memuat versi terbaru. Di HP: tutup aplikasi sepenuhnya lalu buka lagi.

---

## Cara mengecek hasilnya
Cek ini paling berguna kalau data kamu sudah lebih dari 1000 baris:

1. **Produk** — buka *Produk & Harga*; jumlah produk yang tampil harus sama
   dengan jumlah di card **Total Produk** di Dashboard.
2. **Pelanggan** — buka *Pelanggan*, scroll sampai bawah; nama pelanggan
   terakhir yang kamu daftarkan harus ada.
3. **Stok menipis** — angka merah di lonceng notifikasi harus sama dengan
   jumlah barang di halaman *Notifikasi*.
4. **Rekap Transaksi** — buka *Transaksi* dengan rentang tanggal yang lebar
   (mis. setahun); jumlah di rekap per metode bayar harus bertambah terus
   mengikuti banyaknya transaksi, tidak macet di angka tertentu.
5. **Penjualan Saya** (kasir) — total harus cocok walau transaksi hari itu
   sangat banyak.

## Kalau ada kendala
- **`git status` menunjukkan "not a git repository"** → kamu belum masuk ke
  folder project. Ulangi Langkah 3 dan pastikan `$TUJUAN` benar.
- **`npm run build` gagal** → salin seluruh pesan error-nya dan kirim ke
  Claude beserta nama file yang disebut.
- **Halaman terasa lebih lambat memuat** → wajar untuk data yang sangat besar,
  karena sekarang semua baris benar-benar diambil (sebelumnya terpotong di 1000).
  Data ditarik per 1000 baris per permintaan, jadi tetap aman.

## Untuk belajar
`.range(dari, sampai)` di Supabase mengambil potongan baris. Supaya potongan
antar-halaman tidak saling tumpang tindih, urutannya harus **pasti** (tidak
boleh ada dua baris dengan urutan yang dianggap sama) — makanya ditambahkan
`order("id")` sebagai pemecah seri di `fetchAllRows`.
