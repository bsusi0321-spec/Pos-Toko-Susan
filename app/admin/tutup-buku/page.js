"use client";

// Tempat KHUSUS admin memotong estimasi laba kotor bulanan dengan kas
// masuk/keluar toko (dicatat di menu Shift & Kas) -- dilakukan MANUAL oleh
// admin, biasanya di akhir bulan. Dashboard TIDAK memotong laba dengan kas
// keluar secara otomatis -- angka "Estimasi Laba" di Dashboard itu murni
// dari selisih harga jual & modal barang, belum dikurangi pengeluaran
// operasional toko (plastik, transport, dsb). Baru di halaman inilah
// potongan itu benar-benar dihitung & dicatat sebagai catatan permanen per
// bulan (snapshot -- begitu ditutup, angkanya tidak berubah lagi walau data
// mentahnya berubah belakangan).

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { formatRupiah, formatDateTime } from "@/lib/format";
import { Button, Card, StatCard, Textarea, EmptyState } from "@/components/ui/kit";
import { useViewport } from "@/lib/useViewport";

function currentPeriodKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function periodLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}
function periodRange(key) {
  const [y, m] = key.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1); // eksklusif -- awal bulan berikutnya
  return { start, end };
}

export default function TutupBukuPage() {
  const supabase = createClient();
  const { isMobile } = useViewport();
  const [periodKey, setPeriodKey] = useState(currentPeriodKey());
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState({ revenue: 0, grossProfit: 0, cashIn: 0, cashOut: 0 });
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);
  const [alreadyClosed, setAlreadyClosed] = useState(null);

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodKey, history]);

  async function loadHistory() {
    const { data } = await supabase.from("monthly_closings").select("*, profiles(full_name)").order("period_key", { ascending: false });
    setHistory(data || []);
  }

  async function loadPreview() {
    setLoading(true);
    const { start, end } = periodRange(periodKey);
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    const existing = history.find((h) => h.period_key === periodKey);
    setAlreadyClosed(existing || null);

    const [{ data: tx }, { data: items }, { data: movements }] = await Promise.all([
      supabase.from("transactions").select("id, total").eq("status", "completed").gte("created_at", startIso).lt("created_at", endIso),
      supabase
        .from("transaction_items")
        .select("transaction_id, qty, subtotal, cost_price_snapshot")
        .gte("created_at", startIso)
        .lt("created_at", endIso),
      supabase.from("cash_movements").select("type, amount").gte("movement_date", startIso).lt("movement_date", endIso),
    ]);

    const txIds = new Set((tx || []).map((t) => t.id));
    const revenue = (tx || []).reduce((s, t) => s + Number(t.total), 0);
    const grossProfit = (items || [])
      .filter((it) => txIds.has(it.transaction_id))
      .reduce((s, it) => s + (Number(it.subtotal) - Number(it.cost_price_snapshot) * Number(it.qty)), 0);
    const cashIn = (movements || []).filter((m) => m.type === "masuk").reduce((s, m) => s + Number(m.amount), 0);
    const cashOut = (movements || []).filter((m) => m.type === "keluar").reduce((s, m) => s + Number(m.amount), 0);

    setPreview({ revenue, grossProfit, cashIn, cashOut });
    setLoading(false);
  }

  async function closeMonth() {
    if (alreadyClosed) return;
    if (!confirm(`Tutup buku ${periodLabel(periodKey)}? Setelah ditutup, angkanya tidak akan berubah lagi walau ada transaksi/catatan kas yang menyusul untuk bulan ini.`)) return;
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { start, end } = periodRange(periodKey);
      const netProfit = preview.grossProfit + preview.cashIn - preview.cashOut;
      const { error } = await supabase.from("monthly_closings").insert({
        period_key: periodKey,
        period_start: start.toISOString().slice(0, 10),
        period_end: new Date(end - 1).toISOString().slice(0, 10),
        gross_revenue: preview.revenue,
        gross_profit: preview.grossProfit,
        total_cash_in: preview.cashIn,
        total_cash_out: preview.cashOut,
        net_profit: netProfit,
        notes: notes || null,
        closed_by: userData?.user?.id,
      });
      if (error) throw error;
      toast.success(`Buku ${periodLabel(periodKey)} ditutup`);
      setNotes("");
      loadHistory();
    } catch (err) {
      toast.error(err.code === "23505" ? "Bulan ini sudah pernah ditutup" : err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteClosing(row) {
    if (!confirm(`Hapus catatan tutup buku ${periodLabel(row.period_key)}? Setelah dihapus, bulan ini bisa ditutup ulang.`)) return;
    const { error } = await supabase.from("monthly_closings").delete().eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Catatan dihapus");
    loadHistory();
  }

  const netPreview = preview.grossProfit + preview.cashIn - preview.cashOut;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Tutup Buku Bulanan</h1>
        <p className="text-sm text-ink-muted">
          Potong estimasi laba kotor bulanan dengan kas masuk/keluar toko (dicatat di menu Shift & Kas), lalu kunci
          jadi catatan laba bersih permanen per bulan. Dashboard tidak memotong ini otomatis -- semua potongan
          dilakukan manual dari halaman ini, biasanya di akhir bulan.
        </p>
      </div>

      <Card title="Hitung & Tutup Buku">
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className="text-xs font-medium text-ink-muted block mb-1">Pilih Bulan</label>
            <input
              type="month"
              value={periodKey}
              onChange={(e) => setPeriodKey(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-ink-muted">Menghitung...</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <StatCard label="Omset" value={formatRupiah(preview.revenue)} />
              <StatCard label="Estimasi Laba Kotor" value={formatRupiah(preview.grossProfit)} tone="primary" />
              <StatCard label="Kas Masuk (Toko)" value={formatRupiah(preview.cashIn)} />
              <StatCard label="Pengeluaran (Toko)" value={formatRupiah(preview.cashOut)} tone="danger" />
            </div>
            <div className="rounded-xl border border-primary/30 bg-primary-soft p-4 mb-4">
              <p className="text-xs text-ink-muted mb-1">Estimasi Laba Bersih Setelah Pengeluaran</p>
              <p className="text-2xl font-semibold text-primary">{formatRupiah(netPreview)}</p>
              <p className="text-xs text-ink-muted mt-1">Laba Kotor + Kas Masuk - Pengeluaran</p>
            </div>

            {alreadyClosed ? (
              <div className="rounded-lg border border-border bg-background p-3 text-sm">
                <p>
                  Bulan <b>{periodLabel(periodKey)}</b> sudah ditutup pada {formatDateTime(alreadyClosed.closed_at)} oleh{" "}
                  {alreadyClosed.profiles?.full_name || "-"}, dengan laba bersih{" "}
                  <b className="text-primary">{formatRupiah(alreadyClosed.net_profit)}</b>. Hapus catatannya dulu di
                  tabel riwayat di bawah kalau mau menutup ulang.
                </p>
              </div>
            ) : (
              <>
                <Textarea
                  label="Catatan (opsional)"
                  placeholder="mis. Ada pengeluaran renovasi besar bulan ini"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="mb-3"
                />
                <Button onClick={closeMonth} disabled={saving}>
                  {saving ? "Menutup..." : `Tutup Buku ${periodLabel(periodKey)}`}
                </Button>
              </>
            )}
          </>
        )}
      </Card>

      <Card title="Riwayat Tutup Buku">
        {history.length === 0 ? (
          <EmptyState text="Belum ada bulan yang ditutup." />
        ) : isMobile ? (
          // Versi HP: kolom-kolomnya dibikin menurun per baris (kartu),
          // bukan tabel ke samping -- tabel dengan banyak kolom angka kalau
          // dipaksa muat di layar sempit jadi meluber keluar kotak.
          <div className="space-y-3">
            {history.map((h) => (
              <div key={h.id} className="rounded-xl border border-border p-3 text-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold">{periodLabel(h.period_key)}</p>
                  <button onClick={() => deleteClosing(h)} className="text-xs text-ink-muted hover:text-danger">
                    Hapus
                  </button>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-ink-muted">Omset</span>
                    <span>{formatRupiah(h.gross_revenue)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-muted">Laba Kotor</span>
                    <span>{formatRupiah(h.gross_profit)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-muted">Kas Masuk</span>
                    <span>{formatRupiah(h.total_cash_in)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-muted">Pengeluaran</span>
                    <span className="text-danger">{formatRupiah(h.total_cash_out)}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-border mt-1">
                    <span className="text-ink-muted">Laba Bersih</span>
                    <span className="font-semibold text-primary">{formatRupiah(h.net_profit)}</span>
                  </div>
                </div>
                <p className="text-xs text-ink-muted mt-2">
                  Ditutup {formatDateTime(h.closed_at)} · {h.profiles?.full_name}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-ink-muted border-b border-border">
                <tr>
                  <th className="text-left py-2 pr-3 font-medium">Periode</th>
                  <th className="text-right py-2 pr-3 font-medium">Omset</th>
                  <th className="text-right py-2 pr-3 font-medium">Laba Kotor</th>
                  <th className="text-right py-2 pr-3 font-medium">Kas Masuk</th>
                  <th className="text-right py-2 pr-3 font-medium">Pengeluaran</th>
                  <th className="text-right py-2 pr-3 font-medium">Laba Bersih</th>
                  <th className="text-left py-2 pr-3 font-medium">Ditutup</th>
                  <th className="text-right py-2 font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 pr-3 font-medium">{periodLabel(h.period_key)}</td>
                    <td className="py-2.5 pr-3 text-right">{formatRupiah(h.gross_revenue)}</td>
                    <td className="py-2.5 pr-3 text-right">{formatRupiah(h.gross_profit)}</td>
                    <td className="py-2.5 pr-3 text-right">{formatRupiah(h.total_cash_in)}</td>
                    <td className="py-2.5 pr-3 text-right text-danger">{formatRupiah(h.total_cash_out)}</td>
                    <td className="py-2.5 pr-3 text-right font-semibold text-primary">{formatRupiah(h.net_profit)}</td>
                    <td className="py-2.5 pr-3 text-ink-muted text-xs">
                      {formatDateTime(h.closed_at)}
                      <br />
                      {h.profiles?.full_name}
                    </td>
                    <td className="py-2.5 text-right">
                      <button onClick={() => deleteClosing(h)} className="text-xs text-ink-muted hover:text-danger">
                        Hapus
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
