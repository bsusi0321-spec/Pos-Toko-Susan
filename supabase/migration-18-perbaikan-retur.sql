-- Migration 18: Perbaikan bug di halaman Retur Barang
--
-- Ditemukan 2 bug dengan pola sama seperti bug transaksi & shift sebelumnya:
-- tabel `returns` RLS aktif tapi HANYA punya policy select & insert. Tidak
-- ada policy UPDATE maupun DELETE. Akibatnya:
--
-- 1. Tombol "Sudah Diambil" / "Tandai Belum Diambil" terlihat berhasil
--    (tidak ada pesan error) tapi status retur sebenarnya TIDAK berubah
--    di database — akan kembali seperti semula begitu halaman di-refresh.
-- 2. Pembersihan otomatis "retur yang sudah diambil lebih dari 1 bulan"
--    (dijalankan tiap kali halaman Retur dibuka) tidak pernah benar-benar
--    menghapus apa pun, jadi riwayat retur menumpuk terus meski aplikasi
--    bilang "data otomatis dihapus permanen 1 bulan setelah diambil".
--
-- Catatan: pakai "drop policy if exists" dulu supaya migration ini aman
-- dijalankan ulang meski sebagian policy-nya sudah sempat terpasang.

drop policy if exists "returns_update" on returns;
drop policy if exists "returns_delete" on returns;

create policy "returns_update" on returns for update using (is_active_user());
create policy "returns_delete" on returns for delete using (is_active_user());
