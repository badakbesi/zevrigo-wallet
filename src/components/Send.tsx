/**
 * Kirim: alamat dan jumlah diperiksa di antarmuka, lalu backend Rust memilih koin dan menghitung biaya tanpa password
 * (pratinjau, RENCANA_T9 F3). Layar konfirmasi menampilkan jumlah yang diterima, biaya, total keluar, dan kembalian
 * sebelum password diminta; backend menolak menandatangani bila jumlah atau biaya berubah sejak pratinjau. Tombol "Semua"
 * mengirim semua saldo yang bisa dipakai dikurangi biaya, tanpa kembalian (F4). Penerima bisa diketik, ditempel sebagai
 * alamat atau URI `zevrigo:` (alamat dan jumlah terisi), atau dibaca dari kode QR (RENCANA_T10).
 */

import { CircleCheck, Lock, ScanLine, Send as SendIcon, X } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { checkAddress } from '../lib/address';
import { type ShownError, shownError } from '../lib/errors';
import { TEXT } from '../lib/i18n';
import { type PreviewDto, type SendRequestArgs, type SentDto, ipc, toWalletError } from '../lib/ipc';
import { checkSendAmount, formatQuanta, toQuanta } from '../lib/quanta';
import { type PaymentRead, isPaymentUri, paymentErrorText, readPayment } from '../lib/uri';
import { useWallet } from '../store';
import { ExplorerButton } from './ExplorerButton';
import { QrScanner } from './QrScanner';
import {
  Card,
  CopyButton,
  ErrorBox,
  PageHeader,
  ShownErrorBox,
  Zvrg,
  inputClass,
  primaryButton,
  secondaryButton,
} from './ui';

const FEE_RATES = [1, 2, 5, 10];

