// Mengubah daftar baris tabel voice_dictionary (dari Supabase) jadi objek
// Map sederhana {SINGKATAN: "dibaca sebagai"} untuk pencarian cepat.
// Kuncinya selalu di-uppercase supaya pencocokan tidak peduli huruf
// besar/kecil, apapun cara admin mengetiknya di halaman Kamus Suara.
export function buildVoiceDictionaryMap(rows) {
  const map = {};
  for (const row of rows || []) {
    if (row?.abbreviation) map[row.abbreviation.trim().toUpperCase()] = row.spoken_as;
  }
  return map;
}

// Mengganti singkatan di dalam sebuah nama produk dengan versi "dibaca
// sebagai" dari kamus, SEBELUM teksnya dikirim ke suara kasir. Nama produk
// aslinya (yang tampil di layar/struk) tidak disentuh sama sekali -- ini
// cuma dipakai untuk teks yang mau dibacakan.
//
// Ada 2 pola yang dicocokkan ke kamus:
// 1. Angka nempel langsung di depan singkatan, mis. "1500ML" -> dipisah
//    jadi "1500" + cek "ML" ke kamus -> "1500 mili liter".
// 2. Singkatan berdiri sendiri sebagai satu kata, mis. "SCHT" dalam
//    "Indomie Goreng SCHT" -> cek "SCHT" ke kamus -> "saset".
// Kata yang tidak ada di kamus dibiarkan apa adanya, tidak diubah.
export function expandProductNameForVoice(name, dictionaryMap) {
  if (!name) return name;
  if (!dictionaryMap || Object.keys(dictionaryMap).length === 0) return name;

  return name.replace(/(\d+)([A-Za-z]+)\b|\b([A-Za-z]+)\b/g, (match, num, unitAfterNumber, standaloneWord) => {
    if (num && unitAfterNumber) {
      const spoken = dictionaryMap[unitAfterNumber.toUpperCase()];
      return spoken ? `${num} ${spoken}` : match;
    }
    if (standaloneWord) {
      const spoken = dictionaryMap[standaloneWord.toUpperCase()];
      return spoken ? spoken : match;
    }
    return match;
  });
}
