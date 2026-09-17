export function formatRupiah(value) {
  const n = Number(value || 0);
  return "Rp" + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

// Kode transaksi pendek & mudah disebut/dicari, dipakai konsisten di nota
// fisik, nota digital, WhatsApp, dan halaman admin "Cek Transaksi" (supaya
// kode yang dilihat pelanggan di struk sama persis dengan yang dicari admin).
export function txCode(id) {
  if (!id) return "-";
  return `TRX-${String(id).slice(0, 8).toUpperCase()}`;
}

export function formatNumber(value, digits = 0) {
  const n = Number(value || 0);
  return n.toLocaleString("id-ID", { maximumFractionDigits: digits });
}

export function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ------------------------------------------------------------------
// Dipakai buat kolom-kolom HARGA (input) supaya menampilkan titik ribuan
// SAMBIL diketik (mis. ketik "15000" tampil "15.000"), bukan cuma pas
// ditampilkan setelah tersimpan. Nilai mentahnya (tanpa titik) yang tetap
// disimpan ke state seperti biasa -- cuma tampilannya saja yang diformat,
// jadi tidak mengubah cara data ini dipakai/dihitung/disimpan ke database.
export function digitsOnly(raw) {
  return String(raw ?? "").replace(/[^\d]/g, "");
}

export function formatThousands(raw) {
  const d = digitsOnly(raw);
  if (!d) return "";
  return Number(d).toLocaleString("id-ID");
}

// onRawChange menerima STRING ANGKA MENTAH (tanpa titik) -- sama persis
// seperti nilai e.target.value yang selama ini dipakai, jadi kode yang
// menyimpan ke state tidak perlu diubah sama sekali. Fungsi ini juga
// memulihkan posisi kursor setelah tampilan diformat ulang, supaya kalau
// user menyisipkan angka di TENGAH teks, kursornya tidak melompat ke akhir.
export function handleThousandsInputChange(e, onRawChange) {
  const input = e.target;
  const cursorPos = input.selectionStart ?? input.value.length;
  const digitsBeforeCursor = digitsOnly(input.value.slice(0, cursorPos)).length;

  onRawChange(digitsOnly(input.value));

  requestAnimationFrame(() => {
    if (!input.isConnected) return;
    const display = input.value;
    let seen = 0;
    let pos = display.length;
    for (let i = 0; i < display.length; i++) {
      if (/\d/.test(display[i])) seen++;
      if (seen === digitsBeforeCursor) {
        pos = i + 1;
        break;
      }
    }
    if (digitsBeforeCursor === 0) pos = 0;
    input.setSelectionRange(pos, pos);
  });
}
