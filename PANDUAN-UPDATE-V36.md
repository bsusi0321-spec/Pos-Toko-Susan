# Update V36 — Stok Opname + Riwayat Perubahan + pembersihan log rutin

Sudah termasuk kolom "No" di semua tabel (V35). Dua menu baru muncul di sidebar admin:
**Stok Opname** (di bawah "Stok & Barang Masuk") dan **Riwayat Perubahan** (di bawah "Log Aktivitas").

## Urutan pasang (PENTING, ikuti berurutan)

1. **Supabase → SQL Editor**, jalankan berurutan (masing-masing sekali):
   1. `supabase/migration-33-stok-opname.sql`
   2. `supabase/migration-34-riwayat-perubahan.sql`
   Keduanya aman dijalankan ulang. Setelah selesai harus muncul "Success".
2. Timpa file project dengan isi zip ini (daftar file di bawah).
3. `npm run build`, lalu `git add .`, `git commit`, `git push`.
4. Tes cepat: lakukan 1 transaksi di kasir (stok harus berkurang normal), lalu buka
   **Riwayat Perubahan** dan ubah harga satu produk → harus muncul barisnya.

## File yang berubah / baru

Baru:
- `supabase/migration-33-stok-opname.sql`
- `supabase/migration-34-riwayat-perubahan.sql`
- `app/admin/stok-opname/page.js`
- `app/admin/riwayat-perubahan/page.js`
- `app/api/cleanup-log/run/route.js`

Diubah:
- `vercel.json` (tambah jadwal harian pembersihan log, jam 03.00 UTC)
- `app/admin/AdminShell.js` (2 menu baru)
- `app/admin/produk/page.js` (tombol "Riwayat" per produk)
- 11 halaman admin + `app/kasir/KasirApp.js` (kolom No, dari V35)

## Cara kerja singkat

**Stok Opname**: buat sesi per cabang → tambah barang (scan / ketik / semua produk aktif) →
isi stok fisik → Tinjau & Terapkan. Stok sistem dicatat database saat jumlah fisik disimpan;
koreksi = selisih, jadi penjualan yang terjadi sesudahnya tidak hilang. Sesi yang sudah
diterapkan terkunci. Mode "hitung buta" (bawaan aktif) menyembunyikan stok sistem saat menghitung.

**Riwayat Perubahan**: dicatat otomatis oleh database untuk produk, harga, stok cabang,
barcode, pengguna, pelanggan, supplier, cabang, pengaturan toko, kas, tutup buku, hapus
transaksi/shift/kasbon, dan stok opname. Tidak bisa diubah/dihapus dari aplikasi.
Penjualan biasa tidak dicatat di sini (sudah ada di riwayat stok & transaksi).

**Log yang dihapus otomatis setelah 30 hari** (permanen): log aktivitas jenis checkout,
buka shift, buat/terima pesanan pembelian; dan riwayat berlabel rutin (pengaturan tampilan
seperti shortcut kasir/kamus suara, pembatalan transaksi tertunda, sesi opname draft yang dibuang).
**Tidak pernah dihapus otomatis**: riwayat perubahan harga/stok/produk/pengguna, transaksi,
shift & kas, kasbon, tutup buku, stok opname, riwayat stok, retur, bayar hutang supplier.
Tombol "Bersihkan sekarang" ada di bagian bawah halaman Riwayat Perubahan.

## Catatan

- Perubahan lewat SQL Editor / Table Editor Supabase juga tercatat, dengan pelaku
  "Database langsung". Pemilik database yang sengaja mematikan trigger masih bisa menghindarinya,
  jadi batasi akses dashboard Supabase hanya untuk pemilik.
- Migration 34 mengganti fungsi `adjust_branch_stock` (dipakai kasir). Isinya sama persis
  dengan migration 21 ditambah 1 baris penanda. Kalau ada yang aneh di kasir setelah ini,
  kabari saya.
- Riwayat baru terisi mulai migration 34 dijalankan; perubahan sebelumnya tidak bisa dilacak.
