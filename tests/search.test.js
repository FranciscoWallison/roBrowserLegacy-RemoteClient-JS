/**
 * File search, against the contract roBrowser's viewers depend on.
 *
 * FileManager.search posts `filter=<regex.source>` to the remote client's root and splits the answer on
 * newlines. With game files loaded locally it runs the same regex over each archive's name table. The
 * remote answer has to be identical to the local one -- the viewers cannot tell the two apart -- so most
 * tests here compare against localSearch(), a reproduction of the client's own code.
 *
 * Until this contract was implemented, POST / fell through to Express's 404 page, which the client split
 * into eleven "file names" of HTML.
 */
import test from 'node:test';
import assert from 'node:assert';
import iconv from 'iconv-lite';
import configs from '../src/config/configs.js';
import { startServer } from './helpers/server.js';
import {
  clientName,
  clientSearch,
  localSearch,
  urlPathFor,
  MAP_VIEWER,
  grfViewerDirectory,
  grfViewerKeyword,
} from './helpers/roBrowser.js';

const file = (name) => ({ name, content: `payload of ${name} `.repeat(8) });

// Table order matters: results come back in it. The names are made up, so that no file a real client
// has can shadow them (see tests/helpers/server.js).
const FILES = [
  file('data\\testmap.rsw'),
  file('data\\testmap.gat'),
  file('data\\TestIsland.RSW'), // original case must survive
  file('data\\texture\\유저인터페이스\\test_basic.bmp'),
  file('data\\texture\\유저인터페이스\\cardbmp\\웤테스트.bmp'), // 웤 is 0x9F 0x70: a byte windows-1252 reads as "Ÿ"
  file('data\\texture\\test_effect\\ring_blue.tga'),
  file('data\\texture\\test_effect\\ring_red.tga'),
  file('data\\sprite\\아이템\\똠테스트.spr'), // 똠 is 0x8C 0x63: "Œc"
  file('data\\sprite\\똠테스트\\bowl.act'), // ...and the same byte in a folder name
  file('data\\model\\testmap\\fountain.rsm'),
];

let srv;

test.before(async () => {
  srv = await startServer({}, { files: FILES });
});

test.after(async () => {
  await srv.close();
});

async function assertSameAsLocal(regex) {
  const { list, res } = await clientSearch(srv.base, regex);
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(list, localSearch(FILES, regex), `remote and local search differ for ${regex}`);
  return list;
}

test('MapViewer: POST / answers like a locally loaded archive', async () => {
  const list = await assertSameAsLocal(MAP_VIEWER);
  assert.deepStrictEqual(list, ['data\\testmap.rsw', 'data\\TestIsland.RSW']);
});

// The GRF Viewer opens a folder as `${data-path}/` -- GrfViewer.js, onDirectoryClick.

test('GRF Viewer: a folder lists each entry directly under it, once', async () => {
  const list = await assertSameAsLocal(grfViewerDirectory('data/texture/'));
  assert.deepStrictEqual(list, [
    `data\\texture\\${clientName('유저인터페이스')}`,
    'data\\texture\\test_effect',
  ]);
});

test('GRF Viewer: a Korean folder taken from a previous listing opens', async () => {
  const { list: folders } = await clientSearch(srv.base, grfViewerDirectory('data/texture/'));
  const korean = folders.find((entry) => entry.endsWith(clientName('유저인터페이스')));
  assert.ok(korean, 'the Korean folder is not in the listing');

  const list = await assertSameAsLocal(grfViewerDirectory(`${korean}/`));
  assert.deepStrictEqual(list, [`${korean}\\test_basic.bmp`, `${korean}\\cardbmp`]);
});

test('GRF Viewer: a folder whose name holds a 0x80-0x9F byte opens', async () => {
  // The pattern carries "Œ" (U+0152), the windows-1252 reading of byte 0x8C, where the name table holds
  // U+008C.
  const folder = `data\\sprite\\${clientName('똠테스트')}`;
  assert.ok(folder.includes('Œ'));
  const list = await assertSameAsLocal(grfViewerDirectory(`${folder}/`));
  assert.deepStrictEqual(list, [`${folder}\\bowl.act`]);
});

