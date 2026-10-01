# Panduan Lengkap Aplikasi POS Kasir

Semua panduan (setup awal + riwayat update) digabung jadi 1 file ini supaya
tidak perlu buka banyak file terpisah lagi. Ikuti **Bagian 1** kalau ini
instalasi baru dari nol. Kalau aplikasinya sudah jalan dan cuma mau tahu
migration/update apa saja yang sudah pernah dibuat, langsung ke **Bagian 2**
atau **Bagian 3**.

---

## DAFTAR ISI

- **Bagian 1** — Setup Awal dari Nol (Supabase, GitHub, Vercel)
- **Bagian 2** — Riwayat Update (urut dari paling lama ke paling baru)
- **Bagian 3** — Daftar Semua File Migration SQL (referensi cepat)
- **Bagian 4** — Kalau Ada Kendala

---

## BAGIAN 1 — Setup Awal dari Nol

Ikuti urutan ini dari atas ke bawah. Total waktu sekitar 30-45 menit untuk
yang baru pertama kali.

### 1.1 Buat akun & project Supabase

1. Buka https://supabase.com → klik **Start your project** → daftar/login (bisa pakai akun GitHub).
2. Klik **New project**.
3. Isi:
   - **Name**: bebas, mis. `pos-toko-saya`
   - **Database Password**: buat password kuat, **simpan di tempat aman** (bukan password login toko, ini password database).
   - **Region**: pilih yang terdekat, mis. `Southeast Asia (Singapore)`.
4. Klik **Create new project**, tunggu 1-2 menit sampai project siap.

### 1.2 Jalankan skema database

1. Di sidebar kiri Supabase, klik **SQL Editor** → **New query**.
2. Buka file `supabase/schema.sql`, **copy semua isinya**, tempel ke SQL Editor, klik **Run** (atau Ctrl+Enter).
3. Pastikan muncul **Success. No rows returned** — berarti semua tabel berhasil dibuat.
4. Ulangi langkah yang sama (New query → copy isi file → Run) untuk **setiap** file `supabase/migration-XX-....sql`, **berurutan sesuai nomornya** dari yang paling kecil sampai yang paling besar (lihat urutan lengkapnya di **Bagian 3** di bawah).

> Kalau muncul error "relation already exists" atau "policy already exists", berarti file itu sudah pernah dijalankan sebelumnya — aman, lewati saja lanjut ke file berikutnya.

### 1.3 Buat akun Admin pertama

1. Di sidebar kiri, klik **Authentication** → tab **Users** → klik **Add user** → **Create new user**.
2. Isi:
   - **Email**: `namaadmin@kasir.local` (ganti `namaadmin` sesuai username yang Anda mau, boleh huruf kecil saja)
   - **Password**: buat password untuk login admin nanti, catat baik-baik.
   - Centang **Auto Confirm User**.
3. Klik **Create user**, lalu klik user yang baru dibuat, **copy nilai "User UID"** (kode panjang seperti `a1b2c3d4-...`).
4. Kembali ke **SQL Editor** → **New query**, tempel ini (ganti bagian `<...>`):

   ```sql
   insert into profiles (id, full_name, username, role, active, default_opening_cash)
   values ('<TEMPEL_USER_UID_DI_SINI>', 'Nama Anda', 'namaadmin', 'admin', true, 0);
   ```

   Ganti `'namaadmin'` supaya sama persis dengan bagian sebelum `@kasir.local` di email tadi.
5. Klik **Run**. Kalau sukses, akun admin Anda siap dipakai login.

### 1.4 Ambil kunci API

1. Klik ikon gerigi **Project Settings** (bawah sidebar kiri) → **API**.
2. Catat 3 nilai berikut (dipakai di Bagian 1.6):
   - **Project URL** → contoh: `https://abcdefgh.supabase.co`
   - **anon public** key → deretan huruf/angka panjang
   - **service_role** key → klik "Reveal" untuk melihat. **Jaga kerahasiaan ini**, jangan pernah dibagikan/di-upload ke GitHub.

