import { create as createQr } from 'qrcode';
import { describe, expect, test } from 'vitest';
import { paymentUri } from './qrcode';
import { decodeQr, scanSize } from './scan';
import { readPayment } from './uri';

const W5 = 'rzvrg1qtfhjsfflxh307x4skzrt3jrlwvg4jes32ljmut9fsxyrd939mseq59qlxg';

/** Gambar RGBA kode QR seperti di layar Terima: `scale` piksel per modul, tepi `margin` modul. */
function render(text: string, invert = false, scale = 4, margin = 4) {
  const qr = createQr(text, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const side = (size + margin * 2) * scale;
  const data = new Uint8ClampedArray(side * side * 4);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const row = Math.floor(y / scale) - margin;
      const col = Math.floor(x / scale) - margin;
      const dark = row >= 0 && col >= 0 && row < size && col < size && Boolean(qr.modules.get(row, col));
      const value = dark !== invert ? 0 : 255;
      const i = (y * side + x) * 4;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  return { data, width: side, height: side };
}

describe('pembaca kode QR', () => {
  test('membaca URI pembayaran dari layar Terima dan alamat polos', () => {
    const uri = paymentUri(W5, '0.25');
    const image = render(uri);
    const text = decodeQr(image.data, image.width, image.height);
    expect(text).toBe(uri);
    expect(readPayment(text ?? '', 'regtest')).toEqual({ ok: true, uri: true, address: W5, amount: '0.25' });
    const plain = render(W5);
    expect(decodeQr(plain.data, plain.width, plain.height)).toBe(W5);
  });

  test('membaca kode terang di atas gelap', () => {
    const image = render(paymentUri(W5), true);
    expect(decodeQr(image.data, image.width, image.height)).toBe(paymentUri(W5));
  });

  test('gambar tanpa kode QR atau ukuran salah menghasilkan null', () => {
    const blank = new Uint8ClampedArray(64 * 64 * 4).fill(255);
    expect(decodeQr(blank, 64, 64)).toBeNull();
    expect(decodeQr(blank, 0, 0)).toBeNull();
    expect(decodeQr(blank, 128, 128)).toBeNull();
  });

  test('memperkecil gambar kamera dengan perbandingan tetap', () => {
    expect(scanSize(1280, 720)).toEqual({ width: 640, height: 360 });
    expect(scanSize(1920, 1080)).toEqual({ width: 640, height: 360 });
    expect(scanSize(720, 1280)).toEqual({ width: 360, height: 640 });
    expect(scanSize(640, 480)).toEqual({ width: 640, height: 480 });
    expect(scanSize(3000, 1000)).toEqual({ width: 640, height: 213 });
    expect(scanSize(0, 480)).toEqual({ width: 0, height: 0 });
  });
});
