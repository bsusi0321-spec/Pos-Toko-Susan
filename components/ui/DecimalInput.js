"use client";

// Kolom angka dengan koma desimal ala Indonesia (lihat lib/format.js).
// Ketik 1166,67 -> tampil "1.166,67". Titik ribuan otomatis, koma = desimal.
// onValueChange menerima STRING ANGKA BIASA ("1166.67"), atau "" bila kosong.

import { useRef, useState } from "react";
import { MAX_DECIMALS, formatDecimalId, formatDecimalLive, decimalTextToRaw } from "@/lib/format";

export default function DecimalInput({ value, onValueChange, decimals = MAX_DECIMALS, onFocus, onBlur, ...props }) {
  const [text, setText] = useState(null); // null = tidak sedang diedit
  const inputRef = useRef(null);
  const shown = text !== null ? text : formatDecimalId(value, decimals);

  function handleChange(e) {
    const input = e.target;
    const cursor = input.selectionStart ?? input.value.length;
    const keep = /[\d,]/; // karakter "bermakna" untuk memulihkan posisi kursor
    const before = input.value.slice(0, cursor).split("").filter((c) => keep.test(c)).length;

    const nextText = formatDecimalLive(input.value, decimals);
    setText(nextText);
    onValueChange(decimalTextToRaw(nextText));

    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el || !el.isConnected) return;
      let seen = 0;
      let pos = before === 0 ? 0 : el.value.length;
      for (let i = 0; i < el.value.length && before > 0; i++) {
        if (keep.test(el.value[i])) seen++;
        if (seen === before) {
          pos = i + 1;
          break;
        }
      }
      el.setSelectionRange(pos, pos);
    });
  }

  function handleFocus(e) {
    setText(formatDecimalId(value, decimals));
    onFocus?.(e);
  }

  function handleBlur(e) {
    setText(null);
    onBlur?.(e);
  }

  return (
    <input
      {...props}
      ref={inputRef}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={shown}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  );
}
