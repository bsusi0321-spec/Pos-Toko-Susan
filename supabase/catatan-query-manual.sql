-- ============================================================
-- CATATAN QUERY MANUAL
-- Kumpulan query yang pernah dijalankan langsung di SQL Editor
-- Supabase (bukan bagian dari file migration-XX resmi).
-- Disatukan di sini sebagai arsip/riwayat, BUKAN untuk dijalankan
-- ulang begitu saja -- baca komentar tiap bagian sebelum eksekusi.
-- ============================================================


-- ----------------------------------------------------------
-- Bikin akun admin pertama
-- ----------------------------------------------------------
insert into profiles (id, full_name, username, role, active, default_opening_cash)
values ('e538db42-02a7-476e-9294-db977f9d1018', 'Toko Susan', 'tokosusan', 'admin', true, 0);


-- ----------------------------------------------------------
-- Tambah kolom shortcut key kasir
-- ----------------------------------------------------------
alter table store_settings add column if not exists action_hotkeys jsonb not null default
  '{"search": "F2", "qty": "F4", "hold": "F7", "recall": "F8", "pay": "F12", "drawer": "F6"}'::jsonb;


-- ----------------------------------------------------------
-- Cek 10 transaksi dengan laba terendah hari ini
-- ----------------------------------------------------------
select ti.created_at at time zone 'Asia/Jakarta' as waktu,
       t.status, p.name, ti.qty, ti.unit_price, ti.cost_price_snapshot,
       ti.subtotal - ti.cost_price_snapshot * ti.qty as laba
from transaction_items ti
join transactions t on t.id = ti.transaction_id
join products p on p.id = ti.product_id
where ti.created_at >= date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta'
order by laba asc
limit 10;


-- ----------------------------------------------------------
-- Cek jumlah transaksi hari ini (cek zona waktu)
-- ----------------------------------------------------------
select count(*) from transaction_items
where created_at >= date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta';


-- ----------------------------------------------------------
-- Fitur "Tutup Buku Bulanan"
-- Tempat KHUSUS admin memotong estimasi laba kotor bulanan dengan
-- kas masuk/keluar toko (cash_movements), dilakukan manual oleh admin
-- (biasanya di akhir bulan), BUKAN otomatis dipotong di Dashboard.
-- Setiap "tutup buku" tersimpan permanen sebagai catatan sejarah --
-- angka laba kotor & kas masuk/keluar boleh terus berubah di data
-- mentahnya (transaksi baru menyusul, dsb), tapi begitu sebuah bulan
-- sudah "ditutup", catatan hasil perhitungannya TIDAK ikut berubah
-- lagi (snapshot).
-- ----------------------------------------------------------
create table if not exists monthly_closings (
  id uuid primary key default gen_random_uuid(),
  period_key text not null unique, -- format 'YYYY-MM', mis. '2026-09', mencegah 1 bulan ditutup dobel
  period_start date not null,
  period_end date not null,
  gross_revenue numeric(14,2) not null default 0,     -- omset bulan itu (informasi saja)
  gross_profit numeric(14,2) not null default 0,       -- estimasi laba kotor dari transaksi (sebelum potong pengeluaran)
  total_cash_in numeric(14,2) not null default 0,       -- kas masuk toko (non-penjualan) bulan itu
  total_cash_out numeric(14,2) not null default 0,      -- total pengeluaran toko bulan itu
  net_profit numeric(14,2) not null default 0,          -- gross_profit + total_cash_in - total_cash_out, dikunci saat ditutup
  notes text,
  closed_by uuid references profiles(id),
  closed_at timestamptz not null default now()
);

alter table monthly_closings enable row level security;

-- Semua user aktif boleh lihat riwayat tutup buku, cuma admin yang boleh
-- menutup buku (insert) atau menghapus catatan yang salah (delete). Tidak
-- ada "update" -- kalau ada yang keliru, dihapus lalu ditutup ulang.
create policy "monthly_closings_select" on monthly_closings for select using (is_active_user());
create policy "monthly_closings_admin_insert" on monthly_closings for insert with check (is_admin());
create policy "monthly_closings_admin_delete" on monthly_closings for delete using (is_admin());


