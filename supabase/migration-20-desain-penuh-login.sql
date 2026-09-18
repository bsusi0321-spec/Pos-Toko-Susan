-- ============================================================
-- MIGRASI TAMBAHAN #20 — jalankan SEKALI di SQL Editor Supabase
-- (setelah migration-19-stok-atomik-dan-struk-publik.sql)
-- Fitur: opsi baru "Desain Penuh" untuk latar belakang halaman login
-- (form Username/Password/Login menimpa persis di atas 1 gambar utuh,
-- mis. seperti contoh desain "Toko Susan")
-- ============================================================

-- Kolom login_bg_type sebelumnya dibatasi cuma boleh 'color' / 'image' /
-- 'video' (lihat migration-02-fitur-tambahan.sql). Di sini dibuka satu
-- nilai baru: 'full_design'.
alter table store_settings drop constraint if exists store_settings_login_bg_type_check;
alter table store_settings add constraint store_settings_login_bg_type_check
  check (login_bg_type in ('color', 'image', 'video', 'full_design'));
