"use client";

// Satu baris hitungan di halaman Stok Opname.
// Dipisah dan dibungkus React.memo supaya mengetik angka di SATU baris tidak
// menggambar ulang ribuan baris lainnya (itu penyebab ketikan tertinggal saat
// sesi opname berisi semua produk). Baris hanya digambar ulang kalau datanya
// sendiri berubah. Semua aksi lewat `actions` yang identitasnya stabil tetapi
// selalu memanggil versi terbaru fungsi di halaman induk, jadi tidak ada data basi.

import { memo } from "react";
import { X } from "lucide-react";
import { formatNumber, formatRupiah } from "@/lib/format";

export const REASONS = ["Rusak", "Kadaluarsa", "Hilang", "Salah input stok", "Salah catat pembelian/retur", "Lainnya"];

const diffTone = (d) => (d < 0 ? "text-danger" : d > 0 ? "text-primary" : "text-ink-muted");

function OpnameRow({ i, n, typed, saving, isDraft, hideSystem, registerRef, actions }) {
  const isCounted = i.physical_qty !== null;
  const diff = isCounted ? Number(i.diff_qty) : 0;
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2 pr-3 text-ink-muted">{n + 1}</td>
      <td className="py-2 pr-3">
        {i.product_name}
        {i.unit_label && <span className="text-xs text-ink-muted"> ({i.unit_label})</span>}
        {i.product_id === null && <span className="block text-xs text-danger">Produk sudah dihapus</span>}
      </td>
      {!hideSystem && <td className="py-2 pr-3 text-right">{isCounted ? formatNumber(i.system_qty, 3) : "-"}</td>}
      <td className="py-2 pr-3 text-right">
        {isDraft && i.product_id ? (
          <input
            ref={(el) => registerRef(i.id, el)}
            type="text"
            inputMode="decimal"
            disabled={saving}
            placeholder="0"
            value={typed !== undefined ? typed : isCounted ? String(Number(i.physical_qty)) : ""}
            onChange={(e) => actions.type(i.id, e.target.value)}
            onBlur={() => actions.save(i)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-right outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary disabled:opacity-50"
          />
        ) : isCounted ? (
          formatNumber(i.physical_qty, 3)
        ) : (
          "-"
        )}
      </td>
      {!hideSystem && (
        <td className={`py-2 pr-3 text-right font-medium ${isCounted ? diffTone(diff) : ""}`}>
          {isCounted ? (diff > 0 ? "+" : "") + formatNumber(diff, 3) : "-"}
        </td>
      )}
      {!hideSystem && (
        <td className={`py-2 pr-3 text-right ${isCounted ? diffTone(diff) : ""}`}>
          {isCounted ? formatRupiah(diff * Number(i.cost_price)) : "-"}
        </td>
      )}
      <td className="py-2 pr-3">
        {isDraft ? (
          isCounted ? (
            <select
              value={i.reason || ""}
              onChange={(e) => actions.reason(i, e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">-</option>
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-ink-muted">-</span>
          )
        ) : (
          i.reason || "-"
        )}
      </td>
      {isDraft && (
        <td className="py-2 text-right">
          {isCounted && (
            <button
              type="button"
              title="Batalkan hitungan barang ini"
              onClick={() => actions.clear(i)}
              className="text-ink-muted hover:text-danger p-1"
            >
              <X size={16} />
            </button>
          )}
        </td>
      )}
    </tr>
  );
}

export default memo(OpnameRow);