test('GRF Viewer: a listing that holds a 0x80-0x9F byte comes back in the client\'s spelling', async () => {
  const cardbmp = `data\\texture\\${clientName('유저인터페이스')}\\cardbmp`;
  const list = await assertSameAsLocal(grfViewerDirectory(`${cardbmp}/`));
  assert.deepStrictEqual(list, [`${cardbmp}\\${clientName('웤테스트.bmp')}`]);
  assert.ok(list[0].includes('Ÿ'));
});

test('GRF Viewer: keyword search', async () => {
  const list = await assertSameAsLocal(grfViewerKeyword('ring_'));
  assert.deepStrictEqual(list, [
    'data\\texture\\test_effect\\ring_blue.tga',
    'data\\texture\\test_effect\\ring_red.tga',
  ]);
});

test('the match is case-insensitive, like the client\'s gi flags', async () => {
  const list = await assertSameAsLocal(/DATA\\TESTMAP\.(RSW|GAT)/gi);
  assert.deepStrictEqual(list, ['data\\testmap.rsw', 'data\\testmap.gat']);
});

test('every name a search returns can be fetched at the URL the client builds from it', async () => {
  const { list } = await clientSearch(srv.base, /data\\[^\0]+/gi);
  assert.strictEqual(list.length, FILES.length);

  for (const name of list) {
    const res = await fetch(srv.base + urlPathFor(name));
    assert.strictEqual(res.status, 200, `${name} came from the search but cannot be fetched`);
    const original = FILES.find((f) => clientName(f.name) === name);
    assert.strictEqual(await res.text(), original.content);
  }
});

test('the body is the raw name bytes, labelled ISO-8859-1', async () => {
  const { res, body } = await clientSearch(srv.base, grfViewerDirectory('data/texture/'));
  assert.strictEqual(res.headers.get('content-type'), 'text/plain; charset=ISO-8859-1');

  // UTF-8 here would come out of the client's decoder as a second layer of mojibake.
  const cp949 = iconv.encode('유저인터페이스', 'cp949');
  assert.ok(body.includes(cp949), 'the Korean folder is not in the body as its CP949 bytes');
});

test('POST /search, the route this server used before, gives the same answer', async () => {
  const atRoot = await clientSearch(srv.base, MAP_VIEWER);
  const atSearch = await clientSearch(srv.base, MAP_VIEWER, { route: '/search' });
  assert.deepStrictEqual(atSearch.list, atRoot.list);
});

// ── Failures answer 200 with an empty body: the client ignores the status and would read any
//    message as file names ──

async function assertEmptyAnswer(body, expectedError) {
  const res = await fetch(srv.base + '/', {
    method: 'POST',
    headers: { 'Content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(await res.text(), '');
  assert.strictEqual(res.headers.get('x-search-error'), expectedError);
}

test('search disabled: empty answer', async () => {
  configs.CLIENT_ENABLESEARCH = false;
  try {
    await assertEmptyAnswer('filter=' + encodeURIComponent(MAP_VIEWER.source), 'disabled');
  } finally {
    configs.CLIENT_ENABLESEARCH = true;
  }
});

test('missing or empty filter: empty answer', async () => {
  await assertEmptyAnswer('', 'invalid-filter');
  await assertEmptyAnswer('filter=', 'invalid-filter');
});

test('a pattern that does not compile: empty answer', async () => {
  await assertEmptyAnswer('filter=' + encodeURIComponent('data\\([^'), 'invalid-pattern');
});

test('a pattern over the length cap: empty answer', async () => {
  await assertEmptyAnswer('filter=' + 'a'.repeat(257), 'filter-too-long');
});

test('a catastrophic pattern: empty answer at the deadline, and the next search still works', async () => {
  const started = Date.now();
  await assertEmptyAnswer('filter=' + encodeURIComponent('^(.+)+#$'), 'timeout');
  assert.ok(Date.now() - started < 10000, 'the deadline is not being enforced');

  await assertSameAsLocal(MAP_VIEWER);
});
