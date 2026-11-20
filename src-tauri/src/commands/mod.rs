//! Perintah IPC wallet desktop (MOD-15, DEC-31).
//!
//! Setiap perintah memakai pustaka MOD-12 `zevrigo-cli` dengan folder data [`AppState`]. Pekerjaan yang lama (Argon2id,
//! RPC ke node, pemindaian riwayat) berjalan di utas sendiri, tidak di utas jendela. Galat dikirim ke antarmuka sebagai
//! [`CommandError`] dengan kode tetap untuk diterjemahkan. Jumlah koin selalu teks angka quanta. Kirim selalu lewat
//! pratinjau dulu (`preview_send`, RENCANA_T9 F3), dan aplikasi bisa dikunci dengan password wallet (`unlock_app`, F7).

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::State;
use tauri_plugin_opener::OpenerExt as _;
use zeroize::Zeroizing;
use zevrigo_cli::{
    Balance, Cli, CliError, Expected, History, HistoryEntry, Preview, Protection, Sent, Spend,
    WalletFileError, check_new_password, default_rpc_url, history_path, load_network, network_name,
    next_address, os_random, show_phrase, wallet_path, wallet_restore,
};
use zevrigo_primitives::{Amount, Network, OutputKind};
use zevrigo_wallet_core::{
    HARDENED, KdfParams, Mnemonic, NONCE_LEN, RECEIVE_BRANCH, SALT_LEN, SendError, account_key,
    encode_address,
};

/// Variabel lingkungan untuk memilih folder data wallet (misalnya folder yang sama dengan `--datadir` CLI).
pub const DATADIR_ENV: &str = "ZEVRIGO_WALLET_DATADIR";

/// Gerbang RPC publik jaringan demo regtest (DEC-34, TSK-M53): alamat node bawaan wallet untuk regtest (TSK-M61).
pub const DEMO_RPC_URL: &str = "https://zevrigo-rpc.ratuaurion.store";

/// Alamat node bawaan wallet: regtest memakai gerbang demo publik [`DEMO_RPC_URL`], jaringan lain node di komputer sendiri
/// (alamat bawaan CLI). Pengguna bisa menggantinya di Pengaturan.
#[must_use]
pub fn wallet_default_rpc_url(network: Network) -> String {
    match network {
        Network::Regtest => DEMO_RPC_URL.to_owned(),
        Network::Testnet | Network::Mainnet => default_rpc_url(network),
    }
}

/// Folder data wallet. File wallet per jaringan ada di `<datadir>/<jaringan>/wallet.json`.
pub struct AppState {
    datadir: PathBuf,
}

impl AppState {
    /// Folder dari [`DATADIR_ENV`], atau bawaan: `%APPDATA%\Zevrigo` di Windows, `$HOME/.zevrigo` di sistem lain.
    /// `None` jika variabel lingkungan yang dibutuhkan tidak ada. Hanya desktop; Android memakai [`AppState::new`].
    #[cfg_attr(target_os = "android", allow(dead_code))]
    pub fn from_env() -> Option<Self> {
        let datadir = match std::env::var_os(DATADIR_ENV).filter(|dir| !dir.is_empty()) {
            Some(dir) => PathBuf::from(dir),
            None => default_datadir()?,
        };
        Some(Self::new(datadir))
    }

    /// Folder data tertentu, misalnya folder data aplikasi Android (TSK-M58).
    #[must_use]
    pub const fn new(datadir: PathBuf) -> Self {
        Self { datadir }
    }
}

#[cfg_attr(target_os = "android", allow(dead_code))]
fn default_datadir() -> Option<PathBuf> {
    let (variable, folder) = if cfg!(windows) {
        ("APPDATA", "Zevrigo")
    } else {
        ("HOME", ".zevrigo")
    };
    std::env::var_os(variable)
        .filter(|dir| !dir.is_empty())
        .map(|dir| PathBuf::from(dir).join(folder))
}

/// Galat perintah untuk antarmuka: `code` tetap (diterjemahkan antarmuka), `message` keterangan dari MOD-12.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct CommandError {
    /// Kode galat, misalnya `wrong_password` atau `node_unreachable`.
    pub code: &'static str,
    /// Keterangan lengkap.
    pub message: String,
}

