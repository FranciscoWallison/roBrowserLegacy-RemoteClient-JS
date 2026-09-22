/**
 * The GRF loader must decode Korean names with iconv-lite.
 *
 * Without it the loader falls back to TextDecoder('euc-kr'), which knows EUC-KR but not CP949's
 * extension to it, so any name using an extension syllable comes out wrong -- 똠 (0x8C 0x63) decodes to
 * a C1 control followed by "c". On the bRO data.grf that was 13 names the client could not reach.
 *
 * Until grf-loader 1.2.0 only its CommonJS build loaded iconv-lite, and src/utils/grfLoader.js went
 * through `createRequire` to get it; the ES module build is fixed, and these tests hold either way.
 */
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import grfLoader from '../src/utils/grfLoader.js';
import Grf from '../src/controllers/grfController.js';
import { buildGrf } from './helpers/grfBuilder.js';

test('the loader has iconv-lite', () => {
  assert.strictEqual(grfLoader.hasIconvLite(), true);
});

test('a name using a CP949 extension syllable decodes to the right Korean', async () => {
  const names = [
    'data\\sprite\\아이템\\똠테스트.spr', // 똠: CP949 extension, unknown to EUC-KR
    'data\\texture\\유저인터페이스\\test_basic.bmp', // plain EUC-KR
    'data\\texture\\유저인터페이스\\cardbmp\\웤테스트.bmp', // 웤 (0x9F 0x70): extension too
  ];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remoteclient-loader-'));
  const archive = path.join(dir, 'test.grf');
  buildGrf(archive, names.map((name) => ({ name, content: `payload of ${name} `.repeat(8) })));

  const grf = new Grf(archive);
  await grf.load();
  assert.deepStrictEqual(grf.listFiles().sort(), [...names].sort());
});
