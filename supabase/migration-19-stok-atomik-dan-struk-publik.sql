-- ============================================================
-- MIGRASI TAMBAHAN #19 — jalankan SEKALI di SQL Editor Supabase
-- (setelah migration-18-perbaikan-retur.sql)
-- Fitur: (1) perbaikan stok bentrok kalau 2 akun jual produk yang sama
--            hampir bersamaan, (2) struk publik untuk kode QR "ambil struk"
-- ============================================================

-- ------------------------------------------------------------
-- 1) STOK ATOMIK — mencegah race condition antar akun
-- ------------------------------------------------------------
-- SEBELUMNYA: aplikasi baca stok_qty dulu ke JS, hitung stok baru, baru upsert.
-- Kalau 2 transaksi (mis. kasir & admin, atau 2 kasir) memproses produk yang
-- SAMA hampir bersamaan, dua-duanya bisa baca angka stok lama SEBELUM salah
-- satu sempat menyimpan hasilnya -> yang tersimpan terakhir menimpa yang
-- pertama, pengurangan stok dari transaksi pertama jadi hilang (lost update).
--
-- SEKARANG: hitung & simpan stok baru dalam SATU pernyataan UPDATE di
-- database (bukan baca-hitung-simpan di JS). Postgres otomatis mengunci baris
-- yang sedang diupdate, jadi transaksi kedua menunggu transaksi pertama
-- selesai dulu baru membaca angka stok TERBARU (bukan angka basi) -- tidak
-- ada lagi update yang hilang.
--
-- p_delta: negatif untuk mengurangi stok (penjualan), positif untuk menambah
-- (retur/terima barang). Stok tidak pernah dibiarkan minus (di-floor ke 0).
create or replace function adjust_branch_stock(p_product_id uuid, p_branch_id uuid, p_delta numeric)
returns table(new_stock numeric, min_stock numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    update product_branch_stock
       set stock_qty = greatest(0, stock_qty + p_delta)
     where product_id = p_product_id and branch_id = p_branch_id
    returning stock_qty, product_branch_stock.min_stock;

  if not found then
    return query
      insert into product_branch_stock (product_id, branch_id, stock_qty, min_stock)
      values (p_product_id, p_branch_id, greatest(0, p_delta), 0)
      returning stock_qty, product_branch_stock.min_stock;
  end if;
end;
$$;

-- Hanya akun yang login (kasir/admin) yang boleh memanggil, sama seperti
-- sebelumnya lewat RLS pada tabel product_branch_stock.
revoke all on function adjust_branch_stock(uuid, uuid, numeric) from public;
grant execute on function adjust_branch_stock(uuid, uuid, numeric) to authenticated;

-- ------------------------------------------------------------
-- 2) STRUK PUBLIK — untuk kode QR "ambil struk" di ReceiptModal
-- ------------------------------------------------------------
-- Tabel transactions/transaction_items dikunci RLS supaya hanya kasir
-- pemilik & admin yang bisa baca. Supaya pelanggan (tanpa login) bisa
-- membuka struknya lewat scan QR, dibuatkan SATU fungsi terbatas yang
-- hanya mengembalikan field yang memang layak dilihat publik (tidak ada
-- cost_price, tidak ada data transaksi lain) berdasarkan ID transaksi
-- (UUID acak, tidak bisa ditebak) -- bukan membuka akses tabel mentah ke
-- publik. Transaksi berstatus 'pending' atau 'void' sengaja tidak
-- ditampilkan lewat sini.
create or replace function get_public_receipt(p_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result json;
begin
  select json_build_object(
    'store', (select json_build_object(
        'store_name', store_name,
        'store_address', store_address,
        'store_phone', store_phone,
        'receipt_footer', receipt_footer,
        'receipt_show_address', receipt_show_address,
        'receipt_show_phone', receipt_show_phone,
        'receipt_show_cashier', receipt_show_cashier,
        'receipt_show_customer', receipt_show_customer,
        'tax_label', tax_label,
        'tax_price_inclusive', tax_price_inclusive
      ) from store_settings where id = 1),
    'tx', (select json_build_object(
        'id', t.id,
        'created_at', t.created_at,
        'payment_method', t.payment_method,
        'subtotal', t.subtotal,
        'discount', t.discount,
        'delivery_fee', t.delivery_fee,
        'tax_amount', t.tax_amount,
        'total', t.total,
        'paid_amount', t.paid_amount,
        'change_amount', t.change_amount
      ) from transactions t where t.id = p_id and t.status = 'completed'),
    'items', (select coalesce(json_agg(json_build_object(
        'name', p.name,
        'price_type', ti.price_type,
        'qty', ti.qty,
        'unit_price', ti.unit_price
      ) order by ti.id), '[]'::json)
      from transaction_items ti
      join products p on p.id = ti.product_id
      where ti.transaction_id = p_id),
    'cashierName', (select pr.full_name from transactions t join profiles pr on pr.id = t.cashier_id where t.id = p_id),
    'customerName', (select c.name from transactions t join customers c on c.id = t.customer_id where t.id = p_id)
  ) into v_result;

  return v_result;
end;
$$;

-- Sengaja dibuka untuk 'anon' -- inilah yang membuat pelanggan tanpa akun
-- bisa membuka link struknya lewat QR. Fungsi di atas sudah membatasi field
-- & hanya transaksi 'completed' yang bisa dibaca lewat sini.
revoke all on function get_public_receipt(uuid) from public;
grant execute on function get_public_receipt(uuid) to anon, authenticated;
