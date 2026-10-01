-- ============================================================
-- MIGRASI #30 -- jalankan SEKALI di SQL Editor Supabase
-- (setelah migration-29-tutup-buku-bulanan.sql)
--
-- Fitur: sistem timbangan baru (satuan gram, kelipatan 10 gram)
--   - modal & harga jual cukup 1 angka per KG (sudah ada di
--     products.cost_price / products.sell_price, TIDAK diubah)
--   - stok disimpan dalam gram (kolom baru: stock_qty_gram)
--   - "harga tambahan" flat untuk penjualan eceran di bawah 1 KG
--     (kolom baru: eceran_tambahan)
--
-- PENTING -- ini AMAN dijalankan kapan saja, termasuk saat kasir
-- sedang dipakai transaksi:
--   1) Semua perintah di bawah cuma MENAMBAH kolom baru, tidak ada
--      "drop", "alter ... type", atau "delete" pada kolom/tabel lama.
--   2) Kolom "gram_mode_aktif" defaultnya FALSE untuk semua produk
--      -- kode aplikasi yang sekarang jalan tidak tahu-menahu soal
--      kolom ini, jadi tidak ada perubahan perilaku sampai kode baru
--      dipasang DAN admin sengaja mengaktifkan kolom ini per produk.
-- ============================================================

-- 1) Stok dalam satuan gram (khusus produk timbangan, sistem baru).
--    Kolom lama "stock_qty" (KG desimal) TIDAK diubah/dihapus -- tetap
--    dipakai apa adanya oleh kode yang sekarang jalan.
alter table products add column if not exists stock_qty_gram numeric(14,0) not null default 0;

-- 2) Isi awal stock_qty_gram dari stock_qty yang sudah ada sekarang,
--    supaya begitu kode baru mulai membaca stock_qty_gram, angkanya
--    sudah benar sejak awal (bukan mulai dari nol).
--    Kelipatan 10 gram sesuai standar toko (dibulatkan ke gram terdekat).
update products
   set stock_qty_gram = round(stock_qty * 1000)
 where unit_type = 'kg';

-- 3) Biaya tambahan flat untuk penjualan eceran (di bawah 1 KG).
--    Default 0 -- aman untuk semua produk lama, tidak menambah biaya
--    apa pun sampai admin isi angkanya sendiri di halaman produk nanti.
alter table products add column if not exists eceran_tambahan numeric(14,2) not null default 0;

-- 4) Saklar per produk: sistem gram baru dipakai HANYA kalau ini true.
--    Default FALSE untuk semua produk (termasuk yang sudah ada) --
--    supaya bisa dites di 1 produk dulu (mis. Cabe Kering) sebelum
--    dinyalakan untuk produk timbangan lainnya satu per satu.
alter table products add column if not exists gram_mode_aktif boolean not null default false;

-- ------------------------------------------------------------
-- Verifikasi setelah dijalankan -- harusnya semua produk timbangan
-- muncul dengan stock_qty_gram terisi & gram_mode_aktif = false.
-- ------------------------------------------------------------
select name, unit_type, stock_qty, stock_qty_gram, eceran_tambahan, gram_mode_aktif
from products
where unit_type = 'kg';
