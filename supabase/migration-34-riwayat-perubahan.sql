-- ============================================================
-- MIGRASI TAMBAHAN #34 — jalankan SEKALI di SQL Editor Supabase
-- (setelah migration-33-stok-opname.sql)
--
-- Fitur: RIWAYAT PERUBAHAN (audit) + pembersihan log rutin.
--
-- Masalah sebelumnya: "Log Aktivitas" ditulis dari kode aplikasi, jadi
-- hanya mencatat sedikit hal, tidak mencatat edit harga/stok/produk,
-- dan perubahan lewat SQL Editor tidak terlihat sama sekali.
--
-- Sekarang: pencatatan dilakukan oleh TRIGGER di database. Setiap
-- tambah/ubah/hapus pada tabel penting otomatis dicatat: siapa, kapan,
-- nilai lama -> nilai baru. Tidak bisa dilewati lewat halaman mana pun.
--
--   source = 'aplikasi'           -> dilakukan lewat aplikasi (ada nama user)
--   source = 'server'             -> dilakukan server aplikasi (mis. kelola pengguna)
--   source = 'database langsung'  -> lewat SQL Editor / Table Editor Supabase
--
-- Riwayat TIDAK bisa diubah/dihapus lewat aplikasi. Yang boleh dihapus
-- hanya baris berlabel 'rutin' yang lebih tua dari 30 hari, lewat fungsi
-- bersihkan_log_rutin() di bawah.
--
-- Yang TIDAK dicatat (sengaja, agar tidak menumpuk):
--   - pengurangan stok akibat penjualan (sudah ada di stock_movements)
--   - transaksi baru (sudah ada di tabel transaksi itu sendiri)
--
-- AMAN dijalankan ulang. Satu-satunya fungsi lama yang diganti adalah
-- adjust_branch_stock (isinya SAMA persis dengan migration-21, hanya
-- ditambah 1 baris penanda "jangan catat pengurangan stok penjualan").
-- ============================================================

-- ------------------------------------------------------------
-- 1) TABEL RIWAYAT
-- ------------------------------------------------------------
create table if not exists audit_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  table_name text not null,
  record_id text,
  record_label text,                 -- nama yang mudah dibaca (mis. nama produk)
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  old_data jsonb,                    -- UPDATE: hanya kolom yang berubah. DELETE: seluruh baris.
  new_data jsonb,                    -- UPDATE: hanya kolom yang berubah. INSERT: seluruh baris.
  changed_keys text[],
  user_id uuid,                      -- sengaja tanpa foreign key: riwayat tetap ada walau akun dihapus
  user_name text,
  source text not null,
  context text,                      -- mis. "Stok opname SO-20260930-001"
  importance text not null default 'penting' check (importance in ('penting','rutin'))
);

-- Untuk tombol "Riwayat" per produk (termasuk stok, harga grosir/kg, dan barcode produk itu).
alter table audit_log add column if not exists product_id uuid;
create index if not exists audit_log_product_idx on audit_log (product_id, created_at desc) where product_id is not null;

create index if not exists audit_log_created_idx on audit_log (created_at desc);
create index if not exists audit_log_table_idx on audit_log (table_name, created_at desc);
create index if not exists audit_log_record_idx on audit_log (table_name, record_id);
create index if not exists audit_log_rutin_idx on audit_log (created_at) where importance = 'rutin';

alter table audit_log enable row level security;
drop policy if exists "audit_admin_select" on audit_log;
create policy "audit_admin_select" on audit_log for select using (is_admin());
-- Sengaja TIDAK ada policy insert/update/delete: aplikasi tidak bisa menulis
-- atau mengubah riwayat. Hanya trigger di bawah (security definer) yang menulis.

revoke all on audit_log from anon, authenticated;
grant select on audit_log to authenticated;

-- Pengunci: baris riwayat tidak boleh diubah, dan hanya baris 'rutin' yang
-- boleh dihapus (itupun hanya lewat bersihkan_log_rutin).
create or replace function audit_log_protect() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE'
     and old.importance = 'rutin'
     and current_setting('app.audit_cleanup', true) = '1' then
    return old;
  end if;
  raise exception 'Riwayat perubahan tidak boleh diubah atau dihapus';
end;
$$;

drop trigger if exists trg_audit_log_protect on audit_log;
create trigger trg_audit_log_protect before update or delete on audit_log
  for each row execute function audit_log_protect();

create or replace function audit_log_protect_truncate() returns trigger
language plpgsql as $$
begin
  raise exception 'Riwayat perubahan tidak boleh dikosongkan';
