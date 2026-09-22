/**
 * Byte ranges for audio.
 *
 * The client plays BGM by pointing an <audio> element straight at this server. Media elements fetch with
 * `Range: bytes=0-` and seek with further ranges; a server that ignores them makes seeking impossible, and
 * some browsers will not play the file at all.
 */
import test from 'node:test';
import assert from 'node:assert';
import { startServer, rawGet } from './helpers/server.js';

// Bytes 0-255 repeated: compressible enough for the GRF builder, and any slice is easy to predict.
const AUDIO = Buffer.from(Array.from({ length: 4096 }, (_, i) => i % 256));
const MP3 = { name: 'BGM\\test_theme.mp3', content: AUDIO };
const WAV = { name: 'data\\wav\\test_effect.wav', content: AUDIO };
const TEXT = { name: 'data\\test_notes.txt', content: 'not audio '.repeat(50) };

let srv;

test.before(async () => {
  srv = await startServer({}, { files: [MP3, WAV, TEXT] });
});

test.after(async () => {
  await srv.close();
});

const get = (urlPath, headers = {}) => rawGet(srv.base, urlPath, headers);

test('a whole audio file advertises range support', async () => {
  const res = await get('/BGM/test_theme.mp3');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers['accept-ranges'], 'bytes');
  assert.deepStrictEqual(res.body, AUDIO);
});

test('a range answers 206 with exactly those bytes', async () => {
  const res = await get('/BGM/test_theme.mp3', { Range: 'bytes=100-199' });
  assert.strictEqual(res.status, 206);
  assert.strictEqual(res.headers['content-range'], `bytes 100-199/${AUDIO.length}`);
  assert.strictEqual(res.headers['content-length'], '100');
  assert.deepStrictEqual(res.body, AUDIO.subarray(100, 200));
});

test('open-ended and suffix ranges', async () => {
  const tail = await get('/BGM/test_theme.mp3', { Range: 'bytes=4000-' });
  assert.strictEqual(tail.status, 206);
  assert.deepStrictEqual(tail.body, AUDIO.subarray(4000));

  const suffix = await get('/BGM/test_theme.mp3', { Range: 'bytes=-10' });
  assert.strictEqual(suffix.status, 206);
  assert.strictEqual(suffix.headers['content-range'], `bytes ${AUDIO.length - 10}-${AUDIO.length - 1}/${AUDIO.length}`);
  assert.deepStrictEqual(suffix.body, AUDIO.subarray(AUDIO.length - 10));
});

test('a range the file cannot satisfy answers 416', async () => {
  const res = await get('/BGM/test_theme.mp3', { Range: `bytes=${AUDIO.length + 10}-` });
  assert.strictEqual(res.status, 416);
  assert.strictEqual(res.headers['content-range'], `bytes */${AUDIO.length}`);
});

test('a Range header that is not a byte range is ignored and the whole file sent', async () => {
  for (const range of ['nonsense', 'lines=0-9']) {
    const res = await get('/BGM/test_theme.mp3', { Range: range });
    assert.strictEqual(res.status, 200, `Range: ${range}`);
    assert.deepStrictEqual(res.body, AUDIO);
  }
});

test('ranges work from the cache as well as on the first read', async () => {
  // The first request above read the file from the GRF; these come from the LRU cache, a separate branch.
  for (let i = 0; i < 2; i++) {
    const res = await get('/data/wav/test_effect.wav', { Range: 'bytes=0-9' });
    assert.strictEqual(res.status, 206, `request ${i + 1}`);
    assert.deepStrictEqual(res.body, AUDIO.subarray(0, 10));
  }
});

test('If-Range with the current ETag gets the range, with another gets the whole file', async () => {
  const { headers } = await get('/BGM/test_theme.mp3');
  const current = await get('/BGM/test_theme.mp3', { Range: 'bytes=0-9', 'If-Range': headers.etag });
  assert.strictEqual(current.status, 206);

  const stale = await get('/BGM/test_theme.mp3', { Range: 'bytes=0-9', 'If-Range': '"some-older-version"' });
  assert.strictEqual(stale.status, 200);
  assert.deepStrictEqual(stale.body, AUDIO);
});

test('a range response is never compressed', async () => {
  // Content-Range counts the file's bytes; a gzipped body would not match it.
  const res = await get('/data/wav/test_effect.wav', { Range: 'bytes=0-2047', 'Accept-Encoding': 'gzip' });
  assert.strictEqual(res.status, 206);
  assert.strictEqual(res.headers['content-encoding'], undefined);
  assert.deepStrictEqual(res.body, AUDIO.subarray(0, 2048));
});

test('files that are not audio ignore Range', async () => {
  const res = await get('/data/test_notes.txt', { Range: 'bytes=0-9' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers['accept-ranges'], undefined);
  assert.strictEqual(res.body.toString(), TEXT.content);
});
