import { describe, expect, test } from 'vitest';
import { TEXT } from './i18n';
import { paymentUri } from './qrcode';
import { isPaymentUri, paymentErrorText, readPayment } from './uri';

// W5 (regtest) dan W10 (testnet): alamat pertama frasa uji W1 (Spesifikasi Wallet v0.1 Bagian 4).
const W5 = 'rzvrg1qtfhjsfflxh307x4skzrt3jrlwvg4jes32ljmut9fsxyrd939mseq59qlxg';
const W10 = 'tzvrg1qtfhjsfflxh307x4skzrt3jrlwvg4jes32ljmut9fsxyrd939mseq4f4dkt';

describe('URI pembayaran', () => {
  test('membaca alamat polos dan URI dari layar Terima', () => {
    expect(readPayment(`  ${W5} `, 'regtest')).toEqual({ ok: true, uri: false, address: W5 });
    expect(readPayment(paymentUri(W5), 'regtest')).toEqual({ ok: true, uri: true, address: W5 });
    expect(readPayment(paymentUri(W5, '0.25'), 'regtest')).toEqual({ ok: true, uri: true, address: W5, amount: '0.25' });
    expect(readPayment(`zevrigo:${W10}?amount=1.50`, 'testnet')).toEqual({ ok: true, uri: true, address: W10, amount: '1.5' });
    expect(readPayment(`ZEVRIGO:${W5.toUpperCase()}?AMOUNT=2`, 'regtest')).toEqual({
      ok: true,
      uri: true,
      address: W5,
      amount: '2',
    });
    expect(readPayment(`zevrigo:${W5}?label=Toko%20A&message=terima%20kasih&amount=3`, 'regtest')).toEqual({
      ok: true,
      uri: true,
      address: W5,
      amount: '3',
    });
    expect(isPaymentUri(' Zevrigo:x')).toBe(true);
    expect(isPaymentUri(W5)).toBe(false);
  });

  test('menolak alamat, jumlah, dan parameter yang tidak sah', () => {
    const wrong = { kind: 'address', error: 'wrong_network', detected: 'testnet' };
    expect(readPayment(W10, 'regtest')).toEqual({ ok: false, uri: false, error: wrong });
    expect(readPayment(`zevrigo:${W10}`, 'regtest')).toEqual({ ok: false, uri: true, error: wrong });
    expect(readPayment('', 'regtest')).toEqual({ ok: false, uri: false, error: { kind: 'address', error: 'empty' } });
    expect(readPayment('zevrigo:', 'regtest')).toEqual({ ok: false, uri: true, error: { kind: 'address', error: 'empty' } });
    const amounts = [
      ['abc', 'format'],
      ['0', 'zero'],
      ['0,5', 'format'],
      ['-1', 'format'],
      ['+1', 'format'],
      ['1e3', 'format'],
      [' 1', 'format'],
      ['', 'format'],
      ['0.0000000000000000001', 'precision'],
    ] as const;
    for (const [value, error] of amounts) {
      expect(readPayment(`zevrigo:${W5}?amount=${value}`, 'regtest'), value).toEqual({
        ok: false,
        uri: true,
        error: { kind: 'amount', error },
      });
    }
    const bad = { ok: false, uri: true, error: { kind: 'uri' } };
    expect(readPayment(`zevrigo:${W5}?amount=1&amount=2`, 'regtest')).toEqual(bad);
    expect(readPayment(`zevrigo:${W5}?req-fee=1`, 'regtest')).toEqual(bad);
    expect(readPayment(`zevrigo:${W5}?label=%E0%A4%A`, 'regtest')).toEqual(bad);
  });

  test('menyusun pesan galat', () => {
    const t = TEXT.id;
    expect(paymentErrorText(t, { kind: 'address', error: 'wrong_network', detected: 'testnet' })).toBe(
      'Alamat ini untuk jaringan lain: testnet',
    );
    expect(paymentErrorText(t, { kind: 'address', error: 'checksum' })).toBe(t.addressErrors.checksum);
    expect(paymentErrorText(t, { kind: 'amount', error: 'zero' })).toBe(`${t.uriAmount} ${t.amountErrors.zero}`);
    expect(paymentErrorText(TEXT.en, { kind: 'uri' })).toBe(TEXT.en.uriInvalid);
  });
});