### 1.5 Push Kode ke GitHub

1. Buka https://github.com/new (login/daftar dulu jika belum punya akun).
2. **Repository name**: mis. `pos-kasir-toko`. Pilih **Private** (disarankan).
3. Jangan centang "Add README" (biar tidak bentrok). Klik **Create repository**.
4. Buka folder aplikasi di komputer, jalankan Terminal/Command Prompt di folder itu:

   ```bash
   git init
   git add .
   git commit -m "Aplikasi POS kasir"
   git branch -M main
   git remote add origin https://github.com/USERNAME_ANDA/pos-kasir-toko.git
   git push -u origin main
   ```

   Ganti `USERNAME_ANDA` dan `pos-kasir-toko` sesuai punya Anda. Saat diminta login, gunakan username GitHub + Personal Access Token (bukan password biasa).

   > Tidak punya `git`? Alternatif: di halaman repository GitHub, klik **Add file → Upload files**, drag semua isi folder aplikasi, klik **Commit changes**.

### 1.6 Deploy ke Vercel

1. Buka https://vercel.com/new, login pakai akun GitHub Anda.
2. Klik **Import** pada repository `pos-kasir-toko`.
3. Di **Environment Variables**, tambahkan 4 baris ini (nilai dari langkah 1.4):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL Anda |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key Anda |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key Anda |
   | `CRON_SECRET` | ketik bebas string acak, mis. `rahasia-arsip-toko-2026` |

4. Klik **Deploy**. Tunggu 1-3 menit, lalu klik **Visit** — aplikasi Anda sudah online (mis. `pos-kasir-toko.vercel.app`).

### 1.7 Login Pertama Kali & Konfigurasi Awal

1. Login dengan **username** (bagian sebelum `@kasir.local`) dan password admin dari langkah 1.3.
2. Urutan yang disarankan: **Pengaturan Toko** → **Produk & Harga** → **Pengguna** (buat akun kasir) → **Shortcut Kasir** → **Supplier** & **Pelanggan** (kalau perlu).
3. Minta kasir login pakai akun masing-masing — halaman kasir otomatis minta konfirmasi modal awal saat pertama login tiap shift.

---

## BAGIAN 2 — Riwayat Update

Ditulis urut dari yang paling lama. Kalau aplikasi Anda sudah lama tidak
di-update, jalankan SEMUA migration yang disebutkan di bawah ini (berurutan)
sebelum deploy kode terbarunya.

### Update — Pajak, WhatsApp, Notifikasi Telegram, Multi-Cabang

**Migration:** `09-pajak`, `10-notifikasi`, `11-cabang`, `12-cabang-stok`, `13-upload-gambar`, `14-ikon-aplikasi` (berurutan; `12` migrasi stok — stok lama otomatis pindah ke Cabang Utama, baca catatan di dalam filenya).

- **Pajak/PPN**: Produk & Harga → edit produk → isi "Pajak/PPN (%)". Label custom & harga-termasuk-pajak diatur di Pengaturan Toko.
- **Kirim struk WhatsApp**: langsung aktif, tombol muncul di modal struk.
- **Notifikasi Telegram**: chat `@BotFather` → `/newbot` → catat Bot Token. Chat `@userinfobot` → catat Chat ID. Isi keduanya di Pengaturan Toko → Notifikasi Otomatis → tes kirim → nyalakan toggle.
- **Multi-Cabang**: menu Cabang sudah otomatis berisi "Cabang Utama". Tambah cabang baru kalau perlu, tugaskan kasir ke cabang di menu Pengguna.
- **QRIS**: Pengaturan Toko → Info Pembayaran → Upload Gambar QRIS (statis, gratis, konfirmasi manual, bukan payment gateway).
- **Ikon Aplikasi**: Pengaturan Toko → Identitas Toko → Ikon Aplikasi → Upload (disarankan 512x512px, latar penuh sampai tepi, jangan transparan).

