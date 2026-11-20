/**
 * Panggilan ke backend Rust wallet (`apps/wallet/src-tauri/src/commands`) lewat IPC Tauri. Jumlah koin selalu teks
 * angka quanta. Galat dari Rust berbentuk `{ code, message }`.
 */

import { invoke } from '@tauri-apps/api/core';
import type { WalletNetwork } from './address';
import type { HistoryEntryDto } from './history';

export interface WalletInfo {
  exists: boolean;
  path: string;
  defaultRpcUrl: string;
}

export interface ChainStatus {
  network: string;
  height: number;
  bestBlockId: string;
}

export interface BalanceDto {
  tipHeight: number;
  total: string;
  spendable: string;
  immature: string;
  pendingSpent: string;
  pendingReceived: string;
  afterPending: string;
  utxos: number;
}

export interface HistoryDto {
  tipHeight: number;
  entries: HistoryEntryDto[];
}

export interface SentDto {
  txid: string;
  amount: string;
  fee: string;
  change: string | null;
  inputs: number;
  size: number;
}

/** Pratinjau kirim (`preview_send`, RENCANA_T9 F3): rencana yang sama dengan `send`, tanpa password dan tanpa mengirim. */
export interface PreviewDto {
  amount: string;
  fee: string;
  change: string | null;
  inputs: number;
  size: number;
  tipHeight: number;
}

/** Permintaan kirim dari layar Kirim; `all` = kirim semua saldo yang bisa dipakai (teks `amount` diabaikan). */
export interface SendRequestArgs {
  network: WalletNetwork;
  rpcUrl: string;
  to: string;
  amount: string;
  all: boolean;
  feeRate: number;
}

/** Satu alamat penerimaan (`list_addresses`): indeks di cabang penerimaan dan alamat bech32m. */
export interface AddressItem {
  index: number;
  address: string;
}

/** Alamat penerimaan yang sudah dibuat, terbaru dulu (paling banyak 1.000); `total` = jumlah alamat yang sudah dibuat. */
export interface AddressListDto {
  total: number;
  addresses: AddressItem[];
}

export interface WalletError {
  code: string;
  message: string;
}

export function toWalletError(error: unknown): WalletError {
  if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error) {
    const { code, message } = error as { code: unknown; message: unknown };
    if (typeof code === 'string' && typeof message === 'string') {
      return { code, message };
    }
  }
  return { code: 'failed', message: String(error) };
}

export const ipc = {
  walletInfo: (network: WalletNetwork) => invoke<WalletInfo>('wallet_info', { network }),
  newPhrase: () => invoke<string>('new_phrase'),
  restoreWallet: (network: WalletNetwork, phrase: string, password: string, confirm: string) =>
    invoke<string>('restore_wallet', { network, phrase, password, confirm }),
  receiveAddress: (network: WalletNetwork) => invoke<string>('receive_address', { network }),
  newAddress: (network: WalletNetwork) => invoke<string>('new_address', { network }),
  listAddresses: (network: WalletNetwork) => invoke<AddressListDto>('list_addresses', { network }),
  chainStatus: (network: WalletNetwork, rpcUrl: string) => invoke<ChainStatus>('chain_status', { network, rpcUrl }),
  balance: (network: WalletNetwork, rpcUrl: string) => invoke<BalanceDto>('balance', { network, rpcUrl }),
  history: (network: WalletNetwork, rpcUrl: string) => invoke<HistoryDto>('history', { network, rpcUrl }),
  previewSend: (args: SendRequestArgs) => invoke<PreviewDto>('preview_send', { ...args }),
  send: (args: SendRequestArgs & { password: string; expectedAmount: string; expectedFee: string }) =>
    invoke<SentDto>('send', { ...args }),
  unlockApp: (network: WalletNetwork, password: string) => invoke<null>('unlock_app', { network, password }),
  revealPhrase: (network: WalletNetwork, password: string) =>
    invoke<string>('reveal_phrase', { network, password }),
  deleteWallet: (network: WalletNetwork, password: string) =>
    invoke<null>('delete_wallet', { network, password }),
  openExplorerTx: (network: WalletNetwork, txid: string) => invoke<null>('open_explorer_tx', { network, txid }),
};
