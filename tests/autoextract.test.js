/**
 * CLIENT_AUTOEXTRACT: off unless asked for, and when on, writing only where it may.
 *
 * It was always on, fixed in the source. Every file a game requested from a GRF was written into the
 * project's data/ folder -- which the server reads before DATA_OVERRIDE_PATH, so those copies hid the
 * translated files the override provides. Seen on a real setup: four translated tables replaced by the
 * Korean originals from the GRF.
 */
import test from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import Client from '../src/controllers/clientController.js';
import { isSafeFileName } from '../src/utils/safePath.js';
import { startServer } from './helpers/server.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONFIGS = pathToFileURL(path.join(ROOT, 'src', 'config', 'configs.js')).href;

/** CLIENT_AUTOEXTRACT as configs.js reads it, in a fresh process with the given environment value. */
function autoExtractWith(value) {
  const env = { ...process.env };
  delete env.CLIENT_AUTOEXTRACT;
  if (value !== undefined) env.CLIENT_AUTOEXTRACT = value;
  return execFileSync(process.execPath, ['--input-type=module', '-e',
    `const { default: c } = await import(${JSON.stringify(CONFIGS)}); process.stdout.write(String(c.CLIENT_AUTOEXTRACT));`],
  { env, encoding: 'utf8' });
}

test('off by default, on only with CLIENT_AUTOEXTRACT=true', () => {
  assert.strictEqual(autoExtractWith(undefined), 'false');
  assert.strictEqual(autoExtractWith('false'), 'false');
  assert.strictEqual(autoExtractWith('true'), 'true');
});

/** Wait for the write that extractFile() schedules with setImmediate. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

test('when on, a file read from a GRF lands in data/, and nowhere outside the asset folders', async () => {
  const INSIDE = { name: 'data\\__autoextract_test__\\written.txt', content: 'extract me '.repeat(10) };
  // resources/ holds DATA.INI and the archives: a request must never write there.
  const OUTSIDE = { name: 'resources\\__autoextract_test__.txt', content: 'do not extract me '.repeat(10) };
  const inside = path.join(ROOT, 'data', '__autoextract_test__', 'written.txt');
  const outside = path.join(ROOT, 'resources', '__autoextract_test__.txt');

  const srv = await startServer({}, { files: [INSIDE, OUTSIDE] });
  Client.AutoExtract = true;
  try {
    assert.strictEqual((await fetch(srv.base + '/data/__autoextract_test__/written.txt')).status, 200);
    assert.strictEqual((await fetch(srv.base + '/resources/__autoextract_test__.txt')).status, 200);
    await settle();

    assert.ok(fs.existsSync(inside), 'the file was not extracted into data/');
    assert.strictEqual(fs.readFileSync(inside, 'utf8'), INSIDE.content);
    assert.ok(!fs.existsSync(outside), 'a file was written into resources/');
  } finally {
    Client.AutoExtract = false;
    fs.rmSync(path.join(ROOT, 'data', '__autoextract_test__'), { recursive: true, force: true });
    fs.rmSync(outside, { force: true });
    await srv.close();
  }
});

// ── Names Windows would reinterpret, refused as file names there ──

test('on Windows, device names, streams, wildcards and trailing dots or spaces are refused', () => {
  for (const name of [
    'data/nul', 'data/NUL.txt', 'data/com1.spr', 'data/lpt9', 'data/aux.bmp', 'data/con/x.bmp',
    'data/x.txt:stream', 'data/*.spr', 'data/a?.bmp', 'data/x.txt.', 'data/x.txt ', 'data/a\u0001b',
  ]) {
    assert.strictEqual(isSafeFileName(name, 'win32'), false, `${name} was accepted`);
  }
});

test('on Windows, ordinary and mojibake asset names are accepted', () => {
  for (const name of [
    'data/sprite/foo.spr', 'data\\texture\\basepic\\loading01.jpg', 'data/console.txt', 'data/nullpo.bmp',
    'data/texture/À¯ÀúÀÎ/a.bmp', 'data/sprite/Œc¾ç.spr',
  ]) {
    assert.strictEqual(isSafeFileName(name, 'win32'), true, `${name} was refused`);
  }
});

test('elsewhere those names are ordinary', () => {
  assert.strictEqual(isSafeFileName('data/nul.txt', 'linux'), true);
  assert.strictEqual(isSafeFileName('data/x.txt.', 'linux'), true);
});
