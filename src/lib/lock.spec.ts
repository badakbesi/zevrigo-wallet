import { describe, expect, test } from 'vitest';
import { LOCK_AFTER_MS, lockAfterHidden } from './lock';

describe('kunci aplikasi', () => {
  test('mengunci sesudah 1 menit di latar belakang', () => {
    expect(LOCK_AFTER_MS).toBe(60_000);
    expect(lockAfterHidden(null, 1_000_000)).toBe(false);
    expect(lockAfterHidden(1_000_000, 1_000_000)).toBe(false);
    expect(lockAfterHidden(1_000_000, 1_059_999)).toBe(false);
    expect(lockAfterHidden(1_000_000, 1_060_000)).toBe(true);
    expect(lockAfterHidden(1_000_000, 5_000_000)).toBe(true);
  });
});
