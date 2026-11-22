# Zevrigo Wallet (MOD-15)

Wallet Zevrigo Coin untuk desktop dan Android, testnet dan regtest: Tauri 2 dengan antarmuka React (DEC-31, TSK-M42, TSK-M58).

Repo ini bagian dari **zevrigo_lab**: crate inti (`zevrigo-primitives`, `zevrigo-wallet-core`, `zevrigo-cli`, `zevrigo-rpc`)
dari repo inti `zevrigo` di folder sebelah (`../zevrigo`). Aturan proyek: [AGENTS.md](AGENTS.md).

## Code signing policy
Lihat [docs/code-signing-policy.md](docs/code-signing-policy.md).

- `src/`: antarmuka (React 19, Vite, Tailwind CSS, zustand). Enam layar: wallet baru / pulihkan, Ringkasan, Terima
  (alamat + QR), Kirim, Riwayat, Pengaturan. Dua bahasa (Indonesia, Inggris). Tanpa simulasi dan tanpa sumber dari
  internet (font sistem, ikon dibundel).
- `src-tauri/`: crate Rust `zevrigo-wallet` (satu-satunya anggota workspace repo ini; crate inti dari `../zevrigo`). Perintah IPC di `src/commands` memakai pustaka MOD-12
  `zevrigo-cli`, sehingga file wallet sama dengan CLI: `<folder data>/<jaringan>/wallet.json` (terenkripsi Argon2id +
  XChaCha20-Poly1305, DEC-27) dan tembolok riwayat `history.json`.

Folder data bawaan: `%APPDATA%\Zevrigo` (Windows) atau `~/.zevrigo` (sistem lain); ganti dengan variabel
`ZEVRIGO_WALLET_DATADIR`. Untuk memakai wallet yang sama dari CLI: `zevrigo-cli --testnet --datadir <folder data> ...`.

Aturan jumlah koin: tidak pernah memakai `number` (floating point). Lewat IPC jumlah berupa teks angka quanta, di
antarmuka berupa `bigint` (`src/lib/quanta.ts`).

## Perintah

```bash
npm ci --ignore-scripts --no-audit --no-fund   # paket dari package-lock.json
npm run check                                   # typecheck, test (vitest), build ke dist/
npm run tauri build                             # aplikasi rilis dan installer (Windows: NSIS)
```

`make wallet-check` menjalankan hal yang sama; crate Rust: `make check-all`. di Linux butuh paket WebKitGTK
(`libwebkit2gtk-4.1-dev`, `librsvg2-dev`, `libxdo-dev`, `libayatana-appindicator3-dev`).

## Installer Windows

Dibangun di Windows (DEC-31 pilihan A) dengan Rust MSVC, Node.js 22.12 atau lebih baru, Microsoft C++ Build Tools, dan
WebView2. Pakai salinan bersih di luar repo (misalnya `git archive HEAD`), karena `node_modules` versi Windows berbeda dari
versi Linux dan `.cargo/config.toml` lokal memakai jalur Linux. Di PowerShell, dari salinan itu:

```powershell
$env:CARGO_TARGET_DIR = 'C:\zevrigo-build\target'
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run tauri -- build -- --locked
```

Hasilnya `<CARGO_TARGET_DIR>\release\bundle\nsis\Zevrigo Wallet_<versi>_x64-setup.exe`. Installer belum ditandatangani
(DEC-07), sehingga Windows SmartScreen menampilkan peringatan. Installer menampilkan kebijakan privasi dan lisensi
(`src-tauri/PRIVASI-DAN-LISENSI.txt`, `bundle.licenseFile`) sebelum memasang.

Rilis resmi dibangun GitHub Actions (`.github/workflows/rilis-wallet.yml`) saat tag `wallet-v<versi>` di-push; versi tag
wajib sama dengan `version` di `src-tauri/tauri.conf.json`. Workflow membuat rilis draf berisi
`zevrigo-wallet-<versi>-x64-setup.exe` dan `SHA256SUMS.txt` (catatan dari `rilis-catatan.md`); pencipta memeriksa lalu
menerbitkannya. Aturan penandatanganan: `docs/code-signing-policy.md`.

Sejak 0.2.0 (TSK-M61) jaringan bawaan wallet adalah **Regtest**, jaringan demo publik (DEC-34): node bawaannya gerbang
RPC `https://demo-gerbang-rpc.zevrigo.online` (MOD-18; sejak 0.3.2, domain resmi DEC-42; 0.3.1 memakai `zevrigo-rpc.ratuaurion.store`), dengan pita "REGTEST" dan catatan privasi di Pengaturan. Untuk
testnet, wallet butuh node di komputer sendiri, misalnya `zevrigo-node --testnet` (RPC bawaan `http://127.0.0.1:18801`).
Alamat node bisa diubah di Pengaturan, misalnya `http://127.0.0.1:28801` untuk `zevrigo-node --regtest`. Node di WSL2 bisa
dihubungi dari wallet Windows lewat `127.0.0.1`.

## Android (TSK-M58)

Isi aplikasi ada di pustaka `zevrigo_wallet_lib` (`src-tauri/src/lib.rs`), dipakai program desktop dan aplikasi Android.
Di Android, wallet disimpan di folder data aplikasi (ikut terhapus bila aplikasi dihapus: simpan 24 kata pemulihan), dan
sertifikat HTTPS gerbang RPC diperiksa terhadap daftar akar sistem Android (rustls-platform-verifier). Alat build Android di
WSL ada di `~/android` (`source ~/.zevrigo-android.env`, TSK-M56). Pemeriksaan kode Android tanpa membangun APK:

```bash
source ~/.zevrigo-android.env
B="$NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin"
CC_aarch64_linux_android="$B/aarch64-linux-android24-clang" AR_aarch64_linux_android="$B/llvm-ar" \
CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$B/aarch64-linux-android24-clang" \
  cargo clippy --target aarch64-linux-android -p zevrigo-wallet --lib -- -D warnings
# HP 32-bit (sekali: rustup target add armv7-linux-androideabi)
CC_armv7_linux_androideabi="$B/armv7a-linux-androideabi24-clang" AR_armv7_linux_androideabi="$B/llvm-ar" \
CARGO_TARGET_ARMV7_LINUX_ANDROIDEABI_LINKER="$B/armv7a-linux-androideabi24-clang" \
  cargo clippy --target armv7-linux-androideabi -p zevrigo-wallet --lib -- -D warnings
```

Proyek Gradle Android (`src-tauri/gen/android`) tidak di-commit: berisi jalur mutlak alat build di PC pencipta (repository
Maven lokal komponen Kotlin rustls-platform-verifier, wrapper Gradle lokal) dan aturan R8 `app/zevrigo-rustls.pro`. Salinannya
di luar repo: `C:\zevrigo_lab\arsip\zevrigo-wallet-android-gen.tar.gz`. APK rilis (satu APK untuk HP 64-bit `arm64-v8a`
dan 32-bit `armeabi-v7a`, Android 7.0 ke atas) dibangun tanpa tanda tangan
(`npx tauri android build --apk --target aarch64 armv7`), lalu ditandatangani pencipta dengan kunci rilis di luar repo (sidik
sertifikat di [SUMBER_RESMI.md](https://github.com/badakbesi/zevrigo/blob/main/SUMBER_RESMI.md)).

## Ikon

Ikon aplikasi (`src-tauri/icons`, ikon peluncur Android `mipmap-*`) diturunkan dari logo resmi
`merek/zevrigo-ikon-aplikasi-1024.png` dan `merek/zevrigo-tanda-1024.png` repo inti (DEC-40), tanpa mengubah warna dan bentuk.

