// Membuat struk sebagai GAMBAR (PNG) lewat Canvas API bawaan browser (tidak
// perlu library tambahan) lalu langsung memicu unduhan ke perangkat --
// dipakai di halaman struk publik (/struk/[id]) supaya begitu pelanggan
// scan QR & buka halamannya, tinggal tap satu tombol dan file struknya
// tersimpan ke HP/galeri mereka, tidak perlu lewat dialog cetak/print.

import { formatRupiah, formatNumber, formatDateTime, txCode } from "@/lib/format";

const PRICE_TYPE_LABELS = {
  grosir: "Grosir",
  half_grosir: "1/2 Grosir",
  kg: "Per Kg",
  half_kg: "Per 1/2 Kg",
  ons: "Per Ons",
  out_of_town: "Antar Luar Kota",
};

const PAYMENT_LABELS = { tunai: "Tunai", transfer: "Transfer", qris: "QRIS", kasbon: "Kasbon" };

export function downloadReceiptImage({ store, tx, items, cashierName, customerName }) {
  const W = 640; // lebar kanvas (px) -- cukup tajam buat dibuka/di-zoom di HP
  const PAD = 32;
  const contentW = W - PAD * 2;
  const lineH = 30;
  const fontMono = '15px "Courier New", monospace';
  const fontMonoBold = 'bold 15px "Courier New", monospace';

  // Kanvas sementara cuma buat ngukur tinggi teks yang bakal wrap
  const measureCanvas = document.createElement("canvas");
  const mctx = measureCanvas.getContext("2d");

  function wrapLines(text, font, maxWidth) {
    mctx.font = font;
    const words = String(text).split(" ");
    const lines = [];
    let cur = "";
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (mctx.measureText(test).width > maxWidth && cur) {
        lines.push(cur);
        cur = w;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  // ---------- Susun daftar "baris" yang mau digambar ----------
  const rows = []; // {type: 'center'|'line'|'row'|'dash'|'space', ...}
  rows.push({ type: "center", text: store?.store_name || "Toko", font: 'bold 18px "Courier New", monospace' });
  if (store?.receipt_show_address !== false && store?.store_address) rows.push({ type: "center", text: store.store_address, font: fontMono, muted: true });
  if (store?.receipt_show_phone !== false && store?.store_phone) rows.push({ type: "center", text: store.store_phone, font: fontMono, muted: true });
  rows.push({ type: "dash" });
  rows.push({ type: "line", text: txCode(tx.id), font: fontMonoBold });
  rows.push({ type: "line", text: formatDateTime(tx.created_at || new Date()), font: fontMono, muted: true });
  if (store?.receipt_show_cashier !== false && cashierName) rows.push({ type: "line", text: `Kasir: ${cashierName}`, font: fontMono, muted: true });
  if (store?.receipt_show_customer !== false && customerName) rows.push({ type: "line", text: `Pelanggan: ${customerName}`, font: fontMono, muted: true });
  rows.push({ type: "dash" });

  for (const it of items || []) {
    const tier = it.price_type_label || PRICE_TYPE_LABELS[it.price_type];
    rows.push({ type: "line", text: `${it.name}${tier ? ` (${tier})` : ""}`, font: fontMono, wrap: true });
    rows.push({
      type: "row",
      left: `${formatNumber(it.qty, 2)} x ${formatRupiah(it.unit_price)}`,
      right: formatRupiah(it.unit_price * it.qty),
      font: fontMono,
    });
  }
  rows.push({ type: "dash" });

  rows.push({ type: "row", left: "Subtotal", right: formatRupiah(tx.subtotal), font: fontMono });
  if (Number(tx.discount) > 0) rows.push({ type: "row", left: "Diskon", right: `-${formatRupiah(tx.discount)}`, font: fontMono });
  if (Number(tx.delivery_fee) > 0) rows.push({ type: "row", left: "Biaya Antar", right: formatRupiah(tx.delivery_fee), font: fontMono });
  if (Number(tx.tax_amount) > 0 && !store?.tax_price_inclusive) {
    rows.push({ type: "row", left: store?.tax_label || "PPN", right: `+${formatRupiah(tx.tax_amount)}`, font: fontMono });
  }
  rows.push({ type: "row", left: "Total", right: formatRupiah(tx.total), font: fontMonoBold, big: true });
  rows.push({ type: "dash" });
  rows.push({ type: "row", left: PAYMENT_LABELS[tx.payment_method] || tx.payment_method, right: "", font: fontMono });
  if (tx.payment_method !== "kasbon") {
    rows.push({ type: "row", left: "Dibayar", right: formatRupiah(tx.paid_amount), font: fontMono });
    rows.push({ type: "row", left: "Kembali", right: formatRupiah(tx.change_amount), font: fontMono });
  }
  if (store?.receipt_footer) {
    rows.push({ type: "dash" });
    for (const line of String(store.receipt_footer).split("\n")) {
      rows.push({ type: "center", text: line, font: fontMono, muted: true });
    }
  }

  // ---------- Hitung tinggi total (termasuk wrap teks nama barang) ----------
  let height = PAD * 2;
  const expanded = [];
  for (const r of rows) {
    if (r.type === "dash") {
      expanded.push(r);
      height += 18;
      continue;
    }
    if (r.type === "line" && r.wrap) {
      const wrapped = wrapLines(r.text, r.font, contentW);
      for (const w of wrapped) expanded.push({ ...r, text: w });
      height += lineH * wrapped.length;
      continue;
    }
    expanded.push(r);
    height += r.big ? lineH + 6 : lineH;
  }

  // ---------- Gambar sungguhan ----------
  const canvas = document.createElement("canvas");
  const ratio = window.devicePixelRatio || 1;
  canvas.width = W * ratio;
  canvas.height = height * ratio;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, height);
  ctx.fillStyle = "#111827";
  ctx.textBaseline = "middle";

  let y = PAD;
  for (const r of expanded) {
    if (r.type === "dash") {
      ctx.save();
      ctx.strokeStyle = "#9ca3af";
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(PAD, y + 9);
      ctx.lineTo(W - PAD, y + 9);
      ctx.stroke();
      ctx.restore();
      y += 18;
      continue;
    }
    const h = r.big ? lineH + 6 : lineH;
    ctx.font = r.font;
    ctx.fillStyle = r.muted ? "#6b7280" : "#111827";
    if (r.type === "center") {
      ctx.textAlign = "center";
      ctx.fillText(r.text, W / 2, y + h / 2);
    } else if (r.type === "line") {
      ctx.textAlign = "left";
      ctx.fillText(r.text, PAD, y + h / 2);
    } else if (r.type === "row") {
      ctx.textAlign = "left";
      ctx.fillText(r.left, PAD, y + h / 2);
      ctx.textAlign = "right";
      ctx.fillText(r.right, W - PAD, y + h / 2);
    }
    y += h;
  }

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `struk-${txCode(tx.id)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, "image/png");
}
