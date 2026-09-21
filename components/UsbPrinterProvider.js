"use client";

import { useEffect } from "react";
import { autoReconnectUsbPrinter } from "@/lib/usbPrinter";

// Komponen tak terlihat, dipasang sekali di root layout (sama seperti
// BluetoothPrinterProvider) -- supaya di halaman apa pun yang dibuka,
// aplikasi langsung mencoba nyambung ulang ke printer USB yang terakhir
// kali disambungkan, tanpa dialog pilih perangkat.
export default function UsbPrinterProvider() {
  useEffect(() => {
    autoReconnectUsbPrinter().catch(() => {});
  }, []);
  return null;
}
