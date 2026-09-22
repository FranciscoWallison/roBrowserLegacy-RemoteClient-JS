/**
 * Regex search must stay interruptible.
 *
 * The search compiles a caller-supplied pattern and runs it over every GRF name. A pattern like
 * `^(.+)+#$` backtracks exponentially: measured in this environment it takes ~93 ms against 24
 * characters and roughly doubles per character, while a name table runs to millions -- hours of
 * blocked event loop from one request. And the form-encoded POST the roBrowser client uses is a CORS
 * *simple* request: no preflight, so any page the victim visits can fire it.
 *
 * An earlier attempt bounded the scan with a wall-clock budget sampled every 1024 candidates. That
 * bounds many cheap evaluations, not one expensive one -- the cost is inside a single regex call
 * that nothing on that thread can interrupt. Hence the worker, which can be killed.
 */
const test = require('node:test');
const assert = require('node:assert');

const searchPool = require('../src/utils/searchPool');

// A name table as the search sees one: every name followed by a NUL.
const TABLES = [
  [
    'data/sprite/monstro/poring_ataque_frente.spr',
    'data/texture/basepic/loading01.jpg',
    'data/texture/basepic/loading00.jpg',
  ].map((name) => `${name}\0`).join(''),
];

const LOADING = 'loading0[0-9]\\.jpg';

// Classic catastrophic pattern, well inside the 256-character cap the route enforces.
const EVIL = '^(.+)+#$';

test('an ordinary pattern still returns its matches', async () => {
  const matches = await searchPool.search(LOADING, 'gi', TABLES, { timeoutMs: 5000 });
  assert.deepStrictEqual(matches, ['loading01.jpg', 'loading00.jpg']);
});

test('a substring matched many times comes back once', async () => {
  const matches = await searchPool.search('data/', 'gi', TABLES, { timeoutMs: 5000 });
  assert.deepStrictEqual(matches, ['data/']);
});

test('a pattern that matches the empty string terminates', async () => {
  // exec() does not advance past an empty match on its own; the worker must, or it loops forever.
  const matches = await searchPool.search('#?', 'gi', TABLES, { timeoutMs: 5000 });
  assert.deepStrictEqual(matches, ['']);
});

test('a search without the g flag still terminates', async () => {
  const matches = await searchPool.search(LOADING, 'i', TABLES, { timeoutMs: 5000 });
  assert.strictEqual(matches.length, 2);
});

test('a catastrophic pattern is aborted at the deadline instead of running forever', async () => {
  const started = Date.now();
  await assert.rejects(
    () => searchPool.search(EVIL, 'gi', TABLES, { timeoutMs: 1000 }),
    /timed out/
  );
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 5000, `abort took ${elapsed}ms — the deadline is not being enforced`);
});

test('the event loop stays responsive while a hostile pattern burns', async () => {
  let ticks = 0;
  const ticker = setInterval(() => { ticks++; }, 50);

  await assert.rejects(() => searchPool.search(EVIL, 'gi', TABLES, { timeoutMs: 1000 }));
  clearInterval(ticker);

  // Without the worker this thread would be wedged inside the regex and tick zero times.
  assert.ok(ticks > 5, `only ${ticks} timer ticks during the attack — the main thread was blocked`);
});

test('searches keep working after a worker is terminated', async () => {
  await assert.rejects(() => searchPool.search(EVIL, 'gi', TABLES, { timeoutMs: 500 }));

  const matches = await searchPool.search(LOADING, 'gi', TABLES, { timeoutMs: 5000 });
  assert.strictEqual(matches.length, 2, 'the pool did not recover after terminating the worker');
});

test.after(() => {
  // Release the worker so the test runner can exit.
  searchPool.invalidate();
});