impl CommandError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

impl From<CliError> for CommandError {
    fn from(error: CliError) -> Self {
        Self::new(error_code(&error), error.to_string())
    }
}

impl From<WalletFileError> for CommandError {
    fn from(error: WalletFileError) -> Self {
        Self::from(CliError::from(error))
    }
}

/// Kode galat tetap untuk galat MOD-12.
#[must_use]
pub fn error_code(error: &CliError) -> &'static str {
    match error {
        CliError::WrongPassword => "wrong_password",
        CliError::PasswordTooShort => "password_too_short",
        CliError::PasswordMismatch => "password_mismatch",
        CliError::WrongNetwork { .. } => "wrong_network",
        CliError::Rpc { .. } => "node_unreachable",
        CliError::Rejected { .. } => "rejected",
        CliError::PreviewChanged { .. } => "preview_changed",
        CliError::Send(SendError::InsufficientFunds { .. }) => "insufficient_funds",
        CliError::Send(SendError::TooLarge { .. }) => "too_many_coins",
        CliError::Send(SendError::ZeroAmount) => "bad_amount",
        CliError::Send(_) => "send_failed",
        CliError::Address(_) => "bad_address",
        CliError::Mnemonic(_) | CliError::PassphraseMismatch => "bad_phrase",
        CliError::File(WalletFileError::Exists { .. }) => "wallet_exists",
        CliError::File(WalletFileError::Missing { .. }) => "wallet_missing",
        CliError::File(_) => "wallet_file",
        CliError::ChainChanged => "chain_changed",
        CliError::History(_) | CliError::HistoryFile { .. } => "history_failed",
        _ => "failed",
    }
}

/// Jaringan dari nama antarmuka: hanya `testnet` dan `regtest`.
///
/// # Errors
///
/// Kode `network` untuk nama lain.
pub fn parse_network(name: &str) -> Result<Network, CommandError> {
    match name {
        "testnet" => Ok(Network::Testnet),
        "regtest" => Ok(Network::Regtest),
        _ => Err(CommandError::new(
            "network",
            format!("jaringan tidak dikenal: {name} (pilih testnet atau regtest)"),
        )),
    }
}

/// Jumlah quanta dari teks angka desimal tanpa nol di depan, minimal 1.
///
/// # Errors
///
/// Kode `bad_amount` untuk teks lain atau nilai di atas `u128`.
pub fn parse_quanta(text: &str) -> Result<Amount, CommandError> {
    let bad = || CommandError::new("bad_amount", format!("jumlah quanta tidak sah: {text}"));
    let digits_only = !text.is_empty() && text.bytes().all(|byte| byte.is_ascii_digit());
    if !digits_only || (text.len() > 1 && text.starts_with('0')) {
        return Err(bad());
    }
    let quanta: u128 = text.parse().map_err(|_| bad())?;
    if quanta == 0 {
        return Err(bad());
    }
    Ok(Amount::from_quanta(quanta))
}

/// Jumlah kirim dari antarmuka (RENCANA_T9 F4): `all` = semua saldo yang bisa dipakai (teks jumlah diabaikan), selain itu
/// teks quanta [`parse_quanta`].
///
/// # Errors
///
/// Kode `bad_amount`.
pub fn parse_spend(amount: &str, all: bool) -> Result<Spend, CommandError> {
    if all {
        return Ok(Spend::All);
    }
    Ok(Spend::Amount(parse_quanta(amount)?))
}

/// Tarif biaya dari antarmuka: minimal 1 quanta per byte.
///
/// # Errors
///
/// Kode `bad_fee` untuk 0.
pub fn check_fee_rate(fee_rate: u64) -> Result<u128, CommandError> {
    if fee_rate == 0 {
        return Err(CommandError::new(
            "bad_fee",
            "tarif biaya minimal 1 quanta per byte",
        ));
    }
    Ok(u128::from(fee_rate))
}

fn quanta(amount: Amount) -> String {
    amount.as_quanta().to_string()
}

/// Keadaan file wallet satu jaringan.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WalletInfo {
    /// File wallet sudah ada.
    pub exists: bool,
    /// Path file wallet.
    pub path: String,
    /// Alamat RPC bawaan node jaringan ini ([`wallet_default_rpc_url`]).
    pub default_rpc_url: String,
}