### Perbaikan — Transaksi Tertahan Hilang, Shift & Kas, Retur Barang Tidak Tersimpan

Audit menyeluruh semua tombol simpan/ubah/hapus data di seluruh aplikasi,
dicocokkan satu-satu dengan izin (RLS policy) di database. Ditemukan tabel
`returns` ternyata tidak punya izin UPDATE/DELETE sama sekali — tombol
"Sudah Diambil"/"Tandai Belum Diambil" kelihatan berhasil tapi **tidak
benar-benar tersimpan**, balik lagi ke status semula setelah refresh.
Tombol hapus di Pelanggan/Supplier/Barcode Produk/Catatan Kas juga tidak
mengecek apakah penghapusan benar-benar berhasil (gagal diam-diam tanpa
pesan error).

**Migration (jalankan berurutan):** `16-perbaikan-hapus-transaksi`, `17-perbaikan-hapus-shift-kas`, `18-perbaikan-retur`.

### Update — Produk Baru Langsung Muncul di Kasir

Sebelumnya daftar barang di kasir cuma dimuat sekali saat halaman dibuka;
produk baru baru kelihatan setelah keluar-masuk lagi. Sekarang kasir
"mendengarkan" perubahan tabel `products` lewat Supabase Realtime dan
otomatis memuat ulang daftarnya (keranjang/transaksi berjalan tidak ikut
ter-reset). **Tidak ada migration baru** (realtime untuk tabel `products`
sudah diaktifkan sejak `schema.sql`). File: `app/kasir/KasirApp.js`.

### Update — Mode Terang/Gelap di Akun Kasir

Sebelumnya tombol terang/gelap cuma ada di admin, dan pilihannya hilang
tiap halaman dibuka ulang. Sekarang pilihan tema disimpan **per perangkat**
di localStorage (HP kasir boleh gelap, PC admin boleh terang, tanpa saling
mengganggu). Kalau perangkat belum pernah memilih, dipakai "Mode Tampilan
Default" dari Pengaturan Toko. **Tidak ada migration baru**. File baru:
`lib/theme.js`; diubah: `app/kasir/KasirApp.js`, `app/admin/AdminShell.js`, `app/layout.js`.

### Update — Menu "Penjualan Saya" + Cetak Lewat Kabel (USB)

1. **Menu "Penjualan Saya (Rekap)"** di layar kasir — kasir cek sendiri jumlah
   transaksi & total penjualannya (per Shift Ini/Hari Ini/Pilih Tanggal),
   rincian per metode bayar, rata-rata per transaksi, 20 transaksi terbaru.
   Kasir cuma bisa lihat transaksinya sendiri (dijaga RLS `trx_select`,
   **tidak perlu migration baru**). File baru: `app/kasir/components/MySalesModal.js`.
2. **Tombol "Cetak Kabel" (USB)** di modal struk, berdampingan dengan "Cetak
   Bluetooth". Printer USB disambung sekali (dialog pilih perangkat dari
   browser), berikutnya otomatis tersambung & langsung cetak. Isi struk
   sama persis dengan jalur Bluetooth (`buildReceiptEscPos()`).
   - **Batasan**: cuma Chrome/Edge (tidak ada di Safari/iPhone/Firefox), harus HTTPS.
   - **Android**: colok lewat kabel OTG, umumnya langsung bisa.
   - **Windows**: kalau printer USB sudah terpasang sebagai printer resmi
     (ada driver), Windows "memegang" printer itu duluan sehingga browser
     tidak boleh memakainya langsung — untuk kasus ini tombolnya **otomatis**
     membuka dialog cetak biasa sebagai cadangan, jadi tetap bisa mencetak.
   - File baru: `lib/usbPrinter.js`; diubah: `app/kasir/components/ReceiptModal.js`.

