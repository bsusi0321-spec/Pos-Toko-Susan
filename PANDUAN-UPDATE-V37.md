# Update V37 — Perbaikan pencarian barang di Kasir

Tidak ada migration SQL. Cukup ganti 3 file lalu build & push:

- `lib/search.js`  (logika pencarian baru)
- `app/kasir/KasirApp.js`  (batas hasil 8 -> 30; file ini juga membawa kolom "No" dari V35)
- `components/ProductSearchInput.js`  (kolom cari barang di Pembelian/Retur/Label, batas 8 -> 30)

## Penyebab barang "tidak bisa dicari"
1. Kasir hanya menampilkan 8 hasil pertama, diurutkan abjad. Mengetik "gula" yang cocok 13 barang
   hanya menampilkan 8; sisanya tidak pernah terlihat.
2. Kata yang diketik harus persis sama dengan potongan di nama. "aqua600" tidak menemukan
   "Aqua 600ml", "s26" tidak menemukan "Susu S-26", "cocacola" tidak menemukan "Coca-Cola".

## Yang diubah
- Hasil diurutkan dari yang paling relevan: barcode/SKU persis, lalu nama diawali kata yang diketik,
  lalu kata di awal nama, lalu sisanya. Tombol Enter sekarang memilih hasil paling relevan.
- Batas hasil 30 (daftar bisa di-scroll).
- Spasi dan tanda baca (-, /, ., +) diabaikan sebagai jaring pengaman kalau pencocokan biasa gagal.
