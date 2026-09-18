"use client";

// Halaman PUBLIK (tanpa login) untuk pelanggan membuka struknya sendiri lewat
// scan kode QR di ReceiptModal / struk cetak. Data diambil lewat fungsi
// database get_public_receipt (RPC, security definer) yang cuma
// mengembalikan field yang memang layak dilihat publik untuk transaksi
// berstatus "completed" saja — bukan akses langsung ke tabel transactions
// yang dikunci RLS untuk kasir/admin.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatRupiah, formatNumber, formatDateTime, txCode } from "@/lib/format";
import { downloadReceiptImage } from "@/lib/downloadReceiptImage";

const PRICE_TYPE_LABELS = {
  grosir: "Grosir",
  half_grosir: "1/2 Grosir",
  kg: "Per Kg",
  half_kg: "Per 1/2 Kg",
  ons: "Per Ons",
  out_of_town: "Antar Luar Kota",
};

const PAYMENT_LABELS = { tunai: "Tunai", transfer: "Transfer", qris: "QRIS", kasbon: "Kasbon" };

export default function PublicReceiptPage() {
  const params = useParams();
  const id = params?.id;
  const [state, setState] = useState("loading"); // loading | ok | not_found | error
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!id) return;
    const supabase = createClient();
    // get_public_receipt mengembalikan satu nilai json (bukan tabel/baris),
    // jadi TIDAK pakai .single() di sini (itu untuk fungsi yang me-return
    // baris/tabel, beda kasus dengan adjust_branch_stock di KasirApp.js).
    supabase
      .rpc("get_public_receipt", { p_id: id })
      .then(({ data: result, error }) => {
        if (error || !result || !result.tx) {
          setState("not_found");
          return;
        }
        setData(result);
        setState("ok");
      })
      .catch(() => setState("error"));
  }, [id]);

  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <p className="text-sm text-ink-muted">Memuat struk...</p>
      </div>
    );
  }

  if (state !== "ok") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 text-center">
        <div>
          <p className="text-sm font-medium">Struk tidak ditemukan</p>
          <p className="text-xs text-ink-muted mt-1">
            Link mungkin salah, atau transaksi ini belum/tidak berstatus selesai.
          </p>
        </div>
      </div>
    );
  }

  const { store, tx, items, cashierName, customerName } = data;

  const rows = [];
  rows.push({ label: "Subtotal", value: formatRupiah(tx.subtotal) });
  if (Number(tx.discount) > 0) rows.push({ label: "Diskon", value: `-${formatRupiah(tx.discount)}` });
  if (Number(tx.delivery_fee) > 0) rows.push({ label: "Biaya Antar", value: formatRupiah(tx.delivery_fee) });
  if (Number(tx.tax_amount) > 0 && !store?.tax_price_inclusive) {
    rows.push({ label: store?.tax_label || "PPN", value: `+${formatRupiah(tx.tax_amount)}` });
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 print:p-0 print:block">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-sm print:border-0 print:rounded-none">
        <div className="px-5 py-4 font-mono text-[13px] leading-snug">
          <div className="text-center">
            <p className="font-bold text-sm">{store?.store_name || "Toko"}</p>
            {store?.receipt_show_address !== false && store?.store_address && <p className="text-xs text-ink-muted">{store.store_address}</p>}
            {store?.receipt_show_phone !== false && store?.store_phone && <p className="text-xs text-ink-muted">{store.store_phone}</p>}
          </div>
          <hr className="border-dashed border-border my-2" />
          <div className="text-xs text-ink-muted">
            <p className="font-semibold text-ink">{txCode(tx.id)}</p>
            <p>{formatDateTime(tx.created_at)}</p>
            {store?.receipt_show_cashier !== false && cashierName && <p>Kasir: {cashierName}</p>}
            {store?.receipt_show_customer !== false && customerName && <p>Pelanggan: {customerName}</p>}
          </div>
          <hr className="border-dashed border-border my-2" />

          <div className="space-y-1.5">
            {(items || []).map((it, i) => {
              const tierLabel = it.price_type === "retail" ? null : (it.price_type_label || PRICE_TYPE_LABELS[it.price_type]);
              return (
                <div key={i}>
                  <p>
                    {it.name}
                    {tierLabel ? <span className="text-xs text-ink-muted"> ({tierLabel})</span> : ""}
                  </p>
                  <div className="flex justify-between">
                    <span>
                      {formatNumber(it.qty, 2)} x {formatRupiah(it.unit_price)}
                    </span>
                    <span>{formatRupiah(it.unit_price * it.qty)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <hr className="border-dashed border-border my-2" />
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between">
              <span>{r.label}</span>
              <span>{r.value}</span>
            </div>
          ))}
          <div className="flex justify-between font-bold text-sm mt-1">
            <span>Total</span>
            <span>{formatRupiah(tx.total)}</span>
          </div>
          <hr className="border-dashed border-border my-2" />
          <div className="flex justify-between">
            <span>{PAYMENT_LABELS[tx.payment_method] || tx.payment_method}</span>
            <span></span>
          </div>
          {tx.payment_method !== "kasbon" && (
            <>
              <div className="flex justify-between">
                <span>Dibayar</span>
                <span>{formatRupiah(tx.paid_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span>Kembali</span>
                <span>{formatRupiah(tx.change_amount)}</span>
              </div>
            </>
          )}
          {store?.receipt_footer && <p className="text-center whitespace-pre-line text-xs text-ink-muted mt-3">{store.receipt_footer}</p>}
        </div>

        <div className="p-4 border-t border-border print:hidden">
          <button
            onClick={() => downloadReceiptImage(data)}
            className="w-full rounded-lg bg-primary text-white px-3 py-2.5 text-sm font-medium hover:bg-primary-hover"
          >
            Unduh Struk (PNG)
          </button>
        </div>
      </div>
    </div>
  );
}
