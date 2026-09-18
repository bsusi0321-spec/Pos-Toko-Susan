"use client";

// Cetak struk LANGSUNG ke printer thermal Bluetooth lewat Web Bluetooth API +
// perintah ESC/POS mentah -- TANPA perlu printer terpasang sebagai printer
// resmi di HP/komputer (beda dari lib/printReceipt.js yang mengandalkan
// dialog cetak browser / window.print(), yang cuma jalan kalau printernya
// sudah dikenal OS lewat driver).
//
// Kenapa "Cetak Struk" versi lama sering gagal/tidak muncul apa-apa di
// printer thermal Bluetooth murah: window.print() itu SELALU lewat dialog
// cetak sistem operasi, dan dialog itu cuma menampilkan printer yang memang
// sudah terpasang resmi di HP/komputer (driver/print service). Kebanyakan
// printer struk thermal 58mm/80mm yang dijual buat dipasangkan ke HP TIDAK
// terdaftar sebagai printer resmi di OS -- makanya walau sudah "connected"
// di pengaturan Bluetooth HP, printer itu tidak pernah muncul di dialog
// cetak, dan tombol "Cetak Struk" kelihatan seperti tidak melakukan apa-apa.
// Fitur baru di file ini mengirim data struk langsung ke printernya lewat
// koneksi Bluetooth, melewati dialog cetak OS sama sekali.
//
// Batasan (bawaan teknologi Web Bluetooth, bukan bug aplikasi):
// - Cuma didukung browser berbasis Chrome/Edge (Chrome Android, Chrome/Edge
//   di Windows/Mac/ChromeOS). TIDAK didukung sama sekali di Safari/iPhone
//   atau Firefox -- ini batasan dari Apple/Mozilla, bukan sesuatu yang bisa
//   diakali dari sisi aplikasi web manapun.
// - Printernya harus tipe Bluetooth LOW ENERGY (BLE) dengan "print service"
//   umum yang dipakai kebanyakan printer thermal kasir portable jaman
//   sekarang. Printer Bluetooth versi lama (Bluetooth Classic/SPP, biasanya
//   printer yang sudah dipakai bertahun-tahun) tidak bisa disambungkan lewat
//   cara ini.

const PRINTER_SERVICE_CANDIDATES = [
  "000018f0-0000-1000-8000-00805f9b34fb", // dipakai kebanyakan printer thermal BLE generik (chipset umum di pasaran)
  0x18f0,
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // dipakai sebagian merk lain (mis. beberapa printer berbasis modul BLE UART)
];

// Printer yang sudah pernah disambungkan disimpan ID-nya di sini supaya
// begitu aplikasi dibuka lagi (halaman di-reload, atau dibuka di tab/hari
// lain), aplikasi bisa coba nyambung ULANG ke printer yang SAMA secara
// otomatis di belakang layar -- TANPA memunculkan dialog pilih perangkat
// dan tanpa kasir perlu menekan tombol apa pun. Koneksi baru dianggap
// "putus" kalau kasir/admin menekan tombol Putuskan di Pengaturan
// (lihat `manualDisconnect` di bawah) atau printernya dilepas izin
// Bluetooth-nya dari pengaturan browser/HP.
const STORAGE_KEY = "pos_ble_printer_device_id";

let cachedDevice = null;
let cachedCharacteristic = null;
// true hanya kalau kasir/admin SENGAJA menekan tombol "Putuskan Printer".
// Selama ini false, kalau koneksi putus sendiri (printer mati/baterai habis/
// di luar jangkauan) aplikasi akan terus mencoba nyambung ulang ke printer
// yang sama, sesuai permintaan: sekali tersambung, tidak boleh putus kecuali
// memang diputuskan.
let manualDisconnect = false;
let reconnecting = false;
const listeners = new Set();

function notify() {
  const status = getConnectedPrinterName();
  listeners.forEach((fn) => {
    try {
      fn(status);
    } catch {}
  });
}