end;
$$;

drop trigger if exists trg_audit_log_protect_truncate on audit_log;
create trigger trg_audit_log_protect_truncate before truncate on audit_log
  for each statement execute function audit_log_protect_truncate();

-- ------------------------------------------------------------
-- 2) FUNGSI PENCATAT (dipasang sebagai trigger di banyak tabel)
-- ------------------------------------------------------------
-- PENTING: kegagalan mencatat riwayat TIDAK boleh menggagalkan pekerjaan
-- utama (mis. menyimpan penjualan). Kalau ada error, hanya keluar WARNING.
create or replace function audit_row_change() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_old_d jsonb;
  v_new_d jsonb;
  v_keys text[];
  v_name text;
  v_source text;
  v_label text;
  v_id text;
  v_importance text := 'penting';
  v_pname text;
  v_bname text;
  v_product uuid;
  v_secret text[] := array['telegram_bot_token'];
  v_noise text[] := array['updated_at'];
  k text;
begin
  begin
    if tg_op = 'INSERT' then
      v_new := to_jsonb(new); v_row := v_new;
    elsif tg_op = 'DELETE' then
      v_old := to_jsonb(old); v_row := v_old;
    else
      v_old := to_jsonb(old); v_new := to_jsonb(new); v_row := v_new;
    end if;

    -- Pengurangan/penambahan stok dari PENJUALAN sudah punya catatan di
    -- stock_movements -> jangan dobel (ditandai oleh adjust_branch_stock).
    if tg_table_name = 'product_branch_stock' and current_setting('app.audit_skip', true) = '1' then
      return null;
    end if;
    -- Baris stok awal (0) yang dibuat otomatis untuk produk/cabang baru: bukan perubahan.
    if tg_table_name = 'product_branch_stock' and tg_op = 'INSERT'
       and coalesce((v_new->>'stock_qty')::numeric, 0) = 0 then
      return null;
    end if;
    -- Anak-anak produk yang ikut terhapus karena produknya dihapus: cukup
    -- catatan penghapusan produknya saja.
    if tg_op = 'DELETE'
       and tg_table_name in ('product_branch_stock','product_wholesale_pricing','product_kg_pricing','product_out_of_town_pricing','product_barcodes')
       and not exists (select 1 from products where id = (v_old->>'product_id')::uuid) then
      return null;
    end if;

    -- Tingkat kepentingan
    if tg_table_name in ('cashier_shortcuts','voice_dictionary','label_settings','product_price_labels','product_units') then
      v_importance := 'rutin';
    elsif tg_table_name = 'transactions' and tg_op = 'DELETE' and v_old->>'status' = 'pending' then
      v_importance := 'rutin';  -- kasir membatalkan transaksi tertunda: hal biasa
    elsif tg_table_name = 'stock_opnames' and tg_op = 'DELETE' and v_old->>'status' in ('draft','batal') then
      v_importance := 'rutin';  -- sesi opname yang belum diterapkan dibuang: tidak mengubah stok
    end if;

    -- UPDATE: simpan hanya kolom yang benar-benar berubah
    if tg_op = 'UPDATE' then
      select array_agg(n.key order by n.key),
             jsonb_object_agg(n.key, v_old -> n.key),
             jsonb_object_agg(n.key, n.value)
        into v_keys, v_old_d, v_new_d
        from jsonb_each(v_new) n
       where (v_old -> n.key) is distinct from n.value
         and not (n.key = any(v_noise));
      if v_keys is null then return null; end if;   -- tidak ada perubahan berarti
      v_old := v_old_d;
      v_new := v_new_d;
    else
      select array_agg(key order by key) into v_keys from jsonb_object_keys(v_row) as key;
    end if;

    -- Data rahasia (token) tidak boleh terbaca di riwayat
    foreach k in array v_secret loop
      if v_old is not null and v_old ? k then v_old := jsonb_set(v_old, array[k], to_jsonb('(disembunyikan)'::text)); end if;
      if v_new is not null and v_new ? k then v_new := jsonb_set(v_new, array[k], to_jsonb('(disembunyikan)'::text)); end if;
    end loop;

    -- Produk terkait (untuk riwayat per produk)
    if tg_table_name = 'products' then v_product := (v_row->>'id')::uuid;
    elsif v_row ? 'product_id' then v_product := (v_row->>'product_id')::uuid;
    end if;

    -- ID & label yang mudah dibaca
    v_id := coalesce(v_row->>'id', nullif(concat_ws(':', v_row->>'product_id', v_row->>'branch_id'), ''));

    if tg_table_name = 'transactions' then
      v_label := 'TRX-' || upper(left(v_row->>'id', 8)) || ' (total ' || coalesce(v_row->>'total', '0') || ')';
    elsif v_row ? 'product_id' then
      select name into v_pname from products where id = (v_row->>'product_id')::uuid;
      v_label := coalesce(v_pname, '(produk sudah dihapus)');
      if v_row ? 'barcode' then v_label := v_label || ' - ' || (v_row->>'barcode'); end if;
      if v_row ? 'branch_id' then
        select name into v_bname from branches where id = (v_row->>'branch_id')::uuid;
        v_label := v_label || ' @ ' || coalesce(v_bname, '?');
      end if;
    elsif tg_table_name = 'shifts' then
      select full_name into v_pname from profiles where id = (v_row->>'cashier_id')::uuid;
      v_label := 'Shift ' || coalesce(v_pname, '?') || ' - ' || coalesce(v_row->>'opening_time', '');
    elsif v_row ? 'customer_id' then
      select name into v_pname from customers where id = (v_row->>'customer_id')::uuid;
      v_label := v_pname;
    else
      v_label := coalesce(v_row->>'name', v_row->>'full_name', v_row->>'store_name', v_row->>'code',
                          v_row->>'period_key', v_row->>'description', v_row->>'label', v_row->>'abbreviation');
    end if;

    -- Pelaku
    if v_uid is not null then
      select full_name into v_name from profiles where id = v_uid;
    end if;
    v_source := case
      when v_uid is not null then 'aplikasi'
      when auth.role() = 'service_role' then 'server'
      else 'database langsung'
    end;

    insert into audit_log (table_name, record_id, record_label, action, old_data, new_data, changed_keys,
                           user_id, user_name, source, context, importance, product_id)
    values (tg_table_name, v_id, v_label, tg_op, v_old, v_new, v_keys,
            v_uid, v_name, v_source, nullif(current_setting('app.audit_context', true), ''), v_importance, v_product);
  exception when others then
    raise warning 'audit_row_change gagal (% %): %', tg_table_name, tg_op, sqlerrm;
  end;
  return null;
