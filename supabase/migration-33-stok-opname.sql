-- ============================================================
-- MIGRASI TAMBAHAN #33 — jalankan SEKALI di SQL Editor Supabase
-- (setelah migration-32-hapus-produk-nonaktif.sql)
--
-- Fitur: STOK OPNAME (mencocokkan stok sistem dengan hitungan fisik).
--
-- Cara kerjanya:
--   1) Admin membuat sesi opname untuk 1 cabang, lalu menambahkan barang
--      yang mau dihitung (semua produk aktif, atau sebagian saja).
--   2) Setiap barang dihitung -> tersimpan "stok fisik" + "stok sistem
--      pada saat barang itu dihitung" (dicatat oleh database, bukan oleh
--      browser, jadi angkanya tidak bisa dipalsukan dari layar).
--   3) Saat diterapkan: stok TIDAK ditimpa mentah-mentah, tapi dikoreksi
--      sebesar selisihnya (fisik - sistem saat dihitung). Jadi penjualan
--      yang terjadi SETELAH barang dihitung tetap terhitung dan tidak
--      hilang. Toko boleh tetap buka saat opname.
--   4) Setelah diterapkan, sesi TERKUNCI (tidak bisa diedit/dihapus).
--      Setiap penyesuaian dicatat ke stock_movements (jenis 'koreksi',
--      catatan "Opname SO-...").
--
-- AMAN dijalankan ulang (memakai "if not exists" / "create or replace").
-- Tidak mengubah tabel atau fungsi lama sama sekali.
-- ============================================================

-- ------------------------------------------------------------
-- 1) TABEL
-- ------------------------------------------------------------
create table if not exists stock_opnames (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                 -- contoh: SO-20260930-001
  branch_id uuid not null references branches(id),
  status text not null default 'draft' check (status in ('draft','selesai','batal')),
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  applied_by uuid references profiles(id),
  applied_at timestamptz
);

create table if not exists stock_opname_items (
  id uuid primary key default gen_random_uuid(),
  opname_id uuid not null references stock_opnames(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name text not null,                -- "foto" nama produk saat ditambahkan
  unit_label text,                           -- satuan untuk tampilan (PCS / Kg / dst)
  cost_price numeric(14,2) not null default 0, -- harga modal saat ditambahkan (untuk nilai selisih)
  system_qty numeric(14,3),                  -- stok sistem SAAT barang ini dihitung
  physical_qty numeric(14,3),                -- hasil hitung fisik (kosong = belum dihitung)
  diff_qty numeric(14,3) generated always as (physical_qty - system_qty) stored,
  reason text,
  note text,
  counted_by uuid references profiles(id),
  counted_at timestamptz,
  unique (opname_id, product_id)
);

create index if not exists stock_opname_items_opname_idx on stock_opname_items (opname_id);
create index if not exists stock_opnames_created_idx on stock_opnames (created_at desc);

-- ------------------------------------------------------------
-- 2) AKSES: hanya admin yang boleh MELIHAT. Semua perubahan wajib lewat
--    fungsi di bawah (bukan edit tabel langsung), supaya angka stok sistem
--    dan hasil hitung tidak bisa diakali dari luar aplikasi.
-- ------------------------------------------------------------
alter table stock_opnames enable row level security;
alter table stock_opname_items enable row level security;

drop policy if exists "opname_admin_all" on stock_opnames;
drop policy if exists "opname_admin_select" on stock_opnames;
create policy "opname_admin_select" on stock_opnames for select using (is_admin());

drop policy if exists "opname_items_admin_all" on stock_opname_items;
drop policy if exists "opname_items_admin_select" on stock_opname_items;
create policy "opname_items_admin_select" on stock_opname_items for select using (is_admin());

revoke all on stock_opnames, stock_opname_items from anon, authenticated;
grant select on stock_opnames, stock_opname_items to authenticated;

-- ------------------------------------------------------------
-- 3) PENGUNCI: sesi yang sudah selesai/batal tidak boleh diubah lagi
-- ------------------------------------------------------------
create or replace function opname_guard_header() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'selesai' then
      raise exception 'Opname % sudah diterapkan dan terkunci, tidak bisa dihapus', old.code;
    end if;
    return old;
  end if;

  if old.status <> 'draft' then
    raise exception 'Opname % sudah % dan terkunci, tidak bisa diubah', old.code, old.status;
  end if;
  if new.branch_id is distinct from old.branch_id
     and exists (select 1 from stock_opname_items where opname_id = old.id) then
    raise exception 'Cabang tidak bisa diganti setelah ada barang di sesi opname ini';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_opname_guard_header on stock_opnames;
create trigger trg_opname_guard_header before update or delete on stock_opnames
  for each row execute function opname_guard_header();

create or replace function opname_guard_items() returns trigger
language plpgsql as $$
declare
  v_status text;
  v_opname uuid;