-- ============================================================
-- KASUS: Cabe Kering laba minus (21 Sept 2026)
-- ============================================================

-- LANGKAH 1 -- cari tahu kenapa Cabe Kering bisa laba minus
-- Jalankan satu per satu di SQL Editor Supabase.

-- (a) Setelan harga produk Cabe Kering saat ini
select p.name, p.unit_type, p.cost_price, p.sell_price,
       k.cost_per_kg, k.price_per_kg,
       k.cost_per_half_kg, k.price_per_half_kg,
       k.cost_per_ons, k.price_per_ons,
       o.price as harga_antar_luar_kota
from products p
left join product_kg_pricing k on k.product_id = p.id
left join product_out_of_town_pricing o on o.product_id = p.id
where p.name ilike '%cabe kering%';

-- (b) Riwayat pembelian Cabe Kering -- lihat siapa yang mengubah modal jadi 85000
select po.created_at, po.status, poi.price_type, poi.qty,
       poi.unit_cost, poi.new_sell_price
from purchase_order_items poi
join purchase_orders po on po.id = poi.purchase_order_id
join products p on p.id = poi.product_id
where p.name ilike '%cabe kering%'
order by po.created_at desc;

-- (c) Tipe harga yang dipakai di transaksi yang minus
select t.created_at as waktu, p.name, ti.price_type, ti.price_type_label,
       ti.qty, ti.unit_price, ti.cost_price_snapshot,
       (ti.unit_price - ti.cost_price_snapshot) * ti.qty as laba
from transaction_items ti
join transactions t on t.id = ti.transaction_id
join products p on p.id = ti.product_id
where p.name ilike '%cabe kering%'
order by t.created_at desc;

-- (d) Cari SEMUA baris penjualan lain yang modalnya lebih tinggi dari harga jual
select t.created_at as waktu, p.name, ti.price_type, ti.qty,
       ti.unit_price, ti.cost_price_snapshot,
       (ti.unit_price - ti.cost_price_snapshot) * ti.qty as laba
from transaction_items ti
join transactions t on t.id = ti.transaction_id
join products p on p.id = ti.product_id
where t.status = 'completed'
  and ti.cost_price_snapshot > ti.unit_price
order by t.created_at desc;


-- LANGKAH 2 -- betulkan baris transaksi yang modalnya salah
-- JANGAN dijalankan sebelum Langkah 1 selesai & modal yang benar diketahui.
-- Ganti <MODAL_BENAR> dengan modal per satuan yang DIJUAL
-- (mis. jual per bungkus/ons -> modal per bungkus/ons, BUKAN per kg).

-- Pratinjau dulu: baris apa saja yang akan berubah (tidak mengubah apa pun)
select ti.id, t.created_at, ti.qty, ti.unit_price, ti.cost_price_snapshot
from transaction_items ti
join transactions t on t.id = ti.transaction_id
join products p on p.id = ti.product_id
where p.name ilike '%cabe kering%'
  and ti.cost_price_snapshot > ti.unit_price;

-- Koreksi (contoh template, isi <MODAL_BENAR> sebelum dijalankan)
-- update transaction_items ti
--    set cost_price_snapshot = <MODAL_BENAR>
--   from products p
--  where p.id = ti.product_id
--    and p.name ilike '%cabe kering%'
--    and ti.cost_price_snapshot > ti.unit_price;


-- ============================================================
-- HAPUS transaksi Cabe Kering yang salah (id baris: 5ea39f11-...)
-- CATATAN: skrip ini disiapkan sebagai opsi cadangan, TIDAK dijalankan --
-- solusi akhir yang dipakai adalah koreksi cost_price_snapshot (bukan hapus).
-- Disimpan di sini sebagai arsip saja.
-- ============================================================

-- LANGKAH A -- PRATINJAU (tidak mengubah apa pun).
select t.id as transaksi_id, t.created_at, t.status, t.total, t.payment_method,
       p.name, ti.qty, ti.unit_price
