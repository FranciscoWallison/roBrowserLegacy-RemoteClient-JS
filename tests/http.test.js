/**
 * The real routes, over real HTTP.
 *
 * Replaces tests/endpoints.test.js, which pattern-matched the source text of index.js and broke on any
 * refactor that moved a line -- including one that changed no behaviour at all. These start the actual
 * Express app on an ephemeral port, backed by a synthetic GRF (tests/helpers/grfBuilder.js), so they
 * need no Ragnarok client and exercise what a browser would.
 */
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import iconv from 'iconv-lite';
import { startServer, rawGet } from './helpers/server.js';
import { clientUrlPath, urlPathFor } from './helpers/roBrowser.js';
import { resolveCorsOrigins, defaultCorsOrigins } from '../src/app.js';
import Client from '../src/controllers/clientController.js';
import logger from '../src/utils/logger.js';

const ASCII = { name: 'data\\texture\\basepic\\loading01.txt', content: 'plain ascii payload '.repeat(20) };
const KOREAN = { name: 'data\\texture\\유저인터페이스\\basic.bmp', content: 'korean-named payload '.repeat(20) };
// "똠" is 0x8C 0x63 in CP949: a byte Latin-1 and windows-1252 read differently.
const KOREAN_C1 = { name: 'data\\sprite\\아이템\\똠테스트.spr', content: 'c1-byte payload '.repeat(20) };
// Requested by one test only, so its first request is a cache miss.
const CACHE_PROBE = { name: 'data\\test_cache_probe.txt', content: 'cache probe payload '.repeat(20) };
const ALLOWED_ORIGIN = 'http://localhost:8000';

let dev;

test.before(async () => {
  dev = await startServer(
    { isProd: false, corsOrigins: [ALLOWED_ORIGIN] },
    { files: [ASCII, KOREAN, KOREAN_C1, CACHE_PROBE] }
  );
});

test.after(async () => {
  await dev.close();
});

test('serves a file from the GRF by its path', async () => {
  const res = await fetch(dev.base + '/data/texture/basepic/loading01.txt');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(await res.text(), ASCII.content);
});

test('path lookup is case-insensitive, as in the official client', async () => {
  const res = await fetch(dev.base + '/DATA/Texture/BASEPIC/Loading01.TXT');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(await res.text(), ASCII.content);
});

test('serves a Korean-named file at the exact URL roBrowser builds', async () => {
  // CP949 bytes read as windows-1252, then encodeURIComponent per segment -- FileManager.getHTTP's format.
  const res = await fetch(dev.base + clientUrlPath(KOREAN.name));
  assert.strictEqual(res.status, 200, `client URL ${clientUrlPath(KOREAN.name)} did not resolve`);
  assert.strictEqual(await res.text(), KOREAN.content);
});

test('also serves the Korean-named file when requested as UTF-8', async () => {
  const utf8Path = '/' + KOREAN.name.split('\\').map(encodeURIComponent).join('/');
  const res = await fetch(dev.base + utf8Path);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(await res.text(), KOREAN.content);
});

test('serves a name with a CP949 byte in 0x80-0x9F in both of its spellings', async () => {
  // The client reads names as windows-1252 ("Œc" for 똠); a Latin-1 reading gives a C1 control instead
  // of "Œ". Only the Latin-1 spelling used to resolve.
  const bytes = iconv.encode(KOREAN_C1.name, 'cp949');
  const spellings = {
    'windows-1252 (what the client sends)': clientUrlPath(KOREAN_C1.name),
    'Latin-1': urlPathFor(bytes.toString('latin1')),
  };
  assert.notStrictEqual(spellings['Latin-1'], spellings['windows-1252 (what the client sends)']);

  for (const [label, urlPath] of Object.entries(spellings)) {
    const res = await fetch(dev.base + urlPath);
    assert.strictEqual(res.status, 200, `${label} spelling ${urlPath} did not resolve`);
    assert.strictEqual(await res.text(), KOREAN_C1.content);
  }
});

test('a file that exists nowhere answers 404', async () => {
  const res = await fetch(dev.base + '/data/texture/does-not-exist.bmp');
  assert.strictEqual(res.status, 404);
});

test('sends an ETag and answers a matching If-None-Match with 304', async () => {
  const first = await fetch(dev.base + '/data/texture/basepic/loading01.txt');
  const etag = first.headers.get('etag');
  assert.ok(etag, 'no ETag on a static game asset');
  // Last-Modified was the time of the response: every file claimed to have changed at every request.
  assert.strictEqual(first.headers.get('last-modified'), null);

  const second = await fetch(dev.base + '/data/texture/basepic/loading01.txt', {
    headers: { 'If-None-Match': etag },
  });
  assert.strictEqual(second.status, 304);
});

