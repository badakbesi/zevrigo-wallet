# MOD-15: Wallet App (`zevrigo-wallet`)

- **ID:** `MOD-15`
- **Path:** akar repo `zevrigo-wallet` (antarmuka), `src-tauri/` (crate Rust); sampai DEC-39 `apps/wallet` di repo inti
- **Paket:** `zevrigo-wallet` (pustaka `zevrigo_wallet_lib` + bin), antarmuka npm `zevrigo-wallet`
- **Status:** 🟢 v0.1: aplikasi desktop Tauri 2 untuk testnet dan regtest (TSK-M42), installer Windows NSIS (TSK-F07); 🟢 0.2.0 versi demo (TSK-M61); 🟢 0.2.1 kotak frasa dan hapus wallet, Android rilis (TSK-M58); 🟡 0.2.2 daftar alamat penerimaan (RENCANA_T8); 🟡 0.2.3 scan kode QR dan URI `zevrigo:` di Kirim (RENCANA_T10); 🟡 0.2.4 tautan explorer dan pesan galat lengkap (RENCANA_T9 F5, F6)
- **Bergantung pada:** `MOD-01` (`Amount`, `Network`), `MOD-09` (frasa baru, alamat), `MOD-12` (pustaka CLI, DEC-31)
- **Dipakai oleh:** —

## Tujuan

Wallet desktop untuk pengguna akhir: membuat atau memulihkan wallet, melihat saldo dan riwayat, menerima (alamat + QR),
dan mengirim ZVRG, dengan kunci hanya di komputer pengguna.

## Tanggung Jawab

- Antarmuka (`src/`, React + Vite + Tailwind CSS, zustand): enam layar, dua bahasa, tanpa simulasi, tanpa
  sumber dari internet. Jumlah koin tidak pernah `number`: teks angka quanta di IPC, `bigint` di antarmuka.
- Perintah IPC (`src-tauri/src/commands`): `wallet_info`, `new_phrase`, `restore_wallet`, `receive_address`,
  `new_address`, `list_addresses`, `chain_status`, `balance`, `history`, `send`, `reveal_phrase`, `delete_wallet`,
  `open_explorer_tx`. Semua lewat pustaka MOD-12, sehingga
  file wallet dan tembolok riwayat sama dengan CLI. Pekerjaan lama berjalan di utas sendiri.
- Wallet baru: frasa 24 kata dibuat backend dari sumber acak sistem operasi (`getrandom`), baru disimpan sesudah
  pengguna mengisi ulang 3 kata acak dari catatannya. File wallet selalu dikunci password (Argon2id penuh, DEC-27).
- Kotak frasa dan kata (0.2.1, TSK-M58): koreksi dan kapitalisasi otomatis keyboard dimatikan (`autoCorrect`,
  `autoCapitalize`, `spellCheck`), dan frasa yang diketik saat memulihkan ditampilkan per nomor (kata tak dikenal merah)
  untuk dicocokkan dengan catatan. Galat `bad_phrase` menjelaskan bahwa semua kata dikenal tetapi checksum tidak cocok.
- Hapus wallet dari perangkat (0.2.1, `delete_wallet`): password wajib (file wallet dibuka dulu), centang "sudah mencatat
  frasa"; tembolok `history.json` lalu `wallet.json` jaringan aktif dihapus, lalu layar wallet baru / pulihkan tampil.
- Daftar alamat penerimaan (0.2.2, `list_addresses`, RENCANA_T8): layar Terima menampilkan semua alamat penerimaan yang
  sudah dibuat (paling banyak 1.000 terbaru, indeks terbesar dulu), dengan tombol salin dan kode QR per alamat. Diturunkan
  dari kunci akun publik di file wallet (versi 1: dari frasa), tanpa password, tanpa node, tanpa mengubah file wallet.
  Tombol "Buat alamat tambahan" (dulu "Alamat baru") tetap memanggil `new_address`; alamat lama tidak hilang. Catatan gap
  limit 20 tampil sesudah lebih dari 20 alamat dibuat.
- Kirim dari kode QR atau URI (0.2.3, RENCANA_T10): kolom penerima menerima alamat polos atau URI
  `zevrigo:<alamat>[?amount=<ZVRG>]` (`src/lib/uri.ts`: alamat untuk jaringan aktif, jumlah bertitik desimal, parameter
  `req-*` ditolak); tombol "Scan QR" membuka kamera lewat `getUserMedia` di WebView (Android: izin CAMERA di manifest,
  diminta saat pertama dipakai; Windows: webcam) dan membaca kode dengan paket npm `jsqr` 1.4.0 (Apache-2.0, JavaScript
  murni, izin pencipta 20 November 2026), tanpa Google Play Services. Gambar kamera hanya diproses di perangkat.
