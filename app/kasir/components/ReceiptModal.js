"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import toast from "react-hot-toast";
import { Bluetooth, Usb } from "lucide-react";
import { formatRupiah, formatNumber, formatDateTime, txCode } from "@/lib/format";
import { shareReceiptToWhatsApp } from "@/lib/shareReceipt";
import { printReceiptBluetooth, getConnectedPrinterName, hasSavedPrinter, subscribePrinterStatus } from "@/lib/blePrinter";
import {
  printReceiptUsb,
  connectUsbPrinter,
  autoReconnectUsbPrinter,
  getConnectedUsbPrinterName,
} from "@/lib/usbPrinter";
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
// selalu bisa MELIHAT struknya di aplikasi. Ada DUA tombol cetak fisik:
// 1. "Cetak Bluetooth" -- langsung mengirim struk ke printer Bluetooth yang
//    sudah tersambung (koneksinya dikelola & diingat global, lihat
//    lib/blePrinter.js dan components/BluetoothPrinterProvider.js).
// 2. "Cetak Kabel" -- mengirim struk lewat kabel USB (lib/usbPrinter.js).
//    Pertama kali ditekan muncul dialog pilih printer dari browser; sesudah
//    itu printernya diingat dan tombol ini langsung mencetak.
export default function ReceiptModal({ data, onClose }) {
  const [showQr, setShowQr] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [printBusy, setPrintBusy] = useState(false);
  const [usbBusy, setUsbBusy] = useState(false);
  const [printerName, setPrinterName] = useState(null);
  // Dihitung ulang di dalam useEffect (bukan langsung saat render) supaya
  // hasil render pertama di client sama persis dengan di server (server
  // tidak punya "navigator.bluetooth" sama sekali) -- mencegah mismatch
  // hydration Next.js.
  useEffect(() => {
    setPrinterName(getConnectedPrinterName());
    return subscribePrinterStatus((name) => setPrinterName(name));
  }, []);

  async function handlePrint() {
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
  // Cetak lewat kabel USB. Alurnya satu tombol: kalau belum tersambung, coba
  // sambung ulang printer yang tersimpan; kalau belum ada, tampilkan dialog
  // pilih printer (harus dari klik ini) lalu langsung cetak. Kalau browser/OS
  // tidak mengizinkan akses USB langsung (mis. printer dipegang driver
  // Windows), otomatis jatuh ke dialog cetak biasa supaya kasir tetap bisa
  // mencetak lewat kabel.
  async function handlePrintUsb() {
    setUsbBusy(true);
    try {
      if (!getConnectedUsbPrinterName()) {
        const auto = await autoReconnectUsbPrinter();
        if (!auto) await connectUsbPrinter();
      }
      await printReceiptUsb(data);
      toast.success("Struk dikirim ke printer kabel", { id: "usb-print" });
    } catch (err) {
      // Dialog pilih printer ditutup tanpa memilih -- bukan kegagalan.
      if (err?.name === "NotFoundError") return;
      if (err?.canFallback) {
        toast(`${err.message} Membuka dialog cetak biasa...`, { id: "usb-print", duration: 6000 });
        printReceipt(data);
        return;
      }
      toast.error(err?.message || "Gagal mencetak lewat kabel", { id: "usb-print" });
    } finally {
      setUsbBusy(false);
    }
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
            <button onClick={onClose} className="flex-1 rounded-lg border border-border px-3 py-2.5 text-sm font-medium hover:bg-background">
              Tutup
            </button>
            <button
              onClick={() => setShowQr((v) => !v)}
              className="flex-1 rounded-lg border border-border px-3 py-2.5 text-sm font-medium hover:bg-background"
            >
              {showQr ? "Sembunyikan QR" : "QR Ambil Struk"}
            </button>
            <button
              onClick={() => shareReceiptToWhatsApp(data)}
              className="flex-1 rounded-lg border border-[#25D366] text-[#128C7E] px-3 py-2.5 text-sm font-medium hover:bg-[#25D366]/10"
            >
              Kirim WhatsApp
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handlePrint}
              disabled={printBusy || usbBusy}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-primary text-white px-3 py-2.5 text-sm font-medium hover:bg-primary-hover disabled:opacity-60"
            >
              <Bluetooth size={15} />
              {printBusy ? "Mencetak..." : "Cetak Bluetooth"}
            </button>
            <button
              onClick={handlePrintUsb}
              disabled={printBusy || usbBusy}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-primary text-primary px-3 py-2.5 text-sm font-medium hover:bg-primary/10 disabled:opacity-60"
            >
              <Usb size={15} />
              {usbBusy ? "Mencetak..." : "Cetak Kabel"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
