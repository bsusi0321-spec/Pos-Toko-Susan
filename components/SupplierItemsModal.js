"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { formatDate, formatNumber, formatRupiahDec } from "@/lib/format";
import { Button, Modal, Input, Badge } from "@/components/ui/kit";

// Daftar barang yang PERNAH DIBELI dari satu supplier, diambil dari riwayat nota
// pembelian (produk belum punya kolom supplier sendiri). Barang yang stoknya
// menipis diletakkan paling atas supaya gampang menentukan apa yang perlu dipesan.
//
// Props:
//  - supplier: { id, name }
//  - branchId: cabang untuk membaca stok (kosong = cabang aktif pertama)
//  - onPick(productId): kalau diisi, tiap barang punya tombol "Tambah ke pesanan"
//  - onClose
const TIER_LABELS = {
  retail: "Eceran",
  grosir: "Grosir",
  half_grosir: "Setengah Grosir",
  kg: "Per Kg",
  half_kg: "Per 1/2 Kg",
  ons: "Per Ons",
};

export default function SupplierItemsModal({ supplier, branchId = null, onClose, onPick = null }) {
  const supabase = createClient();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const items = await fetchAllRows(() =>
          supabase
            .from("purchase_order_items")
            .select(
              "id, product_id, product_name, price_type, qty, unit_cost, products(name, unit_type, active), purchase_orders!inner(id, supplier_id, created_at)"
            )
            .eq("purchase_orders.supplier_id", supplier.id)
        );

        let bid = branchId;
        if (!bid) {
          const { data: b } = await supabase
            .from("branches")
            .select("id")
            .eq("active", true)
            .order("created_at", { ascending: true })
            .limit(1);
          bid = b?.[0]?.id || null;
        }

        const map = new Map();
        for (const it of items) {
          const key = it.product_id || `nama:${it.product_name || "-"}`;
          const date = it.purchase_orders?.created_at || null;
          let g = map.get(key);
          if (!g) {
            g = {
              key,
              productId: it.product_id || null,
              name: it.products?.name || it.product_name || "(produk sudah dihapus)",
              unit: it.products?.unit_type === "kg" ? "kg" : "pcs",
              active: it.products ? it.products.active !== false : false,
              lastDate: date,
              orders: new Set(),
              tiers: {},
            };
            map.set(key, g);
          }
          g.orders.add(it.purchase_orders?.id);
          if (date && (!g.lastDate || Date.parse(date) > Date.parse(g.lastDate))) g.lastDate = date;
          const cur = g.tiers[it.price_type];
          if (!cur || (date && (!cur.date || Date.parse(date) > Date.parse(cur.date)))) {
            g.tiers[it.price_type] = { cost: it.unit_cost, qty: it.qty, date };
          }
        }
        const list = [...map.values()];

        // Stok sekarang di cabang
        const stock = {};
        const ids = list.map((g) => g.productId).filter(Boolean);
        if (bid) {
          for (let i = 0; i < ids.length; i += 100) {
            const { data, error: stockErr } = await supabase
              .from("product_branch_stock")
              .select("product_id, stock_qty, min_stock")
              .eq("branch_id", bid)
              .in("product_id", ids.slice(i, i + 100));
            if (stockErr) throw stockErr;
            for (const r of data || []) stock[r.product_id] = r;
          }
        }
        for (const g of list) {
          const s = g.productId ? stock[g.productId] : null;
          g.stock = Number(s?.stock_qty || 0);
          g.min = Number(s?.min_stock || 0);
          g.hasStock = !!bid && !!g.productId;
          g.low = g.min > 0 && g.stock <= g.min;
        }
        list.sort((a, b) => {
          if (a.low !== b.low) return a.low ? -1 : 1;
          return Date.parse(b.lastDate || 0) - Date.parse(a.lastDate || 0);
        });

        if (!cancelled) setRows(list);
      } catch (e) {
        if (!cancelled) setError(e?.message || "Gagal memuat daftar barang");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplier.id, branchId]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const term = q.trim().toLowerCase();
    return term ? rows.filter((r) => r.name.toLowerCase().includes(term)) : rows;
  }, [rows, q]);
  const lowCount = (rows || []).filter((r) => r.low).length;

  return (
    <Modal title={`Barang dari ${supplier.name}`} onClose={onClose} wide>
      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : rows === null ? (
        <p className="text-sm text-ink-muted">Memuat...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Belum ada barang yang pernah dibeli dari supplier ini. Barang akan muncul di sini setelah ada nota pembelian.
        </p>
      ) : (
        <>
          <p className="text-xs text-ink-muted mb-3">
            {rows.length} barang pernah dibeli dari riwayat nota
            {lowCount > 0 && (
              <>
                {" · "}
                <span className="text-danger font-medium">{lowCount} stok menipis</span>
              </>
            )}
            .
          </p>
          <Input placeholder="Cari barang..." value={q} onChange={(e) => setQ(e.target.value)} className="mb-3" />
          {filtered.length === 0 ? (
            <p className="text-sm text-ink-muted">Tidak ada barang yang cocok.</p>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-ink-muted border-b border-border">
                  <tr>
                    <th className="text-left py-2 pr-3 font-medium">No</th>
                    <th className="text-left py-2 pr-3 font-medium">Barang</th>
                    <th className="text-left py-2 pr-3 font-medium">Terakhir dibeli</th>
                    <th className="text-left py-2 pr-3 font-medium">Harga beli terakhir</th>
                    <th className="text-right py-2 pr-3 font-medium">Stok</th>
                    {onPick && <th className="py-2" />}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr key={r.key} className="border-b border-border last:border-0 align-top">
                      <td className="py-2.5 pr-3 text-ink-muted">{i + 1}</td>
                      <td className="py-2.5 pr-3">
                        <p className="font-medium">{r.name}</p>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {r.low && <Badge tone="danger">Stok menipis</Badge>}
                          {!r.active && <Badge>{r.productId ? "Nonaktif" : "Sudah dihapus"}</Badge>}
                          <span className="text-[11px] text-ink-muted">dibeli di {r.orders.size} nota</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-ink-muted whitespace-nowrap">{r.lastDate ? formatDate(r.lastDate) : "-"}</td>
                      <td className="py-2.5 pr-3">
                        {Object.entries(r.tiers).map(([type, t]) => (
                          <p key={type} className="text-xs whitespace-nowrap">
                            <span className="text-ink-muted">{TIER_LABELS[type] || type}:</span> {formatRupiahDec(t.cost, 2)}{" "}
                            <span className="text-ink-muted">(x{formatNumber(t.qty, 3)})</span>
                          </p>
                        ))}
                      </td>
                      <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                        {r.hasStock ? (
                          <>
                            <p className={r.low ? "text-danger font-semibold" : "font-medium"}>
                              {formatNumber(r.stock, 3)} {r.unit}
                            </p>
                            {r.min > 0 && <p className="text-[11px] text-ink-muted">min {formatNumber(r.min, 3)}</p>}
                          </>
                        ) : (
                          <span className="text-ink-muted">-</span>
                        )}
                      </td>
                      {onPick && (
                        <td className="py-2.5 text-right">
                          <Button variant="outline" onClick={() => onPick(r.productId)} disabled={!r.productId || !r.active}>
                            Tambah ke pesanan
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-ink-muted mt-3">
            Harga dan jumlah diambil dari nota terakhir untuk tiap jenis. Barang yang belum pernah dibeli dari supplier ini tidak muncul.
          </p>
        </>
      )}
    </Modal>
  );
}
