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

// True kalau produk cocok dengan query: exact barcode match (untuk hasil
// scan), ATAU setiap kata di query ada sebagai substring di corpus produk,
// urutan bebas.
export function matchesProductQuery(product, query) {
  const q = normalizeSearchText(query);
  if (!q) return true;

  // Exact match barcode tetap diprioritaskan (dipakai saat scan kamera/fisik).
  if ((product?.product_barcodes || []).some((b) => normalizeSearchText(b.barcode) === q)) {
    return true;
  }

  const corpus = buildProductCorpus(product);
  const words = tokenize(q);
  return words.every((w) => corpus.includes(w));
}

export function searchProducts(products, query, limit) {
  const q = normalizeSearchText(query);
  if (!q) return [];
  const results = (products || []).filter((p) => matchesProductQuery(p, q));
  return typeof limit === "number" ? results.slice(0, limit) : results;
}
