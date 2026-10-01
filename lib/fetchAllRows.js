// Supabase (PostgREST) membatasi maksimal 1000 baris per query secara
// default, walau tidak diminta secara eksplisit. Kalau jumlah data (misalnya
// produk) sudah lebih dari 1000, query biasa akan diam-diam memotong sisanya
// -- tidak error, cuma datanya tidak lengkap.
//
// Fungsi ini menembus batas itu dengan menarik data per halaman (1000 baris)
// berulang-ulang sampai tidak ada sisa lagi, jadi jumlah baris TIDAK terbatas.
//
// Cara pakai:
//   const produk = await fetchAllRows(() =>
//     supabase.from("products").select("*").eq("active", true).order("name")
//   );
//
// PENTING: buildQuery harus function yang MEMBUAT query baru setiap dipanggil
// (bukan query yang sudah di-await), supaya .range() bisa ditempel di query
// yang masih "segar" untuk setiap halaman.
//
// Urutan tiebreaker: pengambilan per halaman butuh urutan yang PASTI, kalau
// tidak baris bisa terlewat/dobel di batas antar-halaman (terutama kalau
// beberapa baris punya nilai order yang sama, mis. created_at kembar). Makanya
// otomatis ditambahkan order kolom "id" di paling akhir. Untuk tabel yang tidak
// punya kolom "id" (mis. product_branch_stock), sebutkan kolomnya:
//   fetchAllRows(() => ..., { orderBy: ["product_id", "branch_id"] })
//
// Argumen kedua boleh berupa angka (ukuran halaman, cara lama) atau objek
// { pageSize, orderBy }.
export async function fetchAllRows(buildQuery, options = {}) {
  const opt = typeof options === "number" ? { pageSize: options } : options || {};
  const pageSize = opt.pageSize || 1000;
  const orderBy = opt.orderBy || ["id"];

  const semuaBaris = [];
  let halaman = 0;

  while (true) {
    const dari = halaman * pageSize;
    const sampai = dari + pageSize - 1;

    let query = buildQuery();
    for (const kolom of orderBy) query = query.order(kolom, { ascending: true });

    const { data, error } = await query.range(dari, sampai);

    if (error) throw error;

    semuaBaris.push(...(data || []));

    if (!data || data.length < pageSize) break; // halaman terakhir
    halaman += 1;
  }

  return semuaBaris;
}

// Sama seperti fetchAllRows, tapi TIDAK melempar error: kalau gagal, dicatat
// di console lalu mengembalikan array kosong. Dipakai di tempat yang dulunya
// memang cuma mengabaikan error (data null -> daftar kosong), supaya halaman
// tidak macet/crash hanya karena satu daftar gagal dimuat.
export async function fetchAllRowsOrEmpty(buildQuery, options = {}) {
  try {
    return await fetchAllRows(buildQuery, options);
  } catch (e) {
    console.error("fetchAllRows gagal:", e);
    return [];
  }
}
