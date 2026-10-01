-- ============================================================
-- TEMPLATE: Cek & perbaiki produk yang laba-nya minus/aneh
-- Dipakai ulang untuk produk APAPUN, tidak cuma Cabe Kering.
--
-- Cara pakai: cari tanda >>> GANTI <<< di bawah, ganti sesuai
-- produk yang lagi dicek. Jalankan satu bagian per satu, dari
-- atas ke bawah, JANGAN loncat ke bagian "PERBAIKAN" sebelum
-- yakin dengan hasil bagian "CEK".
-- ============================================================


-- ============================================================
-- BAGIAN 1 -- CEK (aman, tidak mengubah data apapun)
-- ============================================================

-- (1a) Cari SEMUA baris penjualan di SELURUH toko yang modalnya
--      lebih besar dari harga jualnya -- BISA LANGSUNG DIPAKAI
--      TANPA DIEDIT, tidak perlu tahu nama produknya dulu.
--      Jalankan ini duluan untuk nemuin produk apa saja yang
--      bermasalah saat ini.
select t.id as transaksi_id, ti.id as baris_id, t.created_at, p.name,
       ti.price_type, ti.qty, ti.unit_price, ti.cost_price_snapshot,
       (ti.unit_price - ti.cost_price_snapshot) * ti.qty as laba
from transaction_items ti
join transactions t on t.id = ti.transaction_id
join products p on p.id = ti.product_id
where t.status = 'completed'
  and ti.cost_price_snapshot > ti.unit_price
order by t.created_at desc;


-- (1b) Setelan harga produk tertentu saat ini (>>> GANTI nama produk <<<)
select p.name, p.unit_type, p.cost_price, p.sell_price,
       k.cost_per_kg, k.price_per_kg,
       k.cost_per_half_kg, k.price_per_half_kg,
       k.cost_per_ons, k.price_per_ons,
       o.price as harga_antar_luar_kota
from products p
left join product_kg_pricing k on k.product_id = p.id
left join product_out_of_town_pricing o on o.product_id = p.id
where p.name ilike '%>>> GANTI NAMA PRODUK <<<%';


-- (1c) Riwayat pembelian produk tertentu (>>> GANTI nama produk <<<)
--      -- buat lihat modal aslinya kalau pernah tercatat lewat
--      menu Pembelian.
select po.created_at, po.status, poi.price_type, poi.qty,
       poi.unit_cost, poi.new_sell_price
from purchase_order_items poi
join purchase_orders po on po.id = poi.purchase_order_id
join products p on p.id = poi.product_id
where p.name ilike '%>>> GANTI NAMA PRODUK <<<%'
order by po.created_at desc;


-- (1d) Semua transaksi produk tertentu, urut dari terbaru
--      (>>> GANTI nama produk <<<)
select t.created_at as waktu, p.name, ti.price_type, ti.price_type_label,
       ti.qty, ti.unit_price, ti.cost_price_snapshot,
       (ti.unit_price - ti.cost_price_snapshot) * ti.qty as laba
from transaction_items ti
join transactions t on t.id = ti.transaction_id
join products p on p.id = ti.product_id
where p.name ilike '%>>> GANTI NAMA PRODUK <<<%'
order by t.created_at desc;


-- ============================================================
-- BAGIAN 2 -- PERBAIKAN (baru jalankan setelah yakin dengan
-- angka modal yang benar, hasil dari Bagian 1)
-- ============================================================

-- (2a) Pratinjau dulu: baris mana saja yang akan berubah
--      (>>> GANTI nama produk <<<) -- ini TIDAK mengubah apa pun,
--      aman dijalankan kapan saja.
select ti.id, t.created_at, ti.qty, ti.unit_price, ti.cost_price_snapshot
from transaction_items ti
join transactions t on t.id = ti.transaction_id
join products p on p.id = ti.product_id
where p.name ilike '%>>> GANTI NAMA PRODUK <<<%'
  and ti.cost_price_snapshot > ti.unit_price;

-- (2b) Koreksi 1 baris transaksi tertentu berdasarkan id-nya
--      (>>> GANTI id baris & angka modal yang benar <<<)
-- update transaction_items
--    set cost_price_snapshot = >>> ANGKA MODAL YANG BENAR <<<
--  where id = '>>> GANTI id baris transaction_items <<<';

-- (2c) ATAU koreksi SEMUA baris bermasalah untuk 1 produk sekaligus
--      (>>> GANTI nama produk & angka modal yang benar <<<)
-- update transaction_items ti
--    set cost_price_snapshot = >>> ANGKA MODAL YANG BENAR <<<
--   from products p
--  where p.id = ti.product_id
--    and p.name ilike '%>>> GANTI NAMA PRODUK <<<%'
--    and ti.cost_price_snapshot > ti.unit_price;

-- (2d) Perbaiki juga harga modal produknya di halaman Produk,
--      supaya transaksi BERIKUTNYA tidak ikut salah lagi
--      (>>> GANTI nama produk & angka modal yang benar <<<)
-- update products
--    set cost_price = >>> ANGKA MODAL YANG BENAR <<<
--  where name ilike '%>>> GANTI NAMA PRODUK <<<%';


-- ============================================================
-- BAGIAN 3 -- VERIFIKASI AKHIR
-- Jalankan lagi query (1a) di atas -- kalau baris produk yang
-- barusan diperbaiki sudah tidak muncul lagi, berarti sudah beres.
-- ============================================================