- Tautan explorer (0.2.4, RENCANA_T9 F5): tombol "Explorer" di riwayat dan hasil kirim memanggil `open_explorer_tx`, yang
  menyusun sendiri tautan `https://demo-explorer.zevrigo.online/tx/?id=<txid>` (sejak 0.3.2; hanya regtest, txid 64 hex kecil) dan membukanya
  di browser sistem lewat `tauri-plugin-opener` 2.7.3 (izin pencipta 20 November 2026). Antarmuka tidak bisa membuka URL lain:
  wallet tanpa capabilities, dan skrip tautan JS plugin dimatikan. Bila gagal, tautan bisa disalin.
- Pesan galat lengkap (0.2.4, RENCANA_T9 F6): setiap kotak galat dari perintah Rust menampilkan teks terjemahan dan "Detail
  teknis" (keterangan Rust) yang bisa disalin; kotak offline juga. Tanpa detail untuk galat frasa dan password.
- Ikon aplikasi (0.2.1, DEC-40): `src-tauri/icons` dan ikon peluncur Android dari logo resmi `merek/` repo inti.
- Galat dikirim dengan kode tetap (`wrong_password`, `node_unreachable`, `insufficient_funds`, ...) dan diterjemahkan.
- Folder data: `%APPDATA%\Zevrigo` (Windows) atau `~/.zevrigo`, atau `ZEVRIGO_WALLET_DATADIR`.
- CSP ketat di `tauri.conf.json`: hanya sumber aplikasi sendiri dan IPC.
- Android (TSK-M58 bagian 1): isi aplikasi di pustaka `zevrigo_wallet_lib` (`src-tauri/src/lib.rs`, crate-type
  `staticlib`, `cdylib`, `rlib`); `run` adalah `tauri::mobile_entry_point`, program desktop memanggil `try_run`. Folder data
  Android = folder data aplikasi (`app_data_dir`, ikut terhapus saat aplikasi dihapus; frasa 24 kata tetap satu-satunya
  cadangan). HTTPS ke gerbang RPC diperiksa terhadap daftar akar sistem Android (rustls-platform-verifier, pilihan pencipta
  14 November 2026), disiapkan saat mulai dengan `init_with_env` dan konteks Activity dari `WebviewWindow::with_webview` +
  `jni_handle().exec` (tanpa kode `unsafe` di repo). Layar sempit memakai menu bawah lima tombol (`md:hidden`).
- Versi demo 0.2.0 (TSK-M61, DEC-34): jaringan bawaan regtest dengan node bawaan gerbang demo publik
  `https://demo-gerbang-rpc.zevrigo.online` (sejak 0.3.2, DEC-42; `wallet_default_rpc_url`; testnet tetap node lokal), pita "REGTEST" berisi
  peringatan koin demo, catatan privasi di Pengaturan, pesan offline khusus gerbang demo. Installer menampilkan
  `src-tauri/PRIVASI-DAN-LISENSI.txt` (`bundle.licenseFile`). Rilis dibangun `.github/workflows/rilis-wallet.yml` dari tag
  `wallet-v<versi>` (rilis draf + SHA256SUMS.txt); belum ditandatangani (DEC-07, `docs/code-signing-policy.md`).

## Bukan Tanggung Jawab

- Kriptografi, pemilihan koin, dan format file wallet (MOD-09, MOD-12). Mainnet (belum ada). Passphrase BIP39 tambahan
  (pakai CLI). iOS. Layanan kasir (MOD-16).

## Rilis pertama 0.3.0 (RENCANA_T9, pencipta 20 November 2026)

Fitur wajib F1 sampai F7 sebelum rilis publik: scan kode QR (F1) dan URI `zevrigo:` (F2) di Kirim, pratinjau biaya sebelum
password (F3, `preview_send` → MOD-12 `Cli::preview`), kirim semua saldo (F4, tombol "Semua" → MOD-09 `plan_sweep`), buka
transaksi di explorer (F5), pesan galat lengkap (F6), dan kunci aplikasi dengan password wallet (F7, `unlock_app`; layar kunci
saat dibuka, sesudah 1 menit di latar belakang, dan tombol Kunci; bisa dimatikan di Pengaturan). Kirim selalu lewat
pratinjau: `send` menerima jumlah dan biaya yang dilihat pengguna dan tidak menandatangani bila rencana baru berbeda
(`preview_changed`). Versi Android `versionCode` 3000. Versi uji 0.2.1 sampai 0.2.4 tidak pernah dirilis.

