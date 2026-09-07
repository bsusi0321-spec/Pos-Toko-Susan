"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ScanLine, X } from "lucide-react";
import { useScanner } from "./ScannerProvider";

export default function ScannerStatusWidget() {
  const { physicalActive, phoneConnected, phoneSessionId, phoneError, startPairing, stopPairing } = useScanner();
  const [modalOpen, setModalOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState(null);

  useEffect(() => {
    if (!modalOpen) return;
    const id = phoneSessionId || startPairing();
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    QRCode.toDataURL(`${origin}/scan-remote/${id}`, { margin: 1, width: 260 }).then(setQrDataUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen]);

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-background"
        title="Sambungkan scanner"
      >
        <ScanLine size={14} />
        <span className="hidden sm:inline">Scanner</span>
        <span className={`h-1.5 w-1.5 rounded-full ${physicalActive || phoneConnected ? "bg-primary" : "bg-danger"}`} />
      </button>

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-surface border border-border rounded-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Sambungkan Scanner</h2>
              <button onClick={() => setModalOpen(false)} className="text-ink-muted hover:text-ink">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between text-sm border border-border rounded-lg px-3 py-2">
                <span>Scanner Fisik (USB/Bluetooth)</span>
                <span className={`flex items-center gap-1.5 text-xs ${physicalActive ? "text-primary" : "text-ink-muted"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${physicalActive ? "bg-primary" : "bg-danger"}`} />
                  {physicalActive ? "Siap" : "Belum ada aktivitas"}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm border border-border rounded-lg px-3 py-2">
                <span>Scanner HP (via QR)</span>
                <span className={`flex items-center gap-1.5 text-xs ${phoneConnected ? "text-primary" : "text-ink-muted"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${phoneConnected ? "bg-primary" : "bg-danger"}`} />
                  {phoneConnected ? "Terhubung" : "Menunggu HP"}
                </span>
              </div>
            </div>

            <p className="text-xs text-ink-muted mb-3 text-center">
              Buka kamera HP (atau browser HP), pindai kode QR ini untuk menjadikan HP sebagai alat scan.
              Setelah tersambung, cukup arahkan HP ke barcode barang — hasilnya langsung terpakai
              di layar ini, di halaman mana pun sedang dibuka.
            </p>

            {phoneError && (
              <p className="text-xs text-danger bg-danger-soft rounded-lg px-3 py-2 mb-3">{phoneError}</p>
            )}

            <div className="flex justify-center bg-white rounded-xl p-4 mb-3">
              {qrDataUrl ? <img src={qrDataUrl} alt="QR sambungkan scanner HP" width={220} height={220} /> : <p className="text-xs text-ink-muted py-16">Membuat kode QR...</p>}
            </div>

            <p className="text-xs text-ink-muted mb-1">Atau buka tautan ini langsung di HP:</p>
            <p className="text-xs font-mono bg-background rounded-lg px-3 py-2 break-all mb-4">
              {typeof window !== "undefined" ? `${window.location.origin}/scan-remote/${phoneSessionId}` : ""}
            </p>

            <button
              onClick={() => {
                stopPairing();
                setModalOpen(false);
              }}
              className="w-full border border-border rounded-lg py-2 text-sm font-medium hover:bg-background"
            >
              Putuskan & Tutup
            </button>
          </div>
        </div>
      )}
    </>
  );
}
