# Update V35 — Kolom "No" (nomor urut) di semua tabel

Kolom **No** ditambahkan sebagai kolom pertama di 13 tabel. Nomor dihitung dari urutan
baris yang sedang tampil (ikut berubah kalau kamu mencari/menyaring), bukan disimpan di database.
Tidak ada migration SQL baru.

| Halaman | File |
|---|---|
| Kasir (keranjang) | `app/kasir/KasirApp.js` |
| Produk & Harga | `app/admin/produk/page.js` |
| Transaksi (rekap kasir + daftar transaksi) | `app/admin/transaksi/page.js` |
| Dashboard (retur menunggu + hutang supplier) | `app/admin/dashboard/page.js` |
| Kasbon, Pelanggan, Pengguna, Cabang, Shift Kas, Arsip, Kamus Suara, Tutup Buku | `app/admin/<nama>/page.js` |

Pasang: timpa file ke folder project (langkah sama seperti `PANDUAN-UPDATE-V34.md`),
lalu `npm run build`, `git add .`, `git commit`, `git push`.