from transaction_items ti
join transactions t on t.id = ti.transaction_id
join products p on p.id = ti.product_id
where ti.transaction_id = (
  select transaction_id from transaction_items
  where id = '5ea39f11-25fe-4fc2-ae01-ea36b05b2380'
);

-- LANGKAH B -- HAPUS (tidak dijalankan, diarsipkan saja).
-- do $$
-- declare
--   v_tx uuid;
--   v_cnt int;
-- begin
--   select transaction_id into v_tx
--     from transaction_items
--    where id = '5ea39f11-25fe-4fc2-ae01-ea36b05b2380';
--   if v_tx is null then
--     raise exception 'Baris transaksi tidak ditemukan (mungkin sudah terhapus)';
--   end if;
--
--   select count(*) into v_cnt from transaction_items where transaction_id = v_tx;
--   if v_cnt > 1 then
--     raise exception 'Transaksi ini berisi % barang, bukan hanya Cabe Kering -- dihentikan, tidak ada yang dihapus', v_cnt;
--   end if;
--
--   if exists (select 1 from kasbon where transaction_id = v_tx)
--      or exists (select 1 from returns where reference_transaction_id = v_tx) then
--     raise exception 'Transaksi ini punya kasbon/retur terkait -- dihentikan, tidak ada yang dihapus';
--   end if;
--
--   delete from stock_movements where note = 'Transaksi ' || v_tx::text;
--   delete from transactions where id = v_tx;
-- end $$;

-- LANGKAH C -- cek apa saja yang masih menempel di produk Cabe Kering.
select 'penjualan' as tabel, count(*) from transaction_items ti join products p on p.id = ti.product_id where p.name ilike '%cabe kering%'
union all
select 'pergerakan stok', count(*) from stock_movements s join products p on p.id = s.product_id where p.name ilike '%cabe kering%'
union all
select 'pembelian', count(*) from purchase_order_items i join products p on p.id = i.product_id where p.name ilike '%cabe kering%'
union all
select 'retur', count(*) from returns r join products p on p.id = r.product_id where p.name ilike '%cabe kering%'
union all
select 'shortcut kasir', count(*) from cashier_shortcuts c join products p on p.id = c.product_id where p.name ilike '%cabe kering%';


-- ----------------------------------------------------------
-- Riwayat percobaan koreksi cost_price_snapshot (LIHAT CATATAN PENTING
-- di bawah file ini soal urutan & nilai akhir yang benar-benar dipakai)
-- ----------------------------------------------------------

-- Percobaan 1: konversi modal per kg (85000) ke porsi 50g yang dijual
update transaction_items
   set cost_price_snapshot = round(85000 * 50 / 1000)
 where id = '5ea39f11-25fe-4fc2-ae01-ea36b05b2380'
   and cost_price_snapshot = 85000;

-- Cek riwayat pembelian (hasilnya kosong, tidak ada riwayat pembelian tercatat)
select po.received_at, po.created_at, poi.unit_cost, poi.qty
from purchase_order_items poi
join purchase_orders po on po.id = poi.purchase_order_id
join products p on p.id = poi.product_id
where p.name ilike '%cabe kering%'
order by coalesce(po.received_at, po.created_at) desc;

-- Percobaan 2 (dijalankan setelahnya): mengembalikan cost_price_snapshot
-- transaksi itu KE 85000
update transaction_items
set cost_price_snapshot = 85000
where id = '5ea39f11-25fe-4fc2-ae01-ea36b05b2380';

-- Percobaan 2 (lanjutan): menyamakan cost_price produk ke 85000 juga
update products
set cost_price = 85000
where name ilike '%cabe kering%';

-- Query audit akhir -- cek transaksi mana saja yang modalnya masih
-- lebih besar dari harga jualnya (harus dijalankan lagi untuk verifikasi
-- akhir setelah nilai cost_price_snapshot yang BENAR ditentukan)
select t.created_at, p.name, ti.qty, ti.unit_price, ti.cost_price_snapshot,
       (ti.subtotal - ti.cost_price_snapshot * ti.qty) as laba
from transaction_items ti
join transactions t on t.id = ti.transaction_id
join products p on p.id = ti.product_id
where ti.cost_price_snapshot > ti.unit_price
order by t.created_at desc;
