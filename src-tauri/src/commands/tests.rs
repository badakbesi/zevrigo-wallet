// Uji perintah wallet desktop tanpa node: nama jaringan, jumlah quanta, kode galat, bentuk JSON untuk antarmuka, dan
// alur file wallet di folder sementara (frasa W1 dan alamat W5, W6: Spesifikasi Wallet v0.1 Bagian 4). Argon2id memakai
// parameter penuh seperti aplikasi.

use std::path::PathBuf;

use zevrigo_cli::{Balance, CliError, History, HistoryEntry, Preview, Spend};
use zevrigo_primitives::{Amount, Network};
use zevrigo_rpc::Hex32;
use zevrigo_wallet_core::{Mnemonic, SendError};

use super::{
    AddressList, AddressView, BalanceView, CommandError, DEMO_EXPLORER_URL, DEMO_RPC_URL,
    HistoryView, MAX_LISTED_ADDRESSES, PreviewView, check_fee_rate, delete_in, error_code,
    explorer_tx_url, list_addresses_in, new_address_in, new_phrase_words, parse_network,
    parse_quanta, parse_spend, receive_address_in, restore_in, reveal_in, unlock_in,
    wallet_default_rpc_url, wallet_info_in,
};

const W1: &str = concat!(
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon ",
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art"
);
const W5: &str = "rzvrg1qtfhjsfflxh307x4skzrt3jrlwvg4jes32ljmut9fsxyrd939mseq59qlxg";
const W6: &str = "rzvrg1q3uesn8pvcdeeufxr98v794e07l8ghd85fyd3wclknj5xj04rfqrqyeht59";
const PASSWORD: &str = "kata sandi uji";

fn temp_datadir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("zevrigo-wallet-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    dir
}

fn code<T>(result: Result<T, CommandError>) -> Option<&'static str> {
    result.err().map(|error| error.code)
}

#[test]
fn parses_only_testnet_and_regtest() {
    assert_eq!(parse_network("testnet"), Ok(Network::Testnet));
    assert_eq!(parse_network("regtest"), Ok(Network::Regtest));
    for name in ["mainnet", "Testnet", "", "regtest "] {
        assert_eq!(code(parse_network(name)), Some("network"), "{name:?}");
    }
}

#[test]
fn parses_quanta_text_without_fractions() {
    assert_eq!(parse_quanta("1"), Ok(Amount::from_quanta(1)));
    assert_eq!(
        parse_quanta("1000000000000000000"),
        Ok(Amount::from_quanta(1_000_000_000_000_000_000))
    );
    assert_eq!(
        parse_quanta("340282366920938463463374607431768211455"),
        Ok(Amount::from_quanta(u128::MAX))
    );
    for text in [
        "",
        "0",
        "00",
        "01",
        "1.5",
        "-1",
        "+1",
        " 1",
        "1e3",
        "340282366920938463463374607431768211456",
    ] {
        assert_eq!(code(parse_quanta(text)), Some("bad_amount"), "{text:?}");
    }
}

