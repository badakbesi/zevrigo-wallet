/**
 * Galat pemindaian riwayat (0.3.1, TSK-M70): saldo tetap terbaru, riwayat dicoba lagi pada refresh otomatis berikutnya.
 * Tidak tampil saat node sama sekali tidak terhubung (kotak Offline sudah menjelaskan).
 */

import { shownError } from '../lib/errors';
import { TEXT } from '../lib/i18n';
import { useWallet } from '../store';
import { ShownErrorBox } from './ui';

export function HistoryError() {
  const { language, historyError, connection } = useWallet();
  const t = TEXT[language];
  if (!historyError || connection === 'offline') {
    return null;
  }
  return (
    <div data-testid="history-error" role="status" className="space-y-2">
      <p className="text-xs text-amber-700 dark:text-amber-300">{t.historyFailed}</p>
      <ShownErrorBox error={shownError(t, historyError)} t={t} />
    </div>
  );
}
