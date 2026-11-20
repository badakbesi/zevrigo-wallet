/**
 * Layar kunci aplikasi (RENCANA_T9 F7): saldo, alamat, dan riwayat tidak tampil sampai password wallet jaringan aktif
 * benar. Password diperiksa backend Rust dengan membuka frasa (Argon2id, sekitar 1 sampai 2 detik di HP), lalu dibuang.
 */

import { Lock } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { type ShownError, shownError } from '../lib/errors';
import { TEXT } from '../lib/i18n';
import { toWalletError } from '../lib/ipc';
import { useWallet } from '../store';
import { Card, ShownErrorBox, inputClass, primaryButton } from './ui';

export function LockScreen() {
  const { language, network, unlock } = useWallet();
  const t = TEXT[language];
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ShownError | null>(null);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await unlock(password);
    } catch (err) {
      setError(shownError(t, toWalletError(err)));
    } finally {
      setPassword('');
      setBusy(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto pt-4 md:pt-12">
      <Card className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-500/15">
            <Lock className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t.lockTitle}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {network === 'testnet' ? t.networkTestnet : t.networkRegtest}
            </p>
          </div>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400">{t.lockBody}</p>
        <form onSubmit={submit} data-testid="lock-screen" className="space-y-3">
          <input
            type="password"
            autoComplete="current-password"
            autoFocus
            aria-label={t.password}
            placeholder={t.password}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            required
          />
          {error && <ShownErrorBox error={error} t={t} />}
          <button type="submit" disabled={busy || password === ''} className={`${primaryButton} w-full`}>
            <Lock className="w-4 h-4" />
            {busy ? t.unlocking : t.unlock}
          </button>
        </form>
        <p className="text-xs text-slate-500 dark:text-slate-400">{t.lockForgot}</p>
      </Card>
    </div>
  );
}