begin
  -- Pengecualian: kalau sebuah PRODUK dihapus, kolom product_id di sini otomatis
  -- jadi kosong (ON DELETE SET NULL). Itu boleh walau sesinya sudah terkunci,
  -- selama tidak ada kolom lain yang berubah (nama produk tetap tersimpan).
  if tg_op = 'UPDATE'
     and old.product_id is not null and new.product_id is null
     and (new.opname_id, new.product_name, new.unit_label, new.cost_price, new.system_qty,
          new.physical_qty, new.reason, new.note, new.counted_by, new.counted_at)
         is not distinct from
         (old.opname_id, old.product_name, old.unit_label, old.cost_price, old.system_qty,
          old.physical_qty, old.reason, old.note, old.counted_by, old.counted_at) then
    return new;
  end if;

  v_opname := case when tg_op = 'DELETE' then old.opname_id else new.opname_id end;
  select status into v_status from stock_opnames where id = v_opname;
  -- v_status kosong = induknya sedang ikut terhapus (cascade dari sesi draft/batal) -> boleh.
  if v_status is not null and v_status <> 'draft' then
    raise exception 'Sesi opname sudah % dan terkunci, barangnya tidak bisa diubah', v_status;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_opname_guard_items on stock_opname_items;
create trigger trg_opname_guard_items before insert or update or delete on stock_opname_items
  for each row execute function opname_guard_items();

-- ------------------------------------------------------------
-- 4) FUNGSI (semua khusus admin)
-- ------------------------------------------------------------

