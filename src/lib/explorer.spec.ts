import { describe, expect, test } from 'vitest';
import { explorerTxUrl } from './explorer';

describe('tautan explorer', () => {
  test('hanya regtest dan txid 64 hex kecil, sama dengan Rust', () => {
    const txid = 'ab'.repeat(32);
    expect(explorerTxUrl('regtest', txid)).toBe(`https://zevrigo.ratuaurion.store/tx/?id=${txid}`);
    expect(explorerTxUrl('testnet', txid)).toBeNull();
    for (const bad of ['', 'AB'.repeat(32), 'ab'.repeat(31), `${txid}a`, `${'a'.repeat(63)}?`, ` ${'a'.repeat(63)}`]) {
      expect(explorerTxUrl('regtest', bad), bad).toBeNull();
    }
  });
});
