// Daftar menu admin: SATU sumber untuk sidebar (desktop/tablet) dan layar
// "Menu Utama" (kisi ikon besar). Menambah halaman admin baru cukup menambah
// satu baris di ADMIN_MENU_ITEMS, lalu pilih `group`-nya.
import {
  LayoutDashboard,
  Wallet,
  Undo2,
  Clock,
  Package,
  Tags,
  Truck,
  ShoppingCart,
  Users,
  ScrollText,
  UserCog,
  Archive,
  ShoppingBag,
  Settings,
  Keyboard,
  Receipt,
  Building2,
  Volume2,
  Calculator,
  ClipboardCheck,
  History,
} from "lucide-react";

// Urutan di sini = urutan sidebar (tidak diubah dari sebelumnya).
export const ADMIN_MENU_ITEMS = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "utama" },
  { href: "/admin/kasir", label: "Buka Kasir", icon: ShoppingBag, group: "utama", highlight: true },
  { href: "/admin/kasir-shortcut", label: "Shortcut Kasir", icon: Keyboard, group: "pengaturan" },
  { href: "/admin/kamus-suara", label: "Kamus Suara", icon: Volume2, group: "pengaturan" },
  { href: "/admin/kasbon", label: "Kasbon Pelanggan", icon: Wallet, group: "utama" },
  { href: "/admin/retur", label: "Retur Barang", icon: Undo2, group: "utama" },
  { href: "/admin/shift-kas", label: "Shift & Kas", icon: Clock, group: "keuangan" },
  { href: "/admin/tutup-buku", label: "Tutup Buku Bulanan", icon: Calculator, group: "keuangan" },
  { href: "/admin/produk", label: "Produk & Harga", icon: Package, group: "stok" },
  { href: "/admin/label-barcode", label: "Label & Barcode", icon: Tags, group: "stok" },
  { href: "/admin/supplier", label: "Supplier", icon: Truck, group: "stok" },
  { href: "/admin/pembelian", label: "Stok & Barang Masuk", icon: ShoppingCart, group: "stok" },
  { href: "/admin/stok-opname", label: "Stok Opname", icon: ClipboardCheck, group: "stok" },
  { href: "/admin/transaksi", label: "Cek Transaksi Penjualan", icon: Receipt, group: "utama" },
  { href: "/admin/pelanggan", label: "Pelanggan", icon: Users, group: "data" },
  { href: "/admin/cabang", label: "Cabang", icon: Building2, group: "data" },
  { href: "/admin/log-aktivitas", label: "Log Aktivitas", icon: ScrollText, group: "pengaturan" },
  { href: "/admin/riwayat-perubahan", label: "Riwayat Perubahan", icon: History, group: "pengaturan" },
  { href: "/admin/arsip", label: "Arsip Data", icon: Archive, group: "pengaturan" },
  { href: "/admin/pengguna", label: "Pengguna", icon: UserCog, group: "data" },
  { href: "/admin/pengaturan", label: "Pengaturan Toko", icon: Settings, group: "pengaturan" },
];

// Kelompok di layar Menu Utama (urutan tampil). tone: warna ikon.
export const ADMIN_MENU_GROUPS = [
  { key: "utama", title: "Penjualan", tone: "primary" },
  { key: "stok", title: "Produk & Stok", tone: "primary" },
  { key: "keuangan", title: "Keuangan", tone: "warning" },
  { key: "data", title: "Pelanggan, Cabang & Pengguna", tone: "primary" },
  { key: "pengaturan", title: "Pengaturan & Catatan", tone: "neutral" },
];
