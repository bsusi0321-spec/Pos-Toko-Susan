-- "Tutup Buku Bulanan" -- tempat KHUSUS admin memotong estimasi laba kotor
-- bulanan dengan kas masuk/keluar toko (cash_movements), dilakukan manual
-- oleh admin (biasanya di akhir bulan), BUKAN otomatis dipotong di Dashboard.
-- Setiap "tutup buku" tersimpan permanen sebagai catatan sejarah -- angka
-- laba kotor & kas masuk/keluar boleh terus berubah di data mentahnya
-- (transaksi baru menyusul, dsb), tapi begitu sebuah bulan sudah "ditutup",
-- catatan hasil perhitungannya TIDAK ikut berubah lagi (snapshot).

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
