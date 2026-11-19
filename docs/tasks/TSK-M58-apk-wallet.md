# TSK-M58 · APK Wallet Android (Tauri 2) · 🟡 bagian 1 dan 2 selesai · Prioritas: Tinggi
- **Jenis:** task modul · **Modul:** MOD-15 (`apps/wallet`) · **Untuk:** FTR-11 (DEC-34)
- **Bergantung pada:** TSK-M56 (alat build Android), TSK-M60 (HTTPS di MOD-08), TSK-M61 (wallet demo)
- **Ditulis:** Quick, 14 November 2026 (pencipta: "build wallet untuk versi android saja dulu"; HP uji Android arm64; HTTPS
  lewat daftar akar sistem Android)

## Bagian 1: kode (Q136)
| Bagian | Isi |
|---|---|
| Pustaka | `src-tauri/src/lib.rs` (`zevrigo_wallet_lib`, crate-type `staticlib`, `cdylib`, `rlib`): `try_run` (Builder, setup, 10 perintah IPC yang sama) dan `run` (`#[cfg_attr(mobile, tauri::mobile_entry_point)]`). `main.rs` desktop hanya memanggil `try_run` |
| Folder data | Desktop tidak berubah (`AppState::from_env`). Android: `app.path().app_data_dir()` lewat `AppState::new`, dibuat jika belum ada |
| HTTPS Android | Pilihan pencipta: daftar akar sistem Android. `rustls_platform_verifier::android::init_with_env(env, context)` dipanggil sekali di `setup`, dengan konteks Activity dari `WebviewWindow::with_webview` dan `PlatformWebview::jni_handle().exec` (API aman Tauri/wry; repo tetap tanpa `unsafe`). Ketergantungan langsung `rustls-platform-verifier = "=0.5.3"` hanya untuk `target_os = "android"`, paket yang sama dengan yang dibawa MOD-08 (DEC-10 bagian 14); Cargo.lock hanya bertambah satu rujukan |
| Tampilan HP | Layar di bawah `md` (768 px): menu atas disembunyikan, menu bawah lima tombol (tinggi 56 px, aman untuk area gestur), jarak tepi 16 px, alamat node dipatahkan. `viewport-fit=cover` |
| Gerbang | `make check-all` (desktop tidak berubah), `make wallet-check`, dan `cargo clippy --target aarch64-linux-android -p zevrigo-wallet --lib -- -D warnings` (juga `armv7-linux-androideabi` sejak 0.2.1) dengan clang NDK |

## Bagian 2: APK uji (Q137)
`npm run tauri android init` (proyek Gradle di `src-tauri/gen/android`), repository Maven lokal komponen Kotlin
rustls-platform-verifier-android 0.1.1 dan dependensinya di Gradle, `tauri android build --apk --debug --target aarch64`,
SHA-256 APK, lalu dipasang pencipta di HP. Dilanjutkan: kunci tanda tangan rilis (DEC-04 demo), tombol faucet, daftar
investor demo, output jenis 1.

## Hasil bagian 2 (Q137, Q137b)
APK uji `zevrigo-wallet-0.2.0-android-arm64-debug.apk` (201.907.294 byte, SHA-256
`85832eb1c550027cdc90977fb7c2ec5169a8b1746320f5089a6722fbf7e28a80`, minSdk 24, targetSdk 37, kunci debug). Lolos uji pencipta di
HP Android pada 15 November 2026. Tidak dibagikan.

## Bagian 3: APK rilis (Q143)
Kunci rilis dibuat pencipta di luar repo (`~/.zevrigo-kunci/zevrigo-wallet-rilis.p12`, PKCS12 RSA 4096, alias
`zevrigo-wallet`, `CN=Zevrigo Wallet, O=Zevrigo`, sidik sertifikat
`1575be5a086d9242ec0661108cba4fd71276d0e94a40bca33749f991e9e30c1a`). Build rilis tanpa tanda tangan
(`tauri android build --apk --target aarch64`, aturan R8 `-keep org.rustls.platformverifier.**` di proyek Gradle), lalu
pencipta menandatangani (zipalign halaman 16 KB, apksigner v2 + v3). APK 0.2.0 (17 November 2026, 17.156.361 byte, SHA-256
`591e4c2d…`) tidak dibagikan: uji pencipta menemukan masalah pemulihan frasa (bagian 4).

## Bagian 4: kotak frasa dan hapus wallet, versi 0.2.1 (Q147)
Uji pencipta 17 November 2026: frasa wallet APK uji ditolak `bad_phrase` di APK rilis. Kode pemulihan sama di debug dan
rilis (MOD-09 `Mnemonic::parse`, checksum BIP39); penyebab paling mungkin koreksi otomatis keyboard HP (kata BIP39 diganti
kata BIP39 lain, jadi tidak tertangkap sebagai kata tak dikenal) atau catatan yang keliru (wallet baru hanya memeriksa 3
dari 24 kata). Perbaikan: koreksi dan kapitalisasi otomatis dimatikan di kotak frasa dan kata, frasa ditampilkan per nomor,
pesan `bad_phrase` lebih jelas, dan perintah `delete_wallet` + kartu "Hapus wallet dari perangkat ini" di Pengaturan
(password + centang catatan frasa). Versi wallet 0.2.1 (desktop dan Android, versionCode 2001), sehingga APK 0.2.1 bisa
dipasang di atas 0.2.0 dengan kunci yang sama. Halaman `/unduh/` menunggu rilis `wallet-v0.2.1` (sha256 `null`).

## Bagian 5: rilis 0.2.1 dari repo bersih (Q155, RENCANA_T4)
Sesudah pemisahan repo (DEC-39) dan mulai bersih (DEC-08), proyek Gradle Q137/Q143 dipulihkan dari cadangan Q151 ke
`src-tauri/gen/android` (56 berkas sumber, tetap tidak di-commit; salinan di `C:\zevrigo_lab\arsip`). Ikon Windows dan ikon
peluncur Android diganti logo resmi (DEC-40). Rilis Windows dibangun dari repo inti commit `8eb670d` (dikunci di
`rilis-wallet.yml`). APK 0.2.1 dibangun tanpa tanda tangan lalu ditandatangani pencipta (`q155_tanda.sh`); rilis APK terpisah
dari rilis Windows (keputusan pencipta 19 November 2026). Sejak 0.2.1 satu APK memuat pustaka untuk HP 64-bit (`arm64-v8a`) dan
32-bit (`armeabi-v7a`), karena APK 0.2.0 yang hanya arm64 tidak bisa dipasang di HP 32-bit (pencipta 19 November 2026).
