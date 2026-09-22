/**
 * The search returns every match.
 *
 * It used to stop at 10,000. The client has no way to ask for more, so the MapViewer and the GRF Viewer
 * silently showed a truncated list. Kept in its own file: it needs an archive bigger than the cap, and
 * each test file runs in its own process with its own index.
 */
const test = require('node:test');
const assert = require('node:assert');
const { startServer } = require('./helpers/server');
const { clientSearch, localSearch } = require('./helpers/roBrowser');

const COUNT = 10050;
const FILES = Array.from({ length: COUNT }, (_, i) => ({
  name: `data\\texture\\scale\\${String(i).padStart(5, '0')}.bmp`,
  content: `payload ${i} `.repeat(6),
}));

test('a search matching more than 10,000 names returns all of them', async () => {
  const srv = await startServer({}, { files: FILES });
  try {
    const regex = /data\\texture\\scale\\[^\0]+/gi;
    const { list } = await clientSearch(srv.base, regex);
    assert.strictEqual(list.length, COUNT);
    assert.deepStrictEqual(list, localSearch(FILES, regex));
  } finally {
    await srv.close();
  }
});