#[test]
fn maps_cli_errors_to_fixed_codes() {
    let cases = [
        (CliError::WrongPassword, "wrong_password"),
        (CliError::PasswordTooShort, "password_too_short"),
        (CliError::PasswordMismatch, "password_mismatch"),
        (
            CliError::Rpc {
                message: String::from("koneksi ditolak"),
            },
            "node_unreachable",
        ),
        (
            CliError::WrongNetwork {
                expected: String::from("testnet"),
                actual: String::from("regtest"),
            },
            "wrong_network",
        ),
        (
            CliError::Rejected {
                reason: String::from("double-spend"),
            },
            "rejected",
        ),
        (
            CliError::Send(SendError::InsufficientFunds {
                available: Amount::from_quanta(5),
                needed: Amount::from_quanta(9),
            }),
            "insufficient_funds",
        ),
        (CliError::Send(SendError::ZeroAmount), "bad_amount"),
        (CliError::Send(SendError::Signing), "send_failed"),
        (CliError::ChainChanged, "chain_changed"),
        (CliError::PassphraseMismatch, "bad_phrase"),
        (CliError::IndexExhausted, "failed"),
    ];
    for (error, expected) in cases {
        assert_eq!(error_code(&error), expected, "{error}");
        let message = error.to_string();
        let converted = CommandError::from(error);
        assert_eq!(converted.code, expected);
        assert_eq!(converted.message, message);
    }
    let json = serde_json::to_string(&CommandError::from(CliError::WrongPassword));
    assert_eq!(
        json.ok().as_deref(),
        Some(r#"{"code":"wrong_password","message":"password salah atau file wallet rusak"}"#)
    );
}

#[test]
fn balance_view_sends_quanta_as_text() {
    let balance = Balance {
        tip_height: 120,
        total: Amount::from_quanta(43_959_096_939_479_752_879),
        spendable: Amount::from_quanta(2_000_000_000_000_000_000),
        immature: Amount::from_quanta(41_959_096_939_479_752_879),
        pending_spent: Amount::ZERO,
        pending_received: Amount::from_quanta(7),
        after_pending: Amount::from_quanta(43_959_096_939_479_752_886),
        utxos: 3,
    };
    let json = serde_json::to_value(BalanceView::from(&balance)).ok();
    let expected = serde_json::json!({
        "tipHeight": 120,
        "total": "43959096939479752879",
        "spendable": "2000000000000000000",
        "immature": "41959096939479752879",
        "pendingSpent": "0",
        "pendingReceived": "7",
        "afterPending": "43959096939479752886",
        "utxos": 3,
    });
    assert_eq!(json, Some(expected));
}

#[test]
fn history_view_keeps_pending_entries_and_fees() {
    let history = History {
        tip_height: 9,
        entries: vec![
            HistoryEntry {
                txid: Hex32::new([0xab; 32]),
                height: None,
                timestamp: None,
                coinbase: false,
                received: Amount::from_quanta(40),
                spent: Amount::from_quanta(100),
                fee: None,
            },
            HistoryEntry {
                txid: Hex32::new([0x01; 32]),
                height: Some(9),
                timestamp: Some(1_788_000_000),
                coinbase: true,
                received: Amount::from_quanta(4_361_021_521_773_785),
                spent: Amount::ZERO,
                fee: Some(Amount::from_quanta(300)),
            },
        ],
    };
    let json = serde_json::to_value(HistoryView::from(&history)).ok();
    let expected = serde_json::json!({
        "tipHeight": 9,
        "entries": [
            {
                "txid": "ab".repeat(32),
                "height": null,
                "timestamp": null,
                "coinbase": false,
                "received": "40",
                "spent": "100",
                "fee": null,
            },
            {
                "txid": "01".repeat(32),
                "height": 9,
                "timestamp": 1_788_000_000_u64,
                "coinbase": true,
                "received": "4361021521773785",
                "spent": "0",
                "fee": "300",
            },
        ],
    });
    assert_eq!(json, Some(expected));
}

#[test]
fn new_phrase_has_24_valid_words_and_is_fresh() {
    let first = new_phrase_words();
    let second = new_phrase_words();
    assert!(first.is_ok() && second.is_ok());
    let (first, second) = (first.unwrap_or_default(), second.unwrap_or_default());
    assert_ne!(first, second);
    for phrase in [&first, &second] {
        assert_eq!(phrase.split(' ').count(), 24);
        assert!(Mnemonic::parse(phrase).is_ok());
    }
}

#[test]
fn restores_wallet_and_keeps_last_receive_address() {
    let datadir = temp_datadir("pulih");
    let info = wallet_info_in(&datadir, Network::Regtest);
    assert!(!info.exists);
    assert_eq!(info.default_rpc_url, DEMO_RPC_URL);
    assert!(info.path.ends_with("wallet.json"));

    assert_eq!(
        code(restore_in(
            &datadir,
            Network::Regtest,
            W1,
            PASSWORD,
            "kata sandi lain"
        )),
        Some("password_mismatch")
    );
    assert_eq!(
        code(restore_in(
            &datadir,
            Network::Regtest,
            W1,
            "pendek",
            "pendek"
        )),
        Some("password_too_short")
    );
    assert_eq!(
        code(restore_in(
            &datadir,
            Network::Regtest,
            "abandon art",
            PASSWORD,
            PASSWORD
        )),
        Some("bad_phrase")
    );
    assert!(!wallet_info_in(&datadir, Network::Regtest).exists);

    assert_eq!(
        restore_in(&datadir, Network::Regtest, W1, PASSWORD, PASSWORD),
        Ok(String::from(W5))
    );
    assert!(wallet_info_in(&datadir, Network::Regtest).exists);
    assert!(!wallet_info_in(&datadir, Network::Testnet).exists);
    assert_eq!(
        receive_address_in(&datadir, Network::Regtest),
        Ok(String::from(W5))
    );
    assert_eq!(
        new_address_in(&datadir, Network::Regtest),
        Ok(String::from(W6))
    );
    assert_eq!(
        receive_address_in(&datadir, Network::Regtest),
        Ok(String::from(W6))
    );

    assert_eq!(
        reveal_in(&datadir, Network::Regtest, PASSWORD),
        Ok(String::from(W1))
    );
    assert_eq!(
        code(reveal_in(&datadir, Network::Regtest, "kata sandi salah")),
        Some("wrong_password")
    );
    assert_eq!(
        code(restore_in(
            &datadir,
            Network::Regtest,
            W1,
            PASSWORD,
            PASSWORD
        )),
        Some("wallet_exists")
    );
    assert_eq!(
        code(receive_address_in(&datadir, Network::Testnet)),
        Some("wallet_missing")
    );
    let _ = std::fs::remove_dir_all(&datadir);
}

fn view(index: u32, address: &str) -> AddressView {
    AddressView {
        index,
        address: address.to_owned(),
    }
}

#[test]
fn lists_receive_addresses_newest_first_without_changing_wallet() {
    let datadir = temp_datadir("daftar");
    assert_eq!(
        code(list_addresses_in(&datadir, Network::Regtest)),
        Some("wallet_missing")
    );
    assert_eq!(
        restore_in(&datadir, Network::Regtest, W1, PASSWORD, PASSWORD),
        Ok(String::from(W5))
    );
    assert_eq!(
        list_addresses_in(&datadir, Network::Regtest),
        Ok(AddressList {
            total: 1,
            addresses: vec![view(0, W5)],
        })
    );
    assert_eq!(
        new_address_in(&datadir, Network::Regtest),
        Ok(String::from(W6))
    );

    let wallet = zevrigo_cli::wallet_path(Network::Regtest, &datadir);
    let before = std::fs::read(&wallet).ok();
    assert!(before.is_some());
    let list = list_addresses_in(&datadir, Network::Regtest);
    assert_eq!(
        list,
        Ok(AddressList {
            total: 2,
            addresses: vec![view(1, W6), view(0, W5)],
        })
    );
    assert_eq!(std::fs::read(&wallet).ok(), before);
    assert_eq!(
        receive_address_in(&datadir, Network::Regtest),
        Ok(String::from(W6))
    );
    let json = list.ok().and_then(|list| serde_json::to_value(list).ok());
    let expected = serde_json::json!({
        "total": 2,
        "addresses": [
            { "index": 1, "address": W6 },
            { "index": 0, "address": W5 },
        ],
    });
    assert_eq!(json, Some(expected));

    let mut made = vec![String::from(W5), String::from(W6)];
    for _ in 0..3 {
        made.extend(new_address_in(&datadir, Network::Regtest).ok());
    }
    assert_eq!(made.len(), 5);
    let mut expected: Vec<AddressView> = made
        .iter()
        .zip(0_u32..)
        .map(|(address, index)| view(index, address.as_str()))
        .collect();
    expected.reverse();
    assert_eq!(
        list_addresses_in(&datadir, Network::Regtest).map(|list| list.addresses),
        Ok(expected)
    );
    assert_eq!(
        code(list_addresses_in(&datadir, Network::Testnet)),
        Some("wallet_missing")
    );
    let _ = std::fs::remove_dir_all(&datadir);
}

#[test]
fn lists_at_most_the_newest_thousand_addresses() {
    let datadir = temp_datadir("daftar-batas");
    assert_eq!(
        restore_in(&datadir, Network::Regtest, W1, PASSWORD, PASSWORD),
        Ok(String::from(W5))
    );
    let path = zevrigo_cli::wallet_path(Network::Regtest, &datadir);
    let saved = zevrigo_cli::load_network(Network::Regtest, &path).and_then(|mut file| {
        file.next_index.receive = 1_500;
        zevrigo_cli::wallet_file::save(&path, &file)
    });
    assert!(saved.is_ok());

    let list = list_addresses_in(&datadir, Network::Regtest).ok();
    let total = list.as_ref().map(|list| list.total);
    let indices: Vec<u32> = list
        .iter()
        .flat_map(|list| list.addresses.iter().map(|item| item.index))
        .collect();
    assert_eq!(total, Some(1_500));
    assert_eq!(
        u32::try_from(indices.len()).ok(),
        Some(MAX_LISTED_ADDRESSES)
    );
    assert_eq!(indices.first(), Some(&1_499));
    assert_eq!(indices.last(), Some(&500));
    assert!(indices.windows(2).all(|pair| pair.first() > pair.last()));
    let _ = std::fs::remove_dir_all(&datadir);
}

#[test]
fn deletes_wallet_only_with_password_then_restores_again() {
    let datadir = temp_datadir("hapus");
    assert_eq!(
        code(delete_in(&datadir, Network::Regtest, PASSWORD)),
        Some("wallet_missing")
    );
    assert_eq!(
        restore_in(&datadir, Network::Regtest, W1, PASSWORD, PASSWORD),
        Ok(String::from(W5))
    );
    let history = zevrigo_cli::history_path(Network::Regtest, &datadir);
    assert!(std::fs::write(&history, b"{}").is_ok());

    assert_eq!(
        code(delete_in(&datadir, Network::Regtest, "kata sandi salah")),
        Some("wrong_password")
    );
    assert!(wallet_info_in(&datadir, Network::Regtest).exists);
    assert!(history.exists());

    assert_eq!(delete_in(&datadir, Network::Regtest, PASSWORD), Ok(()));
    assert!(!wallet_info_in(&datadir, Network::Regtest).exists);
    assert!(!history.exists());
    assert_eq!(
        code(delete_in(&datadir, Network::Regtest, PASSWORD)),
        Some("wallet_missing")
    );

    assert_eq!(
        restore_in(&datadir, Network::Regtest, W1, PASSWORD, PASSWORD),
        Ok(String::from(W5))
    );
    let _ = std::fs::remove_dir_all(&datadir);
}

#[test]
fn explorer_link_only_for_regtest_and_lowercase_hex_txid() {
    let txid = "ab".repeat(32);
    assert_eq!(DEMO_EXPLORER_URL, "https://demo-explorer.zevrigo.online");
    assert_eq!(
        explorer_tx_url(Network::Regtest, &txid),
        Ok(format!(
            "https://demo-explorer.zevrigo.online/tx/?id={txid}"
        ))
    );
    assert_eq!(
        code(explorer_tx_url(Network::Testnet, &txid)),
        Some("no_explorer")
    );
    let bad = [
        String::new(),
        "AB".repeat(32),
        "ab".repeat(31),
        format!("{txid}a"),
        format!("{}g", "a".repeat(63)),
        format!("{}?", "a".repeat(63)),
        format!("{}/", "a".repeat(63)),
        format!(" {}", "a".repeat(63)),
    ];
    for text in bad {
        assert_eq!(
            code(explorer_tx_url(Network::Regtest, &text)),
            Some("bad_txid"),
            "{text:?}"
        );
    }
}

#[test]
fn regtest_defaults_to_demo_gateway_and_testnet_to_local_node() {
    assert_eq!(DEMO_RPC_URL, "https://demo-gerbang-rpc.zevrigo.online");
    assert_eq!(wallet_default_rpc_url(Network::Regtest), DEMO_RPC_URL);
    assert_eq!(
        wallet_default_rpc_url(Network::Testnet),
        zevrigo_cli::default_rpc_url(Network::Testnet)
    );
    assert_eq!(
        wallet_default_rpc_url(Network::Testnet),
        "http://127.0.0.1:18801"
    );
}

#[test]
fn parses_spend_fee_rate_and_maps_preview_errors() {
    assert_eq!(parse_spend("", true), Ok(Spend::All));
    assert_eq!(parse_spend("bukan angka", true), Ok(Spend::All));
    assert_eq!(
        parse_spend("12", false),
        Ok(Spend::Amount(Amount::from_quanta(12)))
    );
    for text in ["", "0", "1.5"] {
        assert_eq!(
            code(parse_spend(text, false)),
            Some("bad_amount"),
            "{text:?}"
        );
    }
    assert_eq!(check_fee_rate(1), Ok(1));
    assert_eq!(check_fee_rate(10), Ok(10));
    assert_eq!(code(check_fee_rate(0)), Some("bad_fee"));
    assert_eq!(
        error_code(&CliError::PreviewChanged { amount: 5, fee: 1 }),
        "preview_changed"
    );
    assert_eq!(
        error_code(&CliError::Send(SendError::TooLarge { size: 100_001 })),
        "too_many_coins"
    );
}

#[test]
fn preview_view_sends_quanta_as_text() {
    let preview = Preview {
        amount: Amount::from_quanta(7_999_999_999_999_999_758),
        fee: Amount::from_quanta(242),
        change: None,
        inputs: 2,
        size: 242,
        tip_height: 150,
    };
    let expected = serde_json::json!({
        "amount": "7999999999999999758",
        "fee": "242",
        "change": null,
        "inputs": 2,
        "size": 242,
        "tipHeight": 150,
    });
    assert_eq!(
        serde_json::to_value(PreviewView::from(&preview)).ok(),
        Some(expected)
    );
    let with_change = Preview {
        change: Some(Amount::from_quanta(1_999_999_999_999_999_716)),
        ..preview
    };
    let json = serde_json::to_value(PreviewView::from(&with_change)).ok();
    assert_eq!(
        json.as_ref().and_then(|value| value.get("change")).cloned(),
        Some(serde_json::json!("1999999999999999716"))
    );
}

#[test]
fn unlocks_app_only_with_wallet_password() {
    let datadir = temp_datadir("kunci");
    assert_eq!(
        code(unlock_in(&datadir, Network::Regtest, PASSWORD)),
        Some("wallet_missing")
    );
    assert_eq!(
        restore_in(&datadir, Network::Regtest, W1, PASSWORD, PASSWORD),
        Ok(String::from(W5))
    );
    assert_eq!(
        code(unlock_in(&datadir, Network::Regtest, "kata sandi salah")),
        Some("wrong_password")
    );
    assert_eq!(
        code(unlock_in(&datadir, Network::Regtest, "")),
        Some("wrong_password")
    );
    assert_eq!(unlock_in(&datadir, Network::Regtest, PASSWORD), Ok(()));
    // Password regtest tidak membuka wallet testnet yang belum ada.
    assert_eq!(
        code(unlock_in(&datadir, Network::Testnet, PASSWORD)),
        Some("wallet_missing")
    );
    let _ = std::fs::remove_dir_all(&datadir);
}
