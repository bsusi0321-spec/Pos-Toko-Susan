"use client";

// Kolom "pilih barang" yang bisa DIKETIK manual (nama/SKU/barcode, boleh sebagian
// & urutan bebas -- lihat lib/search.js) SELAIN bisa diisi lewat scan barcode.
// Dipakai untuk mengganti <select> polos berisi semua produk (yang cuma bisa
// dicari dengan scroll atau scan) di halaman Pembelian, Retur, dan Label & Barcode.
//
// value/onSelect dikontrol dari luar seperti komponen form biasa: value = id
// produk yang terpilih, onSelect(product) dipanggil saat user memilih dari
// daftar hasil ketik. Kalau produk terpilih berubah dari luar (misal hasil
// scan barcode men-set product_id), kolom ketik otomatis menampilkan nama
// produk itu supaya kelihatan jelas barang apa yang aktif.

import { useEffect, useMemo, useState } from "react";
import { formatRupiah } from "@/lib/format";
import { searchProducts } from "@/lib/search";

export default function ProductSearchInput({
  products,
  value,
  onSelect,
  placeholder = "Ketik nama, SKU, atau barcode barang...",
  className = "",
  disabled = false,
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = (products || []).find((p) => p.id === value);

  useEffect(() => {
    setQuery(selected ? selected.name : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const results = useMemo(() => searchProducts(products, query, 8), [products, query]);

  return (
    <div className={`relative ${className}`}>
      <input
        value={query}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() =>
          setTimeout(() => {
            setOpen(false);
            // Kalau ditinggal tanpa memilih dari daftar, kembalikan ke nama
            // produk yang benar-benar terpilih (biar tidak membingungkan).
            setQuery(selected ? selected.name : "");
          }, 150)
        }
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
      />
      {open && query.trim() && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-20 bg-surface border border-border rounded-lg shadow-lg max-h-72 overflow-y-auto">
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSelect(p);
                setQuery(p.name);
                setOpen(false);
              }}
              className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm border-b border-border last:border-b-0 hover:bg-primary-soft text-left"
            >
              <span className="font-medium truncate">{p.name}</span>
              {p.sell_price != null && <span className="text-ink-muted shrink-0 text-xs">{formatRupiah(p.sell_price)}</span>}
            </button>
          ))}
        </div>
      )}
      {open && query.trim() && results.length === 0 && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-20 bg-surface border border-border rounded-lg shadow-lg px-4 py-2.5 text-sm text-ink-muted">
          Barang tidak ditemukan
        </div>
      )}
    </div>
  );
}
