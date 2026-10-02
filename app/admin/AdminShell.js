"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Bell, Moon, Sun, House } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { useViewport } from "@/lib/useViewport";
import ScannerStatusWidget from "@/components/ScannerStatusWidget";
import toast from "react-hot-toast";
import { formatRupiah } from "@/lib/format";
import { getSavedTheme, saveTheme, applyTheme } from "@/lib/theme";
import { ADMIN_MENU_ITEMS as NAV } from "@/lib/adminMenu";


export default function AdminShell({ profile, settings, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { isMobile, isTablet } = useViewport();
  const [dark, setDark] = useState(settings?.theme === "dark");
  const [themeReady, setThemeReady] = useState(false);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [lowStockItems, setLowStockItems] = useState([]);

  // Sidebar mengecil (ikon saja) di tablet supaya halaman kerja lebih lega.
  // Di HP tidak ada sidebar/hamburger: semua menu ada di layar "Menu Utama"
  // (/admin, kisi ikon besar); tombol "Menu" di header membawa kembali ke sana.
  const sidebarWidth = isTablet ? "w-16" : "w-60";
  const showLabels = !isTablet;

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
        data = await fetchAllRows(
          () => supabase.from("product_branch_stock").select("stock_qty, min_stock, products(name), branches(name)"),
          { orderBy: ["product_id", "branch_id"] }
        );
      } catch (e) {
        data = [];
      }
      const low = (data || [])
        .filter((row) => Number(row.stock_qty) <= Number(row.min_stock) && Number(row.min_stock) > 0)
        .map((row) => ({ name: row.products?.name || "(barang)", branchName: row.branches?.name, stock_qty: row.stock_qty }));
      setLowStockItems(low);
      setLowStockCount(low.length);
    }
    loadLowStock();

    const channel = supabase
      .channel("admin-notifications")
      .on("postgres_changes", { event: "*", schema: "public", table: "product_branch_stock" }, loadLowStock)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "transactions" }, (payload) => {
        const tx = payload.new;
        if (tx?.status === "completed") {
          toast.success(`Transaksi baru: ${formatRupiah(tx.total)}`, { icon: "🧾" });
        }
      })
      .subscribe();

    return () => {
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
            <Link
              href="/admin"
              title="Menu Utama"
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${!showLabels ? "justify-center px-0" : ""} ${
                pathname === "/admin" ? "bg-primary-soft text-primary font-medium" : "text-ink-muted hover:bg-background hover:text-ink"
              }`}
            >
              <House size={16} />
              {showLabels && "Menu Utama"}
            </Link>
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
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

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 shrink-0 border-b border-border bg-surface flex items-center justify-end gap-2 px-3 sm:px-5 sticky top-0 z-30">
          {isMobile &&
            (pathname === "/admin" ? (
              <p className="mr-auto pl-1 text-sm font-semibold truncate">{settings?.store_name || "Toko Saya"}</p>
            ) : (
              <Link href="/admin" className="mr-auto flex items-center gap-1.5 px-2.5 py-2 rounded-lg hover:bg-background text-sm font-medium">
                <House size={18} /> Menu
              </Link>
            ))}
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
                {lowStockItems.length === 0 && <p className="text-xs text-ink-muted">Semua stok aman.</p>}
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
        <main className="flex-1 overflow-auto overscroll-contain p-3 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
