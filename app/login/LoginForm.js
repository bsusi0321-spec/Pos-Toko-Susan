"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import InstallAppButton from "@/components/InstallAppButton";
import { googleFontHref } from "@/lib/loginFonts";

// ------------------------------------------------------------------
// Mode "Desain Penuh": admin upload 1 gambar utuh (background + logo +
// dekorasi digambar semua di gambar itu sendiri, mis. seperti contoh
// "Toko Susan"), lalu form Username/Password/Login yang SUNGGUHAN
// ditimpakan transparan PERSIS di atas kotak-kotak yang sudah digambar.
//
// PENTING -- kenapa dulu berantakan:
// Koordinat di bawah dalam PERSEN, dan persen itu dihitung terhadap KOTAK
// INDUK-nya. Dulu kotak induk dibuat `w-full h-full` lalu gambarnya
// `object-contain`; akibatnya kotak induk = selebar LAYAR sementara
// gambarnya cuma strip sempit di tengah, jadi "74.5% lebar" = 74.5% lebar
// LAYAR, bukan lebar GAMBAR -- kolom input pun melebar keluar gambar.
//
// Perbaikannya: ukuran kotak induk dihitung sendiri dan pasti (lihat
// .login-design-frame di globals.css) memakai rumus
//   lebar = min(lebar layar, tinggi layar x rasio gambar)
// sehingga kotak induk SELALU sama persis dengan kotak gambar yang
// terlihat, di HP, tablet, maupun PC -- dan koordinat persen di bawah
// otomatis pas tanpa perlu diubah per perangkat.
//
// Tips: buka /login?kalibrasi=1 untuk menampilkan garis batas area klik,
// berguna saat mencocokkan angka-angka di bawah dengan gambar desain baru.
const FULL_DESIGN_LAYOUT = {
  aspectRatio: "1024 / 1536",
  username: { top: "49.4%", left: "12.7%", width: "74.5%", height: "6.4%" },
  password: { top: "58.3%", left: "12.7%", width: "74.5%", height: "6.4%" },
  // Ikon orang/gembok SUDAH tergambar di gambar desain, di sisi kiri dalam
  // kotaknya. `iconPad` = lebar area ikon itu (persen terhadap lebar gambar).
  // Kolom input asli digeser sejauh ini supaya ikonnya tidak tertutup.
  iconPad: "8.8%",
  // Warna kotak input pada gambar desain. Kolom input asli diberi warna yang
  // SAMA supaya tulisan "Username"/"Password" yang ikut tergambar di gambar
  // tertutup rapi -- kalau dibiarkan transparan, tulisan bawaan gambar dan
  // teks yang diketik kasir akan saling tumpang tindih (bug sebelumnya).
  fieldBg: "#ffffff",
  // Ikon mata TIDAK digambar di gambar desainnya, jadi di sini kita
  // gambar ikon mata betulan (kecil & samar) supaya tetap berguna.
  // Kalau nanti pakai gambar desain yang ikon matanya sudah tergambar,
  // ubah `drawIcon` jadi false biar cuma jadi area klik transparan.
  eyeToggle: { top: "58.3%", left: "77.5%", width: "9%", height: "6.4%", drawIcon: true },
  submit: { top: "67.3%", left: "12.6%", width: "74.8%", height: "6.4%" },
  forgotPassword: { top: "74.8%", left: "30%", width: "40%", height: "3.2%" },
};

function EyeIcon({ off }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: "58%", height: "58%" }}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      {off && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  );
}

