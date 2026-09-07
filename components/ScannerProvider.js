"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const ScannerContext = createContext(null);

export function useScanner() {
  const ctx = useContext(ScannerContext);
  if (!ctx) throw new Error("useScanner harus dipakai di dalam ScannerProvider");
  return ctx;
}

// Event global yang dipancarkan setiap kali ada barcode terdeteksi,
// baik dari scanner fisik (keyboard wedge) maupun dari HP yang disambungkan via QR.
// Halaman mana pun bisa `window.addEventListener("pos-barcode-scan", handler)`.
export const BARCODE_EVENT = "pos-barcode-scan";

function emitScan(code, source) {
  window.dispatchEvent(new CustomEvent(BARCODE_EVENT, { detail: { code, source } }));
}

function makeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  // fallback untuk lingkungan tanpa crypto.randomUUID (browser lama / http non-secure)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function ScannerProvider({ children }) {
  const supabaseRef = useRef(null);
  const getSupabase = useCallback(() => {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }, []);
  const [physicalActive, setPhysicalActive] = useState(false);
  const [phoneSession, setPhoneSession] = useState(null); // { id, connected, error }
  const bufferRef = useRef("");
  const timerRef = useRef(null);
  const idleTimerRef = useRef(null);
  const channelRef = useRef(null);

  // ---------- Deteksi scanner fisik (keyboard wedge) di SELURUH halaman ----------
  useEffect(() => {
    function onKeydown(e) {
      const tag = document.activeElement?.tagName;
      const isTyping = tag === "INPUT" || tag === "TEXTAREA";

      if (/^[a-zA-Z0-9]$/.test(e.key)) {
        bufferRef.current += e.key;
        clearTimeout(timerRef.current);
        // Scanner fisik mengetik sangat cepat (<40ms antar karakter).
        // Jika jeda antar karakter pendek dan diakhiri Enter, anggap itu hasil scan.
        timerRef.current = setTimeout(() => {
          bufferRef.current = "";
        }, 60);
      } else if (e.key === "Enter" && bufferRef.current.length >= 4) {
        const code = bufferRef.current;
        bufferRef.current = "";
        if (!isTyping) {
          setPhysicalActive(true);
          clearTimeout(idleTimerRef.current);
          idleTimerRef.current = setTimeout(() => setPhysicalActive(false), 60000);
          emitScan(code, "physical");
        }
      }
    }
    window.addEventListener("keydown", onKeydown);
    return () => {
      window.removeEventListener("keydown", onKeydown);
      clearTimeout(timerRef.current);
      clearTimeout(idleTimerRef.current);
    };
  }, []);

  // ---------- Sambungkan HP via QR (Supabase Realtime broadcast) ----------
  const startPairing = useCallback(() => {
    const id = makeId();
    const supabase = getSupabase();
    const channel = supabase
      .channel(`scanner-pair-${id}`, { config: { broadcast: { ack: true, self: false } } })
      .on("broadcast", { event: "scan" }, (payload) => {
        if (payload?.payload?.code) emitScan(payload.payload.code, "phone");
      })
      .on("broadcast", { event: "hello" }, () => {
        setPhoneSession((s) => (s ? { ...s, connected: true, error: null } : s));
        // Balas supaya HP tahu pasti sudah tersambung dua arah.
        channel.send({ type: "broadcast", event: "ack", payload: {} });
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setPhoneSession((s) => (s ? { ...s, error: "Gagal tersambung ke server realtime. Cek koneksi internet." } : s));
        }
      });
    channelRef.current = channel;
    setPhoneSession({ id, connected: false, error: null });
    return id;
  }, [getSupabase]);

  const stopPairing = useCallback(() => {
    if (channelRef.current) getSupabase().removeChannel(channelRef.current);
    channelRef.current = null;
    setPhoneSession(null);
  }, [getSupabase]);

  useEffect(() => {
    return () => {
      if (channelRef.current) getSupabase().removeChannel(channelRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ScannerContext.Provider
      value={{
        physicalActive,
        phoneConnected: !!phoneSession?.connected,
        phoneSessionId: phoneSession?.id || null,
        phoneError: phoneSession?.error || null,
        startPairing,
        stopPairing,
      }}
    >
      {children}
    </ScannerContext.Provider>
  );
}
