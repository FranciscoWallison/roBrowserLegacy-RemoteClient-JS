/**
 * Names whose bytes no encoder produces again.
 *
 * The index used to spell a Korean name for the client by encoding the decoded name back to CP949. That
 * works while the name is valid CP949; when it is not -- and real archives do carry such names -- the
 * decoded name holds U+FFFD, which encodes back to "?", and the path the client asks for never matched.
 * The bytes are now taken from the archive itself (rawNameBytes), so the index holds what the client
 * sends.
 */
import test from 'node:test';
import assert from 'node:assert';
import iconv from 'iconv-lite';
import { startServer } from './helpers/server.js';
import { urlPathFor } from './helpers/roBrowser.js';

// data\<0xA1 0xFF>.txt -- 0xA1 starts a CP949 character, 0xFF never finishes one.
const RAW_NAME = Buffer.concat([
  Buffer.from('data\\', 'latin1'),
  Buffer.from([0xa1, 0xff]),
  Buffer.from('.txt', 'latin1'),
]);
const CONTENT = 'payload of a name that does not survive a round trip '.repeat(4);

let dev;

test.before(async () => {
  dev = await startServer({ isProd: false }, { files: [{ name: RAW_NAME, content: CONTENT }] });
});

test.after(async () => {
  await dev.close();
});

test('a name that is not valid CP949 is served at the URL its bytes spell', async () => {
  const res = await fetch(dev.base + urlPathFor(RAW_NAME.toString('latin1')));
  assert.strictEqual(res.status, 200);
  assert.strictEqual(await res.text(), CONTENT);
});

test('the spelling from re-encoding the decoded name is not what the client would send', async () => {
  // What the index used to hold: "data\??.txt", with the two bytes lost.
  const reEncoded = iconv.encode(iconv.decode(RAW_NAME, 'cp949'), 'cp949').toString('latin1');
  assert.notStrictEqual(reEncoded, RAW_NAME.toString('latin1'));

  const res = await fetch(dev.base + urlPathFor(reEncoded));
  assert.strictEqual(res.status, 404);
});
