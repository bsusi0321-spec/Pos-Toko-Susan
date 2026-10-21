"use client";

import { debounce } from "@/lib/debounce";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  ShoppingBag,
  Settings,
  LogOut,
  Bell,
  Moon,
  Sun,
  Receipt,
  TrendingUp,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { loadRecentSalePairs, shouldNotifyLowStock } from "@/lib/lowStock";
import { useViewport } from "@/lib/useViewport";
import ScannerStatusWidget from "@/components/ScannerStatusWidget";
import toast from "react-hot-toast";
import { formatRupiah } from "@/lib/format";
import { getSavedTheme, saveTheme, applyTheme } from "@/lib/theme";
import { Menu, X } from "lucide-react";

// Menu digabung per kelompok kerja: sidebar hanya menampilkan KELOMPOK, dan halaman-halaman
// di dalam kelompok itu berpindah lewat tab di atas konten. Alamat (URL) tiap halaman tidak
// berubah, jadi semua tautan lama tetap berfungsi. Mau mengubah susunan menu? Cukup ubah
// daftar di bawah ini.
const NAV_GROUPS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, items: [{ href: "/admin/dashboard", label: "Dashboard" }] },
  { key: "kasir", label: "Buka Kasir", icon: ShoppingBag, items: [{ href: "/admin/kasir", label: "Buka Kasir" }] },
  {
    key: "penjualan",
    label: "Penjualan",
    icon: Receipt,
    items: [
      { href: "/admin/transaksi", label: "Transaksi" },
      { href: "/admin/retur", label: "Retur Barang" },
      { href: "/admin/kasbon", label: "Kasbon" },
      { href: "/admin/pelanggan", label: "Pelanggan" },
    ],
  },
  {
    key: "produk",
    label: "Produk & Stok",
    icon: Package,
    items: [
      { href: "/admin/produk", label: "Produk & Harga" },
      { href: "/admin/kartu-stok", label: "Kartu Stok" },
      { href: "/admin/stok-opname", label: "Stok Opname" },
      { href: "/admin/label-barcode", label: "Label & Barcode" },
      { href: "/admin/riwayat-perubahan", label: "Riwayat Perubahan" },
    ],
  },
  {
    key: "pembelian",
    label: "Pembelian",
    icon: ShoppingCart,
    items: [
      { href: "/admin/pembelian", label: "Stok & Barang Masuk" },
      { href: "/admin/supplier", label: "Supplier" },
    ],
  },
  {
    key: "laporan",
    label: "Laporan & Kas",
    icon: TrendingUp,
    items: [
      { href: "/admin/shift-kas", label: "Shift & Kas" },
      { href: "/admin/tutup-buku", label: "Tutup Buku Bulanan" },
      { href: "/admin/produk-terlaris", label: "Terlaris & Tidak Laris" },
    ],
  },
  {
    key: "pengaturan",
    label: "Pengaturan",
    icon: Settings,
    items: [
      { href: "/admin/pengaturan", label: "Toko" },
      { href: "/admin/cabang", label: "Cabang" },
      { href: "/admin/pengguna", label: "Pengguna" },
      { href: "/admin/kasir-shortcut", label: "Shortcut Kasir" },
      { href: "/admin/kamus-suara", label: "Kamus Suara" },
      { href: "/admin/log-aktivitas", label: "Log Aktivitas" },
      { href: "/admin/arsip", label: "Arsip Data" },
    ],
  },
];

function isOnPage(pathname, href) {
  return pathname === href || pathname.startsWith(href + "/");
}

