/**
 * Tombol "Explorer" (RENCANA_T9 F5): membuka halaman transaksi di explorer resmi lewat browser sistem (perintah Rust
 * `open_explorer_tx`, plugin opener). Hanya untuk jaringan yang punya explorer publik (regtest). Bila browser tidak bisa
 * dibuka, pesan galat lengkap dan tautan untuk disalin tampil.
 */

import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import type { WalletNetwork } from '../lib/address';
import { type ShownError, shownError } from '../lib/errors';
import { explorerTxUrl } from '../lib/explorer';
import type { Dict } from '../lib/i18n';
import { ipc, toWalletError } from '../lib/ipc';
import { CopyButton, ShownErrorBox, secondaryButton } from './ui';

export function ExplorerButton({ txid, network, t }: { txid: string; network: WalletNetwork; t: Dict }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ShownError | null>(null);
  const url = explorerTxUrl(network, txid);
  if (url === null) {
    return null;
  }
  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      await ipc.openExplorerTx(network, txid);
    } catch (err) {
      setError(shownError(t, toWalletError(err)));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="inline-flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={open}
        disabled={busy}
        className={secondaryButton}
        title={t.explorerOpenTitle}
        aria-label={t.explorerOpenTitle}
      >
        <ExternalLink className="w-3.5 h-3.5" />
        {t.explorerOpen}
      </button>
      {error && (
        <div className="max-w-xs whitespace-normal space-y-1.5">
          <ShownErrorBox error={error} t={t} />
          <div className="flex items-center gap-2">
            <code className="font-mono text-[11px] text-slate-600 dark:text-slate-300 break-all">{url}</code>
            <CopyButton text={url} t={t} />
          </div>
        </div>
      )}
    </div>
  );
}