### Update — "Rekap per Kasir" di Akun Admin

Di halaman admin **Cek Transaksi**, di atas daftar transaksi sekarang ada
kartu **Rekap per Kasir**: jumlah transaksi & total penjualan per akun
kasir (rincian Tunai/Transfer/QRIS/Kasbon), baris "Semua Kasir" untuk total
keseluruhan. Mengikuti filter Tanggal & Cabang. Klik nama kasir untuk
menyaring daftar transaksi ke kasir itu saja. **Tidak ada migration baru**
(admin sudah bisa baca semua transaksi lewat `trx_select`). File:
`app/admin/transaksi/page.js`.

### Update — Rapikan Menu Kasir di HP

Tombol "Scan via Kamera" yang dobel di menu hamburger (HP/tablet) dihapus
karena sudah ada tombol ikon scan di sebelah kolom pencarian yang membuka
modal scan yang sama persis. **Tidak ada migration baru**. File:
`app/kasir/KasirApp.js`.

### Update — Kamus Suara (Perbaikan Pengucapan Singkatan Saat Scan)

Suara kasir (Text-to-Speech saat scan barang) sebelumnya salah membaca
singkatan seperti SCHT, ML, KG, G (dieja huruf per huruf, bukan dibaca
sebagai kata). Dibuatkan halaman admin baru **"Kamus Suara"** — admin
tambah/edit/hapus daftar singkatan → cara baca (mis. SCHT → saset, ML →
mili liter), diisi ~23 singkatan umum sebagai data awal. Angka yang nempel
langsung di depan singkatan (mis. "1500ML") otomatis dipisah jadi "1500
mili liter" tanpa perlu didaftarkan satu-satu per angka. Nama produk yang
tersimpan di halaman Produk **tidak berubah sama sekali** — kamus ini cuma
"menerjemahkan" teks sesaat sebelum dibacakan di kasir.

**Migration:** `26-kamus-suara`. File baru: `lib/voiceDictionary.js`,
`app/admin/kamus-suara/page.js`; diubah: `lib/voice.js`, `app/kasir/page.js`,
`app/kasir/KasirApp.js`, `app/admin/AdminShell.js`.

### Update — Kartu Kas di Dashboard + Menu "Tutup Buku Bulanan"

Dashboard sekarang menampilkan kartu **"Kas & Pengeluaran Toko (Bulan
Ini)"** (Kas Masuk & Pengeluaran, dari catatan di menu Shift & Kas) — murni
informasi, **belum** dipotong ke angka "Estimasi Laba" di Dashboard.

Untuk benar-benar memotong laba kotor dengan kas masuk/keluar, dibuatkan
menu admin baru **"Tutup Buku Bulanan"**: admin pilih bulan → sistem hitung
otomatis Omset/Laba Kotor/Kas Masuk/Pengeluaran/Estimasi Laba Bersih
(preview live) → admin bisa tambah catatan → tekan "Tutup Buku" untuk
mengunci jadi catatan permanen (snapshot; begitu ditutup, angkanya tidak
ikut berubah lagi walau ada transaksi/catatan kas susulan untuk bulan itu).
1 bulan cuma bisa ditutup sekali; bisa dihapus dari riwayat kalau mau
ditutup ulang. Pemotongan ini **sepenuhnya manual**, dilakukan admin
sendiri (biasanya di akhir bulan) — Dashboard tidak pernah memotongnya
otomatis.

**Migration:** `29-tutup-buku-bulanan`. File baru: `app/admin/tutup-buku/page.js`;
diubah: `app/admin/dashboard/page.js`, `app/admin/AdminShell.js`.

---

## BAGIAN 3 — Daftar Semua File Migration SQL

Jalankan **berurutan** dari atas ke bawah (di Supabase SQL Editor, New query
→ copy isi file → Run) kalau ini instalasi baru. Kalau database sudah jalan,
cukup jalankan yang belum pernah dijalankan.

