-- Kamus singkatan untuk suara kasir (Text-to-Speech) -- supaya singkatan di
-- nama produk (SCHT, ML, KG, dst) dibacakan sebagai kata lengkap ("saset",
-- "mili liter", "kilogram") alih-alih dieja huruf per huruf oleh mesin suara.
-- Halaman "Kamus Suara" (khusus admin) mengelola tabel ini; nama produk yang
-- tersimpan di tabel `products` TIDAK diubah sama sekali -- kamus ini cuma
-- dipakai untuk "menerjemahkan" teks sesaat sebelum dibacakan di kasir.

create table if not exists voice_dictionary (
  id uuid primary key default gen_random_uuid(),
  abbreviation text not null unique, -- disimpan huruf besar semua (dicocokkan case-insensitive)
  spoken_as text not null,
  created_at timestamptz not null default now()
);

-- Jaga-jaga supaya tidak dobel walau ada yang mengetik huruf besar/kecil
-- beda (mis. "SCHT" dan "scht" dianggap tabrakan yang sama).
create unique index if not exists voice_dictionary_abbr_ci_idx on voice_dictionary (upper(abbreviation));

alter table voice_dictionary enable row level security;

-- Semua pengguna aktif (kasir & admin) boleh membaca -- dipakai kasir untuk
-- proses "menerjemahkan" nama produk sebelum dibacakan. Cuma admin yang boleh
-- tambah/ubah/hapus lewat halaman Kamus Suara.
create policy "voice_dictionary_select" on voice_dictionary for select using (is_active_user());
create policy "voice_dictionary_admin_all" on voice_dictionary for all using (is_admin()) with check (is_admin());

-- Data awal -- singkatan satuan/kemasan paling umum dipakai di produk retail
-- Indonesia. Admin bebas tambah, ubah, atau hapus dari halaman Kamus Suara.
insert into voice_dictionary (abbreviation, spoken_as) values
  ('SCHT', 'saset'),
  ('SACHET', 'saset'),
  ('ML', 'mili liter'),
  ('L', 'liter'),
  ('LTR', 'liter'),
  ('KG', 'kilogram'),
  ('G', 'gram'),
  ('GR', 'gram'),
  ('MG', 'miligram'),
  ('PCS', 'pis'),
  ('PC', 'pis'),
  ('PACK', 'pak'),
  ('BTL', 'botol'),
  ('RTG', 'renteng'),
  ('BKS', 'bungkus'),
  ('LSN', 'lusin'),
  ('DZ', 'lusin'),
  ('KRG', 'karung'),
  ('KRT', 'karton'),
  ('CTN', 'karton'),
  ('BOX', 'boks'),
  ('MM', 'milimeter'),
  ('CM', 'sentimeter')
on conflict (abbreviation) do nothing;
