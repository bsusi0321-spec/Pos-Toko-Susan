"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Bluetooth } from "lucide-react";
import {
  isBleSupported,
  connectBluetoothPrinter,
  disconnectBluetoothPrinter,
  getConnectedPrinterName,
  hasSavedPrinter,
  subscribePrinterStatus,
} from "@/lib/blePrinter";

// Kontrol sambung/putus printer Bluetooth -- dipakai di DUA tempat:
// 1. Halaman Pengaturan (khusus admin, buat printer di komputer/kasir admin)
// 2. Sidebar/menu halaman Kasir (buat printer di perangkat kasir itu sendiri)
// Ini WAJIB ada di kedua tempat karena koneksi Bluetooth melekat per
// BROWSER/PERANGKAT, bukan per akun -- printer yang disambungkan admin dari
// HP-nya sendiri tidak akan ikut tersambung di tablet/HP yang dipakai kasir.
// Jadi tiap perangkat yang dipakai buat mencetak struk perlu menyambungkan
// printernya sendiri-sendiri dari perangkat itu, sekali saja.
export default function PrinterBluetoothControl({ compact = false }) {
  const [supported, setSupported] = useState(false);
  const [printerName, setPrinterName] = useState(null);
  const [everConnected, setEverConnected] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Dicek di dalam useEffect (bukan langsung saat render) supaya hasil
    // render pertama di client sama dengan di server -- server tidak punya
    // "navigator.bluetooth" sama sekali (mencegah mismatch hydration Next.js).
    setSupported(isBleSupported());
    setPrinterName(getConnectedPrinterName());
    setEverConnected(hasSavedPrinter());
    return subscribePrinterStatus((name) => setPrinterName(name));
  }, []);

  async function handleConnect() {
    setBusy(true);
    try {
      const { name } = await connectBluetoothPrinter();
      setPrinterName(name);
      setEverConnected(true);
      toast.success(`Tersambung ke ${name}. Printer ini akan tetap tersambung otomatis sampai diputuskan.`);
    } catch (err) {
      if (err?.name !== "NotFoundError") {
        toast.error(err?.message || "Gagal menyambungkan printer");
      }
    } finally {
      setBusy(false);
    }
  }

  function handleDisconnect() {
    disconnectBluetoothPrinter();
    setPrinterName(null);
    setEverConnected(false);
    toast.success("Printer diputuskan");
  }

  if (!supported) {
    return compact ? null : (
      <p className="text-xs text-ink-muted">
        Browser/perangkat ini tidak mendukung koneksi Bluetooth langsung ke printer (fitur ini hanya tersedia di
        Chrome/Edge -- Android, Windows, Mac, ChromeOS; tidak didukung Safari/iPhone atau Firefox).
      </p>
    );
  }

  if (compact) {
    // Versi ringkas untuk sidebar/menu kasir: satu tombol saja yang isi &
    // fungsinya berubah tergantung status (sambungkan / ganti / putuskan).
    return (
      <div className="space-y-1">
        <button
          onClick={printerName ? handleDisconnect : handleConnect}
          disabled={busy}
          className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-background disabled:opacity-60"
        >
          <Bluetooth size={14} className={printerName ? "text-primary" : "text-ink-muted"} />
          {busy
            ? "Memproses..."
            : printerName
            ? `Putuskan Printer (${printerName})`
            : everConnected
            ? "Sambungkan Ulang Printer"
            : "Sambungkan Printer Bluetooth"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 text-sm">
        <Bluetooth size={16} className={printerName ? "text-primary" : "text-ink-muted"} />
        {printerName ? (
          <span>
            Tersambung ke <span className="font-medium">{printerName}</span>
          </span>
        ) : everConnected ? (
          <span className="text-ink-muted">Terputus (printer tersimpan, coba dinyalakan &amp; didekatkan lagi, atau sambungkan ulang)</span>
        ) : (
          <span className="text-ink-muted">Belum ada printer tersambung</span>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleConnect}
          disabled={busy}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-background disabled:opacity-60"
        >
          {busy ? "Menyambungkan..." : printerName ? "Ganti Printer" : "Sambungkan Printer Bluetooth"}
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
