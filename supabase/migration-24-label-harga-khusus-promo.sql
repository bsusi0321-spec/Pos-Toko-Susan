-- ============================================================
-- MIGRASI TAMBAHAN #24 — jalankan SEKALI di SQL Editor Supabase
-- (setelah migration-22-satuan-produk-dan-fix-harga-antar.sql)
--
-- Menggantikan migration-23-daftar-harga-antar-luar-kota.sql (fitur di situ
-- keliru -- yang seharusnya jadi dropdown/bisa-simpan-lagi itu LABEL-nya,
-- bukan angka harganya). Kalau migration-23 SUDAH dijalankan, migrasi ini
-- otomatis membersihkannya dulu.
--
-- Fitur: kolom "Harga Antar Luar Kota" sekarang punya 2 bagian --
--   1) Label (mis. "Antar Luar Kota", atau nama promo spt "Promo Lebaran")
--      -- ini yang jadi dropdown, bisa tambah & hapus sendiri, dan dipakai
--      lagi untuk produk lain.
--   2) Harga -- TETAP kolom angka biasa, diketik manual per produk, TIDAK
--      di-dropdown.
-- Cocok dipakai untuk 2 kebutuhan sekaligus: harga antar luar kota yang
-- permanen, ATAU harga promo sementara -- kalau promonya sudah habis,
-- admin tinggal kosongkan kolom Harga & simpan; label+harga produk itu
-- hilang (produknya sendiri TIDAK ikut terhapus).
-- ============================================================

-- 0) Bersihkan sisa migration-23 kalau sudah pernah dijalankan sebelumnya.
--    Dibungkus DO block + cek pg_tables supaya TIDAK error kalau tabel itu
--    memang belum pernah dibuat sama sekali (migration-23 tidak pernah
--    dijalankan) -- "drop policy if exists ... on <tabel>" tetap butuh
--    tabelnya dikenali oleh Postgres walau ada "if exists" di policy-nya.
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'out_of_town_price_options') then
    drop policy if exists "oot_options_select" on out_of_town_price_options;
    drop policy if exists "oot_options_admin_all" on out_of_town_price_options;
    drop table if exists out_of_town_price_options;
  end if;
end $$;

-- 1) Daftar label yang pernah diketik admin -- disimpan di tabel sendiri
--    supaya muncul lagi sebagai pilihan dropdown untuk produk lain, dan
--    bisa dihapus dari daftar kalau memang tidak kepake lagi.
create table if not exists product_price_labels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table product_price_labels enable row level security;

-- Dibungkus cek pg_policies supaya aman kalau skrip ini sempat ke-run
-- sebagian sebelumnya (create policy tidak punya "if not exists" bawaan).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'product_price_labels' and policyname = 'product_price_labels_select'
  ) then
    create policy "product_price_labels_select" on product_price_labels for select using (is_active_user());
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'product_price_labels' and policyname = 'product_price_labels_admin_all'
  ) then
    create policy "product_price_labels_admin_all" on product_price_labels for all using (is_admin()) with check (is_admin());
  end if;
end $$;

-- Selalu sediakan pilihan default "Antar Luar Kota" dari awal.
insert into product_price_labels (name) values ('Antar Luar Kota') on conflict (name) do nothing;

-- 2) Kolom label per produk di tabel harga khusus. Sengaja teks bebas
--    (bukan foreign key ke product_price_labels) supaya kalau suatu saat
--    satu opsi label dihapus dari daftar, produk yang SUDAH memakainya
--    tidak ikut rusak -- cuma opsinya saja yang hilang dari dropdown untuk
--    produk BARU berikutnya.
alter table product_out_of_town_pricing add column if not exists label text not null default 'Antar Luar Kota';
update product_out_of_town_pricing set label = 'Antar Luar Kota' where label is null;