function FullDesignLoginForm({ s, username, setUsername, password, setPassword, loading, onSubmit }) {
  const [showPassword, setShowPassword] = useState(false);
  const [debug, setDebug] = useState(false);
  const L = FULL_DESIGN_LAYOUT;
  const inkColor = s.login_font_color || "#111827";

  // Mode kalibrasi: buka /login?kalibrasi=1 untuk melihat garis batas area
  // klik. Dibaca di useEffect (bukan saat render pertama) supaya tidak
  // bentrok dengan hasil render dari server.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("kalibrasi")) setDebug(true);
  }, []);

  // Rasio gambar dikirim ke CSS supaya ukuran kotak form dihitung pasti,
  // tidak bergantung pada cara masing-masing browser menaksir ukuran gambar.
  const [arW, arH] = L.aspectRatio.split("/").map((n) => parseFloat(n));
  const frameVars = { "--login-ar": `${arW} / ${arH}`, "--login-ratio": arW / arH };

  return (
    <div className="relative flex-1 min-h-0 flex items-center justify-center bg-black overflow-hidden">
      {/* Isi ruang kosong kiri-kanan (layar lebar / tablet mendatar) dengan
          gambar yang sama, diperbesar & diburamkan. */}
      <div
        className="login-design-backdrop"
        style={{ backgroundImage: `url(${s.login_bg_url})` }}
        aria-hidden="true"
      />

      <form
        onSubmit={onSubmit}
        className={`login-design-frame${debug ? " login-design-debug" : ""}`}
        style={{ ...frameVars, zIndex: 1 }}
      >
        <img
          src={s.login_bg_url}
          alt=""
          draggable={false}
          className="login-design-img select-none pointer-events-none"
        />

        {/* Username -- digeser ke kanan sejauh lebar ikon, dan diberi latar
            putih supaya tulisan "Username" bawaan gambar tertutup rapi. */}
        <input
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          required
          aria-label="Username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="login-design-hit login-design-field login-design-field--solid px-[2%]"
          style={{
            top: L.username.top,
            left: `calc(${L.username.left} + ${L.iconPad})`,
            width: `calc(${L.username.width} - ${L.iconPad})`,
            height: L.username.height,
            color: inkColor,
            background: L.fieldBg,
          }}
        />

        {/* Password -- selain digeser sejauh ikon gembok, lebarnya juga
            dipotong selebar ikon mata supaya teksnya tidak tertimpa. */}
        <input
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          aria-label="Password"
          autoComplete="current-password"
          className="login-design-hit login-design-field login-design-field--solid px-[2%]"
          style={{
            top: L.password.top,
            left: `calc(${L.password.left} + ${L.iconPad})`,
            width: `calc(${L.password.width} - ${L.iconPad} - ${L.eyeToggle.width})`,
            height: L.password.height,
            color: inkColor,
            background: L.fieldBg,
          }}
        />

        {/* Tombol mata (lihat / sembunyikan password) */}
        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          className="login-design-hit flex items-center justify-center rounded-full"
          style={{
            top: L.eyeToggle.top,
            left: L.eyeToggle.left,
            width: L.eyeToggle.width,
            height: L.eyeToggle.height,
            color: inkColor,
            opacity: L.eyeToggle.drawIcon ? 0.45 : 0,
          }}
          aria-label={showPassword ? "Sembunyikan password" : "Lihat password"}
        >
          {L.eyeToggle.drawIcon && <EyeIcon off={showPassword} />}
        </button>

        {/* Tombol Login -- pil merah & tulisan "Login" sudah tergambar di
            gambarnya, ini area submit transparan di atasnya. Saat proses
            login, area ini diredupkan + spinner supaya kasir tahu sedang
            diproses. */}
        <button
          type="submit"
          disabled={loading}
          className="login-design-hit flex items-center justify-center rounded-full"
          style={{
            ...L.submit,
            background: loading ? "rgba(0,0,0,0.35)" : undefined,
            cursor: loading ? "wait" : "pointer",
          }}
          aria-label="Login"
          aria-busy={loading}
        >
          {loading && <span className="login-design-spinner" />}
        </button>

        {/* "Lupa Password?" -- belum ada alur reset password di aplikasi ini. */}
        <button
          type="button"
          onClick={() => toast("Hubungi admin toko untuk reset password.")}
          className="login-design-hit rounded-full"
          style={L.forgotPassword}
          aria-label="Lupa Password"
        />
      </form>
    </div>
  );
}

