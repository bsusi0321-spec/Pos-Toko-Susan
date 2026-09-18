"use client";

import { useEffect } from "react";
import { autoReconnectBluetoothPrinter } from "@/lib/blePrinter";

// Komponen tak terlihat (tidak merender apa pun) yang dipasang sekali di
// root layout, supaya di halaman APA PUN yang dibuka (kasir, admin,
// pengaturan) aplikasi langsung mencoba nyambung ulang ke printer
// Bluetooth yang terakhir kali disambungkan -- tanpa dialog pilih
// perangkat, tanpa kasir perlu menekan tombol apa pun. Ini yang membuat
// koneksi printer terasa "tetap tersambung" walau halaman di-reload atau
// aplikasi ditutup lalu dibuka lagi, sampai memang diputuskan manual dari
// halaman Pengaturan.
export default function BluetoothPrinterProvider() {
  useEffect(() => {
    autoReconnectBluetoothPrinter().catch(() => {});
  }, []);
  return null;
}
