"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatRupiah, formatDateTime, txCode } from "@/lib/format";

const PAYMENT_LABELS = { tunai: "Tunai", transfer: "Transfer", qris: "QRIS", kasbon: "Kasbon" };
const PAYMENT_ORDER = ["tunai", "transfer", "qris", "kasbon"];
const PAGE_SIZE = 1000; // batas baris per permintaan Supabase
const MAX_PAGES = 10;

// Tanggal lokal perangkat dalam format "YYYY-MM-DD" (untuk <input type="date">).
function localDateValue(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Awal & akhir HARI menurut jam perangkat, diubah ke UTC untuk query database.
function dayRange(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return {
    start: new Date(y, m - 1, d, 0, 0, 0, 0).toISOString(),
    end: new Date(y, m - 1, d + 1, 0, 0, 0, 0).toISOString(),
  };
}

// Rekap penjualan MILIK kasir yang sedang login (jumlah transaksi & total
// rupiah), per shift / hari ini / tanggal tertentu. Datanya dari tabel
// transactions dengan cashier_id = kasir ini dan status "completed" -- sumber
// yang sama dengan hitungan "Tutup Shift". Kasir hanya bisa membaca
// transaksinya sendiri (kebijakan akses trx_select di database), jadi angka
// kasir lain memang tidak akan pernah muncul di sini.
export default function MySalesModal({ cashierId, cashierName, shift, onClose }) {
  const supabase = createClient();
  const [mode, setMode] = useState(shift ? "shift" : "today"); // shift | today | date
  const [date, setDate] = useState(localDateValue());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    const myRequest = ++requestId.current;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const buildQuery = () => {
          let q = supabase
            .from("transactions")
            .select("id, total, payment_method, created_at")
            .eq("cashier_id", cashierId)
            .eq("status", "completed")
            .order("created_at", { ascending: false });
          if (mode === "shift") {
            q = q.eq("shift_id", shift.id);
          } else {
            const { start, end } = dayRange(mode === "today" ? localDateValue() : date);
            q = q.gte("created_at", start).lt("created_at", end);
          }
          return q;
        };
        // Diambil per halaman 1000 baris supaya total tetap benar walau
        // transaksinya sangat banyak (Supabase membatasi 1000 baris/permintaan).
        let all = [];
        for (let page = 0; page < MAX_PAGES; page++) {
          const { data, error: err } = await buildQuery().range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
          if (err) throw err;
          all = all.concat(data || []);
          if ((data || []).length < PAGE_SIZE) break;
        }
        if (myRequest === requestId.current) setRows(all);
      } catch (err) {
        if (myRequest === requestId.current) setError(err?.message || "Gagal memuat data penjualan");
      } finally {
        if (myRequest === requestId.current) setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, date, reloadKey]);

  const summary = useMemo(() => {
    const byMethod = {};
    let total = 0;
    for (const r of rows) {
      const amount = Number(r.total) || 0;
      total += amount;
      const key = r.payment_method || "tunai";
      if (!byMethod[key]) byMethod[key] = { count: 0, amount: 0 };
      byMethod[key].count += 1;
      byMethod[key].amount += amount;
    }
    return { count: rows.length, total, avg: rows.length ? total / rows.length : 0, byMethod };
  }, [rows]);

  const methodKeys = [
    ...PAYMENT_ORDER.filter((k) => summary.byMethod[k]),
    ...Object.keys(summary.byMethod).filter((k) => !PAYMENT_ORDER.includes(k)),
  ];

  const tabs = [
    ...(shift ? [{ id: "shift", label: "Shift Ini" }] : []),
    { id: "today", label: "Hari Ini" },
    { id: "date", label: "Pilih Tanggal" },
  ];

  const periodLabel =
    mode === "shift"
      ? `Sejak shift dibuka ${formatDateTime(shift?.opening_time)}`
      : new Date(mode === "today" ? Date.now() : `${date}T00:00:00`).toLocaleDateString("id-ID", {
          weekday: "long",
          day: "2-digit",
          month: "long",
          year: "numeric",
        });

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Penjualan Saya</h2>
            {cashierName && <p className="text-xs text-ink-muted">Kasir: {cashierName}</p>}
          </div>
          <button onClick={onClose} className="text-ink-muted text-lg leading-none">&times;</button>
        </div>

        <div className="px-4 pt-3 flex gap-1.5 flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setMode(t.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium border ${
                mode === t.id ? "bg-primary text-white border-primary" : "border-border hover:bg-background"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {mode === "date" && (
          <div className="px-4 pt-2">
            <input
              type="date"
              value={date}
              max={localDateValue()}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        )}
        <p className="px-4 pt-2 text-xs text-ink-muted">{periodLabel}</p>

        <div className="overflow-auto p-4 space-y-4">
          {error ? (
            <p className="text-sm text-danger">{error}</p>
          ) : loading ? (
            <p className="text-sm text-ink-muted">Menghitung penjualan...</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-background p-3">
                  <p className="text-xs text-ink-muted">Jumlah Transaksi</p>
                  <p className="text-xl font-semibold">{summary.count}</p>
                </div>
                <div className="rounded-xl bg-background p-3">
                  <p className="text-xs text-ink-muted">Total Penjualan</p>
                  <p className="text-xl font-semibold">{formatRupiah(summary.total)}</p>
                </div>
              </div>
              {summary.count > 0 && (
                <p className="text-xs text-ink-muted -mt-2">Rata-rata per transaksi: {formatRupiah(summary.avg)}</p>
              )}

              {methodKeys.length > 0 && (
                <div className="rounded-xl bg-background p-3 space-y-1.5 text-sm">
                  <p className="text-xs font-medium text-ink-muted">Per Metode Bayar</p>
                  {methodKeys.map((k) => (
                    <div key={k} className="flex justify-between gap-2">
                      <span>
                        {PAYMENT_LABELS[k] || k}{" "}
                        <span className="text-xs text-ink-muted">({summary.byMethod[k].count})</span>
                      </span>
                      <span>{formatRupiah(summary.byMethod[k].amount)}</span>
                    </div>
                  ))}
                </div>
              )}

              {rows.length > 0 ? (
                <div>
                  <p className="text-xs font-medium text-ink-muted mb-1.5">
                    Transaksi Terbaru{rows.length > 20 ? " (20 teratas)" : ""}
                  </p>
                  <div className="divide-y divide-border rounded-xl border border-border">
                    {rows.slice(0, 20).map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                        <div className="min-w-0">
                          <p className="font-mono truncate">{txCode(r.id)}</p>
                          <p className="text-ink-muted">
                            {formatDateTime(r.created_at)} · {PAYMENT_LABELS[r.payment_method] || r.payment_method}
                          </p>
                        </div>
                        <span className="text-sm font-medium shrink-0">{formatRupiah(r.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-ink-muted text-center py-4">Belum ada transaksi selesai pada periode ini.</p>
              )}
            </>
          )}
        </div>

        <div className="p-4 border-t border-border flex gap-2">
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            disabled={loading}
            className="flex-1 rounded-lg border border-border px-3 py-2.5 text-sm font-medium hover:bg-background disabled:opacity-60"
          >
            Muat Ulang
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-lg bg-primary text-white px-3 py-2.5 text-sm font-medium hover:bg-primary-hover"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
