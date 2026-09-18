-- ============================================================
-- MIGRASI TAMBAHAN #22 — jalankan SEKALI di SQL Editor Supabase
-- (setelah migration-21-stok-boleh-minus.sql)
-- Fitur: (1) kolom "Satuan" di halaman Tambah/Edit Produk (PCS, DUS, LUSIN,
--            dst) berupa dropdown yang bisa nambah & hapus opsi sendiri,
--        (2) perbaikan bug "Harga Antar Luar Kota" tidak ikut terhapus di
--            database kalau kolomnya dikosongkan lagi di form
-- ============================================================

-- ------------------------------------------------------------
-- 1) Daftar Satuan Barang -- disimpan di tabel sendiri supaya semua opsi
--    yang pernah diketik admin (PCS, DUS, LUSIN, KARTON, dst) muncul lagi
--    sebagai pilihan dropdown untuk produk lain, dan bisa dihapus dari
--    daftar kalau memang tidak kepake lagi.
create table if not exists product_units (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table product_units enable row level security;

-- Semua akun yang login boleh lihat daftarnya (dipakai buat isi dropdown),
-- tapi cuma admin yang boleh nambah/ubah/hapus opsi -- sama seperti pola
-- tabel referensi lain (suppliers, customers, dst).
create policy "product_units_select" on product_units for select using (is_active_user());
create policy "product_units_admin_all" on product_units for all using (is_admin()) with check (is_admin());

-- Kolom di produk yang nyimpan satuan yang DIPILIH untuk produk itu. Sengaja
-- teks bebas (bukan foreign key ke product_units) supaya kalau suatu saat
-- satu opsi satuan dihapus dari daftar, produk yang SUDAH memakainya tidak
-- ikut rusak/ke-null -- cuma opsinya saja yang hilang dari pilihan dropdown
-- untuk produk BARU berikutnya.
alter table products add column if not exists unit_label text;

-- ------------------------------------------------------------
-- 2) Perbaikan bug Harga Antar Luar Kota
-- ------------------------------------------------------------
-- Ini bukan perubahan skema, cuma catatan: baris di tabel
-- product_out_of_town_pricing sebelumnya tidak pernah terhapus otomatis
-- kalau admin mengosongkan lagi kolom "Harga Antar Luar Kota" di form
-- (kode di app/admin/produk/page.js cuma nyimpen kalau ada isinya, tidak
-- pernah menghapus kalau dikosongkan) -- harga lama jadi nyangkut terus di
-- database walau di form sudah kelihatan kosong. Perbaikannya di kode
-- (produk/page.js), tidak butuh perubahan SQL apapun di sini.