export default function AdminShell({ profile, settings, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const activeGroup = NAV_GROUPS.find((g) => g.items.some((i) => isOnPage(pathname, i.href))) || null;
  const supabase = createClient();
  const { isMobile, isTablet } = useViewport();
  const [dark, setDark] = useState(settings?.theme === "dark");
  const [themeReady, setThemeReady] = useState(false);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Sidebar mengecil (ikon saja) di tablet supaya halaman kerja lebih lega;
  // di HP sidebar disembunyikan jadi menu geser (drawer) lewat tombol hamburger.
  const sidebarWidth = isTablet ? "w-16" : "w-60";
  const showLabels = !isTablet;

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // Pilihan tema disimpan per perangkat (lib/theme.js). Kalau belum pernah
  // memilih, pakai default dari Pengaturan Toko. "themeReady" mencegah tema
  // default sempat menimpa pilihan tersimpan sebelum sempat dibaca.
  useEffect(() => {
    const saved = getSavedTheme();
    if (saved) setDark(saved === "dark");
    setThemeReady(true);
  }, []);

  useEffect(() => {
    if (!themeReady) return;
    applyTheme(dark ? "dark" : "light");
  }, [dark, themeReady]);

  function toggleDark() {
    const next = !dark;
    setDark(next);
    saveTheme(next ? "dark" : "light");
  }

  useEffect(() => {
    async function loadLowStock() {
      let data = [];
      try {
        // product_branch_stock = jumlah produk x jumlah cabang, gampang lewat 1000 baris.
        // Hanya baris dengan stok minimum > 0 yang mungkin "menipis" (lihat filter di bawah),
        // jadi sisanya tidak perlu diunduh -- hasilnya sama, datanya jauh lebih sedikit.
        data = await fetchAllRows(
          () => supabase.from("product_branch_stock").select("product_id, branch_id, stock_qty, min_stock, products(name), branches(name)").gt("min_stock", 0),
          { orderBy: ["product_id", "branch_id"] }
        );
      } catch (e) {
        data = [];
      }
      // Aturan 3 hari: barang menipis yang tidak terjual 3 hari terakhir tidak ikut dihitung/ditampilkan.
      const recentPairs = await loadRecentSalePairs(supabase);
      const low = (data || [])
        .filter((row) => Number(row.stock_qty) <= Number(row.min_stock) && Number(row.min_stock) > 0)
        .filter((row) => shouldNotifyLowStock(recentPairs, row.product_id, row.branch_id))
        .map((row) => ({ name: row.products?.name || "(barang)", branchName: row.branches?.name, stock_qty: row.stock_qty }));
      setLowStockItems(low);
      setLowStockCount(low.length);
    }
    loadLowStock();

    // Setiap barang terjual = 1 perubahan stok. Digabung dulu (1,5 dtk) supaya satu
    // transaksi berisi banyak barang tidak memicu banyak unduhan sekaligus.
    const reloadLowStock = debounce(loadLowStock, 1500);

    const channel = supabase
      .channel("admin-notifications")
      .on("postgres_changes", { event: "*", schema: "public", table: "product_branch_stock" }, reloadLowStock)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "transactions" }, (payload) => {
        const tx = payload.new;
        if (tx?.status === "completed") {
          toast.success(`Transaksi baru: ${formatRupiah(tx.total)}`, { icon: "🧾" });
        }
      })
      .subscribe();

    return () => {
      reloadLowStock.cancel();
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex flex-1 app-shell-height overflow-hidden">
      {/* Class "app-shell-height" (lihat globals.css) = tinggi 100dvh dengan fallback 100vh,
          supaya tingginya pas dengan area yang benar-benar kelihatan di HP dan tetap
          bekerja di browser/webview lama yang belum mendukung satuan dvh. Kalau
          kontainer ini tidak punya tinggi yang jelas, seluruh halaman (termasuk
          header) akan ikut ke-scroll bareng -- itu sebabnya header sempat tidak diam. */}
      {/* Sidebar tetap: disembunyikan di HP (diganti drawer di bawah), mengecil jadi ikon saja di tablet */}
      {!isMobile && (
        <aside className={`${sidebarWidth} shrink-0 border-r border-border bg-surface flex flex-col transition-all`}>
          <div className={`p-4 border-b border-border ${!showLabels ? "px-2 text-center" : ""}`}>
            {showLabels ? (
              <>
                <p className="text-sm font-semibold truncate">{settings?.store_name || "Toko Saya"}</p>
                <p className="text-xs text-ink-muted">Panel Admin</p>
              </>
            ) : (
              <p className="text-xs font-semibold truncate" title={settings?.store_name || "Toko Saya"}>
                {(settings?.store_name || "TS").slice(0, 2).toUpperCase()}
              </p>
            )}
          </div>
          <nav className="flex-1 overflow-auto p-2 space-y-0.5">
            {NAV_GROUPS.map((item) => {
              const Icon = item.icon;
              const active = activeGroup?.key === item.key;
              return (
                <Link
                  key={item.key}
                  href={item.items[0].href}
                  title={item.label}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${!showLabels ? "justify-center px-0" : ""} ${
                    active ? "bg-primary-soft text-primary font-medium" : "text-ink-muted hover:bg-background hover:text-ink"
                  }`}
                >
                  <Icon size={16} />
                  {showLabels && item.label}
                </Link>
              );
            })}
          </nav>
          <div className="p-3 border-t border-border">
            <button
              onClick={handleLogout}
              title="Keluar"
              className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger-soft ${!showLabels ? "justify-center px-0" : ""}`}
            >
              <LogOut size={16} /> {showLabels && "Keluar"}
            </button>
          </div>
        </aside>
      )}

      {/* Drawer menu untuk HP: sidebar penuh muncul dari kiri lewat tombol hamburger di header */}
      {isMobile && mobileNavOpen && (
        <div className="fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileNavOpen(false)} />
          <aside className="relative w-64 max-w-[80vw] h-full bg-surface border-r border-border flex flex-col">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold truncate">{settings?.store_name || "Toko Saya"}</p>
                <p className="text-xs text-ink-muted">Panel Admin</p>
              </div>
              <button onClick={() => setMobileNavOpen(false)} className="p-1.5 rounded-lg hover:bg-background">
                <X size={18} />
              </button>
            </div>
            <nav className="flex-1 overflow-auto p-2 space-y-0.5">
              {NAV_GROUPS.map((item) => {
                const Icon = item.icon;
                const active = activeGroup?.key === item.key;
                return (
                  <Link
                    key={item.key}
                    href={item.items[0].href}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                      active ? "bg-primary-soft text-primary font-medium" : "text-ink-muted hover:bg-background hover:text-ink"
                    }`}
                  >
                    <Icon size={16} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="p-3 border-t border-border">
              <button onClick={handleLogout} className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger-soft">
                <LogOut size={16} /> Keluar
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 shrink-0 border-b border-border bg-surface flex items-center justify-end gap-2 px-3 sm:px-5 sticky top-0 z-30">
          {isMobile && (
            <button onClick={() => setMobileNavOpen(true)} className="mr-auto p-2 rounded-lg hover:bg-background">
              <Menu size={20} />
            </button>
          )}
          <ScannerStatusWidget />
          <div className="relative">
            <button
              onClick={() => (isMobile ? router.push("/admin/notifikasi") : setNotifOpen((v) => !v))}
              className="relative p-2 rounded-lg hover:bg-background"
            >
              <Bell size={18} />
              {lowStockCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-danger text-white text-[10px] flex items-center justify-center">
                  {lowStockCount}
                </span>
              )}
            </button>
            {!isMobile && notifOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-surface border border-border rounded-xl shadow-lg p-3 z-20">
                <p className="text-xs font-medium mb-2">Stok Menipis</p>
                {lowStockItems.length === 0 && <p className="text-xs text-ink-muted">Tidak ada barang menipis yang masih laku.</p>}
                <div className="space-y-1 max-h-64 overflow-auto">
                  {lowStockItems.map((p, idx) => (
                    <div key={idx} className="flex justify-between text-xs py-1 gap-2">
                      <span className="truncate">{p.name}{p.branchName ? ` (${p.branchName})` : ""}</span>
                      <span className="text-danger font-medium shrink-0">{p.stock_qty}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => { setNotifOpen(false); router.push("/admin/notifikasi"); }}
                  className="w-full text-center text-xs text-primary mt-2 pt-2 border-t border-border hover:underline"
                >
                  Lihat Semua di Halaman Notifikasi
                </button>
              </div>
            )}
          </div>
          <button onClick={toggleDark} className="p-2 rounded-lg hover:bg-background">
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <div className="pl-2 ml-1 border-l border-border text-sm">
            <p className="font-medium leading-tight">{profile.full_name}</p>
            <p className="text-xs text-ink-muted leading-tight">Admin</p>
          </div>
        </header>
        <main className="flex-1 overflow-auto overscroll-contain p-3 sm:p-6">
          {/* Tab antar halaman dalam satu kelompok menu (hanya kalau kelompoknya punya lebih dari 1 halaman) */}
          {activeGroup && activeGroup.items.length > 1 && (
            <nav aria-label={activeGroup.label} className="flex gap-1 overflow-x-auto border-b border-border mb-4 sm:mb-5">
              {activeGroup.items.map((tab) => {
                const active = isOnPage(pathname, tab.href);
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    aria-current={active ? "page" : undefined}
                    className={`shrink-0 px-3.5 py-2.5 text-sm border-b-2 -mb-px transition ${
                      active ? "border-primary text-primary font-medium" : "border-transparent text-ink-muted hover:text-ink"
                    }`}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </nav>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