| # | File | Isi Singkat |
|---|---|---|
| — | `schema.sql` | Skema dasar (semua tabel inti) — wajib pertama kali |
| 02 | `migration-02-fitur-tambahan.sql` | Fitur tambahan awal |
| 03 | `migration-03-perbaikan.sql` | Perbaikan awal |
| 04 | `migration-04-harga-bertingkat.sql` | Harga grosir/bertingkat |
| 05 | `migration-05-retur-dan-metode-bayar.sql` | Retur barang & metode bayar |
| 06 | `migration-06-barcode-unik-dan-nota.sql` | Barcode unik & nomor nota |
| 07 | `migration-07-catatan-item-pembelian.sql` | Catatan per item pembelian |
| 08 | `migration-08-pengaturan-struk.sql` | Pengaturan tampilan struk |
| 09 | `migration-09-pajak.sql` | Pajak/PPN |
| 10 | `migration-10-notifikasi.sql` | Notifikasi Telegram |
| 11 | `migration-11-cabang.sql` | Multi-cabang |
| 12 | `migration-12-cabang-stok.sql` | Stok per cabang |
| 13 | `migration-13-upload-gambar.sql` | Upload gambar (QRIS, dll) |
| 14 | `migration-14-ikon-aplikasi.sql` | Ikon aplikasi custom |
| 15 | `migration-15-nama-produk-unik.sql` | Nama produk unik |
| 16 | `migration-16-perbaikan-hapus-transaksi.sql` | Perbaikan hapus transaksi tertahan |
| 17 | `migration-17-perbaikan-hapus-shift-kas.sql` | Perbaikan hapus shift & kas |
| 18 | `migration-18-perbaikan-retur.sql` | Perbaikan izin retur barang |
| 19 | `migration-19-stok-atomik-dan-struk-publik.sql` | Stok atomik & halaman struk publik |
| 20 | `migration-20-desain-penuh-login.sql` | Desain halaman login |
| 21 | `migration-21-stok-boleh-minus.sql` | Opsi stok boleh minus |
| 22 | `migration-22-satuan-produk-dan-fix-harga-antar.sql` | Satuan produk & harga antar luar kota |
| 24 | `migration-24-label-harga-khusus-promo.sql` | Label harga promo |
| 25 | `migration-25-simpan-nama-promo-di-struk.sql` | Nama promo tersimpan di struk |
| 26 | `migration-26-kamus-suara.sql` | Kamus Suara (lihat Bagian 2) |
| 29 | `migration-29-tutup-buku-bulanan.sql` | Tutup Buku Bulanan (lihat Bagian 2) |

> **Kenapa nomornya loncat** (tidak ada 01, 23, 27, 28)? `01` diwakili oleh
> `schema.sql` sendiri. `23` memang tidak pernah dipakai dari awal — sudah
> dicek, tidak ada tabel/kolom apa pun di kode yang butuh nomor itu. `27`
> dan `28` adalah update yang murni perubahan kode (lihat Bagian 2), tidak
> butuh perubahan database sama sekali, jadi memang tidak ada file SQL-nya.

---

## BAGIAN 4 — Kalau Ada Kendala

- **Tidak bisa login** → cek lagi email di Authentication Supabase harus persis `username@kasir.local`, dan baris di tabel `profiles` harus punya `id` yang sama dengan User UID.
- **Menu Pengguna gagal menambah akun** → pastikan `SUPABASE_SERVICE_ROLE_KEY` sudah benar di Environment Variables Vercel, lalu redeploy.
- **Setelah ubah kode**, cukup `git push` lagi — Vercel otomatis build ulang setiap ada push ke branch `main`.
- **Ganti environment variable di Vercel** → setelah menyimpan, wajib klik Redeploy supaya perubahan berlaku.
- **Error "relation/policy already exists"** saat menjalankan migration → aman, berarti sudah pernah dijalankan, lewati saja.
