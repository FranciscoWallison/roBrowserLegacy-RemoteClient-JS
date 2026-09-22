/**
 * BGM_PATH, SYSTEM_PATH, AI_PATH: loose client folders kept outside the project.
 *
 * Music, fonts and AI scripts are not in any GRF. Before these variables they had to be copied into
 * the project, or linked with junctions or symlinks.
 */
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import configs from '../src/config/configs.js';
import logger from '../src/utils/logger.js';
import { startServer, rawGet } from './helpers/server.js';

const SONG = Buffer.from(Array.from({ length: 2048 }, (_, i) => i % 256));
let srv;
let saved;
let outside;

test.before(async () => {
  const client = fs.mkdtempSync(path.join(os.tmpdir(), 'remoteclient-client-'));
  for (const dir of ['BGM', 'System', 'AI']) fs.mkdirSync(path.join(client, dir));
  fs.writeFileSync(path.join(client, 'BGM', 'test_theme.mp3'), SONG);
  fs.writeFileSync(path.join(client, 'System', 'test_font.eot'), 'font bytes');
  fs.writeFileSync(path.join(client, 'AI', 'test_ai.lua'), '-- ai script');

  // A link inside BGM/ that leads out of it. A junction needs no privileges on Windows; elsewhere
  // Node creates a plain directory symlink.
  outside = fs.mkdtempSync(path.join(os.tmpdir(), 'remoteclient-outside-'));
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'must not be served');
  fs.symlinkSync(outside, path.join(client, 'BGM', 'escape'), 'junction');

  saved = { ...configs.ASSET_DIRS };
  configs.ASSET_DIRS.bgm = path.join(client, 'BGM');
  configs.ASSET_DIRS.system = path.join(client, 'System');
  configs.ASSET_DIRS.ai = path.join(client, 'AI');
  srv = await startServer();
});

test.after(async () => {
  Object.assign(configs.ASSET_DIRS, saved);
  await srv.close();
});

test('serves BGM/, System/ and AI/ from the configured folders', async () => {
  const bgm = await rawGet(srv.base, '/BGM/test_theme.mp3');
  assert.strictEqual(bgm.status, 200);
  assert.deepStrictEqual(bgm.body, SONG);

  assert.strictEqual((await rawGet(srv.base, '/System/test_font.eot')).body.toString(), 'font bytes');
  assert.strictEqual((await rawGet(srv.base, '/AI/test_ai.lua')).body.toString(), '-- ai script');
});

test('the folder name in the URL is case-insensitive, as the client is', async () => {
  assert.strictEqual((await rawGet(srv.base, '/bgm/test_theme.mp3')).status, 200);
  assert.strictEqual((await rawGet(srv.base, '/SYSTEM/test_font.eot')).status, 200);
});

test('byte ranges work on music from BGM_PATH', async () => {
  const res = await rawGet(srv.base, '/BGM/test_theme.mp3', { Range: 'bytes=10-19' });
  assert.strictEqual(res.status, 206);
  assert.deepStrictEqual(res.body, SONG.subarray(10, 20));
});

test('a path cannot climb out of the folder', async () => {
  for (const p of ['/BGM/../System/test_font.eot', '/BGM/..%2f..%2fsecret.txt', '/BGM/%2e%2e/%2e%2e/etc/passwd']) {
    const res = await rawGet(srv.base, p);
    assert.notStrictEqual(res.status, 200, `${p} answered 200`);
  }
});

test('a junction or symlink inside the folder cannot lead out of it', async () => {
  const res = await rawGet(srv.base, '/BGM/escape/secret.txt');
  assert.strictEqual(res.status, 404);
  assert.ok(!res.body.toString().includes('must not be served'));
});

test('a request for a folder answers 404 without logging a read error', async () => {
  // A folder passed the old existence check and reached readFileSync, which logged EISDIR each time.
  const folder = path.join(configs.PROJECT_ROOT, 'data', '__folder_request_test__');
  fs.mkdirSync(folder, { recursive: true });
  const { error } = logger;
  const logged = [];
  logger.error = (...args) => logged.push(args.join(' '));
  try {
    assert.strictEqual((await rawGet(srv.base, '/data/__folder_request_test__')).status, 404);
    assert.deepStrictEqual(logged, []);
  } finally {
    logger.error = error;
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

test('other folders are not reachable through these variables', async () => {
  // Only BGM/, System/ and AI/ map to a configured folder; data/ still goes to the project and the GRFs.
  assert.strictEqual((await rawGet(srv.base, '/data/test_theme.mp3')).status, 404);
  assert.strictEqual((await rawGet(srv.base, '/BGM')).status, 404);
});
