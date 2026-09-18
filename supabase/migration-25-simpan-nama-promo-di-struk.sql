-- ============================================================
-- MIGRASI TAMBAHAN #25 — jalankan SEKALI di SQL Editor Supabase
-- (setelah migration-24-label-harga-khusus-promo.sql)
--
-- Masalah: struk & riwayat transaksi menampilkan nama tipe harga
-- ("Antar Luar Kota", dst) dari daftar TETAP di kode, bukan dari label
-- yang benar-benar dipakai SAAT transaksi terjadi. Akibatnya kalau admin
-- ganti/hapus label promo di kemudian hari, struk transaksi LAMA ikut
-- berubah tampilannya padahal transaksinya sudah lewat -- bisa bikin
-- pelanggan komplain karena tidak sesuai dengan yang di kasir waktu itu.
--
-- Perbaikan: setiap kali item dijual, nama labelnya di-"foto" (snapshot)
-- dan disimpan permanen di baris transaksi itu sendiri -- sama seperti
-- cost_price_snapshot yang sudah ada duluan untuk harga modal. Jadi struk
-- lama akan SELALU menampilkan nama yang sama persis dengan yang dipakai
-- pas transaksi, walau label promonya sudah diubah/dihapus belakangan.
-- ============================================================

alter table transaction_items add column if not exists price_type_label text;

-- Perbaiki data transaksi LAMA yang sudah ada supaya ikut punya snapshot
-- (dari label yang sedang aktif di produk sekarang -- ini cuma tebakan
-- terbaik untuk data lama, karena transaksi sebelum migrasi ini memang
-- tidak pernah menyimpan snapshot-nya).
update transaction_items ti
set price_type_label = coalesce(oot.label, 'Antar Luar Kota')
from product_out_of_town_pricing oot
where ti.price_type = 'out_of_town'
  and ti.product_id = oot.product_id
  and ti.price_type_label is null;

-- Fungsi struk publik (dipakai halaman /struk/[id] yang dibuka pelanggan
-- lewat QR) perlu diperbarui supaya ikut mengembalikan price_type_label.
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
        'price_type_label', ti.price_type_label,
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

revoke all on function get_public_receipt(uuid) from public;
grant execute on function get_public_receipt(uuid) to anon, authenticated;