/// Ringkasan chain dari node.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChainStatus {
    /// Nama jaringan node.
    pub network: String,
    /// Tinggi ujung chain.
    pub height: u64,
    /// ID blok ujung (hex).
    pub best_block_id: String,
}

/// Saldo wallet ([`Balance`]) dengan jumlah sebagai teks quanta.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BalanceView {
    /// Tinggi ujung chain.
    pub tip_height: u64,
    /// Semua UTXO milik wallet di chain.
    pub total: String,
    /// Bisa dipakai di blok berikutnya.
    pub spendable: String,
    /// Coinbase yang belum matang.
    pub immature: String,
    /// UTXO yang sedang dibelanjakan transaksi di mempool.
    pub pending_spent: String,
    /// Output transaksi di mempool ke alamat wallet.
    pub pending_received: String,
    /// Saldo setelah semua transaksi tertunda masuk blok.
    pub after_pending: String,
    /// Jumlah UTXO milik wallet.
    pub utxos: usize,
}

impl From<&Balance> for BalanceView {
    fn from(balance: &Balance) -> Self {
        Self {
            tip_height: balance.tip_height,
            total: quanta(balance.total),
            spendable: quanta(balance.spendable),
            immature: quanta(balance.immature),
            pending_spent: quanta(balance.pending_spent),
            pending_received: quanta(balance.pending_received),
            after_pending: quanta(balance.after_pending),
            utxos: balance.utxos,
        }
    }
}

/// Satu entri riwayat ([`HistoryEntry`]) dengan jumlah sebagai teks quanta.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntryView {
    /// Txid (hex).
    pub txid: String,
    /// Tinggi blok, `null` untuk transaksi tertunda.
    pub height: Option<u64>,
    /// Cap waktu blok (detik Unix), `null` untuk transaksi tertunda.
    pub timestamp: Option<u64>,
    /// Hadiah tambang.
    pub coinbase: bool,
    /// Jumlah output ke alamat wallet (termasuk kembalian).
    pub received: String,
    /// Jumlah koin wallet yang dibelanjakan.
    pub spent: String,
    /// Biaya, jika diketahui.
    pub fee: Option<String>,
}

impl From<&HistoryEntry> for HistoryEntryView {
    fn from(entry: &HistoryEntry) -> Self {
        Self {
            txid: String::from(entry.txid),
            height: entry.height,
            timestamp: entry.timestamp,
            coinbase: entry.coinbase,
            received: quanta(entry.received),
            spent: quanta(entry.spent),
            fee: entry.fee.map(quanta),
        }
    }
}

/// Riwayat wallet ([`History`]), entri terbaru dulu.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryView {
    /// Tinggi ujung chain saat dipindai.
    pub tip_height: u64,
    /// Entri riwayat.
    pub entries: Vec<HistoryEntryView>,
}

impl From<&History> for HistoryView {
    fn from(history: &History) -> Self {
        Self {
            tip_height: history.tip_height,
            entries: history.entries.iter().map(HistoryEntryView::from).collect(),
        }
    }
}

/// Hasil kirim ([`Sent`]) dengan jumlah sebagai teks quanta.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SentView {
    /// Txid dari node.
    pub txid: String,
    /// Jumlah yang diterima penerima.
    pub amount: String,
    /// Biaya.
    pub fee: String,
    /// Kembalian, jika ada.
    pub change: Option<String>,
    /// Jumlah input.
    pub inputs: usize,
    /// Ukuran transaksi dalam byte.
    pub size: usize,
}

impl From<&Sent> for SentView {
    fn from(sent: &Sent) -> Self {
        Self {
            txid: String::from(sent.txid),
            amount: quanta(sent.amount),
            fee: quanta(sent.fee),
            change: sent.change.map(quanta),
            inputs: sent.inputs,
            size: sent.size,
        }
    }
}

