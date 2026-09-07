"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ScanRemotePage({ params }) {
  const { sessionId } = params;
  const [status, setStatus] = useState("connecting"); // connecting | ready | error
  const [lastCode, setLastCode] = useState(null);
  const channelRef = useRef(null);
  const scannerRef = useRef(null);
  const cooldownRef = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`scanner-pair-${sessionId}`).subscribe((state) => {
      if (state === "SUBSCRIBED") {
        channel.send({ type: "broadcast", event: "hello", payload: {} });
        setStatus("ready");
      }
    });
    channelRef.current = channel;

    let html5Qrcode;
    import("html5-qrcode").then(({ Html5Qrcode }) => {
      html5Qrcode = new Html5Qrcode("phone-scan-region");
      scannerRef.current = html5Qrcode;
      html5Qrcode
        .start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 260, height: 160 } },
          (decodedText) => {
            if (cooldownRef.current) return;
            cooldownRef.current = true;
            setLastCode(decodedText);
            channelRef.current?.send({ type: "broadcast", event: "scan", payload: { code: decodedText } });
            if (navigator.vibrate) navigator.vibrate(80);
            setTimeout(() => {
              cooldownRef.current = false;
            }, 1200);
          },
          () => {}
        )
        .catch(() => setStatus("error"));
    });

    return () => {
      if (scannerRef.current) scannerRef.current.stop().catch(() => {});
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-lg font-semibold mb-1">Scanner HP</h1>
        <p className="text-sm text-white/60 mb-4">
          {status === "connecting" && "Menyambungkan ke layar kasir..."}
          {status === "ready" && "Tersambung. Arahkan kamera ke barcode."}
          {status === "error" && "Tidak bisa mengakses kamera. Izinkan akses kamera di browser."}
        </p>
        <div id="phone-scan-region" className="rounded-xl overflow-hidden bg-white/5" />
        {lastCode && (
          <div className="mt-4 rounded-lg bg-white/10 px-3 py-2 text-sm">
            Terkirim: <span className="font-mono">{lastCode}</span>
          </div>
        )}
        <p className="text-xs text-white/40 mt-6">
          Halaman ini tidak perlu login. Biarkan tetap terbuka selama ingin memakai HP sebagai scanner.
        </p>
      </div>
    </div>
  );
}
