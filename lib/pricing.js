// Menghitung daftar varian harga yang tersedia untuk sebuah produk
// dan bagaimana tiap varian memengaruhi jumlah stok yang harus dikurangi.

export function getPriceVariants(product) {
  const variants = [];

  variants.push({
    price_type: "retail",
    label: "Eceran",
    unit_price: Number(product.sell_price || 0),
    stock_factor: 1, // 1 qty keranjang = kurangi 1 stok
  });

  if (product.unit_type === "unit") {
    const w = Array.isArray(product.product_wholesale_pricing)
      ? product.product_wholesale_pricing[0]
      : product.product_wholesale_pricing;
    if (w?.wholesale_qty && w?.wholesale_price) {
      variants.push({
        price_type: "grosir",
        label: `Grosir (${w.wholesale_qty} pcs)`,
        unit_price: Number(w.wholesale_price),
        stock_factor: Number(w.wholesale_qty),
      });
    }
    if (w?.half_wholesale_qty && w?.half_wholesale_price) {
      variants.push({
        price_type: "half_grosir",
        label: `Setengah Grosir (${w.half_wholesale_qty} pcs)`,
        unit_price: Number(w.half_wholesale_price),
        stock_factor: Number(w.half_wholesale_qty),
      });
    }
  }

  if (product.unit_type === "kg") {
    const k = Array.isArray(product.product_kg_pricing)
      ? product.product_kg_pricing[0]
      : product.product_kg_pricing;
    if (k?.price_per_kg) {
      variants.push({
        price_type: "kg",
        label: "Per Kg",
        unit_price: Number(k.price_per_kg),
        stock_factor: 1,
      });
    }
    if (k?.price_per_half_kg) {
      variants.push({
        price_type: "half_kg",
        label: "Per 1/2 Kg",
        unit_price: Number(k.price_per_half_kg),
        stock_factor: 0.5,
      });
    }
    if (k?.price_per_ons) {
      variants.push({
        price_type: "ons",
        label: "Per Ons (100gr)",
        unit_price: Number(k.price_per_ons),
        stock_factor: 0.1,
      });
    }
  }

  const oot = Array.isArray(product.product_out_of_town_pricing)
    ? product.product_out_of_town_pricing[0]
    : product.product_out_of_town_pricing;
  if (oot?.price) {
    variants.push({
      price_type: "out_of_town",
      label: "Antar Luar Kota",
      unit_price: Number(oot.price),
      stock_factor: 1,
    });
  }

  return variants;
}

export function priceTypeLabel(type) {
  return (
    {
      retail: "Eceran",
      grosir: "Grosir",
      half_grosir: "1/2 Grosir",
      kg: "Per Kg",
      half_kg: "1/2 Kg",
      ons: "Per Ons",
      out_of_town: "Antar Luar Kota",
    }[type] || type
  );
}