test('CORS: an allowed origin is echoed back', async () => {
  const res = await fetch(dev.base + '/data/texture/basepic/loading01.txt', { headers: { Origin: ALLOWED_ORIGIN } });
  assert.strictEqual(res.headers.get('access-control-allow-origin'), ALLOWED_ORIGIN);
});

test('CORS: an origin outside the list gets no allow header', async () => {
  const res = await fetch(dev.base + '/data/texture/basepic/loading01.txt', { headers: { Origin: 'http://evil.example' } });
  assert.strictEqual(res.headers.get('access-control-allow-origin'), null);
});

test('CORS_ORIGINS: unset keeps the defaults, a list replaces them, "*" allows any origin', () => {
  const clientUrl = 'http://localhost:3000';
  assert.deepStrictEqual(resolveCorsOrigins(undefined, clientUrl), defaultCorsOrigins(clientUrl));
  assert.deepStrictEqual(resolveCorsOrigins(' , ', clientUrl), defaultCorsOrigins(clientUrl));
  assert.deepStrictEqual(
    resolveCorsOrigins(' https://play.example.com/ , https://cdn.example.com ', clientUrl),
    ['https://play.example.com', 'https://cdn.example.com']
  );
  assert.strictEqual(resolveCorsOrigins('https://a.example, *', clientUrl), '*');
});

test('CORS_ORIGINS="*": any origin gets an allow header', async () => {
  const srv = await startServer({ corsOrigins: resolveCorsOrigins('*') });
  try {
    const res = await fetch(srv.base + '/api/health', { headers: { Origin: 'https://anywhere.example' } });
    assert.strictEqual(res.headers.get('access-control-allow-origin'), '*');
  } finally {
    await srv.close();
  }
});

test('POST /batch returns requested files as base64 and omits the missing ones', async () => {
  const res = await fetch(dev.base + '/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: ['data/texture/basepic/loading01.txt', 'data/missing.bmp'] }),
  });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.deepStrictEqual(Object.keys(body), ['data/texture/basepic/loading01.txt']);
  assert.strictEqual(Buffer.from(body['data/texture/basepic/loading01.txt'], 'base64').toString(), ASCII.content);
});

test('POST /batch rejects more than 50 files', async () => {
  const res = await fetch(dev.base + '/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: Array.from({ length: 51 }, (_, i) => `data/${i}.bmp`) }),
  });
  assert.strictEqual(res.status, 400);
});

test('POST /batch with no body answers 400, not 500', async () => {
  // Express 5 leaves req.body undefined when no parser ran; destructuring it used to throw.
  const res = await fetch(dev.base + '/batch', { method: 'POST' });
  assert.strictEqual(res.status, 400);
});

// ── Errors: the status line in plain text, never a stack trace ──

test('a malformed JSON body answers 400 in plain text', async () => {
  const res = await fetch(dev.base + '/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"files": [',
  });
  assert.strictEqual(res.status, 400);
  assert.match(res.headers.get('content-type'), /^text\/plain/);
  assert.strictEqual(await res.text(), 'Bad Request');
});

test('a URL with broken percent-encoding answers 400 without a stack trace', async () => {
  // Express's default handler answered this with an HTML page holding the stack trace and the absolute
  // path of the checkout.
  const res = await rawGet(dev.base, '/data/%E0%A4%A.bmp');
  assert.strictEqual(res.status, 400);
  assert.match(res.headers['content-type'], /^text\/plain/);
  assert.strictEqual(res.body.toString(), 'Bad Request');
});

test('an error inside a route answers 500 without detail, is logged, and the server keeps serving', async () => {
  const { loadFile } = Client;
  const { error } = logger;
  const logged = [];
  Client.loadFile = async () => { throw new Error('boom: F:\\secret\\path'); };
  logger.error = (...args) => logged.push(args);
  try {
    const res = await fetch(dev.base + '/data/never-cached.bmp');
    assert.strictEqual(res.status, 500);
    const body = await res.text();
    assert.strictEqual(body, 'Internal Server Error');
    assert.strictEqual(logged.length, 1, 'a 500 must be logged');
  } finally {
    Client.loadFile = loadFile;
    logger.error = error;
  }

  const after = await fetch(dev.base + '/data/texture/basepic/loading01.txt');
  assert.strictEqual(after.status, 200);
});

