-- ============================================================
-- MIGRASI TAMBAHAN #21 — jalankan SEKALI di SQL Editor Supabase
-- (setelah migration-20-desain-penuh-login.sql)
-- Fitur: stok sekarang boleh menjadi MINUS (mis. "-1") kalau kejual
-- melebihi stok yang tercatat, dipakai sebagai penanda ada kesalahan
-- input stok yang perlu dicek admin -- bukan lagi dibulatkan diam-diam
-- ke 0 seperti sebelumnya.
-- ============================================================

-- Ganti fungsi adjust_branch_stock (dibuat di migration-19): sebelumnya
-- stok baru dibulatkan ke 0 lewat greatest(0, ...) supaya tidak pernah
-- minus. Sekarang dibiarkan apa adanya (boleh minus), supaya kalau ada
-- kesalahan input stok dari admin (mis. stok fisiknya sebenarnya 5 dus
-- tapi ke-input cuma 5 pcs), penjualan tetap bisa jalan dan selisihnya
-- kelihatan jelas di angka minus itu -- bukan dipaksa mentok di 0 seolah
-- tidak ada masalah.
create or replace function adjust_branch_stock(p_product_id uuid, p_branch_id uuid, p_delta numeric)
returns table(new_stock numeric, min_stock numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    update product_branch_stock
       set stock_qty = stock_qty + p_delta
     where product_id = p_product_id and branch_id = p_branch_id
    returning stock_qty, product_branch_stock.min_stock;

  if not found then
    return query
      insert into product_branch_stock (product_id, branch_id, stock_qty, min_stock)
      values (p_product_id, p_branch_id, p_delta, 0)
      returning stock_qty, product_branch_stock.min_stock;
  end if;
end;
$$;