end;
$$;

-- ------------------------------------------------------------
-- 3) PASANG TRIGGER DI TABEL YANG DIPANTAU
--    (tabel yang belum ada di databasemu otomatis dilewati)
-- ------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select * from (values
      -- tabel, nama trigger, kejadian, syarat (WHEN)
      ('products',                    'trg_audit',     'insert or update or delete', null),
      ('product_branch_stock',        'trg_audit',     'insert or update or delete', null),
      ('product_wholesale_pricing',   'trg_audit',     'insert or update or delete', null),
      ('product_kg_pricing',          'trg_audit',     'insert or update or delete', null),
      ('product_out_of_town_pricing', 'trg_audit',     'insert or update or delete', null),
      ('product_barcodes',            'trg_audit',     'insert or update or delete', null),
      ('profiles',                    'trg_audit',     'insert or update or delete', null),
      ('store_settings',              'trg_audit',     'update',                     null),
      ('customers',                   'trg_audit',     'insert or update or delete', null),
      ('suppliers',                   'trg_audit',     'insert or update or delete', null),
      ('branches',                    'trg_audit',     'insert or update or delete', null),
      ('cash_movements',              'trg_audit',     'insert or update or delete', null),
      ('monthly_closings',            'trg_audit',     'insert or delete',           null),
      ('transactions',                'trg_audit_upd', 'update', '(old.status is distinct from new.status and new.status = ''void'') or old.total is distinct from new.total'),
      ('transactions',                'trg_audit_del', 'delete', null),
      ('shifts',                      'trg_audit_del', 'delete', null),
      ('kasbon',                      'trg_audit_upd', 'update', 'old.amount is distinct from new.amount'),
      ('kasbon',                      'trg_audit_del', 'delete', null),
      ('kasbon_payments',             'trg_audit_del', 'delete', null),
      ('supplier_payments',           'trg_audit_del', 'delete', null),
      ('purchase_orders',             'trg_audit_del', 'delete', null),
      ('stock_opnames',               'trg_audit_upd', 'update', 'old.status is distinct from new.status'),
      ('stock_opnames',               'trg_audit_del', 'delete', null),
      -- pengaturan tampilan (dianggap rutin, dibersihkan setelah 30 hari)
      ('cashier_shortcuts',           'trg_audit',     'insert or update or delete', null),
      ('voice_dictionary',            'trg_audit',     'insert or update or delete', null),
      ('label_settings',              'trg_audit',     'insert or update or delete', null),
      ('product_price_labels',        'trg_audit',     'insert or update or delete', null),
      ('product_units',               'trg_audit',     'insert or update or delete', null)
    ) as t(tbl, trg, ev, cond)
  loop
    if to_regclass('public.' || r.tbl) is null then
      continue;
    end if;
    execute format('drop trigger if exists %I on %I', r.trg, r.tbl);
    execute format(
      'create trigger %I after %s on %I for each row %s execute function audit_row_change()',
      r.trg, r.ev, r.tbl,
      case when r.cond is null then '' else 'when (' || r.cond || ')' end
    );
  end loop;
