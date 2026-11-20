import { describe, expect, test } from 'vitest';
import { GAP_LIMIT, fill, shortAddress, showGapNote } from './addresses';

// W5: alamat penerimaan pertama regtest dari frasa uji W1 (Spesifikasi Wallet v0.1 Bagian 4).
const W5 = 'rzvrg1qtfhjsfflxh307x4skzrt3jrlwvg4jes32ljmut9fsxyrd939mseq59qlxg';

describe('daftar alamat', () => {
  test('memendekkan alamat dengan awal dan akhir tetap terlihat', () => {
    expect(shortAddress(W5)).toBe('rzvrg1qtfhjsff…eq59qlxg');
    expect(shortAddress(W5, 6, 4)).toBe('rzvrg1…qlxg');
    expect(shortAddress('rzvrg1abc')).toBe('rzvrg1abc');
    expect(shortAddress(W5, 40, 24)).toBe(W5);
  });

  test('catatan gap limit hanya sesudah lebih dari 20 alamat', () => {
    expect(GAP_LIMIT).toBe(20);
    expect(showGapNote(0)).toBe(false);
    expect(showGapNote(GAP_LIMIT)).toBe(false);
    expect(showGapNote(GAP_LIMIT + 1)).toBe(true);
  });

  test('mengisi teks dengan nilai', () => {
    expect(fill('Alamat #{n}', { n: 3 })).toBe('Alamat #3');
    expect(fill('{shown} dari {total}', { shown: 1000, total: 1500 })).toBe('1000 dari 1500');
    expect(fill('{n} dan {lain}', { n: 0 })).toBe('0 dan {lain}');
  });
});
