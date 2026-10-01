// Pilihan tampilan terang/gelap, disimpan PER PERANGKAT di localStorage
// (sama seperti pengaturan suara di lib/voice.js) -- jadi kasir di HP A boleh
// gelap, kasir di PC B boleh terang, tanpa mengubah pengaturan toko.
// Kalau perangkat belum pernah memilih, dipakai "Mode Tampilan Default"
// dari Pengaturan Toko (store_settings.theme).
//
// Dipakai bersama oleh layar kasir (KasirApp.js) dan admin (AdminShell.js),
// supaya pilihan yang sama berlaku di keduanya.

export const THEME_STORAGE_KEY = "kasir_theme";

export function getSavedTheme() {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    return v === "dark" || v === "light" ? v : null;
  } catch {
    return null;
  }
}

export function saveTheme(theme) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // localStorage bisa diblokir (mis. mode privat) -- abaikan, tema tetap
    // berlaku selama halaman terbuka, hanya tidak diingat setelah ditutup.
  }
}

// Tema gelap = class "dark" di <html> (warnanya didefinisikan di app/globals.css).
export function applyTheme(theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

// Script kecil yang dijalankan SEBELUM halaman tampil (dipasang di app/layout.js)
// supaya layar tidak berkedip putih dulu baru jadi gelap saat halaman dibuka ulang.
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var c=document.documentElement.classList;if(t==="dark")c.add("dark");else if(t==="light")c.remove("dark")}catch(e){}`;