export function Send() {
  const { language, network, balance, rpcUrl, refresh, connection } = useWallet();
  const t = TEXT[language];
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [all, setAll] = useState(false);
  const [feeRate, setFeeRate] = useState(1);
  const [preview, setPreview] = useState<PreviewDto | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [reviewError, setReviewError] = useState<ShownError | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ShownError | null>(null);
  const [sent, setSent] = useState<SentDto | null>(null);
  const [uriError, setUriError] = useState<string | null>(null);
  const [filled, setFilled] = useState<'address' | 'amount' | null>(null);
  const [scanning, setScanning] = useState(false);

  const spendable = balance ? toQuanta(balance.spendable) : 0n;
  const address = useMemo(() => checkAddress(recipient, network), [recipient, network]);
  const parsed = useMemo(() => checkSendAmount(amount, spendable), [amount, spendable]);
  const amountOk = all ? spendable > 0n : parsed.ok;
  const ready = address.ok && amountOk && balance !== null && connection !== 'offline' && !previewing;

  const sendArgs = (): SendRequestArgs | null => {
    if (!address.ok) {
      return null;
    }
    if (all) {
      return { network, rpcUrl: rpcUrl(), to: address.address, amount: '', all: true, feeRate };
    }
    if (!parsed.ok) {
      return null;
    }
    return { network, rpcUrl: rpcUrl(), to: address.address, amount: parsed.quanta.toString(), all: false, feeRate };
  };

  const fill = (read: Extract<PaymentRead, { ok: true }>) => {
    setRecipient(read.address);
    if (read.amount !== undefined) {
      setAmount(read.amount);
      setAll(false);
    }
    setUriError(null);
    setFilled(read.amount !== undefined ? 'amount' : 'address');
  };

  const changeRecipient = (value: string) => {
    setFilled(null);
    if (!isPaymentUri(value)) {
      setUriError(null);
      setRecipient(value);
      return;
    }
    const read = readPayment(value, network);
    if (read.ok) {
      fill(read);
      return;
    }
    setRecipient(value);
    setUriError(paymentErrorText(t, read.error));
  };

  const scanned = (text: string): string | null => {
    const read = readPayment(text, network);
    if (!read.ok) {
      return `${t.scanNotZevrigo} ${paymentErrorText(t, read.error)}`;
    }
    fill(read);
    setScanning(false);
    return null;
  };

  const addressError = () => {
    if (uriError) {
      return uriError;
    }
    if (recipient.trim() === '' || address.ok) {
      return null;
    }
    const text = t.addressErrors[address.error];
    return address.detected ? `${text} ${address.detected}` : text;
  };
  const amountError = all || amount.trim() === '' || parsed.ok ? null : t.amountErrors[parsed.error];

  const review = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const args = sendArgs();
    if (!ready || args === null) {
      return;
    }
    setPreviewing(true);
    setReviewError(null);
    try {
      const result = await ipc.previewSend(args);
      setPassword('');
      setError(null);
      setPreview(result);
    } catch (err) {
      setReviewError(shownError(t, toWalletError(err)));
    } finally {
      setPreviewing(false);
    }
  };

  const confirm = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const args = sendArgs();
    if (args === null || preview === null) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await ipc.send({ ...args, password, expectedAmount: preview.amount, expectedFee: preview.fee });
      setSent(result);
      setPreview(null);
      setPassword('');
      setAmount('');
      setAll(false);
      setRecipient('');
      setFilled(null);
      await refresh();
    } catch (err) {
      const walletError = toWalletError(err);
      setError(shownError(t, walletError));
      if (walletError.code === 'preview_changed') {
        // Saldo atau mempool berubah: tampilkan angka baru, pengguna memeriksa lalu mengirim lagi.
        try {
          setPreview(await ipc.previewSend(args));
        } catch (again) {
          setPreview(null);
          setReviewError(shownError(t, toWalletError(again)));
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const closePreview = () => {
    setPreview(null);
    setPassword('');
    setError(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.sendTitle}
        subtitle={t.sendSubtitle}
        action={
          <div className="text-right text-xs">
            <span className="block text-slate-500 dark:text-slate-400">{t.spendableNow}</span>
            <Zvrg quanta={spendable} lang={language} exact className="text-sm font-bold text-emerald-600 dark:text-emerald-400" />
          </div>
        }
      />

      {sent && (
        <div
          role="status"
          className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-start justify-between gap-3"
        >
          <div className="space-y-1.5 min-w-0 text-xs">
            <div className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300">
              <CircleCheck className="w-4 h-4 shrink-0" />
              {t.sentTitle}: <Zvrg quanta={toQuanta(sent.amount)} lang={language} exact />
            </div>
            <div className="font-mono text-slate-800 dark:text-slate-200 break-all">txid {sent.txid}</div>
            <div className="text-slate-600 dark:text-slate-300">
              {t.sentFee}: {formatQuanta(toQuanta(sent.fee), language)} quanta
              {sent.change !== null && (
                <>
                  {' · '}
                  {t.sentChange}: <Zvrg quanta={toQuanta(sent.change)} lang={language} exact />
                </>
              )}
              {' · '}
              {t.sentInputs}: {sent.inputs} · {t.sentSize}: {sent.size} {t.bytes}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <CopyButton text={sent.txid} t={t} />
            <ExplorerButton txid={sent.txid} network={network} t={t} />
            <button
              type="button"
              aria-label={t.cancel}
              onClick={() => setSent(null)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <Card>
        <form onSubmit={review} className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="send-recipient" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              {t.recipient}
            </label>
            <div className="flex items-stretch gap-2">
              <input
                id="send-recipient"
                type="text"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                value={recipient}
                onChange={(e) => changeRecipient(e.target.value)}
                placeholder={network === 'testnet' ? 'tzvrg1…' : 'rzvrg1…'}
                className={`${inputClass} font-mono min-w-0 flex-1`}
                required
              />
              <button
                type="button"
                onClick={() => setScanning(true)}
                className={secondaryButton}
                aria-label={t.scanButton}
                title={t.scanButton}
              >
                <ScanLine className="w-4 h-4" />
                <span className="hidden sm:inline">{t.scanButton}</span>
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t.recipientHint}</p>
          </div>
          {addressError() && <ErrorBox>{addressError()}</ErrorBox>}
          {filled && !uriError && (
            <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300">
              {filled === 'amount' ? t.filledAddressAmount : t.filledAddress}
            </p>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="send-amount" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {t.amount}
              </label>
              <button
                type="button"
                data-testid="send-all"
                aria-pressed={all}
                title={t.sendAllTitle}
                onClick={() => setAll(!all)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-colors ${
                  all
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {t.sendAll}
              </button>
            </div>
            <div className="relative">
              <input
                id="send-amount"
                type="text"
                inputMode="decimal"
                value={all ? '' : amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={all ? t.sendAllPlaceholder : '0'}
                disabled={all}
                className={`${inputClass} pr-16 font-mono disabled:opacity-60`}
                required={!all}
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">ZVRG</span>
            </div>
          </div>
          {all && (
            <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300">
              {balance !== null && spendable === 0n ? t.sendAllEmpty : t.sendAllActive}
            </p>
          )}
          {!all && parsed.ok && (
            <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
              = {formatQuanta(parsed.quanta, language)} quanta
            </div>
          )}
          {amountError && <ErrorBox>{amountError}</ErrorBox>}

          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">{t.feeRate}</div>
            <div className="grid grid-cols-4 gap-2">
              {FEE_RATES.map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => setFeeRate(rate)}
                  className={`py-2 px-3 text-xs font-mono font-semibold rounded-lg border transition-colors ${
                    feeRate === rate
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {rate} {t.feeRateUnit}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t.feeHint}</p>
          </div>

          {reviewError && <ShownErrorBox error={reviewError} t={t} />}
          <button type="submit" disabled={!ready} className={`${primaryButton} w-full`}>
            <SendIcon className="w-4 h-4" />
            {previewing ? t.previewing : t.review}
          </button>
        </form>
      </Card>

      {preview !== null && address.ok && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75"
        >
          <form
            onSubmit={confirm}
            className="w-full max-w-md max-h-full overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t.confirmTitle}</h3>
              <button
                type="button"
                aria-label={t.cancel}
                onClick={closePreview}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">{t.confirmBody}</p>
            <div
              data-testid="send-preview"
              className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 text-xs"
            >
              <div>
                <span className="text-slate-500 block">{t.recipient}</span>
                <span className="font-mono text-slate-900 dark:text-slate-100 break-all">{address.address}</span>
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 block">{t.previewReceives}</span>
                <Zvrg
                  quanta={toQuanta(preview.amount)}
                  lang={language}
                  exact
                  className="font-bold text-emerald-600 dark:text-emerald-400"
                />
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 block">{t.previewFee}</span>
                <span className="font-mono">
                  {formatQuanta(toQuanta(preview.fee), language)} quanta · {feeRate} {t.feeRateUnit}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 block">{t.previewTotal}</span>
                <Zvrg quanta={toQuanta(preview.amount) + toQuanta(preview.fee)} lang={language} exact className="font-bold" />
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 block">{t.sentChange}</span>
                {preview.change !== null ? (
                  <Zvrg quanta={toQuanta(preview.change)} lang={language} exact />
                ) : (
                  <span>{t.previewNoChange}</span>
                )}
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-slate-500">
                {t.sentInputs}: {preview.inputs} · {t.sentSize}: {preview.size} {t.bytes}
              </div>
            </div>
            <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span className="block">{t.password}</span>
              <input
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                required
              />
            </label>
            {error && <ShownErrorBox error={error} t={t} />}
            <div className="flex items-center justify-end gap-2.5">
              <button type="button" onClick={closePreview} className={secondaryButton}>
                {t.cancel}
              </button>
              <button type="submit" disabled={busy || password === ''} className={primaryButton}>
                <Lock className="w-4 h-4" />
                {busy ? t.sending : t.signAndSend}
              </button>
            </div>
          </form>
        </div>
      )}
      {scanning && <QrScanner t={t} onText={scanned} onClose={() => setScanning(false)} />}
    </div>
  );
}
