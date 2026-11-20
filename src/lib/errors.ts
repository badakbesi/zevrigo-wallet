/**
 * Pesan galat untuk layar (RENCANA_T9 F6): teks terjemahan dari kode tetap Rust, ditambah keterangan lengkap dari Rust
 * (`message`) sebagai "detail teknis" yang bisa disalin untuk dilaporkan. Detail tidak ditampilkan untuk galat frasa dan
 * password, karena keterangannya bisa memuat kata frasa yang diketik; detail kosong atau sama dengan teks juga tidak.
 */

import { type Dict, walletErrorText } from './i18n';

export interface ShownError {
  text: string;
  detail?: string;
}

export const NO_DETAIL_CODES: readonly string[] = ['bad_phrase', 'wrong_password', 'password_too_short', 'password_mismatch'];

export function shownError(t: Dict, error: { code: string; message: string }): ShownError {
  const text = walletErrorText(t, error.code);
  const message = error.message.trim();
  if (NO_DETAIL_CODES.includes(error.code) || message === '' || message === text) {
    return { text };
  }
  return { text, detail: message };
}