export default function LoginForm({ settings }) {
  const router = useRouter();
  const supabase = createClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const s = settings || {};
  const bgType = s.login_bg_type || "color";
  const fontFamily = s.login_font_family || "Inter";

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading) return; // proteksi dobel-klik / dobel-submit
    setLoading(true);
    try {
      // username disimpan di profiles, login Supabase pakai email -> konversi username jadi email internal
      const email = username.includes("@") ? username : `${username.trim().toLowerCase()}@kasir.local`;
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", data.user.id)
        .single();

      if (!profile || !profile.active) {
        await supabase.auth.signOut();
        throw new Error("Akun tidak aktif atau tidak ditemukan.");
      }

      toast.success(`Selamat datang, ${profile.full_name}`);
      router.push(profile.role === "admin" ? "/admin/dashboard" : "/kasir");
      router.refresh();
    } catch (err) {
      toast.error(err.message || "Username atau password salah.");
    } finally {
      setLoading(false);
    }
  }

  // Mode "Desain Penuh" dipisah render-nya sejak awal -- layoutnya beda
  // total (form menimpa gambar) dari kartu login yang biasa.
  if (bgType === "full_design" && s.login_bg_url) {
    return (
      <FullDesignLoginForm
        s={s}
        username={username}
        setUsername={setUsername}
        password={password}
        setPassword={setPassword}
        loading={loading}
        onSubmit={handleSubmit}
      />
    );
  }

  return (
    <div className="relative flex-1 min-h-0 flex items-center justify-center p-6 overflow-hidden bg-black">
      {/* Memuat font pilihan admin langsung dari Google Fonts di browser (tidak berat saat build) */}
      <link rel="stylesheet" href={googleFontHref(fontFamily)} />

      {/* ---------- Lapisan Latar Belakang ---------- */}
      {bgType === "video" && s.login_bg_video_url && (
        <video
          className="absolute inset-0 w-full h-full object-cover"
          src={s.login_bg_video_url}
          autoPlay
          loop
          muted
          playsInline
        />
      )}
      {bgType === "image" && s.login_bg_url && (
        <div
          className="absolute inset-0 w-full h-full bg-cover bg-center"
          style={{ backgroundImage: `url(${s.login_bg_url})` }}
        />
      )}
      {bgType === "color" && (
        <div
          className="absolute inset-0 w-full h-full"
          style={{
            background: `linear-gradient(135deg, ${s.login_gradient_from || "#0f6d4f"}, ${s.login_gradient_to || "#0b1f19"})`,
          }}
        />
      )}
      {/* Overlay gelap tipis supaya form tetap terbaca di atas background apa pun */}
      <div className="absolute inset-0 bg-black/40" />

      {/* ---------- Kartu Form Login ---------- */}
      <div className="relative w-full max-w-sm bg-surface/95 backdrop-blur border border-border rounded-2xl shadow-xl p-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 h-11 w-11 rounded-xl bg-primary-soft flex items-center justify-center text-primary font-semibold text-lg">
            {(s.store_name || "K").charAt(0).toUpperCase()}
          </div>
          <h1
            style={{
              color: s.login_font_color || "var(--ink)",
              fontFamily: `"${fontFamily}", sans-serif`,
              fontWeight: s.login_font_weight || 600,
            }}
            className="text-xl"
          >
            {s.login_title || "Masuk ke Aplikasi Kasir"}
          </h1>
          <p className="text-sm text-ink-muted mt-1">{s.store_name || "Toko Saya"}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Username</label>
            <input
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              placeholder="mis. siti"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              placeholder="••••••••"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{ background: s.login_accent_color || "var(--primary)" }}
            className="w-full text-white rounded-lg py-2.5 text-sm font-medium hover:opacity-90 transition disabled:opacity-60"
          >
            {loading ? "Memproses..." : "Masuk"}
          </button>
        </form>
        <InstallAppButton />
      </div>
    </div>
  );
}
