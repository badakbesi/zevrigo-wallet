/**
 * Pesan saat node tidak bisa dihubungi atau berjalan di jaringan lain. Keterangan lengkap dari Rust tampil dengan tombol
 * salin (RENCANA_T9 F6), agar penyebab (misalnya galat sertifikat) bisa dilaporkan apa adanya.
 */

import { CircleAlert } from 'lucide-react';
import { shownError } from '../lib/errors';
import { TEXT } from '../lib/i18n';
import { useWallet } from '../store';
import { CopyButton, secondaryButton } from './ui';

export function Offline() {
  const { language, network, syncError, refresh, refreshing, rpcUrl } = useWallet();
  const t = TEXT[language];
  const shown = syncError ? shownError(t, syncError) : null;
  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30">
      <div className="flex items-start gap-3 text-sm min-w-0">
        <CircleAlert className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
        <div className="space-y-1 min-w-0">
          <div className="font-semibold text-rose-700 dark:text-rose-300">{t.offlineTitle}</div>
          <div className="text-slate-700 dark:text-slate-300">
            {shown ? shown.text : ''} {t.offlineBody}
          </div>
          <div className="font-mono text-xs text-slate-500 dark:text-slate-400">
            {rpcUrl()} · {network === 'regtest' ? t.offlineDemo : t.offlineCommand}
          </div>
          {shown?.detail && (
            <div className="flex items-start gap-2 pt-1">
              <code data-testid="offline-detail" className="flex-1 min-w-0 font-mono text-[11px] text-slate-600 dark:text-slate-300 break-all">
                {shown.detail}
              </code>
              <CopyButton text={shown.detail} t={t} label={t.copy} />
            </div>
          )}
        </div>
      </div>
      <button type="button" onClick={() => refresh()} disabled={refreshing} className={secondaryButton}>
        {t.retry}
      </button>
    </div>
  );
}
