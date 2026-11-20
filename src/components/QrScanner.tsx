/**
 * Layar pemindai kode QR untuk Kirim (RENCANA_T10, F1). Kamera lewat `getUserMedia` di WebView: di Android izin kamera
 * diminta Tauri saat pertama dipakai (izin CAMERA di manifest), di Windows memakai webcam. Setiap SCAN_INTERVAL_MS gambar
 * kamera diperkecil ke kanvas lalu dibaca `decodeQr` (jsqr). Teks yang ditemukan diserahkan ke `onText`: `null` berarti
 * diterima (kamera dimatikan, induk menutup layar), teks lain adalah pesan galat yang ditampilkan sementara pemindaian
 * berlanjut. Gambar kamera hanya diproses di perangkat: tidak disimpan dan tidak dikirim ke mana pun.
 */

import { Camera, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Dict } from '../lib/i18n';
import { SCAN_INTERVAL_MS, decodeQr, scanSize } from '../lib/scan';
import { ErrorBox, primaryButton } from './ui';

type Problem = 'denied' | 'missing' | 'unsupported' | 'failed';

function problemOf(error: unknown): Problem {
  const name =
    typeof error === 'object' && error !== null && 'name' in error ? String((error as { name: unknown }).name) : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return 'denied';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return 'missing';
  }
  return 'failed';
}

export function QrScanner({
  t,
  onText,
  onClose,
}: {
  t: Dict;
  onText: (text: string) => string | null;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onTextRef = useRef(onText);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [detail, setDetail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [needTap, setNeedTap] = useState(false);

  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let last = '';
    const canvas = document.createElement('canvas');
    const stop = () => {
      stopped = true;
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      for (const track of stream?.getTracks() ?? []) {
        track.stop();
      }
      stream = null;
    };
    const tick = () => {
      if (stopped) {
        return;
      }
      const video = videoRef.current;
      if (video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        const size = scanSize(video.videoWidth, video.videoHeight);
        if (canvas.width !== size.width || canvas.height !== size.height) {
          canvas.width = size.width;
          canvas.height = size.height;
        }
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (context && size.width > 0) {
          context.drawImage(video, 0, 0, size.width, size.height);
          const text = decodeQr(context.getImageData(0, 0, size.width, size.height).data, size.width, size.height);
          if (text !== null && text !== last) {
            last = text;
            const error = onTextRef.current(text);
            if (error === null) {
              stop();
              return;
            }
            setMessage(error);
          }
        }
      }
      timer = setTimeout(tick, SCAN_INTERVAL_MS);
    };
    const start = async () => {
      const media = typeof navigator === 'undefined' ? undefined : (navigator.mediaDevices as MediaDevices | undefined);
      if (media === undefined || typeof media.getUserMedia !== 'function') {
        setProblem('unsupported');
        setStarting(false);
        return;
      }
      try {
        const opened = await media.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
        if (stopped) {
          for (const track of opened.getTracks()) {
            track.stop();
          }
          return;
        }
        stream = opened;
        const video = videoRef.current;
        if (video) {
          video.srcObject = opened;
          try {
            await video.play();
          } catch {
            if (!stopped) {
              setNeedTap(true);
            }
          }
        }
        if (!stopped) {
          setStarting(false);
          tick();
        }
      } catch (error) {
        if (!stopped) {
          setProblem(problemOf(error));
          setDetail(String(error));
          setStarting(false);
        }
      }
    };
    void start();
    return stop;
  }, []);

  const tapToStart = () => {
    const video = videoRef.current;
    if (video) {
      video.play().then(
        () => setNeedTap(false),
        () => undefined,
      );
    }
  };

  const problemText =
    problem === 'denied'
      ? t.cameraDenied
      : problem === 'missing'
        ? t.cameraMissing
        : problem === 'unsupported'
          ? t.cameraUnsupported
          : t.cameraFailed;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.scanTitle}
      className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-slate-100 dark"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-800">
        <div className="inline-flex items-center gap-2 text-sm font-semibold">
          <Camera className="w-4 h-4 text-emerald-400" />
          {t.scanTitle}
        </div>
        <button type="button" onClick={onClose} aria-label={t.cancel} className="p-2 rounded-lg text-slate-300 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="relative flex-1 min-h-0 overflow-hidden bg-black">
        <video
          ref={videoRef}
          data-testid="scan-video"
          playsInline
          muted
          autoPlay
          className="absolute inset-0 w-full h-full object-cover"
        />
        {problem === null && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-64 h-64 max-w-[75vw] max-h-[75vw] rounded-2xl border-4 border-emerald-400 shadow-[0_0_0_9999px_rgba(2,6,23,0.55)]" />
          </div>
        )}
        {problem === null && (starting || needTap) && (
          <div className="absolute inset-0 flex items-center justify-center">
            {needTap ? (
              <button type="button" onClick={tapToStart} className={primaryButton}>
                {t.scanTapToStart}
              </button>
            ) : (
              <span className="text-sm text-slate-300">{t.scanStarting}</span>
            )}
          </div>
        )}
      </div>
      <div
        className="px-4 pt-4 space-y-3 border-t border-slate-800"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        {problem === null ? (
          <p className="text-xs text-slate-300">{t.scanHint}</p>
        ) : (
          <ErrorBox>
            <div>{problemText}</div>
            {detail && <div className="mt-1 font-mono break-all opacity-80">{detail}</div>}
          </ErrorBox>
        )}
        {problem === null && message && <ErrorBox>{message}</ErrorBox>}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-lg border border-slate-600 text-sm font-semibold text-slate-100 hover:bg-slate-800"
        >
          {t.cancel}
        </button>
      </div>
    </div>
  );
}