/// Pratinjau kirim ([`Preview`], RENCANA_T9 F3) dengan jumlah sebagai teks quanta. Total keluar dihitung antarmuka
/// (jumlah + biaya, bigint).
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewView {
    /// Jumlah yang diterima penerima.
    pub amount: String,
    /// Biaya.
    pub fee: String,
    /// Kembalian, jika ada.
    pub change: Option<String>,
    /// Jumlah input.
    pub inputs: usize,
    /// Ukuran transaksi dalam byte.
    pub size: usize,
    /// Tinggi ujung chain saat dihitung.
    pub tip_height: u64,
}

impl From<&Preview> for PreviewView {
    fn from(preview: &Preview) -> Self {
        Self {
            amount: quanta(preview.amount),
            fee: quanta(preview.fee),
            change: preview.change.map(quanta),
            inputs: preview.inputs,
            size: preview.size,
            tip_height: preview.tip_height,
        }
    }
}

/// Keadaan file wallet `network` di `datadir`.
#[must_use]
pub fn wallet_info_in(datadir: &Path, network: Network) -> WalletInfo {
    let path = wallet_path(network, datadir);
    WalletInfo {
        exists: path.is_file(),
        path: path.display().to_string(),
        default_rpc_url: wallet_default_rpc_url(network),
    }
}

/// Frasa pemulihan baru 24 kata dari sumber acak sistem operasi. Belum disimpan: file wallet baru dibuat
/// [`restore_in`] setelah pengguna memeriksa catatannya.
///
/// # Errors
///
/// Sumber acak sistem operasi gagal dibaca.
pub fn new_phrase_words() -> Result<String, CommandError> {
    let entropy = Zeroizing::new(os_random()?);
    let mnemonic = Mnemonic::from_entropy(entropy.as_slice()).map_err(CliError::from)?;
    Ok(mnemonic.phrase().to_owned())
}

fn prefix<const N: usize>(bytes: &[u8; 32]) -> [u8; N] {
    let mut out = [0_u8; N];
    for (slot, byte) in out.iter_mut().zip(bytes) {
        *slot = *byte;
    }
    out
}

/// Membuat file wallet terenkripsi dari `phrase` (tanpa passphrase BIP39), lalu mengembalikan alamat penerimaan
/// pertama. Password minimal 8 karakter dan wajib sama dengan `confirm`.
///
/// # Errors
///
/// `password_too_short`, `password_mismatch`, `bad_phrase`, `wallet_exists`, atau galat file wallet.
pub fn restore_in(
    datadir: &Path,
    network: Network,
    phrase: &str,
    password: &str,
    confirm: &str,
) -> Result<String, CommandError> {
    check_new_password(password, confirm)?;
    let protection = Protection {
        password,
        kdf: KdfParams::DEFAULT,
        salt: prefix::<SALT_LEN>(&os_random()?),
        nonce: prefix::<NONCE_LEN>(&os_random()?),
    };
    wallet_restore(network, datadir, phrase, "", &protection)?;
    receive_address_in(datadir, network)
}

/// Alamat penerimaan terakhir yang sudah dibagikan (tanpa menaikkan indeks), atau alamat pertama untuk wallet yang
/// belum pernah membagikan alamat.
///
/// # Errors
///
/// Galat file wallet atau turunan kunci.
pub fn receive_address_in(datadir: &Path, network: Network) -> Result<String, CommandError> {
    let file = load_network(network, &wallet_path(network, datadir))?;
    if let (Some(index), Some(account)) = (file.next_index.receive.checked_sub(1), file.account()?)
        && let Ok(child) = account.derive_path(&[RECEIVE_BRANCH, index])
    {
        return Ok(encode_address(
            network,
            OutputKind::SingleKey,
            &child.x_only(),
        ));
    }
    Ok(next_address(network, datadir, "")?)
}

/// Alamat penerimaan baru (indeks berikutnya), sama dengan perintah CLI `address`.
///
/// # Errors
///
/// Galat file wallet atau turunan kunci.
pub fn new_address_in(datadir: &Path, network: Network) -> Result<String, CommandError> {
    Ok(next_address(network, datadir, "")?)
}

/// Explorer resmi jaringan demo regtest (`SUMBER_RESMI.md` repo inti). Testnet belum punya explorer publik.
pub const DEMO_EXPLORER_URL: &str = "https://zevrigo.ratuaurion.store";

