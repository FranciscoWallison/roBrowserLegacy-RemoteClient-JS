/**
 * The startup check warns below the Node version the server needs -- the minimum in package.json
 * "engines" -- instead of the v14 it used to recommend.
 */
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import StartupValidator from '../src/validators/startupValidator.js';

const real = Object.getOwnPropertyDescriptor(process, 'version');

function warningsFor(version) {
  Object.defineProperty(process, 'version', { ...real, value: version });
  try {
    const validator = new StartupValidator();
    validator.validateNodeVersion();
    return validator.warnings.filter((w) => w.includes('Node.js'));
  } finally {
    Object.defineProperty(process, 'version', real);
  }
}

test('warns below v22.12', () => {
  for (const version of ['v18.20.4', 'v20.18.0', 'v22.11.0']) {
    assert.strictEqual(warningsFor(version).length, 1, `${version} was not flagged`);
  }
});

test('stays quiet from v22.12 on', () => {
  for (const version of ['v22.12.0', 'v22.20.0', 'v24.14.0', 'v25.0.0']) {
    assert.deepStrictEqual(warningsFor(version), [], `${version} was flagged`);
  }
});

test('matches the minimum declared in package.json', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'package.json'), 'utf8'));
  assert.strictEqual(pkg.engines.node, '>=22.12');
});
