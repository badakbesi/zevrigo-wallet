/**
 * Membaca penerima dari teks yang ditempel atau hasil scan kode QR (RENCANA_T10, F2): alamat polos atau URI pembayaran
 * `zevrigo:<alamat>[?amount=<ZVRG>]`, bentuk yang dibuat layar Terima (`paymentUri`). Alamat diperiksa `checkAddress`
 * untuk jaringan aktif; jumlah di URI harus angka dengan titik desimal (bentuk `canonicalZvrg`), lalu diperiksa
 * `parseZvrg`. Parameter `req-*` yang tidak dikenal ditolak (aturan BIP21); parameter lain (label, message) diabaikan.
 */

import { type AddressError, type WalletNetwork, checkAddress } from './address';
import type { Dict } from './i18n';
import { type AmountError, canonicalZvrg, parseZvrg } from './quanta';

export const URI_SCHEME = 'zevrigo:';

export type PaymentError =
  | { kind: 'address'; error: AddressError; detected?: string }
  | { kind: 'amount'; error: AmountError }
  | { kind: 'uri' };

/** Hasil baca: `amount` berupa teks ZVRG kanonis (titik desimal), hanya bila URI memuat jumlah. */
export type PaymentRead =
  | { ok: true; uri: boolean; address: string; amount?: string }
  | { ok: false; uri: boolean; error: PaymentError };

const URI_AMOUNT = /^[0-9]+(\.[0-9]+)?$/;

export function isPaymentUri(text: string): boolean {
  return text.trim().toLowerCase().startsWith(URI_SCHEME);
}

function addressRead(text: string, network: WalletNetwork, uri: boolean): PaymentRead {
  const check = checkAddress(text, network);
  if (check.ok) {
    return { ok: true, uri, address: check.address };
  }
  return { ok: false, uri, error: { kind: 'address', error: check.error, detected: check.detected } };
}

export function readPayment(input: string, network: WalletNetwork): PaymentRead {
  const text = input.trim();
  if (!isPaymentUri(text)) {
    return addressRead(text, network, false);
  }
  const rest = text.slice(URI_SCHEME.length);
  const mark = rest.indexOf('?');
  const read = addressRead(mark < 0 ? rest : rest.slice(0, mark), network, true);
  if (!read.ok || mark < 0) {
    return read;
  }
  const bad: PaymentRead = { ok: false, uri: true, error: { kind: 'uri' } };
  let amount: string | undefined;
  for (const part of rest.slice(mark + 1).split('&')) {
    if (part === '') {
      continue;
    }
    const eq = part.indexOf('=');
    const key = (eq < 0 ? part : part.slice(0, eq)).toLowerCase();
    let value: string;
    try {
      value = decodeURIComponent(eq < 0 ? '' : part.slice(eq + 1));
    } catch {
      return bad;
    }
    if (key === 'amount') {
      if (amount !== undefined) {
        return bad;
      }
      const parsed = URI_AMOUNT.test(value) ? parseZvrg(value) : ({ ok: false, error: 'format' } as const);
      if (!parsed.ok) {
        return { ok: false, uri: true, error: { kind: 'amount', error: parsed.error } };
      }
      amount = canonicalZvrg(parsed.quanta);
    } else if (key.startsWith('req-')) {
      return bad;
    }
  }
  return { ...read, amount };
}

/** Pesan galat untuk hasil baca yang tidak sah. */
export function paymentErrorText(t: Dict, error: PaymentError): string {
  if (error.kind === 'address') {
    const text = t.addressErrors[error.error];
    return error.detected ? `${text} ${error.detected}` : text;
  }
  if (error.kind === 'amount') {
    return `${t.uriAmount} ${t.amountErrors[error.error]}`;
  }
  return t.uriInvalid;
}