// Dipakai komponen UI (halaman Pengaturan, modal struk) supaya status
// "Tersambung / Tidak" di layar selalu ikut update otomatis, termasuk saat
// printer nyambung ulang sendiri di belakang layar tanpa ada yang menekan
// tombol apa pun. Mengembalikan fungsi untuk berhenti berlangganan.
export function subscribePrinterStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isBleSupported() {
  return typeof navigator !== "undefined" && !!navigator.bluetooth;
}

// Chrome mendukung menyimpan izin akses perangkat Bluetooth secara permanen
// dan membacanya lagi lewat navigator.bluetooth.getDevices() TANPA perlu
// menampilkan dialog pilih perangkat lagi -- inilah yang dipakai untuk
// nyambung ulang otomatis. Browser lama/berbeda yang tidak mendukung fungsi
// ini akan mengharuskan kasir menekan tombol sambung sekali lagi setelah
// reload halaman (keterbatasan bawaan Web Bluetooth, bukan bug aplikasi).
function supportsPersistentDevices() {
  return isBleSupported() && typeof navigator.bluetooth.getDevices === "function";
}

async function findWritableCharacteristic(server) {
  const services = await server.getPrimaryServices();
  for (const service of services) {
    let chars = [];
    try {
      chars = await service.getCharacteristics();
    } catch {
      continue;
    }
    const writable = chars.find((c) => c.properties.write || c.properties.writeWithoutResponse);
    if (writable) return writable;
  }
  return null;
}

async function attachDevice(device) {
  const server = await device.gatt.connect();
  const characteristic = await findWritableCharacteristic(server);
  if (!characteristic) {
    try {
      device.gatt.disconnect();
    } catch {}
    throw new Error(`Printer "${device.name || "?"}" berhasil disambung tapi tidak ditemukan fitur cetaknya. Kemungkinan printer ini bukan tipe Bluetooth Low Energy (BLE).`);
  }
  cachedDevice = device;
  cachedCharacteristic = characteristic;
  manualDisconnect = false;
  try {
    localStorage.setItem(STORAGE_KEY, device.id);
  } catch {}
  device.addEventListener("gattserverdisconnected", handleUnexpectedDisconnect);
  notify();
  return { name: device.name || "Printer Bluetooth" };
}

// Dipanggil otomatis kalau printer putus SENDIRI (mati, baterai habis, atau
// keluar jangkauan) -- bukan karena tombol Putuskan ditekan. Aplikasi akan
// terus mengintai & mencoba nyambung ulang setiap beberapa detik selama
// printer belum sengaja diputuskan, supaya kasir tidak perlu bolak-balik ke
// Pengaturan tiap kali printernya sempat lepas sebentar.
async function handleUnexpectedDisconnect() {
  cachedCharacteristic = null;
  notify();
  if (manualDisconnect || reconnecting || !cachedDevice) return;
  reconnecting = true;
  const device = cachedDevice;
  for (let attempt = 0; attempt < 20 && !manualDisconnect && cachedDevice === device; attempt++) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const server = await device.gatt.connect();
      const characteristic = await findWritableCharacteristic(server);
      if (characteristic) {
        cachedCharacteristic = characteristic;
        notify();
        break;
      }
    } catch {
      // printer masih mati / di luar jangkauan, akan dicoba lagi
    }
  }
  reconnecting = false;
}

// Membuka dialog pilih perangkat Bluetooth bawaan browser. Harus dipicu
// langsung dari klik tombol (tidak bisa dipanggil otomatis di background).
// Sekali berhasil, koneksinya akan otomatis diingat & disambung ulang terus
// (lihat autoReconnectBluetoothPrinter & handleUnexpectedDisconnect) sampai
// ada yang menekan tombol Putuskan.
export async function connectBluetoothPrinter() {
  if (!isBleSupported()) {
    throw new Error('Browser ini tidak mendukung Bluetooth langsung. Pakai Chrome (Android/Windows/Mac), bukan Safari/iPhone.');
  }
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: PRINTER_SERVICE_CANDIDATES,
  });
  return attachDevice(device);
}