-- 4a) Buat sesi baru. Kode: SO-YYYYMMDD-NNN (tanggal WIB).
create or replace function opname_buat(p_branch_id uuid, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today text;
  v_next int;
  v_id uuid;
begin
  if not is_admin() then raise exception 'Hanya admin yang boleh membuat opname'; end if;
  if not exists (select 1 from branches where id = p_branch_id) then
    raise exception 'Cabang tidak ditemukan';
  end if;

  v_today := to_char((now() at time zone 'Asia/Jakarta')::date, 'YYYYMMDD');
  perform pg_advisory_xact_lock(hashtext('opname_kode'));
  select coalesce(max(substring(code from '[0-9]+$')::int), 0) + 1
    into v_next
    from stock_opnames
   where code like 'SO-' || v_today || '-%';

  insert into stock_opnames (code, branch_id, notes, created_by)
  values ('SO-' || v_today || '-' || lpad(v_next::text, 3, '0'), p_branch_id, nullif(trim(coalesce(p_notes, '')), ''), auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- 4b) Tambah barang ke sesi. p_product_ids kosong (null) = SEMUA produk aktif.
--     Barang yang sudah ada di sesi dilewati. Mengembalikan jumlah yang ditambahkan.
create or replace function opname_tambah_produk(p_opname_id uuid, p_product_ids uuid[] default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_count int;
begin
  if not is_admin() then raise exception 'Hanya admin yang boleh mengubah opname'; end if;
  select status into v_status from stock_opnames where id = p_opname_id;
  if v_status is null then raise exception 'Sesi opname tidak ditemukan'; end if;
  if v_status <> 'draft' then raise exception 'Sesi opname sudah %, tidak bisa ditambah barang', v_status; end if;

  insert into stock_opname_items (opname_id, product_id, product_name, unit_label, cost_price)
  select p_opname_id, p.id, p.name,
         coalesce(nullif(p.unit_label, ''), case when p.unit_type = 'kg' then 'Kg' else 'PCS' end),
         coalesce(p.cost_price, 0)
    from products p
   where (p_product_ids is null and p.active = true)
      or (p_product_ids is not null and p.id = any(p_product_ids))
  on conflict (opname_id, product_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 4c) Simpan hasil hitung 1 barang. Stok sistem diambil SAAT INI oleh database.
--     p_physical kosong (null) = batalkan hitungan barang itu.
create or replace function opname_hitung(p_item_id uuid, p_physical numeric, p_reason text default null, p_note text default null)
returns table(stok_sistem numeric, stok_fisik numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item stock_opname_items%rowtype;
  v_opname stock_opnames%rowtype;
  v_sys numeric;
begin
  if not is_admin() then raise exception 'Hanya admin yang boleh menghitung opname'; end if;
  if p_physical is not null and p_physical < 0 then raise exception 'Stok fisik tidak boleh minus'; end if;

  select * into v_item from stock_opname_items where id = p_item_id;
  if not found then raise exception 'Barang opname tidak ditemukan'; end if;
  select * into v_opname from stock_opnames where id = v_item.opname_id;
  if v_opname.status <> 'draft' then raise exception 'Sesi opname sudah %, tidak bisa diubah', v_opname.status; end if;
  if v_item.product_id is null then raise exception 'Produk ini sudah dihapus, tidak bisa dihitung'; end if;

  if p_physical is null then
    update stock_opname_items
       set system_qty = null, physical_qty = null, reason = null, note = null, counted_by = null, counted_at = null
     where id = p_item_id;
    return query select null::numeric, null::numeric;
    return;
  end if;

  select coalesce(
           (select pbs.stock_qty from product_branch_stock pbs
             where pbs.product_id = v_item.product_id and pbs.branch_id = v_opname.branch_id),
           0)
    into v_sys;

  update stock_opname_items
     set system_qty = v_sys,
         physical_qty = p_physical,
         reason = nullif(trim(coalesce(p_reason, '')), ''),
         note = nullif(trim(coalesce(p_note, '')), ''),
         counted_by = auth.uid(),
         counted_at = now()
   where id = p_item_id;

  return query select v_sys, p_physical;
end;
$$;

-- 4c2) Ubah alasan/catatan barang TANPA mengubah hasil hitung.
create or replace function opname_catatan(p_item_id uuid, p_reason text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not is_admin() then raise exception 'Hanya admin yang boleh mengubah opname'; end if;
  select o.status into v_status
    from stock_opname_items i join stock_opnames o on o.id = i.opname_id
   where i.id = p_item_id;
  if v_status is null then raise exception 'Barang opname tidak ditemukan'; end if;
  if v_status <> 'draft' then raise exception 'Sesi opname sudah %, tidak bisa diubah', v_status; end if;
  update stock_opname_items
     set reason = nullif(trim(coalesce(p_reason, '')), ''),
         note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_item_id;
end;
$$;

-- 4c3) Hapus sesi yang MASIH DRAFT (yang sudah diterapkan tidak bisa dihapus).
create or replace function opname_hapus(p_opname_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'Hanya admin yang boleh menghapus opname'; end if;
  delete from stock_opnames where id = p_opname_id;   -- trigger pengunci menolak kalau sudah selesai
end;
$$;

-- 4d) Terapkan: koreksi stok sebesar selisih tiap barang yang sudah dihitung.
--     Semua-atau-tidak-sama-sekali (satu transaksi database).
create or replace function opname_terapkan(p_opname_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  o stock_opnames%rowtype;
  i record;
  v_delta numeric;
  v_counted int := 0;
  v_adjusted int := 0;
  v_minus numeric := 0;
  v_plus numeric := 0;
begin
  if not is_admin() then raise exception 'Hanya admin yang boleh menerapkan opname'; end if;

  select * into o from stock_opnames where id = p_opname_id for update;
  if not found then raise exception 'Sesi opname tidak ditemukan'; end if;
  if o.status <> 'draft' then raise exception 'Opname % sudah %, tidak bisa diterapkan lagi', o.code, o.status; end if;

  -- Ditandai supaya Riwayat Perubahan tahu perubahan stok ini berasal dari opname.
  perform set_config('app.audit_context', 'Stok opname ' || o.code, true);

  for i in
    select * from stock_opname_items
     where opname_id = p_opname_id and physical_qty is not null and system_qty is not null
     order by product_name
  loop
    v_counted := v_counted + 1;
    v_delta := i.physical_qty - i.system_qty;
    if v_delta = 0 or i.product_id is null then continue; end if;

    update product_branch_stock
       set stock_qty = stock_qty + v_delta
     where product_id = i.product_id and branch_id = o.branch_id;
    if not found then
      insert into product_branch_stock (product_id, branch_id, stock_qty, min_stock)
      values (i.product_id, o.branch_id, v_delta, 0);
    end if;

    insert into stock_movements (product_id, branch_id, movement_type, qty, unit_cost, note, created_by)
    values (i.product_id, o.branch_id, 'koreksi', v_delta, i.cost_price,
            'Opname ' || o.code || coalesce(' - ' || i.reason, ''), auth.uid());

    v_adjusted := v_adjusted + 1;
    if v_delta < 0 then v_minus := v_minus + (v_delta * i.cost_price);
    else v_plus := v_plus + (v_delta * i.cost_price);
    end if;
  end loop;

  if v_counted = 0 then
    raise exception 'Belum ada barang yang dihitung, tidak ada yang bisa diterapkan';
  end if;

  update stock_opnames
     set status = 'selesai', applied_by = auth.uid(), applied_at = now()
   where id = p_opname_id;

  return json_build_object(
    'code', o.code,
    'dihitung', v_counted,
    'disesuaikan', v_adjusted,
    'nilai_kurang', v_minus,
    'nilai_lebih', v_plus
  );
end;
$$;

revoke all on function opname_buat(uuid, text) from public, anon;
revoke all on function opname_tambah_produk(uuid, uuid[]) from public, anon;
revoke all on function opname_hitung(uuid, numeric, text, text) from public, anon;
revoke all on function opname_terapkan(uuid) from public, anon;
revoke all on function opname_catatan(uuid, text, text) from public, anon;
revoke all on function opname_hapus(uuid) from public, anon;
grant execute on function opname_buat(uuid, text) to authenticated;
grant execute on function opname_tambah_produk(uuid, uuid[]) to authenticated;
grant execute on function opname_hitung(uuid, numeric, text, text) to authenticated;
grant execute on function opname_terapkan(uuid) to authenticated;
grant execute on function opname_catatan(uuid, text, text) to authenticated;
grant execute on function opname_hapus(uuid) to authenticated;
