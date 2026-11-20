import { describe, expect, test } from 'vitest';
import { shownError } from './errors';
import { TEXT } from './i18n';

describe('pesan galat', () => {
  test('menambah detail teknis dari Rust', () => {
    const t = TEXT.id;
    const message = 'RPC gagal: invalid peer certificate: Revoked';
    expect(shownError(t, { code: 'node_unreachable', message })).toEqual({
      text: t.walletErrors.node_unreachable,
      detail: message,
    });
    expect(shownError(t, { code: 'kode_baru', message: ' sesuatu ' })).toEqual({
      text: t.walletErrors.failed,
      detail: 'sesuatu',
    });
    expect(shownError(TEXT.en, { code: 'open_failed', message: 'no browser' })).toEqual({
      text: TEXT.en.walletErrors.open_failed,
      detail: 'no browser',
    });
  });

  test('tanpa detail untuk frasa, password, dan keterangan kosong', () => {
    const t = TEXT.id;
    for (const code of ['bad_phrase', 'wrong_password', 'password_too_short', 'password_mismatch']) {
      expect(shownError(t, { code, message: 'frasa atau passphrase tidak sah: kata abandon' })).toEqual({
        text: t.walletErrors[code as keyof typeof t.walletErrors],
      });
    }
    expect(shownError(t, { code: 'failed', message: '  ' })).toEqual({ text: t.walletErrors.failed });
    expect(shownError(t, { code: 'failed', message: t.walletErrors.failed })).toEqual({ text: t.walletErrors.failed });
  });
});
