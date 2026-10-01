-- ============================================================
-- MIGRASI #31 -- jalankan SEKALI di SQL Editor Supabase
-- (setelah migration-30-timbangan-gram.sql)
--
-- KOREKSI migrasi #30: stok gram kemarin ditaruh di kolom
-- products.stock_qty_gram -- ternyata kolom itu BUKAN yang
-- dipakai kasir untuk cek/kurangi stok. Stok yang sungguhan
-- dipakai ada di product_branch_stock (per cabang). Migrasi ini
-- menambahkan versi gram di tabel yang BENAR.
--
-- products.stock_qty_gram dari migrasi #30 dibiarkan saja (tidak
-- dihapus, tidak berbahaya) -- cuma tidak akan dipakai kode kasir.
--
-- AMAN dijalankan kapan saja, termasuk saat kasir sedang jalan --
-- cuma menambah kolom baru + 1 fungsi baru, tidak mengubah/
-- menghapus apa pun yang sudah ada.
-- ============================================================

-- 1) Stok gram per cabang (kolom baru, di tabel stok yang sungguhan dipakai).
alter table product_branch_stock add column if not exists stock_qty_gram numeric(14,0) not null default 0;

-- 2) Isi awal: stok kg (desimal) yang sudah ada sekarang di tiap cabang,
--    dikonversi ke gram -- HANYA untuk produk unit_type = 'kg'.
update product_branch_stock pbs
   set stock_qty_gram = round(pbs.stock_qty * 1000)
  from products p
 where p.id = pbs.product_id
   and p.unit_type = 'kg';

-- 3) Fungsi atomik versi gram -- sama persis pola & keamanannya dengan
--    adjust_branch_stock yang sudah ada (migration-19 & 21), cuma target
--    kolomnya stock_qty_gram. Dipakai nanti oleh kasir KHUSUS untuk
--    produk yang gram_mode_aktif = true.
create or replace function adjust_branch_stock_gram(p_product_id uuid, p_branch_id uuid, p_delta numeric)
returns table(new_stock_gram numeric, min_stock numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    update product_branch_stock
       set stock_qty_gram = greatest(0, stock_qty_gram + p_delta)
     where product_id = p_product_id and branch_id = p_branch_id
    returning stock_qty_gram, product_branch_stock.min_stock;

  if not found then
    return query
      insert into product_branch_stock (product_id, branch_id, stock_qty_gram, min_stock)
      values (p_product_id, p_branch_id, greatest(0, p_delta), 0)
      returning stock_qty_gram, product_branch_stock.min_stock;
  end if;
end;
$$;

revoke all on function adjust_branch_stock_gram(uuid, uuid, numeric) from public;
grant execute on function adjust_branch_stock_gram(uuid, uuid, numeric) to authenticated;

-- ------------------------------------------------------------
-- Verifikasi -- lihat stok gram per cabang untuk produk timbangan.
-- ------------------------------------------------------------
select p.name, b.name as cabang, pbs.stock_qty as stok_kg_lama, pbs.stock_qty_gram as stok_gram_baru
from product_branch_stock pbs
join products p on p.id = pbs.product_id
join branches b on b.id = pbs.branch_id
where p.unit_type = 'kg'
order by p.name, b.name;