test('GET / serves the index page', async () => {
  // The asset route's wildcard is optional in Express 5 syntax ('/{*splat}'), so it also answers "/".
  const res = await fetch(dev.base + '/');
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-type'), /^text\/html/);
});

test('files at the project root are not served', async () => {
  for (const p of ['/.env', '/package.json', '/index.js', '/.git/config']) {
    const res = await rawGet(dev.base, p);
    assert.strictEqual(res.status, 404, `${p} answered ${res.status}`);
  }
});

test('path traversal on the wire is not served', async () => {
  for (const p of ['/../../.env', '/data/../package.json', '/data/..%2f..%2fpackage.json']) {
    const res = await rawGet(dev.base, p);
    assert.strictEqual(res.status, 404, `${p} answered ${res.status}`);
  }
});

// ── Diagnostic endpoints: full detail in development, gated in production ──

test('development: /api/health carries the full payload', async () => {
  const body = await (await fetch(dev.base + '/api/health')).json();
  for (const key of ['missingFiles', 'cache', 'index', 'esrgan']) {
    assert.ok(key in body, `development /api/health lost "${key}"`);
  }
});

test('development: /api/missing-files, /api/cache-stats and /list-files answer 200', async () => {
  assert.strictEqual((await fetch(dev.base + '/api/missing-files')).status, 200);
  assert.strictEqual((await fetch(dev.base + '/api/cache-stats')).status, 200);
  const list = await fetch(dev.base + '/list-files');
  assert.strictEqual(list.status, 200);
  assert.ok((await list.json()).includes(ASCII.name));
});

test('a cache miss is counted once', async () => {
  // The asset route looked in the cache for the ETag, then called getFile(), which looked again: every
  // miss was counted twice and the reported hit rate was wrong.
  const stats = async () => (await (await fetch(dev.base + '/api/cache-stats')).json()).cache;
  const before = await stats();
  await fetch(dev.base + '/data/test_cache_probe.txt');
  const afterMiss = await stats();
  await fetch(dev.base + '/data/test_cache_probe.txt');
  const afterHit = await stats();
  assert.strictEqual(afterMiss.misses - before.misses, 1, 'one miss counted more than once');
  assert.strictEqual(afterHit.hits - afterMiss.hits, 1);
  assert.strictEqual(afterHit.misses, afterMiss.misses);
});

test('the paths remembered as missing are bounded', async () => {
  // Every distinct path that 404s was kept forever, and anyone can request as many as they like.
  const { maxTrackedMissing } = Client;
  Client.maxTrackedMissing = 5;
  try {
    for (let i = 0; i < 12; i++) await fetch(dev.base + `/data/bounded-miss-${i}.bmp`);
    const summary = await (await fetch(dev.base + '/api/missing-files')).json();
    assert.ok(summary.tracked <= 5, `${summary.tracked} paths tracked`);
  } finally {
    Client.maxTrackedMissing = maxTrackedMissing;
  }
});

test('production: diagnostics are gated and /api/health keeps only liveness', async () => {
  const status = { timestamp: 't', status: 'ok', hasWarnings: false, summary: { errors: 0 }, details: 'secret' };
  const prod = await startServer({ isProd: true, validationStatus: status });
  try {
    assert.strictEqual((await fetch(prod.base + '/api/missing-files')).status, 404);
    assert.strictEqual((await fetch(prod.base + '/api/cache-stats')).status, 404);
    // The whole file list: about 10 MB of JSON for a real client, and never asked for by roBrowser.
    assert.strictEqual((await fetch(prod.base + '/list-files')).status, 404);

    const res = await fetch(prod.base + '/api/health');
    assert.strictEqual(res.status, 200, '/api/health must stay reachable for health checks');
    assert.deepStrictEqual(Object.keys(await res.json()).sort(), ['hasWarnings', 'status', 'summary', 'timestamp']);
  } finally {
    await prod.close();
  }
});

// ── Static roBrowser mount (ENABLE_STATIC_SERVE) ──

test('the static mount serves the checkout but denies dot-files', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remoteclient-static-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<html>ok</html>');
  fs.writeFileSync(path.join(root, '.env'), 'SECRET=1');
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.git', 'config'), '[core]');

  const srv = await startServer({ staticRoot: root });
  try {
    assert.strictEqual((await fetch(srv.base + '/index.html')).status, 200);
    for (const p of ['/.env', '/.git/config']) {
      const res = await rawGet(srv.base, p);
      assert.notStrictEqual(res.status, 200, `${p} was served from the static mount`);
      assert.ok(!res.body.toString().includes('SECRET'), `${p} leaked its content`);
    }
  } finally {
    await srv.close();
  }
});
