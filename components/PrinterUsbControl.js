"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Usb } from "lucide-react";
import {
  isWebUsbSupported,
  connectUsbPrinter,
  disconnectUsbPrinter,
  getConnectedPrinterName,
  hasSavedUsbPrinter,
  subscribeUsbPrinterStatus,
} from "@/lib/usbPrinter";

// Kontrol sambung/putus printer USB langsung (WebUSB) -- polanya sama
// persis dengan PrinterBluetoothControl.js, dipakai di DUA tempat yang sama
// (halaman Pengaturan & menu kasir), karena koneksi USB juga melekat per
// PERANGKAT, bukan per akun.
export default function PrinterUsbControl({ compact = false }) {
  const [supported, setSupported] = useState(false);
  const [printerName, setPrinterName] = useState(null);
  const [everConnected, setEverConnected] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSupported(isWebUsbSupported());
    setPrinterName(getConnectedPrinterName());
    setEverConnected(hasSavedUsbPrinter());
    return subscribeUsbPrinterStatus((name) => setPrinterName(name));
  }, []);

  async function handleConnect() {
    setBusy(true);
    try {
      const { name } = await connectUsbPrinter();
      setPrinterName(name);
      setEverConnected(true);
      toast.success(`Tersambung ke ${name}. Printer ini akan tetap tersambung otomatis sampai diputuskan.`);
    } catch (err) {
      if (err?.name !== "NotFoundError") {
        toast.error(err?.message || "Gagal menyambungkan printer USB");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    await disconnectUsbPrinter();
    setPrinterName(null);
    setEverConnected(false);
    toast.success("Printer USB diputuskan");
  }

  if (!supported) {
    return compact ? null : (
      <p className="text-xs text-ink-muted">
        Browser/perangkat ini tidak mendukung sambung langsung ke printer USB (fitur ini hanya tersedia di Chrome/Edge
        -- Windows, Mac, Linux, ChromeOS, Android; tidak didukung Safari/iPhone atau Firefox).
      </p>
    );
  }

  if (compact) {
    return (
      <div className="space-y-1">
        <button
          onClick={printerName ? handleDisconnect : handleConnect}
          disabled={busy}
          className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-background active:scale-[0.97] active:bg-background transition disabled:opacity-60"
        >
          <Usb size={14} className={printerName ? "text-primary" : "text-ink-muted"} />
          {busy
            ? "Memproses..."
            : printerName
            ? `Putuskan Printer (${printerName})`
            : everConnected
            ? "Sambungkan Ulang Printer USB"
            : "Sambungkan Printer USB"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 text-sm">
        <Usb size={16} className={printerName ? "text-primary" : "text-ink-muted"} />
        {printerName ? (
          <span>
            Tersambung ke <span className="font-medium">{printerName}</span>
          </span>
        ) : everConnected ? (
          <span className="text-ink-muted">Terputus (printer tersimpan, colokkan lagi lalu sambungkan ulang)</span>
        ) : (
          <span className="text-ink-muted">Belum ada printer USB tersambung</span>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleConnect}
          disabled={busy}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-background disabled:opacity-60"
        >
          {busy ? "Menyambungkan..." : printerName ? "Ganti Printer" : "Sambungkan Printer USB"}
        </button>
        {(printerName || everConnected) && (
          <button
            onClick={handleDisconnect}
            disabled={busy}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-background disabled:opacity-60"
          >
            Putuskan Printer
          </button>
        )}
      </div>
    </div>
  );
}