// Dipanggil sekali secara otomatis tiap aplikasi dibuka/di-reload (lihat
// components/BluetoothPrinterProvider.js) untuk nyambung ulang ke printer
// yang terakhir kali berhasil disambungkan, TANPA dialog pilih perangkat
// dan tanpa perlu kasir menekan apa pun. Kalau belum pernah ada printer
// tersimpan, atau browsernya tidak mendukung reconnect otomatis, fungsi ini
// diam saja (tidak error) -- kasir/admin tinggal sambungkan manual sekali
// dari halaman Pengaturan.
export async function autoReconnectBluetoothPrinter() {
  if (manualDisconnect || cachedCharacteristic || !supportsPersistentDevices()) return null;
  let savedId = null;
  try {
    savedId = localStorage.getItem(STORAGE_KEY);
  } catch {}
  if (!savedId) return null;
  try {
    const devices = await navigator.bluetooth.getDevices();
    const device = devices.find((d) => d.id === savedId);
    if (!device) return null;
    return await attachDevice(device);
  } catch {
    return null;
  }
}

// Satu-satunya cara koneksi benar-benar diputus & dilupakan -- dipicu murni
// dari tombol "Putuskan Printer" di Pengaturan. Sesudah ini, aplikasi TIDAK
// akan mencoba nyambung ulang otomatis lagi sampai disambungkan manual lagi.
export function disconnectBluetoothPrinter() {
  manualDisconnect = true;
  try {
    cachedDevice?.gatt?.disconnect();
  } catch {}
  cachedDevice = null;
  cachedCharacteristic = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
  notify();
}

export function getConnectedPrinterName() {
  return cachedDevice?.gatt?.connected ? cachedDevice.name || "Printer Bluetooth" : null;
}

// Dipakai UI untuk membedakan "belum pernah disambungkan sama sekali" dari
// "pernah disambungkan tapi sedang putus/di luar jangkauan sekarang".
export function hasSavedPrinter() {
  try {
    return !!localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

async function getCharacteristic() {
  if (cachedCharacteristic && cachedDevice?.gatt?.connected) return cachedCharacteristic;
  if (cachedDevice) {
    // Coba sambung ulang ke printer yang SAMA (tanpa memunculkan dialog
    // pilih perangkat lagi) -- misalnya karena printer sempat mati/di luar
    // jangkauan lalu nyala/dekat lagi.
    const server = await cachedDevice.gatt.connect();
    const characteristic = await findWritableCharacteristic(server);
    if (characteristic) {
      cachedCharacteristic = characteristic;
      return characteristic;
    }
  }
  throw new Error('Printer Bluetooth belum tersambung. Sambungkan dulu dari halaman Pengaturan.');
}

async function writeBytes(characteristic, bytes) {
  // Kebanyakan printer BLE murah cuma sanggup terima potongan data kecil
  // sekali kirim -- dipecah jadi potongan kecil dengan jeda supaya tidak
  // membanjiri buffer printernya (yang bisa bikin struk kepotong/berantakan).
  const CHUNK = 100;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const chunk = bytes.slice(i, i + CHUNK);
    if (characteristic.properties.writeWithoutResponse) {
      await characteristic.writeValueWithoutResponse(chunk);
    } else {
      await characteristic.writeValue(chunk);
    }
    await new Promise((r) => setTimeout(r, 20));
  }
}

// ---------- Perintah ESC/POS (bahasa mesin printer thermal) ----------
const ESC = 0x1b;
const GS = 0x1d;
const textEncoder = new TextEncoder();
const enc = (str) => textEncoder.encode(str);

function concatBytes(list) {
  const total = list.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const b of list) {
    out.set(b, offset);
    offset += b.length;
  }
  return out;
}

function padLine(left, right, width) {
  left = left ?? "";
  right = right ?? "";
  if (left.length + right.length >= width) {
    left = left.slice(0, Math.max(0, width - right.length - 1));
  }
  const space = Math.max(1, width - left.length - right.length);
  return left + " ".repeat(space) + right + "\n";
}

const PRICE_TYPE_LABELS = {
  grosir: "Grosir",
  half_grosir: "1/2 Grosir",
  kg: "Per Kg",
  half_kg: "Per 1/2 Kg",
  ons: "Per Ons",
  out_of_town: "Antar Luar Kota",
};
const PAYMENT_LABELS = { tunai: "Tunai", transfer: "Transfer", qris: "QRIS", kasbon: "Kasbon" };

