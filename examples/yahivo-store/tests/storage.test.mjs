// Hosts without a mounted disk: the store still starts, on temporary storage, and says so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, usableDir } from '../lib/db.mjs';

test('unwritable data path falls back to a temporary folder and is flagged', () => {
  // A path under a regular file can never be created, even as root.
  const wanted = '/dev/null/yahivo';
  const out = usableDir(wanted, 'test-fallback');
  assert.equal(out.temporary, true);
  assert.equal(out.wanted, wanted);
  const store = new Store(`${wanted}/yahivo.db`, { seed: 'sample' });
  assert.equal(store.temporary, wanted);
  assert.ok(store.listProducts().length > 0, 'store works on temporary storage');
  store.close();
  assert.equal(new Store(':memory:', { seed: 'none' }).temporary, null);
});
