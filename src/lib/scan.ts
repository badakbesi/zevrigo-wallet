/**
 * Pembaca kode QR dari gambar kamera (RENCANA_T10, F1) dengan `jsqr` 1.4.0 (JavaScript murni, Apache-2.0, izin pencipta
 * 20 November 2026): tanpa layanan Google dan tanpa pengiriman gambar. Fungsi di sini murni (tanpa DOM), jadi bisa diuji
 * di Node; kamera dan kanvas ada di `components/QrScanner.tsx`. Ukuran piksel memakai `number` (bukan jumlah koin).
 */

import jsQR from 'jsqr';

/** Sisi terpanjang gambar yang dipindai (piksel): gambar kamera diperkecil dulu agar tetap cepat di HP murah. */
export const SCAN_MAX_SIDE = 640;

/** Jeda antar pemindaian (milidetik). */
export const SCAN_INTERVAL_MS = 200;

/** Ukuran kanvas pemindaian: sama dengan gambar kamera, atau diperkecil dengan perbandingan tetap sampai `maxSide`. */
export function scanSize(width: number, height: number, maxSide: number = SCAN_MAX_SIDE): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) {
    return { width: 0, height: 0 };
  }
  const side = Math.max(width, height);
  if (side <= maxSide) {
    return { width, height };
  }
  return {
    width: Math.max(1, Math.round((width * maxSide) / side)),
    height: Math.max(1, Math.round((height * maxSide) / side)),
  };
}

/** Teks kode QR di gambar RGBA, atau `null`. Kode terang di atas gelap (layar mode gelap) juga dicoba. */
export function decodeQr(data: Uint8ClampedArray, width: number, height: number): string | null {
  if (!(width > 0) || !(height > 0) || data.length < width * height * 4) {
    return null;
  }
  const code = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' });
  return code === null ? null : code.data;
}
