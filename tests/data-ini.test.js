/**
 * DATA.INI: the one parser, and the server loading archives the way it says.
 */
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseDataIni, resolveGrfPath } from '../src/utils/dataIni.js';
import { buildGrf } from './helpers/grfBuilder.js';
import { startServer } from './helpers/server.js';

test('reads the [Data] section only, in any case, skipping comments', () => {
  const ini = [
    '0=before-any-section.grf',
    '[Other]',
    '0=other-section.grf',
    '[DATA]',
    '; 5=commented.grf',
    '# 6=commented.grf',
    '1=data.grf',
    '[data]',
    '2=rdata.grf',
  ].join('\n');
  assert.deepStrictEqual(parseDataIni(ini), ['data.grf', 'rdata.grf']);
});

test('orders entries by number, lowest first, whatever the order in the file', () => {
  assert.deepStrictEqual(parseDataIni('[Data]\n2=c.grf\n0=a.grf\n10=d.grf\n1=b.grf\n'), ['a.grf', 'b.grf', 'c.grf', 'd.grf']);
});

test('a number used twice keeps the last value, as in the client', () => {
  assert.deepStrictEqual(parseDataIni('[Data]\n0=first.grf\n0=second.grf\n'), ['second.grf']);
});

test('ignores keys that are not numbers, and empty values', () => {
  assert.deepStrictEqual(parseDataIni('[Data]\nname=x.grf\n0=\n1=a.grf\n'), ['a.grf']);
});

test('keeps spaces inside a path and handles CRLF', () => {
  assert.deepStrictEqual(parseDataIni('[Data]\r\n0 = C:\\Program Files\\RO\\data.grf \r\n'), ['C:\\Program Files\\RO\\data.grf']);
});

test('keeps any extension -- .gpf patches too', () => {
  // The startup validator used to drop anything not ending in .grf, while the server loaded it.
  assert.deepStrictEqual(parseDataIni('[Data]\n0=patch.gpf\n1=data.grf\n'), ['patch.gpf', 'data.grf']);
});

test('an absolute path stays; a relative one is resolved from DATA.INI\'s folder', () => {
  const dataIni = path.join(os.tmpdir(), 'client', 'resources', 'DATA.INI');
  const elsewhere = path.resolve(os.tmpdir(), 'other-drive', 'data.grf');
  assert.strictEqual(resolveGrfPath(dataIni, elsewhere), elsewhere);
  assert.strictEqual(resolveGrfPath(dataIni, 'data.grf'), path.join(os.tmpdir(), 'client', 'resources', 'data.grf'));
});

test('the server loads an archive by absolute path, and the lowest number wins a shared file', async () => {
  const name = 'data\\test_priority.txt';
  const iniDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remoteclient-ini-'));
  const otherDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remoteclient-other-'));
  const low = path.join(otherDir, 'low.grf'); // absolute, outside DATA.INI's folder
  buildGrf(low, [{ name, content: 'from the lowest number '.repeat(8) }]);
  buildGrf(path.join(iniDir, 'high.grf'), [{ name, content: 'from a higher number '.repeat(8) }]);
  fs.writeFileSync(path.join(iniDir, 'DATA.INI'), `[Data]\n5=high.grf\n0=${low}\n`);

  const srv = await startServer({}, { dataIniPath: path.join(iniDir, 'DATA.INI'), assertNames: [name] });
  try {
    const res = await fetch(srv.base + '/data/test_priority.txt');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(await res.text(), 'from the lowest number '.repeat(8));
  } finally {
    await srv.close();
  }
});
