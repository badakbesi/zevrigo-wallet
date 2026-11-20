/**
 * Terima: alamat penerimaan terbaru (atau alamat lama yang dipilih dari daftar), jumlah yang diminta (opsional), URI
 * pembayaran, kode QR, dan daftar semua alamat penerimaan wallet (RENCANA_T8). Semua alamat berasal dari frasa yang sama
 * dan tetap bisa menerima; "Buat alamat tambahan" tidak mengganti wallet.
 */

import { Plus, QrCode } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { GAP_LIMIT, fill, shortAddress, showGapNote } from '../lib/addresses';
import { type ShownError, shownError } from '../lib/errors';
import { TEXT } from '../lib/i18n';
import { toWalletError } from '../lib/ipc';
import { canonicalZvrg, parseZvrg } from '../lib/quanta';
import { paymentUri, qrSvg } from '../lib/qrcode';
import { useWallet } from '../store';
import {
  Card,
  CopyButton,
  ErrorBox,
  PageHeader,
  ShownErrorBox,
  inputClass,
  primaryButton,
  secondaryButton,
} from './ui';

export function Receive() {
  const { language, address, addresses, newAddress, loadAddresses } = useWallet();
  const t = TEXT[language];
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [error, setError] = useState<ShownError | null>(null);
  const items = addresses?.addresses ?? [];
  const latestIndex = items.length > 0 ? items[0].index : null;
  const chosen = picked === null ? undefined : items.find((item) => item.index === picked);
  const older = chosen !== undefined && chosen.index !== latestIndex ? chosen : null;
  const shown = older ? older.address : address;
  const parsed = useMemo(() => (amount.trim() === '' ? null : parseZvrg(amount)), [amount]);
  const uri = paymentUri(shown, parsed?.ok ? canonicalZvrg(parsed.quanta) : undefined);
  const qr = useMemo(() => (shown ? qrSvg(uri) : null), [shown, uri]);

  useEffect(() => {
    void loadAddresses();
  }, [loadAddresses]);

  const makeAddress = async () => {
    setBusy(true);
    setError(null);
    try {
      await newAddress();
      setPicked(null);
    } catch (err) {
      setError(shownError(t, toWalletError(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.receiveTitle}
        subtitle={t.receiveSubtitle}
        action={
          <button type="button" onClick={makeAddress} disabled={busy} className={primaryButton}>
            <Plus className="w-4 h-4" />
            {t.newAddress}
          </button>
        }
      />
      {error && <ShownErrorBox error={error} t={t} />}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <Card className="lg:col-span-7 space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span>{older ? fill(t.addressNumber, { n: older.index }) : t.receiveAddress}</span>
              {older && (
                <button type="button" onClick={() => setPicked(null)} className={secondaryButton}>
                  {t.addressBackToLatest}
                </button>
              )}
            </div>
            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <code data-testid="receive-address" className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 break-all">
                {shown}
              </code>
              <CopyButton text={shown} t={t} />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t.newAddressHint}</p>
          </div>
          <label className="block space-y-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <span className="block">{t.requestAmount}</span>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={t.requestAmountPlaceholder}
                className={`${inputClass} pr-16 font-mono`}
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">ZVRG</span>
            </div>
          </label>
          {parsed && !parsed.ok && <ErrorBox>{t.amountErrors[parsed.error]}</ErrorBox>}
          <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span>{t.paymentUri}</span>
              <CopyButton text={uri} t={t} />
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-700 dark:text-slate-300 break-all">
              {uri}
            </div>
          </div>
        </Card>
        <Card className="lg:col-span-5 flex flex-col items-center justify-center gap-4">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <QrCode className="w-4 h-4 text-emerald-500" />
            {older ? `QR #${older.index}` : 'QR'}
          </div>
          {qr && (
            <div className="p-3.5 bg-white rounded-xl border border-slate-200">
              <svg
                data-testid="receive-qr"
                viewBox={`0 0 ${qr.viewBox} ${qr.viewBox}`}
                className="w-52 h-52"
                shapeRendering="crispEdges"
                role="img"
                aria-label={uri}
              >
                <rect width={qr.viewBox} height={qr.viewBox} fill="#ffffff" />
                <path d={qr.path} fill="#0f172a" />
              </svg>
            </div>
          )}
        </Card>
      </div>
      {addresses && items.length > 0 && (
        <Card className="space-y-4">
          <div className="space-y-1">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t.addressListTitle} ({addresses.total})
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t.addressListHint}</p>
          </div>
          <ul
            data-testid="address-list"
            className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg"
          >
            {items.map((item) => (
              <li
                key={item.index}
                className={`flex items-center gap-3 px-3 py-2.5 ${item.address === shown ? 'bg-emerald-500/10' : ''}`}
              >
                <span className="w-12 shrink-0 font-mono text-xs text-slate-500 dark:text-slate-400">#{item.index}</span>
                <button
                  type="button"
                  onClick={() => setPicked(item.index)}
                  title={item.address}
                  aria-label={fill(t.addressShowQr, { n: item.index })}
                  className="flex-1 min-w-0 text-left font-mono text-xs text-slate-800 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-400"
                >
                  <span className="md:hidden">{shortAddress(item.address)}</span>
                  <span className="hidden md:inline break-all">{item.address}</span>
                </button>
                {item.index === latestIndex && (
                  <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                    {t.addressLatest}
                  </span>
                )}
                <CopyButton text={item.address} t={t} />
              </li>
            ))}
          </ul>
          {addresses.total > items.length && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {fill(t.addressListMore, { shown: items.length, total: addresses.total })}
            </p>
          )}
          {showGapNote(addresses.total) && (
            <p className="text-xs text-amber-700 dark:text-amber-300">{fill(t.addressGapNote, { gap: GAP_LIMIT })}</p>
          )}
        </Card>
      )}
    </div>
  );
}