/// Tautan halaman transaksi `txid` di explorer resmi jaringan `network` (RENCANA_T9 F5): hanya regtest, dan hanya txid 64
/// huruf hex kecil, jadi tautan tidak bisa dibelokkan ke alamat lain.
///
/// # Errors
///
/// `no_explorer` untuk jaringan tanpa explorer publik, `bad_txid` untuk txid yang tidak sah.
pub fn explorer_tx_url(network: Network, txid: &str) -> Result<String, CommandError> {
    if !matches!(network, Network::Regtest) {
        return Err(CommandError::new(
            "no_explorer",
            format!(
                "jaringan {} belum punya explorer publik",
                network_name(network)
            ),
        ));
    }
    let valid = txid.len() == 64
        && txid
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase());
    if !valid {
        return Err(CommandError::new(
            "bad_txid",
            "txid harus 64 huruf hex kecil",
        ));
    }
    Ok(format!("{DEMO_EXPLORER_URL}/tx/?id={txid}"))
}

/// Paling banyak alamat penerimaan (yang terbaru) yang dikirim [`list_addresses_in`] ke antarmuka.
pub const MAX_LISTED_ADDRESSES: u32 = 1_000;

/// Satu alamat penerimaan wallet di daftar layar Terima.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddressView {
    /// Indeks di cabang penerimaan (`m/44'/coin'/0'/0/<index>`).
    pub index: u32,
    /// Alamat bech32m jenis 0.
    pub address: String,
}

/// Alamat penerimaan yang sudah dibuat wallet, terbaru dulu.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddressList {
    /// Jumlah alamat penerimaan yang sudah dibuat (indeks berikutnya di file wallet).
    pub total: u32,
    /// Paling banyak [`MAX_LISTED_ADDRESSES`] alamat terbaru, indeks terbesar dulu.
    pub addresses: Vec<AddressView>,
}

/// Alamat penerimaan yang sudah dibuat (indeks 0 sampai sebelum indeks berikutnya di file wallet), terbaru dulu, untuk
/// daftar di layar Terima (RENCANA_T8, pencipta 19 November 2026). Diturunkan dari kunci akun publik di file wallet
/// (versi 2) atau dari frasa (versi 1), jadi tanpa password dan tanpa node. File wallet tidak diubah dan indeks tidak
/// dinaikkan. Indeks yang turunannya tidak sah dilewati, seperti pemindaian MOD-12.
///
/// # Errors
///
/// Galat file wallet atau turunan kunci.
pub fn list_addresses_in(datadir: &Path, network: Network) -> Result<AddressList, CommandError> {
    let file = load_network(network, &wallet_path(network, datadir))?;
    let account = match file.account()? {
        Some(account) => account,
        None => {
            let seed = file.mnemonic()?.to_seed("").map_err(CliError::from)?;
            account_key(&seed, network)
                .and_then(|key| key.to_public())
                .map_err(CliError::from)?
        }
    };
    let branch = account
        .derive_child(RECEIVE_BRANCH)
        .map_err(CliError::from)?;
    let total = file.next_index.receive.min(HARDENED);
    let first = total.saturating_sub(MAX_LISTED_ADDRESSES);
    let addresses = (first..total)
        .rev()
        .filter_map(|index| {
            branch.derive_child(index).ok().map(|child| AddressView {
                index,
                address: encode_address(network, OutputKind::SingleKey, &child.x_only()),
            })
        })
        .collect();
    Ok(AddressList { total, addresses })
}

/// Frasa pemulihan wallet, dibuka dengan password.
///
/// # Errors
///
/// `wrong_password` atau galat file wallet.
pub fn reveal_in(datadir: &Path, network: Network, password: &str) -> Result<String, CommandError> {
    let phrase = show_phrase(network, datadir, password)?;
    Ok(phrase.as_str().to_owned())
}

/// Membuka kunci aplikasi (RENCANA_T9 F7): password wallet `network` diperiksa dengan membuka frasa (Argon2id), lalu
/// frasa langsung dibuang dari memori. Tidak ada yang dikirim ke antarmuka selain berhasil atau galat.
///
/// # Errors
///
/// `wrong_password`, `wallet_missing`, atau galat file wallet.
pub fn unlock_in(datadir: &Path, network: Network, password: &str) -> Result<(), CommandError> {
    let _unlocked = show_phrase(network, datadir, password)?;
    Ok(())
}