function fmtRp(n) {
  return "Rp" + Math.round(Number(n) || 0).toLocaleString("id-ID");
}
function fmtNum(n) {
  return Number(n || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 });
}
function shortTxCode(id) {
  return "TRX-" + String(id || "").slice(0, 8).toUpperCase();
}
function shortDateTime(d) {
  return new Date(d || Date.now()).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Menyusun seluruh isi struk jadi rangkaian byte perintah ESC/POS, siap
// dikirim ke printer. width dalam jumlah karakter (bukan mm) karena printer
// thermal mencetak teks monospace.
export function buildReceiptEscPos({ store, tx, items, cashierName, customerName }) {
  const width = store?.receipt_paper_size === "80mm" ? 48 : 32;
  const chunks = [];
  const line = (s = "") => chunks.push(enc(s + "\n"));
  const raw = (...b) => chunks.push(new Uint8Array(b));
  const alignCenter = () => raw(ESC, 0x61, 1);
  const alignLeft = () => raw(ESC, 0x61, 0);
  const bold = (on) => raw(ESC, 0x45, on ? 1 : 0);
  const big = (on) => raw(GS, 0x21, on ? 0x11 : 0x00);

  raw(ESC, 0x40); // reset/inisialisasi printer

  alignCenter();
  big(true);
  bold(true);
  line(store?.store_name || "Toko");
  big(false);
  bold(false);
  if (store?.receipt_show_address !== false && store?.store_address) line(store.store_address);
  if (store?.receipt_show_phone !== false && store?.store_phone) line(store.store_phone);
  line("-".repeat(width));

  alignLeft();
  bold(true);
  line(shortTxCode(tx.id));
  bold(false);
  line(shortDateTime(tx.created_at));
  if (store?.receipt_show_cashier !== false && cashierName) line(`Kasir: ${cashierName}`);
  if (store?.receipt_show_customer !== false && customerName) line(`Pelanggan: ${customerName}`);
  line("-".repeat(width));

  (items || []).forEach((it) => {
    const tier = it.price_type === "retail" ? null : (it.price_type_label || PRICE_TYPE_LABELS[it.price_type]);
    line(it.name + (tier ? ` (${tier})` : ""));
    line(padLine(`${fmtNum(it.qty)} x ${fmtRp(it.unit_price)}`, fmtRp(it.unit_price * it.qty), width).slice(0, -1));
  });
  line("-".repeat(width));

  line(padLine("Subtotal", fmtRp(tx.subtotal), width).slice(0, -1));
  if (Number(tx.discount) > 0) line(padLine("Diskon", `-${fmtRp(tx.discount)}`, width).slice(0, -1));
  if (Number(tx.delivery_fee) > 0) line(padLine("Biaya Antar", fmtRp(tx.delivery_fee), width).slice(0, -1));
  if (Number(tx.tax_amount) > 0 && !store?.tax_price_inclusive) {
    line(padLine(store?.tax_label || "PPN", `+${fmtRp(tx.tax_amount)}`, width).slice(0, -1));
  }
  bold(true);
  line(padLine("Total", fmtRp(tx.total), width).slice(0, -1));
  bold(false);
  line("-".repeat(width));
  line(padLine(PAYMENT_LABELS[tx.payment_method] || tx.payment_method, "", width).slice(0, -1));
  if (tx.payment_method !== "kasbon") {
    line(padLine("Dibayar", fmtRp(tx.paid_amount), width).slice(0, -1));
    line(padLine("Kembali", fmtRp(tx.change_amount), width).slice(0, -1));
  }

  if (store?.receipt_footer) {
    line("");
    alignCenter();
    store.receipt_footer.split("\n").forEach((l) => line(l));
    alignLeft();
  }

  line("");
  line("");
  line("");
  raw(GS, 0x56, 1); // potong kertas -- kalau printernya tidak punya pemotong otomatis, perintah ini cuma diabaikan begitu saja, tidak bikin error

  return concatBytes(chunks);
}

export async function printReceiptBluetooth(data) {
  const characteristic = await getCharacteristic();
  const bytes = buildReceiptEscPos(data);
  await writeBytes(characteristic, bytes);
}
