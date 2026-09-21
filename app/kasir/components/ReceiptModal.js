"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import toast from "react-hot-toast";
import { Bluetooth, Printer, Usb } from "lucide-react";
import { formatRupiah, formatNumber, formatDateTime, txCode } from "@/lib/format";
import { shareReceiptToWhatsApp } from "@/lib/shareReceipt";
import { printReceiptBluetooth, getConnectedPrinterName, hasSavedPrinter, subscribePrinterStatus } from "@/lib/blePrinter";
import { printReceiptUsb, getConnectedPrinterName as getConnectedUsbPrinterName, hasSavedUsbPrinter, subscribeUsbPrinterStatus } from "@/lib/usbPrinter";
import { printReceipt } from "@/lib/printReceipt";

const PRICE_TYPE_LABELS = {
  grosir: "Grosir",
  half_grosir: "1/2 Grosir",
  kg: "Per Kg",
  half_kg: "Per 1/2 Kg",
  ons: "Per Ons",
  out_of_town: "Antar Luar Kota",
};

const PAYMENT_LABELS = { tunai: "Tunai", transfer: "Transfer", qris: "QRIS", kasbon: "Kasbon" };

// Pratinjau struk di layar (bukan cuma cetak langsung ke printer) supaya kasir
// selalu bisa MELIHAT struknya di aplikasi. Ada 3 cara cetak fisik: "Cetak
// Bluetooth" & "Cetak USB Langsung" (langsung ke printer thermal yang sudah
// tersambung dari halaman Pengaturan -- lihat lib/blePrinter.js &
// lib/usbPrinter.js), dan "Cetak (Kabel/USB)" lewat dialog cetak bawaan
// browser (lib/printReceipt.js) sebagai cadangan kalau printernya sudah
// terpasang lewat driver OS dan tidak bisa "direbut" langsung oleh WebUSB.
// Kasir yang pilih sendiri mau pakai tombol yang mana -- tidak ada yang
// otomatis dipilihkan, supaya tidak keliru kalau kebetulan ada lebih dari
// satu printer/jalur yang tersambung sekaligus.
export default function ReceiptModal({ data, onClose }) {
  const [showQr, setShowQr] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [printBusy, setPrintBusy] = useState(false);
  const [usbPrintBusy, setUsbPrintBusy] = useState(false);
  const [printerName, setPrinterName] = useState(null);
  const [usbPrinterName, setUsbPrinterName] = useState(null);
  // Dihitung ulang di dalam useEffect (bukan langsung saat render) supaya
  // hasil render pertama di client sama persis dengan di server (server
  // tidak punya "navigator.bluetooth"/"navigator.usb" sama sekali) --
  // mencegah mismatch hydration Next.js.
  useEffect(() => {
    setPrinterName(getConnectedPrinterName());
    setUsbPrinterName(getConnectedUsbPrinterName());
    const unsubBt = subscribePrinterStatus((name) => setPrinterName(name));
    const unsubUsb = subscribeUsbPrinterStatus((name) => setUsbPrinterName(name));
    return () => {
      unsubBt();
      unsubUsb();
    };
  }, []);

  async function handlePrintBluetooth() {
    if (!printerName) {
      toast.error(
        hasSavedPrinter()
          ? "Printer belum tersambung ulang. Buka halaman Pengaturan sebentar untuk sambungkan lagi."
          : "Belum ada printer Bluetooth tersambung. Sambungkan dulu dari halaman Pengaturan.",
        { id: "bt-print" }
      );
      return;
    }
    setPrintBusy(true);
    try {
      await printReceiptBluetooth(data);
      toast.success("Struk dikirim ke printer", { id: "bt-print" });
    } catch (err) {
      toast.error(err?.message || "Gagal mencetak struk", { id: "bt-print" });
    } finally {
      setPrintBusy(false);
    }
  }

  async function handlePrintUsb() {
    if (!usbPrinterName) {
      toast.error(
        hasSavedUsbPrinter()
          ? "Printer USB belum tersambung ulang. Buka halaman Pengaturan sebentar untuk sambungkan lagi."
          : "Belum ada printer USB tersambung. Sambungkan dulu dari halaman Pengaturan.",
        { id: "usb-print" }
      );
      return;
    }
    setUsbPrintBusy(true);
    try {
      await printReceiptUsb(data);
      toast.success("Struk dikirim ke printer", { id: "usb-print" });
    } catch (err) {
      toast.error(err?.message || "Gagal mencetak struk", { id: "usb-print" });
    } finally {
      setUsbPrintBusy(false);
    }
  }

  function handlePrintDialog() {
    printReceipt(data);
  }
  const receiptUrl =
    data?.tx?.id && typeof window !== "undefined" ? `${window.location.origin}/struk/${data.tx.id}` : null;

  // Kode QR dibuat begitu diminta ditampilkan, mengarah ke halaman struk
  // publik (/struk/[id]) supaya pelanggan bisa scan lalu langsung melihat/
  // mengunduh struknya sendiri dari HP-nya, tanpa perlu login.
  useEffect(() => {
    if (!showQr || !receiptUrl) return;
    QRCode.toDataURL(receiptUrl, { margin: 1, width: 220 }).then(setQrDataUrl);
  }, [showQr, receiptUrl]);

  if (!data) return null;
  const { store, tx, items, cashierName, customerName } = data;

  const rows = [];
  rows.push({ label: "Subtotal", value: formatRupiah(tx.subtotal) });
  if (Number(tx.discount) > 0) rows.push({ label: "Diskon", value: `-${formatRupiah(tx.discount)}` });
  if (Number(tx.delivery_fee) > 0) rows.push({ label: "Biaya Antar", value: formatRupiah(tx.delivery_fee) });
  if (Number(tx.tax_amount) > 0 && !store?.tax_price_inclusive) {
    rows.push({ label: store?.tax_label || "PPN", value: `+${formatRupiah(tx.tax_amount)}` });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-sm max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold">Struk Transaksi</h2>
          <button onClick={onClose} className="text-ink-muted text-lg leading-none">&times;</button>
        </div>

        <div className="overflow-auto px-5 py-4 font-mono text-[13px] leading-snug">
          <div className="text-center">
            <p className="font-bold text-sm">{store?.store_name || "Toko"}</p>
            {store?.receipt_show_address !== false && store?.store_address && <p className="text-xs text-ink-muted">{store.store_address}</p>}
            {store?.receipt_show_phone !== false && store?.store_phone && <p className="text-xs text-ink-muted">{store.store_phone}</p>}
          </div>
          <hr className="border-dashed border-border my-2" />
          <div className="text-xs text-ink-muted">
            <p className="font-semibold text-ink">{txCode(tx.id)}</p>
            <p>{formatDateTime(tx.created_at || new Date())}</p>
            {store?.receipt_show_cashier !== false && cashierName && <p>Kasir: {cashierName}</p>}
            {store?.receipt_show_customer !== false && customerName && <p>Pelanggan: {customerName}</p>}
          </div>
          <hr className="border-dashed border-border my-2" />

          <div className="space-y-1.5">
            {(items || []).map((it, i) => {
              const tierLabel = it.price_type === "retail" ? null : (it.price_type_label || PRICE_TYPE_LABELS[it.price_type]);
              return (
                <div key={i}>
                  <p>{it.name}{tierLabel ? <span className="text-xs text-ink-muted"> ({tierLabel})</span> : ""}</p>
                  <div className="flex justify-between">
                    <span>{formatNumber(it.qty, 2)} x {formatRupiah(it.unit_price)}</span>
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
          {store?.receipt_footer && (
            <p className="text-center whitespace-pre-line text-xs text-ink-muted mt-3">{store.receipt_footer}</p>
          )}

          {showQr && (
            <div className="mt-3 pt-3 border-t border-dashed border-border flex flex-col items-center">
              <p className="text-xs text-ink-muted mb-2 text-center font-sans">
                Pelanggan bisa scan untuk lihat/simpan struk ini sendiri
              </p>
              <div className="bg-white rounded-lg p-3">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="QR ambil struk" width={180} height={180} />
                ) : (
                  <p className="text-xs text-ink-muted py-16 font-sans">Membuat kode QR...</p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border flex flex-col gap-2">
          <div className="flex gap-2 flex-wrap">
            <button onClick={onClose} className="flex-1 rounded-lg border border-border px-3 py-2.5 text-sm font-medium hover:bg-background active:scale-[0.97] active:bg-background transition">
              Tutup
            </button>
            <button
              onClick={() => setShowQr((v) => !v)}
              className="flex-1 rounded-lg border border-border px-3 py-2.5 text-sm font-medium hover:bg-background active:scale-[0.97] active:bg-background transition"
            >
              {showQr ? "Sembunyikan QR" : "QR Ambil Struk"}
            </button>
            <button
              onClick={() => shareReceiptToWhatsApp(data)}
              className="flex-1 rounded-lg border border-[#25D366] text-[#128C7E] px-3 py-2.5 text-sm font-medium hover:bg-[#25D366]/10 active:scale-[0.97] active:bg-[#25D366]/10 transition"
            >
              Kirim WhatsApp
            </button>
          </div>
          <button
            onClick={handlePrintDialog}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-sm font-medium hover:bg-background active:scale-[0.97] active:bg-background transition"
          >
            <Printer size={15} />
            Cetak (Kabel/USB)
          </button>
          <button
            onClick={handlePrintUsb}
            disabled={usbPrintBusy}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-sm font-medium hover:bg-background active:scale-[0.97] active:bg-background transition disabled:opacity-60 disabled:active:scale-100"
          >
            <Usb size={15} />
            {usbPrintBusy ? "Mencetak..." : "Cetak USB Langsung"}
          </button>
          <button
            onClick={handlePrintBluetooth}
            disabled={printBusy}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-primary text-white px-3 py-2.5 text-sm font-medium hover:bg-primary-hover active:scale-[0.97] transition disabled:opacity-60 disabled:active:scale-100"
          >
            <Bluetooth size={15} />
            {printBusy ? "Mencetak..." : "Cetak Bluetooth"}
          </button>
        </div>
      </div>
    </div>
  );
}