/// Menghapus wallet `network` dari perangkat ini (TSK-M58): tembolok riwayat `history.json`, lalu file wallet. Password
/// wajib benar (file wallet dibuka dulu dengan Argon2id), jadi wallet tidak bisa dihapus tanpa pemiliknya. Koin tetap
/// ada di chain dan kembali lewat pemulihan dari frasa; tanpa frasa, wallet yang dihapus tidak bisa dikembalikan.
///
/// # Errors
///
/// `wrong_password`, `wallet_missing`, atau `wallet_file` jika berkas tidak bisa dihapus.
pub fn delete_in(datadir: &Path, network: Network, password: &str) -> Result<(), CommandError> {
    let _unlocked = show_phrase(network, datadir, password)?;
    let history = history_path(network, datadir);
    match std::fs::remove_file(&history) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            return Err(CommandError::new(
                "wallet_file",
                format!(
                    "tembolok riwayat {} tidak bisa dihapus: {error}",
                    history.display()
                ),
            ));
        }
    }
    let wallet = wallet_path(network, datadir);
    std::fs::remove_file(&wallet).map_err(|error| {
        CommandError::new(
            "wallet_file",
            format!(
                "file wallet {} tidak bisa dihapus: {error}",
                wallet.display()
            ),
        )
    })
}

fn chain_status_at(rpc_url: &str, network: Network) -> Result<ChainStatus, CommandError> {
    let info = Cli::connect(rpc_url, network)?.info()?;
    let actual = String::from(info.network);
    let expected = network_name(network);
    if actual != expected {
        return Err(CliError::WrongNetwork {
            expected: expected.to_owned(),
            actual,
        }
        .into());
    }
    Ok(ChainStatus {
        network: actual,
        height: info.height,
        best_block_id: String::from(info.best_block_id),
    })
}

fn preview_at(
    datadir: &Path,
    network: Network,
    rpc_url: &str,
    to: &str,
    amount: &str,
    all: bool,
    fee_rate: u64,
) -> Result<PreviewView, CommandError> {
    let spend = parse_spend(amount, all)?;
    let fee_rate = check_fee_rate(fee_rate)?;
    let preview =
        Cli::connect(rpc_url, network)?.preview(datadir, "", to.trim(), spend, fee_rate)?;
    Ok(PreviewView::from(&preview))
}

#[allow(clippy::too_many_arguments)]
fn send_at(
    datadir: &Path,
    network: Network,
    rpc_url: &str,
    password: &str,
    to: &str,
    amount: &str,
    all: bool,
    fee_rate: u64,
    expected_amount: &str,
    expected_fee: &str,
) -> Result<SentView, CommandError> {
    let spend = parse_spend(amount, all)?;
    let fee_rate = check_fee_rate(fee_rate)?;
    let expected = Expected {
        amount: parse_quanta(expected_amount)?,
        fee: parse_quanta(expected_fee)?,
    };
    let aux_rand = Zeroizing::new(os_random()?);
    let cli = Cli::connect(rpc_url, network)?;
    let sent = cli.send_spend(
        datadir,
        "",
        password,
        to.trim(),
        spend,
        fee_rate,
        Some(expected),
        &aux_rand,
    )?;
    Ok(SentView::from(&sent))
}

/// Menjalankan pekerjaan wallet di utas sendiri tanpa konteks runtime Tauri (MOD-12 memakai runtime tokio sendiri).
async fn run_blocking<T, F>(job: F) -> Result<T, CommandError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, CommandError> + Send + 'static,
{
    let stopped = || CommandError::new("failed", "pekerjaan wallet berhenti tak terduga");
    tauri::async_runtime::spawn_blocking(move || {
        std::thread::spawn(job)
            .join()
            .unwrap_or_else(|_| Err(stopped()))
    })
    .await
    .map_err(|_| stopped())?
}

/// `wallet_info`: apakah file wallet jaringan ini sudah ada, path-nya, dan alamat RPC bawaan.
///
/// # Errors
///
/// Kode `network`.
#[tauri::command]
pub fn wallet_info(
    state: State<'_, AppState>,
    network: String,
) -> Result<WalletInfo, CommandError> {
    let network = parse_network(&network)?;
    Ok(wallet_info_in(&state.datadir, network))
}