end $$;

-- ------------------------------------------------------------
-- 4) adjust_branch_stock: SAMA persis migration-21 + 1 baris penanda
--    (dipakai kasir tiap penjualan; pengurangan stok penjualan tidak
--    perlu dicatat dua kali karena sudah ada di stock_movements)
-- ------------------------------------------------------------
create or replace function adjust_branch_stock(p_product_id uuid, p_branch_id uuid, p_delta numeric)
returns table(new_stock numeric, min_stock numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.audit_skip', '1', true);

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

revoke all on function adjust_branch_stock(uuid, uuid, numeric) from public;
grant execute on function adjust_branch_stock(uuid, uuid, numeric) to authenticated;

-- Versi gram (belum dipakai kasir) diberi penanda yang sama, supaya kalau
-- nanti diaktifkan tidak membanjiri riwayat. Isi SAMA persis migration-31.
create or replace function adjust_branch_stock_gram(p_product_id uuid, p_branch_id uuid, p_delta numeric)
returns table(new_stock_gram numeric, min_stock numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.audit_skip', '1', true);

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
-- 5) PEMBERSIHAN LOG RUTIN
--    Menghapus PERMANEN yang lebih tua dari p_hari (bawaan 30, minimal 7):
--      a) audit_log berlabel 'rutin' (pengaturan tampilan, batal transaksi tertunda)
--      b) activity_log jenis rutin: checkout, open_shift,
--         create_purchase_order, receive_purchase_order
--         (semuanya sudah punya catatan di tabel aslinya).
--    TIDAK PERNAH disentuh: riwayat berlabel 'penting', transaksi, shift,
--    kas, kasbon, tutup buku, stok opname, stock_movements, retur, bayar
--    hutang supplier.
--    Boleh dipanggil admin (tombol di halaman Riwayat Perubahan) atau
--    server (jadwal harian otomatis).
-- ------------------------------------------------------------
create or replace function bersihkan_log_rutin(p_hari int default 30)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cut timestamptz;
  v_audit int;
  v_aktivitas int;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'Hanya admin yang boleh membersihkan log';
  end if;
  if p_hari is null or p_hari < 7 then
    raise exception 'Batas minimal 7 hari';
  end if;

  v_cut := now() - make_interval(days => p_hari);
  perform set_config('app.audit_cleanup', '1', true);

  delete from audit_log where importance = 'rutin' and created_at < v_cut;
  get diagnostics v_audit = row_count;

  delete from activity_log
   where created_at < v_cut
     and action in ('checkout', 'open_shift', 'create_purchase_order', 'receive_purchase_order');
  get diagnostics v_aktivitas = row_count;

  return json_build_object('audit_dihapus', v_audit, 'aktivitas_dihapus', v_aktivitas, 'sebelum', v_cut);
end;
$$;

revoke all on function bersihkan_log_rutin(int) from public, anon;
grant execute on function bersihkan_log_rutin(int) to authenticated, service_role;

-- Untuk halaman admin: jumlah log rutin yang siap dibersihkan (tanpa menghapus).
create or replace function hitung_log_rutin(p_hari int default 30)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cut timestamptz;
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  v_cut := now() - make_interval(days => greatest(coalesce(p_hari, 30), 7));
  return json_build_object(
    'audit', (select count(*) from audit_log where importance = 'rutin' and created_at < v_cut),
    'aktivitas', (select count(*) from activity_log where created_at < v_cut
                    and action in ('checkout', 'open_shift', 'create_purchase_order', 'receive_purchase_order'))
  );
end;
$$;

revoke all on function hitung_log_rutin(int) from public, anon;
grant execute on function hitung_log_rutin(int) to authenticated;
