/**
 * Tautan explorer resmi (SUMBER_RESMI.md repo inti) untuk halaman transaksi, sama dengan `explorer_tx_url` di Rust. Tombol
 * Explorer membuka tautan yang disusun Rust sendiri (`open_explorer_tx`); tautan di sini hanya untuk disalin bila browser
 * tidak bisa dibuka. Testnet belum punya explorer publik.
 */

import type { WalletNetwork } from './address';

export const EXPLORER_URLS: Partial<Record<WalletNetwork, string>> = {
  regtest: 'https://zevrigo.ratuaurion.store',
};

const TXID = /^[0-9a-f]{64}$/;

export function explorerTxUrl(network: WalletNetwork, txid: string): string | null {
  const base = EXPLORER_URLS[network];
  return base === undefined || !TXID.test(txid) ? null : `${base}/tx/?id=${txid}`;
}
