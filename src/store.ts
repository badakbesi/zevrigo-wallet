/**
 * Keadaan antarmuka wallet (zustand). Pengaturan (jaringan, alamat node per jaringan, bahasa, tema, kunci aplikasi) disimpan di
 * localStorage; data wallet (alamat, saldo, riwayat) selalu dibaca ulang dari backend Rust dan tidak disimpan di sini.
 * Kunci aplikasi (RENCANA_T9 F7): `locked` mulai true; dibuka dengan password wallet jaringan aktif (Argon2id di Rust).
 */

import { create } from 'zustand';
import { NETWORKS, type WalletNetwork } from './lib/address';
import {
  type AddressListDto,
  type BalanceDto,
  type ChainStatus,
  type HistoryDto,
  type WalletError,
  type WalletInfo,
  ipc,
  toWalletError,
} from './lib/ipc';
import type { Lang } from './lib/quanta';

export type Tab = 'dashboard' | 'receive' | 'send' | 'history' | 'settings';
export type Theme = 'dark' | 'light';
export type Connection = 'idle' | 'connecting' | 'online' | 'offline';

interface Settings {
  network: WalletNetwork;
  rpcUrls: Partial<Record<WalletNetwork, string>>;
  language: Lang;
  theme: Theme;
  lockApp: boolean;
}

const SETTINGS_KEY = 'zevrigo-wallet-settings-v1';
// Bawaan regtest: jaringan demo publik (DEC-34, TSK-M61). Testnet publik belum diluncurkan.
const DEFAULT_SETTINGS: Settings = { network: 'regtest', rpcUrls: {}, language: 'id', theme: 'dark', lockApp: true };

function loadSettings(): Settings {
  try {
    const raw = globalThis.localStorage?.getItem(SETTINGS_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }
    const value = JSON.parse(raw) as Partial<Settings>;
    const rpcUrls: Partial<Record<WalletNetwork, string>> = {};
    for (const network of NETWORKS) {
      const url = value.rpcUrls?.[network];
      if (typeof url === 'string' && url.trim() !== '') {
        rpcUrls[network] = url.trim();
      }
    }
    return {
      network: NETWORKS.includes(value.network as WalletNetwork) ? (value.network as WalletNetwork) : DEFAULT_SETTINGS.network,
      rpcUrls,
      language: value.language === 'en' ? 'en' : 'id',
      theme: value.theme === 'light' ? 'light' : 'dark',
      // Kunci aplikasi aktif kecuali dimatikan pengguna di Pengaturan.
      lockApp: value.lockApp !== false,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: Settings): void {
  try {
    globalThis.localStorage?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Penyimpanan lokal tidak tersedia: pengaturan berlaku sampai aplikasi ditutup.
  }
}

interface WalletState extends Settings {
  tab: Tab;
  info: WalletInfo | null;
  infoError: WalletError | null;
  address: string;
  addresses: AddressListDto | null;
  chain: ChainStatus | null;
  balance: BalanceDto | null;
  history: HistoryDto | null;
  connection: Connection;
  syncError: WalletError | null;
  refreshing: boolean;
  locked: boolean;
  rpcUrl: () => string;
  setTab: (tab: Tab) => void;
  setLanguage: (language: Lang) => void;
  setTheme: (theme: Theme) => void;
  setLockApp: (lockApp: boolean) => void;
  lock: () => void;
  unlock: (password: string) => Promise<void>;
  setNetwork: (network: WalletNetwork) => Promise<void>;
  setRpcUrl: (url: string | null) => Promise<void>;
  loadWallet: () => Promise<void>;
  refresh: () => Promise<void>;
  newAddress: () => Promise<void>;
  loadAddresses: () => Promise<void>;
  walletReady: (address: string) => Promise<void>;
}

export const useWallet = create<WalletState>()((set, get) => {
  const settings = () => {
    const { network, rpcUrls, language, theme, lockApp } = get();
    return { network, rpcUrls, language, theme, lockApp };
  };
  return {
    ...loadSettings(),
    tab: 'dashboard',
    info: null,
    infoError: null,
    address: '',
    addresses: null,
    chain: null,
    balance: null,
    history: null,
    connection: 'idle',
    syncError: null,
    refreshing: false,
    locked: true,

    rpcUrl: () => {
      const { network, rpcUrls, info } = get();
      return rpcUrls[network] ?? info?.defaultRpcUrl ?? '';
    },

    setTab: (tab) => set({ tab }),

    setLanguage: (language) => {
      set({ language });
      saveSettings(settings());
    },

    setTheme: (theme) => {
      set({ theme });
      saveSettings(settings());
    },

    setLockApp: (lockApp) => {
      set({ lockApp });
      saveSettings(settings());
    },

    lock: () => set({ locked: true }),

    unlock: async (password) => {
      await ipc.unlockApp(get().network, password);
      set({ locked: false });
    },

    setNetwork: async (network) => {
      if (network === get().network) {
        return;
      }
      set({ network, tab: 'dashboard' });
      saveSettings(settings());
      await get().loadWallet();
    },

    setRpcUrl: async (url) => {
      const rpcUrls = { ...get().rpcUrls };
      const trimmed = url?.trim() ?? '';
      if (trimmed === '') {
        delete rpcUrls[get().network];
      } else {
        rpcUrls[get().network] = trimmed;
      }
      set({ rpcUrls, chain: null, balance: null, history: null, connection: 'idle' });
      saveSettings(settings());
      await get().refresh();
    },

    loadWallet: async () => {
      const { network } = get();
      set({
        info: null,
        infoError: null,
        address: '',
        addresses: null,
        chain: null,
        balance: null,
        history: null,
        connection: 'idle',
        syncError: null,
      });
      try {
        const info = await ipc.walletInfo(network);
        if (get().network !== network) {
          return;
        }
        set({ info });
        if (info.exists) {
          set({ address: await ipc.receiveAddress(network) });
          await get().loadAddresses();
          await get().refresh();
        }
      } catch (error) {
        set({ infoError: toWalletError(error) });
      }
    },

    refresh: async () => {
      const { network, info, refreshing } = get();
      if (!info?.exists || refreshing) {
        return;
      }
      const rpcUrl = get().rpcUrl();
      set({ refreshing: true, connection: get().connection === 'online' ? 'online' : 'connecting' });
      try {
        const chain = await ipc.chainStatus(network, rpcUrl);
        const balance = await ipc.balance(network, rpcUrl);
        const history = await ipc.history(network, rpcUrl);
        if (get().network === network) {
          set({ chain, balance, history, connection: 'online', syncError: null });
        }
      } catch (error) {
        if (get().network === network) {
          set({ connection: 'offline', syncError: toWalletError(error) });
        }
      } finally {
        set({ refreshing: false });
      }
    },

    newAddress: async () => {
      const { network } = get();
      const address = await ipc.newAddress(network);
      if (get().network === network) {
        set({ address });
        await get().loadAddresses();
      }
    },

    loadAddresses: async () => {
      const { network, info } = get();
      if (!info?.exists) {
        return;
      }
      try {
        const addresses = await ipc.listAddresses(network);
        if (get().network === network) {
          set({ addresses });
        }
      } catch {
        // Daftar hanya tampilan: alamat terbaru tetap tampil dari receive_address.
        if (get().network === network) {
          set({ addresses: null });
        }
      }
    },

    walletReady: async (address) => {
      const { network } = get();
      const info = await ipc.walletInfo(network);
      // Password baru saja diketik untuk membuat atau memulihkan wallet ini.
      set({ info, address, addresses: null, tab: 'dashboard', locked: false });
      await get().loadAddresses();
      await get().refresh();
    },
  };
});
