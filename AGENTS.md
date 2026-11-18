# AGENTS.md: Zevrigo Wallet (MOD-15)

Wallet Zevrigo Coin untuk desktop (Windows, installer NSIS) dan Android (APK), Tauri 2 + React. Crate Rust `zevrigo-wallet` di
`src-tauri/`, antarmuka di `src/`. Bergantung pada MOD-01 `zevrigo-primitives`, MOD-09 `zevrigo-wallet-core`, dan MOD-12
`zevrigo-cli` (DEC-31) dari repo inti; dev: MOD-08 `zevrigo-rpc`.

## Hubungan dengan repo inti
Repo ini bagian dari **zevrigo_lab** (pemisahan repo 17 November 2026, AGENDA P1). Repo inti `zevrigo` di folder sebelah
(`../zevrigo`) adalah sumber kebenaran: parameter protokol, aturan konsensus, larangan mutlak, pembagian peran (DEC-16),
keputusan (`docs/decisions`), peta modul, dan penomoran DEC/MOD/TSK. **Baca `../zevrigo/AGENTS.md` dulu; semua aturannya
berlaku di sini.** Bila aturan di file ini dan di repo inti bertentangan, ikuti repo inti dan laporkan.

## Larangan mutlak (ringkas, rincian di repo inti)
- Tanpa `unsafe` dan tanpa floating point di kode proyek, termasuk test. `make check-forbidden` memeriksanya.
- Jumlah koin selalu `u128` quanta di Rust; di TypeScript `bigint` atau `string`, tidak pernah `number`.
- Aturan konsensus hanya di crate `zevrigo-consensus` repo inti. Repo ini tidak menulis aturan konsensus.
- Menambah atau mengubah versi dependensi wajib minta izin pencipta.

## Git
- Conventional Commits. Jangan `git push`, jangan force, jangan mengubah riwayat, remote, identitas, atau `git config`.
  Push dilakukan pencipta (DEC-32). Jangan memakai GitHub CLI atau akun online tanpa izin tertulis.
- Status sekarang: **belum repo git** (keputusan git menunggu pencipta).

## Perintah
```bash
make check-all      # fmt-check + lint + check-forbidden + test (crate src-tauri)
make wallet-check   # npm ci, typecheck, vitest, vite build ke dist/
npm run tauri build # aplikasi rilis dan installer
```

## Khusus repo ini
- File wallet dan perintah wallet lewat pustaka MOD-12 (`zevrigo-cli`), sama dengan CLI. Jangan menulis ulang kriptografi.
- Rilis Windows dari tag `wallet-v<versi>` (`.github/workflows/rilis-wallet.yml`), versi tag = `src-tauri/tauri.conf.json`.
  Penandatanganan: `docs/code-signing-policy.md` (SignPath, DEC-07).
- Android: kunci rilis milik pencipta di `~/.zevrigo-kunci` (di luar repo); agent tidak pernah menyentuhnya.

## Berhenti dan tanya bila
- Ada parameter protokol yang tampak salah, atau tugas butuh dependensi baru, `sudo`, atau perubahan di luar repo ini.
- Perlu mengubah crate di repo inti `zevrigo` (itu tugas terpisah di repo inti).
