"use client";

// Cetak struk LANGSUNG ke printer thermal yang disambung kabel USB, lewat
// WebUSB API + perintah ESC/POS mentah (byte yang sama persis dengan yang
// dipakai lib/blePrinter.js untuk Bluetooth -- lihat buildReceiptEscPos di
// sana) -- TANPA lewat dialog cetak/driver OS sama sekali.
//
// Kenapa fitur ini dibuat: dialog cetak browser (lib/printReceipt.js) cuma
// bisa mencetak ke printer yang sudah terdaftar sebagai printer RESMI di
// OS (perlu driver terpasang). WebUSB "memegang" printernya langsung dari
// browser, jadi bisa tetap jalan walau drivernya belum/tidak terpasang di
// komputer itu. Dialog cetak (Kabel/USB) TETAP ada sebagai cadangan kalau
// ternyata WebUSB tidak bisa "memegang" printer tertentu (lihat catatan di
// bawah).
//
// PERINGATAN PENTING (bawaan teknologi WebUSB, bukan bug aplikasi):
// - Kalau printernya SUDAH terpasang sebagai printer resmi di OS (ada
//   driver-nya, muncul di daftar printer Windows/Mac), ada kemungkinan
//   browser TIDAK diizinkan lagi "merebut" akses ke situ lewat WebUSB,
//   karena OS sudah memegangnya duluan lewat driver tadi. Kalau ini yang
//   terjadi, tombol "Sambungkan Printer USB" akan gagal/error -- solusinya
//   tetap pakai tombol "Cetak (Kabel/USB)" yang lewat dialog cetak biasa.
// - Cuma didukung browser berbasis Chrome/Edge di desktop (Windows/Mac/
//   Linux/ChromeOS) dan Chrome Android. TIDAK didukung Safari/iPhone atau
//   Firefox sama sekali.

// Printer USB thermal umumnya masuk kelas resmi USB "Printer Class" (07h).
const USB_PRINTER_CLASS = 0x07;

// Kalau printer disambungkan pernah berhasil, tanda pengenalnya (vendor +
// produk ID) disimpan di sini supaya begitu aplikasi dibuka lagi, bisa coba
// disambung ULANG otomatis lewat navigator.usb.getDevices() -- TANPA dialog
// pilih perangkat, sama seperti printer Bluetooth. Baru dianggap "putus"
// kalau memang ditekan tombol Putuskan (lihat manualDisconnect).
const STORAGE_KEY = "pos_usb_printer_signature";

let cachedDevice = null;
let cachedEndpointOut = null;
let cachedInterfaceNumber = null;
let manualDisconnect = false;
const listeners = new Set();

function notify() {
  const status = getConnectedPrinterName();
  listeners.forEach((fn) => {
    try {
      fn(status);
    } catch {}
  });
}

// Dipakai komponen UI (Pengaturan, menu kasir, modal struk) supaya status
// tersambung/tidak selalu ikut update otomatis.
export function subscribeUsbPrinterStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isWebUsbSupported() {
  return typeof navigator !== "undefined" && !!navigator.usb;
}

function deviceSignature(device) {
  return `${device.vendorId}:${device.productId}`;
}

// Mencari interface & endpoint OUT (buat kirim data cetak) di printernya.
// Diutamakan interface kelas resmi "Printer" (07h); kalau tidak ketemu,
// dipakai interface pertama yang punya endpoint OUT sebagai cadangan
// (beberapa printer generik tidak selalu melaporkan kelas 07h dengan benar).
function findPrinterInterface(device) {
  const configuration = device.configuration;
  if (!configuration) return null;
  let fallback = null;
  for (const iface of configuration.interfaces) {
    for (const alt of iface.alternates) {
      const outEndpoint = alt.endpoints.find((e) => e.direction === "out");
      if (!outEndpoint) continue;
      const candidate = { interfaceNumber: iface.interfaceNumber, endpointNumber: outEndpoint.endpointNumber };
      if (alt.interfaceClass === USB_PRINTER_CLASS) return candidate;
      if (!fallback) fallback = candidate;
    }
  }
  return fallback;
}

async function attachDevice(device) {
  await device.open();
  if (!device.configuration) await device.selectConfiguration(1);
  const target = findPrinterInterface(device);
  if (!target) {
    try {
      await device.close();
    } catch {}
    throw new Error(
      `Perangkat "${device.productName || "?"}" tidak ditemukan jalur kirim data cetaknya -- kemungkinan yang terpilih tadi BUKAN printernya (mis. mouse/keyboard wireless receiver atau perangkat USB lain yang kebetulan ikut muncul di daftar). Coba tekan "Sambungkan Printer USB" lagi dan pastikan pilih perangkat yang namanya sesuai printernya.`
    );
  }
  try {
    await device.claimInterface(target.interfaceNumber);
  } catch (err) {
    try {
      await device.close();
    } catch {}
    throw new Error(
      `Printer "${device.productName || "?"}" sudah dipakai driver lain di komputer ini (kemungkinan sudah terpasang sebagai printer resmi di OS), jadi tidak bisa disambung langsung lewat cara ini. Coba pakai tombol "Cetak (Kabel/USB)" biasa sebagai gantinya.`
    );
  }
  cachedDevice = device;
  cachedEndpointOut = target.endpointNumber;
  cachedInterfaceNumber = target.interfaceNumber;
  manualDisconnect = false;
  try {
    localStorage.setItem(STORAGE_KEY, deviceSignature(device));
  } catch {}
  notify();
  return { name: device.productName || "Printer USB" };
}

