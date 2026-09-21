import "./globals.css";
import { Toaster } from "react-hot-toast";
import RegisterSW from "./RegisterSW";
import ScannerProvider from "@/components/ScannerProvider";
import GlobalScanToast from "@/components/GlobalScanToast";
import BluetoothPrinterProvider from "@/components/BluetoothPrinterProvider";
import { createClient } from "@/lib/supabase/server";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

export async function generateMetadata() {
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("store_settings")
    .select("store_name, app_icon_url")
    .eq("id", 1)
    .single();

  const storeName = settings?.store_name || "Aplikasi Kasir";
  // Ikon aplikasi diatur admin di Pengaturan Toko; kalau belum diisi,
  // pakai ikon bawaan supaya tidak pernah kosong.
  const iconUrl = settings?.app_icon_url || "/icons/icon-192.png";
  const appleIconUrl = settings?.app_icon_url || "/icons/apple-touch-icon.png";

  return {
    title: storeName,
    description: `Aplikasi POS kasir ${storeName}`,
    manifest: "/manifest.json",
    icons: {
      icon: iconUrl,
      apple: appleIconUrl,
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: storeName.length > 12 ? storeName.slice(0, 12) : storeName,
    },
  };
}

export const viewport = {
  themeColor: "#0f6d4f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }) {
  return (
    // suppressHydrationWarning: script tema di bawah menambah class "dark" ke <html>
    // sebelum React jalan, jadi class-nya sengaja beda dari HTML dari server.
    <html lang="id" className="h-full" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <BluetoothPrinterProvider />
        <ScannerProvider>
          {children}
          <GlobalScanToast />
        </ScannerProvider>
        <Toaster position="top-center" toastOptions={{ duration: 2500 }} />
        <RegisterSW />
      </body>
    </html>
  );
}
