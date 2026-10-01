// Helper pencarian produk yang fleksibel: kata kunci boleh diketik sebagian
// dan urutannya tidak harus sama persis dengan nama produk.
// Contoh: nama produk "Kecap Asin Banteng" akan tetap ketemu walau yang
// diketik cuma "kecap banteng" (asal tiap kata yang diketik ada di suatu
// tempat pada nama/sku/barcode produk).

export function normalizeSearchText(text) {
  return (text || "")
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// Pisahkan query jadi kata-kata (token), buang yang kosong.
function tokenize(query) {
  return normalizeSearchText(query).split(" ").filter(Boolean);
}

// Gabungkan field-field produk yang relevan jadi satu teks pencarian.
function buildProductCorpus(product) {
  const parts = [
    product?.name,
    product?.sku,
    ...((product?.product_barcodes || []).map((b) => b.barcode) || []),
  ];
  return normalizeSearchText(parts.filter(Boolean).join(" "));
}

// Versi "rapat": hanya huruf & angka, tanpa spasi/tanda baca. Dipakai sebagai
// jaring pengaman supaya "aqua600" tetap menemukan "Aqua 600ml", dan "s26"
// menemukan "Susu S-26", walau cara mengetik/spasinya beda dengan nama produk.
function compact(text) {
  return normalizeSearchText(text).replace(/[^\p{L}\p{N}]/gu, "");
}

// Skor kecocokan (makin KECIL makin relevan), atau null kalau tidak cocok.
//   0 = barcode/SKU persis sama dengan yang diketik
//   1 = nama persis sama / nama diawali kata yang diketik
//   2 = setiap kata yang diketik adalah AWAL dari suatu kata di nama
//   3 = setiap kata yang diketik ada di dalam nama (bukan cuma SKU/barcode)
//   4 = cocok lewat SKU/barcode (sebagian)
//   5 = cocok hanya setelah spasi/tanda baca diabaikan
function scoreProduct(product, q, words, qCompact) {
  if (
    normalizeSearchText(product?.sku) === q ||
    (product?.product_barcodes || []).some((b) => normalizeSearchText(b.barcode) === q)
  ) {
    return 0;
  }

  const name = normalizeSearchText(product?.name);
  if (name === q || name.startsWith(q)) return 1;

  const nameWords = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.every((w) => nameWords.some((nw) => nw.startsWith(w)))) return 2;
  if (words.every((w) => name.includes(w))) return 3;

  const corpus = buildProductCorpus(product);
  if (words.every((w) => corpus.includes(w))) return 4;

  if (qCompact.length >= 2 && compact(corpus).includes(qCompact)) return 5;
  return null;
}

// True kalau produk cocok dengan query: exact barcode match (untuk hasil
// scan), ATAU setiap kata di query ada sebagai substring di corpus produk
// (urutan bebas), ATAU cocok setelah spasi/tanda baca diabaikan.
export function matchesProductQuery(product, query) {
  const q = normalizeSearchText(query);
  if (!q) return true;
  return scoreProduct(product, q, tokenize(q), compact(q)) !== null;
}

// Hasil diurutkan dari yang paling relevan (bukan sekadar urutan abjad), lalu
// nama yang lebih pendek, lalu abjad. Tanpa `limit`, semua yang cocok dikembalikan.
export function searchProducts(products, query, limit) {
  const q = normalizeSearchText(query);
  if (!q) return [];
  const words = tokenize(q);
  const qCompact = compact(q);

  const scored = [];
  for (const p of products || []) {
    const score = scoreProduct(p, q, words, qCompact);
    if (score !== null) scored.push({ p, score, len: (p?.name || "").length });
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      a.len - b.len ||
      String(a.p?.name || "").localeCompare(String(b.p?.name || ""), "id")
  );

  const results = scored.map((x) => x.p);
  return typeof limit === "number" ? results.slice(0, limit) : results;
}
