/**
 * Kunci aplikasi (RENCANA_T9 F7): wallet meminta password saat aplikasi dibuka, dan lagi sesudah aplikasi berada di latar
 * belakang paling sedikit `LOCK_AFTER_MS` (misalnya HP dikunci atau pindah aplikasi). Waktu singkat di latar belakang
 * (izin kamera, membuka explorer) tidak mengunci. Waktu dalam milidetik bilangan bulat, bukan jumlah koin.
 */

export const LOCK_AFTER_MS = 60_000;

/** True bila aplikasi yang tersembunyi sejak `hiddenAt` harus dikunci saat tampil lagi pada `now`. */
export function lockAfterHidden(hiddenAt: number | null, now: number): boolean {
  return hiddenAt !== null && now - hiddenAt >= LOCK_AFTER_MS;
}