/// `new_phrase`: frasa baru 24 kata (belum disimpan).
///
/// # Errors
///
/// Sumber acak gagal.
#[tauri::command]
pub async fn new_phrase() -> Result<String, CommandError> {
    run_blocking(new_phrase_words).await
}

/// `restore_wallet`: membuat file wallet terenkripsi dari frasa (wallet baru atau pemulihan).
///
/// # Errors
///
/// Lihat [`restore_in`].
#[tauri::command]
pub async fn restore_wallet(
    state: State<'_, AppState>,
    network: String,
    phrase: String,
    password: String,
    confirm: String,
) -> Result<String, CommandError> {
    let network = parse_network(&network)?;
    let datadir = state.datadir.clone();
    let phrase = Zeroizing::new(phrase);
    let password = Zeroizing::new(password);
    let confirm = Zeroizing::new(confirm);
    run_blocking(move || restore_in(&datadir, network, &phrase, &password, &confirm)).await
}

/// `receive_address`: alamat penerimaan terakhir.
///
/// # Errors
///
/// Lihat [`receive_address_in`].
#[tauri::command]
pub async fn receive_address(
    state: State<'_, AppState>,
    network: String,
) -> Result<String, CommandError> {
    let network = parse_network(&network)?;
    let datadir = state.datadir.clone();
    run_blocking(move || receive_address_in(&datadir, network)).await
}

/// `new_address`: alamat penerimaan baru.
///
/// # Errors
///
/// Lihat [`new_address_in`].
#[tauri::command]
pub async fn new_address(
    state: State<'_, AppState>,
    network: String,
) -> Result<String, CommandError> {
    let network = parse_network(&network)?;
    let datadir = state.datadir.clone();
    run_blocking(move || new_address_in(&datadir, network)).await
}

/// `list_addresses`: alamat penerimaan yang sudah dibuat, terbaru dulu (tanpa password, tanpa node).
///
/// # Errors
///
/// Lihat [`list_addresses_in`].
#[tauri::command]
pub async fn list_addresses(
    state: State<'_, AppState>,
    network: String,
) -> Result<AddressList, CommandError> {
    let network = parse_network(&network)?;
    let datadir = state.datadir.clone();
    run_blocking(move || list_addresses_in(&datadir, network)).await
}

/// `open_explorer_tx`: membuka halaman transaksi di explorer resmi lewat browser sistem (plugin opener, dipanggil dari Rust
/// saja dengan tautan dari [`explorer_tx_url`]).
///
/// # Errors
///
/// `network`, `no_explorer`, `bad_txid`, atau `open_failed` bila browser tidak bisa dibuka.
#[tauri::command]
pub async fn open_explorer_tx(
    app: tauri::AppHandle,
    network: String,
    txid: String,
) -> Result<(), CommandError> {
    let network = parse_network(&network)?;
    let url = explorer_tx_url(network, &txid)?;
    run_blocking(move || {
        app.opener()
            .open_url(url.as_str(), None::<&str>)
            .map_err(|error| {
                CommandError::new(
                    "open_failed",
                    format!("browser tidak bisa dibuka untuk {url}: {error}"),
                )
            })
    })
    .await
}

/// `chain_status`: ringkasan chain node di `rpc_url`, dengan syarat node berjalan di jaringan yang sama.
///
/// # Errors
///
/// `node_unreachable` atau `wrong_network`.
#[tauri::command]
pub async fn chain_status(network: String, rpc_url: String) -> Result<ChainStatus, CommandError> {
    let network = parse_network(&network)?;
    run_blocking(move || chain_status_at(&rpc_url, network)).await
}

/// `balance`: saldo wallet dari node.
///
/// # Errors
///
/// `node_unreachable`, `wrong_network`, atau galat file wallet.
#[tauri::command]
pub async fn balance(
    state: State<'_, AppState>,
    network: String,
    rpc_url: String,
) -> Result<BalanceView, CommandError> {
    let network = parse_network(&network)?;
    let datadir = state.datadir.clone();
    run_blocking(move || {
        let balance = Cli::connect(&rpc_url, network)?.balance(&datadir, "")?;
        Ok(BalanceView::from(&balance))
    })
    .await
}

