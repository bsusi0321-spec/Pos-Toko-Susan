# Update V32 — Tutup Buku: kolom info menurun di layar sempit

## Masalah
Di halaman admin **Tutup Buku Bulanan** (`app/admin/tutup-buku/page.js`):
1. Empat kartu angka (Omset, Estimasi Laba Kotor, Kas Masuk, Pengeluaran)
   dipaksa 2 kolom berdampingan di HP (`grid-cols-2`). Nilai rupiah seperti
   "Rp 12.500.000" ditulis dengan spasi tak-terputus dan berukuran besar
   (`text-2xl`), jadi tidak bisa turun ke baris berikutnya dan meluber keluar kartu.
2. Tabel Riwayat 8 kolom baru berubah jadi kartu kalau lebar layar < 768px
   (`isMobile`). Di tablet dan laptop kecil, lebar isi halaman sebenarnya
   lebih sempit (sidebar admin memakan ~240px), jadi tabel meluber/harus digeser ke samping.

## Perbaikan (hanya 1 file: `app/admin/tutup-buku/page.js`)
- Kartu angka: `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4` -> 1 kolom di HP,
  2 kolom di tablet/laptop kecil, 4 kolom hanya di layar lebar (>=1280px).
- Riwayat: memakai lebar layar (`width < 1280`) untuk memilih tampilan kartu
  yang menurun ke bawah (2 kartu per baris mulai 768px), tabel hanya di layar >= 1280px.

## Untuk belajar
Breakpoint Tailwind: `sm` = 640px, `md` = 768px, `xl` = 1280px, awalan tanpa
prefix berlaku untuk semua ukuran. Pola "mulai 1 kolom, tambah kolom di layar
lebih besar" (mobile-first) lebih aman daripada memulai dari banyak kolom.
Halaman Dashboard (`app/admin/dashboard/page.js`) memakai pola `grid-cols-2
sm:grid-cols-4` yang sama di beberapa tempat, jadi bisa mengalami hal serupa.