// Membuka dialog pilih perangkat USB bawaan browser. Harus dipicu langsung
// dari klik tombol (tidak bisa dipanggil otomatis di background). Daftar
// pilihannya SENGAJA disaring cuma menampilkan perangkat yang jenisnya
// resmi "USB Printer Class" (07h) -- supaya perangkat USB lain yang
// kebetulan tercolok di komputer yang sama (mouse/keyboard wireless
// receiver, webcam, dll) tidak ikut muncul di daftar & tidak ke-klik salah
// oleh kasir (ini penyebab error "tidak ditemukan jalur kirim data cetak"
// kalau yang kepilih ternyata bukan printer).
export async function connectUsbPrinter() {
  if (!isWebUsbSupported()) {
    throw new Error("Browser ini tidak mendukung WebUSB. Pakai Chrome/Edge di Windows/Mac/Android, bukan Safari/iPhone atau Firefox.");
  }
  const device = await navigator.usb.requestDevice({ filters: [{ classCode: USB_PRINTER_CLASS }] });
  return attachDevice(device);
}

// Cadangan kalau printernya tidak muncul di daftar tersaring di atas
// (beberapa printer generik/klon tidak melaporkan dirinya dengan cara
// standar "USB Printer Class") -- menampilkan SEMUA perangkat USB, jadi
// kasir harus lebih teliti memilih (jangan pilih mouse/keyboard wireless
// receiver, webcam, atau perangkat lain yang ikut tampil di daftar itu).
export async function connectUsbPrinterUnfiltered() {
  if (!isWebUsbSupported()) {
    throw new Error("Browser ini tidak mendukung WebUSB. Pakai Chrome/Edge di Windows/Mac/Android, bukan Safari/iPhone atau Firefox.");
  }
  const device = await navigator.usb.requestDevice({ filters: [] });
  return attachDevice(device);
}

// Dipanggil sekali otomatis tiap aplikasi dibuka (lihat
// components/UsbPrinterProvider.js) untuk nyambung ulang ke printer USB
// yang terakhir kali berhasil disambungkan, tanpa dialog pilih perangkat.
export async function autoReconnectUsbPrinter() {
  if (manualDisconnect || cachedDevice || !isWebUsbSupported()) return null;
  let savedSignature = null;
  try {
    savedSignature = localStorage.getItem(STORAGE_KEY);
  } catch {}
  if (!savedSignature) return null;
  try {
    const devices = await navigator.usb.getDevices();
    const device = devices.find((d) => deviceSignature(d) === savedSignature);
    if (!device) return null;
    return await attachDevice(device);
  } catch {
    return null;
  }
}

// Satu-satunya cara koneksi benar-benar diputus & dilupakan -- dipicu dari
// tombol "Putuskan Printer" di Pengaturan.
export async function disconnectUsbPrinter() {
  manualDisconnect = true;
  try {
    if (cachedDevice && cachedInterfaceNumber != null) await cachedDevice.releaseInterface(cachedInterfaceNumber);
  } catch {}
  try {
    await cachedDevice?.close();
  } catch {}
  cachedDevice = null;
  cachedEndpointOut = null;
  cachedInterfaceNumber = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
  notify();
}

export function getConnectedPrinterName() {
  return cachedDevice?.opened ? cachedDevice.productName || "Printer USB" : null;
}

export function hasSavedUsbPrinter() {
  try {
    return !!localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

// Kalau printer USB-nya dicabut fisik, browser otomatis menutup device-nya
// -- dengarkan ini supaya status di layar ikut ter-update. Beda dari
// Bluetooth, printer USB yang dicabut lalu dicolok lagi biasanya perlu
// disambung ulang manual (WebUSB tidak selalu bisa "mengintai & nyambung
// ulang sendiri" seperti Bluetooth, karena sifat koneksi kabelnya).
if (typeof navigator !== "undefined" && navigator.usb) {
  navigator.usb.addEventListener("disconnect", (e) => {
    if (e.device === cachedDevice) {
      cachedDevice = null;
      cachedEndpointOut = null;
      cachedInterfaceNumber = null;
      notify();
    }
  });
}

async function writeBytes(bytes) {
  if (!cachedDevice?.opened || cachedEndpointOut == null) {
    throw new Error('Printer USB belum tersambung. Sambungkan dulu dari halaman Pengaturan.');
  }
  // Dipecah jadi potongan kecil (sama seperti Bluetooth) supaya aman untuk
  // printer yang buffer-nya kecil.
  const CHUNK = 4096;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    await cachedDevice.transferOut(cachedEndpointOut, bytes.slice(i, i + CHUNK));
  }
}

export async function printReceiptUsb(data) {
  const { buildReceiptEscPos } = await import("@/lib/blePrinter");
  const bytes = buildReceiptEscPos(data);
  await writeBytes(bytes);
}
