/**
 * Daftar alamat penerimaan di layar Terima (RENCANA_T8): alamat ringkas, catatan gap limit, dan teks berisian. Semua alamat
 * diturunkan dari frasa 24 kata yang sama dan tetap bisa menerima; saldo wallet adalah jumlah semua alamat.
 */

/**
 * Gap limit pemindaian MOD-12 (`zevrigo_cli::GAP_LIMIT`): saat memulihkan dari 24 kata, wallet berhenti mencari sesudah 20
 * alamat berturut-turut yang belum pernah menerima koin.
 */
export const GAP_LIMIT = 20;

/** Alamat dipendekkan untuk layar sempit: `head` simbol awal dan `tail` simbol akhir. Alamat pendek dikembalikan utuh. */
export function shortAddress(address: string, head = 14, tail = 8): string {
  if (address.length <= head + tail + 1) {
    return address;
  }
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

/** Catatan gap limit tampil bila alamat yang sudah dibuat lebih dari `GAP_LIMIT`. */
export function showGapNote(total: number): boolean {
  return total > GAP_LIMIT;
}

/** Teks dengan `{nama}` diganti nilainya; nama yang tidak ada dibiarkan. */
export function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (whole: string, key: string) => (key in values ? String(values[key]) : whole));
}
