/**
 * src/env.js: .env from the project root, optional, and never over a variable already set.
 *
 * Each case runs a fresh Node process on a copy of env.js inside a temporary "project", so the real
 * .env of this checkout is neither read nor touched.
 */
import test from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ENV_JS = path.join(import.meta.dirname, '..', 'src', 'env.js');

/** A throwaway project with src/env.js and, optionally, a .env; returns what FOO ends up as. */
function run({ dotenv, env = {}, cwd } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remoteclient-env-'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.copyFileSync(ENV_JS, path.join(root, 'src', 'env.js'));
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
  if (dotenv !== undefined) fs.writeFileSync(path.join(root, '.env'), dotenv);

  const script = `await import(${JSON.stringify(pathToFileURL(path.join(root, 'src', 'env.js')).href)});` +
    'process.stdout.write(String(process.env.FOO));';
  const childEnv = { ...process.env, ...env };
  if (!('FOO' in env)) delete childEnv.FOO;
  return execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: cwd || root,
    env: childEnv,
    encoding: 'utf8',
  });
}

test('loads .env from the project root', () => {
  assert.strictEqual(run({ dotenv: 'FOO=from-file\n' }), 'from-file');
});

test('finds it whatever the current directory', () => {
  assert.strictEqual(run({ dotenv: 'FOO=from-file\n', cwd: os.tmpdir() }), 'from-file');
});

test('a variable already set in the environment wins over the file', () => {
  // start-prod.js depends on this: it sets NODE_ENV=production before .env is read.
  assert.strictEqual(run({ dotenv: 'FOO=from-file\n', env: { FOO: 'from-shell' } }), 'from-shell');
});

test('a missing .env is not an error', () => {
  assert.strictEqual(run(), 'undefined');
});