## 0.3.1 (21 November 2026, TSK-M70 repo inti)

Galat "RPC gagal: Request rejected `429`" pada wallet baru di Windows: gerbang RPC demo membatasi laju per pengunjung, dan riwayat
dipindai dari genesis tanpa jeda. Pustaka MOD-12 kini mencoba lagi panggilan yang dijawab `429` (sesudah 1 detik, paling banyak 8
kali) dan menyimpan tembolok riwayat setiap 100 blok. Antarmuka memuat status chain dan saldo dulu, lalu riwayat dengan galat
sendiri (`historyError`, komponen `HistoryError`): saldo tetap tampil dan status tetap terhubung bila hanya riwayat yang gagal.
Android `versionCode` 3001.

## 0.3.2 (22 November 2026, DEC-42)

Domain resmi `zevrigo.online`: node bawaan regtest `https://demo-gerbang-rpc.zevrigo.online` (`DEMO_RPC_URL`) dan explorer
`https://demo-explorer.zevrigo.online` (`DEMO_EXPLORER_URL`, `src/lib/explorer.ts`); teks privasi installer ikut. Alamat node yang
diisi sendiri di Pengaturan tidak berubah; pengguna dengan alamat bawaan langsung memakai gerbang baru. Wallet 0.3.1
tidak tersambung lagi sejak 28 November 2026. `ZEVRIGO_CORE_REF` rilis Windows = repo inti
`089ba15`. Android `versionCode` 3002.

## Uji

- Rust (`src-tauri/src/commands/tests.rs`): nama jaringan, teks quanta, kode galat, bentuk JSON saldo dan riwayat, frasa
  baru, alur file wallet (W1 → W5, alamat terakhir tetap, alamat baru W6, lihat frasa, password salah), hapus wallet
  (tanpa wallet, password salah: file tetap; password benar: wallet dan tembolok hilang, pulihkan lagi W5), daftar alamat
  (W5, lalu W6 + W5, lima alamat berurutan, JSON, file wallet tidak berubah, batas 1.000 dari 1.500 alamat), tautan explorer (hanya regtest dan txid 64 hex kecil), jumlah kirim dan tarif (`parse_spend`, `check_fee_rate`), JSON pratinjau, kode `preview_changed` dan `too_many_coins`, kunci aplikasi (tanpa wallet, password salah, password benar).
- Antarmuka (vitest, `src/lib/*.spec.ts`): jumlah ZVRG/quanta, alamat bech32m (vektor W5, W10, TESTNET_0), daftar kata
  BIP39 (sha256 sama dengan MOD-09, kata per nomor), penggolongan riwayat, URI dan kode QR, daftar alamat (alamat ringkas,
  catatan gap limit, teks berisian), URI pembayaran (alamat polos, URI layar Terima, huruf besar, jumlah dan parameter
  tidak sah, pesan galat), pembaca QR (gambar QR buatan `qrcode` dibaca `jsqr`, kode terbalik, gambar kosong, ukuran
  pemindaian), pesan galat (detail teknis, tanpa detail untuk frasa dan password), tautan explorer (sama dengan Rust), kunci aplikasi
  sesudah 1 menit di latar belakang.

## Task terkait
- [TSK-M42](../tasks/TSK-M42-wallet-desktop.md) — 🟢 aplikasi wallet desktop
- [TSK-F07](https://github.com/badakbesi/zevrigo/blob/main/docs/tasks/README.md) — 🟢 wallet desktop v0.1 (installer Windows, uji dengan node regtest 8 November 2026)
- [TSK-M61](../tasks/TSK-M61-wallet-demo.md) — 🟢 versi demo 0.2.0 dan workflow rilis
- [TSK-M58](../tasks/TSK-M58-apk-wallet.md) — 🟡 APK Wallet Android (bagian 1 kode, bagian 2 APK)
- [TSK-F08](https://github.com/badakbesi/zevrigo/blob/main/docs/tasks/README.md)
