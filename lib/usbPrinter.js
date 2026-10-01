"use client";

// Cetak struk LANGSUNG ke printer thermal lewat KABEL USB memakai WebUSB +
// perintah ESC/POS mentah -- saudara dari lib/blePrinter.js (yang lewat
// Bluetooth). Isi struknya sama persis: kita pakai ulang buildReceiptEscPos()
// dari blePrinter.js, yang beda cuma "jalur pengirimannya".
//
// Batasan (bawaan WebUSB, bukan bug aplikasi):
// - Cuma jalan di Chrome/Edge (Android, Windows, Mac, ChromeOS). Tidak ada
//   di Safari/iPhone maupun Firefox. Halaman harus HTTPS (Vercel sudah HTTPS).
// - Android: colok printer lewat kabel OTG -> biasanya langsung bisa.
// - Windows: kalau printer USB-nya sudah terpasang sebagai printer resmi
//   (ada driver-nya), Windows "memegang" printer itu sehingga browser tidak
//   boleh memakainya langsung. Untuk kasus ini fungsi di bawah melempar
//   UsbPrintError dengan canFallback = true, dan tombol di ReceiptModal
//   otomatis membuka dialog cetak biasa (lib/printReceipt.js) sebagai gantinya.

import { buildReceiptEscPos } from "@/lib/blePrinter";

// Printer yang sudah pernah dipilih diingat (vendorId:productId) supaya
// berikutnya tersambung otomatis tanpa dialog pilih perangkat -- Chrome
// menyimpan izinnya, dibaca lewat navigator.usb.getDevices().
const STORAGE_KEY = "pos_usb_printer_id";

let cachedDevice = null;
let cachedEndpoint = null;
const listeners = new Set();

// Error khusus supaya UI bisa membedakan "gagal total" dari "gagal, tapi
// masih bisa dicetak lewat dialog cetak biasa" (canFallback).
export class UsbPrintError extends Error {
  constructor(message, { canFallback = false } = {}) {
    super(message);
    this.name = "UsbPrintError";
    this.canFallback = canFallback;
  }
}

function deviceKey(d) {
  return `${d.vendorId}:${d.productId}`;
}

function notify() {
  const name = getConnectedUsbPrinterName();
  listeners.forEach((fn) => {
    try {
      fn(name);
    } catch {}
  });
}

function resetConnection() {
  cachedDevice = null;
  cachedEndpoint = null;
  notify();
}

export function subscribeUsbStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isUsbSupported() {
  return typeof navigator !== "undefined" && !!navigator.usb;
}

export function getConnectedUsbPrinterName() {
  return cachedDevice?.opened ? cachedDevice.productName || "Printer USB" : null;
}

// Membuka "pintu" ke printer: buka perangkat, pilih konfigurasi, cari jalur
// kirim data (endpoint bulk OUT) -- diutamakan antarmuka kelas printer (7).
async function attachDevice(device) {
  try {
    if (!device.opened) await device.open();
    if (device.configuration === null) await device.selectConfiguration(1);

    const candidates = [];
    for (const iface of device.configuration.interfaces) {
      for (const alt of iface.alternates) {
        const ep = alt.endpoints.find((e) => e.direction === "out" && e.type === "bulk");
        if (ep) {
          candidates.push({
            interfaceNumber: iface.interfaceNumber,
            alternate: alt.alternateSetting,
            endpointNumber: ep.endpointNumber,
            isPrinterClass: alt.interfaceClass === 7,
          });
        }
      }
    }
    candidates.sort((a, b) => Number(b.isPrinterClass) - Number(a.isPrinterClass));
    const pick = candidates[0];
    if (!pick) {
      throw new UsbPrintError(
        `Perangkat "${device.productName || "USB"}" tidak punya jalur cetak. Pastikan yang dicolok memang printer struk.`
      );
    }

    try {
      await device.claimInterface(pick.interfaceNumber);
    } catch {
      throw new UsbPrintError(
        "Printer USB ini tidak bisa dipakai langsung dari browser (biasanya karena sedang dipegang driver Windows).",
        { canFallback: true }
      );
    }
    if (pick.alternate !== 0) await device.selectAlternateInterface(pick.interfaceNumber, pick.alternate);

    cachedDevice = device;
    cachedEndpoint = pick.endpointNumber;
    try {
      localStorage.setItem(STORAGE_KEY, deviceKey(device));
    } catch {}
    notify();
    return { name: device.productName || "Printer USB" };
  } catch (err) {
    try {
      await device.close();
    } catch {}
    throw err;
  }
}

// Membuka dialog pilih perangkat USB bawaan browser. Harus dipicu langsung
// dari klik tombol. Kalau dialognya ditutup tanpa memilih, browser melempar
// error bernama "NotFoundError" (bukan kegagalan -- UI cukup diam).
export async function connectUsbPrinter() {
  if (!isUsbSupported()) {
    throw new UsbPrintError("Browser ini tidak mendukung cetak lewat kabel USB (perlu Chrome/Edge).", {
      canFallback: true,
    });
  }
  const device = await navigator.usb.requestDevice({
    // 7 = kelas printer; 0xff = "vendor specific" (banyak printer struk murah memakainya)
    filters: [{ classCode: 7 }, { classCode: 0xff }],
  });
  return attachDevice(device);
}

// Nyambung ulang ke printer yang terakhir dipakai TANPA dialog. Diam saja
// (return null) kalau belum ada printer tersimpan atau printernya tidak dicolok.
export async function autoReconnectUsbPrinter() {
  if (cachedDevice?.opened) return { name: getConnectedUsbPrinterName() };
  if (!isUsbSupported()) return null;
  let saved = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {}
  if (!saved) return null;
  try {
    const devices = await navigator.usb.getDevices();
    const device = devices.find((d) => deviceKey(d) === saved);
    if (!device) return null;
    return await attachDevice(device);
  } catch {
    return null;
  }
}

async function writeBytes(bytes) {
  // Dikirim per potongan supaya printer murah dengan buffer kecil tidak kewalahan.
  const CHUNK = 1024;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const result = await cachedDevice.transferOut(cachedEndpoint, bytes.slice(i, i + CHUNK));
    if (result.status !== "ok") {
      throw new UsbPrintError(
        `Printer menolak data (${result.status}). Coba cabut lalu colok lagi kabelnya, kemudian cetak ulang.`
      );
    }
  }
}

export async function printReceiptUsb(data) {
  if (!cachedDevice?.opened) throw new UsbPrintError("Printer kabel belum tersambung.");
  try {
    await writeBytes(buildReceiptEscPos(data));
  } catch (err) {
    if (err instanceof UsbPrintError) throw err;
    // Biasanya kabel terlepas di tengah jalan.
    resetConnection();
    throw new UsbPrintError("Kabel printer terlepas. Colok lagi kabelnya, lalu tekan Cetak Kabel.");
  }
}

// Pantau colok/cabut kabel supaya status selalu benar & tersambung ulang
// sendiri saat kabel dicolok lagi.
if (isUsbSupported()) {
  navigator.usb.addEventListener("disconnect", (e) => {
    if (cachedDevice && deviceKey(e.device) === deviceKey(cachedDevice)) resetConnection();
  });
  navigator.usb.addEventListener("connect", () => {
    autoReconnectUsbPrinter().catch(() => {});
  });
}
