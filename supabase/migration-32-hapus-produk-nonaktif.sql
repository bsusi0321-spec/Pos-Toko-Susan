-- ============================================================
-- MIGRASI TAMBAHAN #32 — jalankan SEKALI di SQL Editor Supabase
-- (setelah migration-31-timbangan-gram-per-cabang.sql)
--
-- Tujuan: produk NONAKTIF boleh dihapus permanen, walau sudah pernah
-- terjual/dibeli/diretur. Transaksi & riwayatnya TIDAK ikut terhapus.
--
-- Sebelumnya: menghapus produk yang sudah pernah terjual ditolak database
-- (foreign key), jadi cuma bisa dinonaktifkan.
--
-- Perbaikan:
-- 1. Nama produk di-"foto" (kolom product_name) di setiap baris riwayat:
--    transaction_items, purchase_order_items, returns, stock_movements.
--    Data lama diisi otomatis dari nama produk sekarang. Baris baru diisi
--    otomatis oleh trigger, jadi kode aplikasi lain tidak perlu berubah.
-- 2. Kolom product_id di tabel-tabel itu boleh kosong, dan foreign key-nya
--    diganti ON DELETE SET NULL: saat produk dihapus, riwayat tetap ada,
--    hanya product_id-nya jadi kosong (namanya tetap tersimpan).
-- 3. Shortcut kasir yang menunjuk produk itu ikut terhapus (percuma
--    tanpa produknya).
-- 4. Struk publik (/struk/[id]) tetap menampilkan nama barang walau produknya
--    sudah dihapus.
-- ============================================================

-- 1) Kolom snapshot nama produk
alter table transaction_items   add column if not exists product_name text;
alter table purchase_order_items add column if not exists product_name text;
alter table returns              add column if not exists product_name text;
alter table stock_movements      add column if not exists product_name text;

-- Isi data lama
update transaction_items t    set product_name = p.name from products p where p.id = t.product_id and t.product_name is null;
update purchase_order_items t set product_name = p.name from products p where p.id = t.product_id and t.product_name is null;
update returns t              set product_name = p.name from products p where p.id = t.product_id and t.product_name is null;
update stock_movements t      set product_name = p.name from products p where p.id = t.product_id and t.product_name is null;

-- Trigger: isi otomatis untuk baris baru
create or replace function fill_product_name_snapshot() returns trigger as $$
begin
  if new.product_name is null and new.product_id is not null then
    select name into new.product_name from products where id = new.product_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_fill_product_name on transaction_items;
create trigger trg_fill_product_name before insert on transaction_items
  for each row execute function fill_product_name_snapshot();

drop trigger if exists trg_fill_product_name on purchase_order_items;
create trigger trg_fill_product_name before insert on purchase_order_items
  for each row execute function fill_product_name_snapshot();

drop trigger if exists trg_fill_product_name on returns;
create trigger trg_fill_product_name before insert on returns
  for each row execute function fill_product_name_snapshot();

drop trigger if exists trg_fill_product_name on stock_movements;
create trigger trg_fill_product_name before insert on stock_movements
  for each row execute function fill_product_name_snapshot();

-- 2) product_id boleh kosong + foreign key jadi ON DELETE SET NULL
do $$
declare
  t text;
  c record;
begin
  foreach t in array array['transaction_items','purchase_order_items','returns','stock_movements'] loop
    execute format('alter table %I alter column product_id drop not null', t);
    for c in
      select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_class ref on ref.oid = con.confrelid
      where con.contype = 'f' and rel.relname = t and ref.relname = 'products'
    loop
      execute format('alter table %I drop constraint %I', t, c.conname);
    end loop;
    execute format('alter table %I add constraint %I foreign key (product_id) references products(id) on delete set null', t, t || '_product_id_fkey');
  end loop;
end $$;

-- 3) Shortcut kasir ikut terhapus bersama produknya
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_class ref on ref.oid = con.confrelid
    where con.contype = 'f' and rel.relname = 'cashier_shortcuts' and ref.relname = 'products'
  loop
    execute format('alter table cashier_shortcuts drop constraint %I', c.conname);
  end loop;
  alter table cashier_shortcuts add constraint cashier_shortcuts_product_id_fkey
    foreign key (product_id) references products(id) on delete cascade;
end $$;

-- 4) Struk publik: pakai nama tersimpan, produk boleh sudah tidak ada
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
        'name', coalesce(ti.product_name, p.name, '(produk sudah dihapus)'),
        'price_type', ti.price_type,
        'price_type_label', ti.price_type_label,
        'qty', ti.qty,
        'unit_price', ti.unit_price
      ) order by ti.id), '[]'::json)
      from transaction_items ti
      left join products p on p.id = ti.product_id
      where ti.transaction_id = p_id),
    'cashierName', (select pr.full_name from transactions t join profiles pr on pr.id = t.cashier_id where t.id = p_id),
    'customerName', (select c.name from transactions t join customers c on c.id = t.customer_id where t.id = p_id)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function get_public_receipt(uuid) from public;
grant execute on function get_public_receipt(uuid) to anon, authenticated;