/// `history`: riwayat transaksi wallet dari blok (tembolok `history.json` sama dengan CLI).
///
/// # Errors
///
/// `node_unreachable`, `wrong_network`, `chain_changed`, atau `history_failed`.
#[tauri::command]
pub async fn history(
    state: State<'_, AppState>,
    network: String,
    rpc_url: String,
) -> Result<HistoryView, CommandError> {
    let network = parse_network(&network)?;
    let datadir = state.datadir.clone();
    run_blocking(move || {
        let history = Cli::connect(&rpc_url, network)?.history(&datadir, "")?;
        Ok(HistoryView::from(&history))
    })
    .await
}

/// `preview_send`: pratinjau kirim tanpa password (RENCANA_T9 F3): jumlah diterima, biaya, kembalian, input, ukuran.
/// `all` = kirim semua saldo yang bisa dipakai (F4).
///
/// # Errors
///
/// `bad_amount`, `bad_fee`, `bad_address`, `insufficient_funds`, `too_many_coins`, atau `node_unreachable`.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn preview_send(
    state: State<'_, AppState>,
    network: String,
    rpc_url: String,
    to: String,
    amount: String,
    all: bool,
    fee_rate: u64,
) -> Result<PreviewView, CommandError> {
    let network = parse_network(&network)?;
    let datadir = state.datadir.clone();
    run_blocking(move || preview_at(&datadir, network, &rpc_url, &to, &amount, all, fee_rate)).await
}

/// `send`: menyusun ulang rencana, memeriksa bahwa jumlah dan biaya sama dengan pratinjau yang dilihat pengguna
/// (`expected_amount`, `expected_fee`), menandatangani (password wallet), dan mengirim. `all` = kirim semua saldo.
///
/// # Errors
///
/// `bad_amount`, `bad_fee`, `bad_address`, `insufficient_funds`, `preview_changed`, `wrong_password`, `rejected`, atau
/// `node_unreachable`.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn send(
    state: State<'_, AppState>,
    network: String,
    rpc_url: String,
    password: String,
    to: String,
    amount: String,
    all: bool,
    fee_rate: u64,
    expected_amount: String,
    expected_fee: String,
) -> Result<SentView, CommandError> {
    let network = parse_network(&network)?;
    let datadir = state.datadir.clone();
    let password = Zeroizing::new(password);
    run_blocking(move || {
        send_at(
            &datadir,
            network,
            &rpc_url,
            &password,
            &to,
            &amount,
            all,
            fee_rate,
            &expected_amount,
            &expected_fee,
        )
    })
    .await
}

/// `unlock_app`: membuka kunci aplikasi dengan password wallet (RENCANA_T9 F7).
///
/// # Errors
///
/// Lihat [`unlock_in`].
#[tauri::command]
pub async fn unlock_app(
    state: State<'_, AppState>,
    network: String,
    password: String,
) -> Result<(), CommandError> {
    let network = parse_network(&network)?;
    let datadir = state.datadir.clone();
    let password = Zeroizing::new(password);
    run_blocking(move || unlock_in(&datadir, network, &password)).await
}

/// `reveal_phrase`: frasa pemulihan, dibuka dengan password.
///
/// # Errors
///
/// `wrong_password` atau galat file wallet.
#[tauri::command]
pub async fn reveal_phrase(
    state: State<'_, AppState>,
    network: String,
    password: String,
) -> Result<String, CommandError> {
    let network = parse_network(&network)?;
    let datadir = state.datadir.clone();
    let password = Zeroizing::new(password);
    run_blocking(move || reveal_in(&datadir, network, &password)).await
}

/// `delete_wallet`: menghapus wallet jaringan ini dari perangkat, dengan password.
///
/// # Errors
///
/// Lihat [`delete_in`].
#[tauri::command]
pub async fn delete_wallet(
    state: State<'_, AppState>,
    network: String,
    password: String,
) -> Result<(), CommandError> {
    let network = parse_network(&network)?;
    let datadir = state.datadir.clone();
    let password = Zeroizing::new(password);
    run_blocking(move || delete_in(&datadir, network, &password)).await
}

#[cfg(test)]
mod tests;
