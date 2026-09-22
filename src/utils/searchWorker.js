/**
 * Regex search, run off the main thread.
 *
 * A caller-supplied pattern can backtrack exponentially -- `^(.+)+#$` takes seconds against a few dozen
 * characters and doubles with every additional one. No amount of budget-checking between evaluations
 * helps, because the cost is inside one regex call that nothing can interrupt.
 *
 * Running it in a worker makes it interruptible: the main thread races every query against a
 * deadline and terminates this thread outright when it overruns. That is the only reliable way to
 * bound an untrusted regex without a linear-time engine.
 */
const { parentPort } = require('node:worker_threads');

/** @type {string[]} The name tables to match against, one per GRF, sent once by the main thread. */
let tables = [];

/**
 * Every match of `regex` in `tables`, first occurrence kept -- what roBrowser computes with
 * `Array.from(new Set(tables.flatMap((t) => t.match(regex) || [])))`.
 *
 * Walked with exec() rather than match() so duplicates collapse as they are found, instead of first
 * building an array with one entry per match: `.?` would give ten million of them for a full data.grf.
 */
function matchAll(regex) {
  const found = new Set();
  for (const table of tables) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(table)) !== null) {
      found.add(match[0]);
      // As String.prototype.match does: step over an empty match, or exec() returns it forever.
      if (match[0].length === 0) regex.lastIndex++;
    }
  }
  return Array.from(found);
}

parentPort.on('message', (msg) => {
  if (msg.type === 'seed') {
    tables = msg.tables;
    parentPort.postMessage({ type: 'seeded', count: tables.length });
    return;
  }

  if (msg.type === 'query') {
    // A pattern that does not compile is rejected by the caller before it gets here; compiling
    // again in this thread is cheap and keeps the worker self-contained. Without 'g', exec() would
    // restart at 0 every time and never finish.
    const flags = msg.flags.includes('g') ? msg.flags : `${msg.flags}g`;
    const regex = new RegExp(msg.pattern, flags);
    parentPort.postMessage({ type: 'result', id: msg.id, matches: matchAll(regex) });
  }
});
