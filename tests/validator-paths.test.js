/**
 * The startup validator checks the project it belongs to, wherever it is started from, and does not
 * depend on npm being on the PATH.
 */
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import configs from '../src/config/configs.js';
import StartupValidator from '../src/validators/startupValidator.js';
import { buildGrf } from './helpers/grfBuilder.js';

test('the Node check does not run npm, so a PATH without npm is not an error', () => {
  // It ran `npm --version`; where npm was not on the PATH -- a process manager, a container running
  // `node index.js` -- that threw, was reported as an error, and errors stop the server.
  const { PATH, Path } = process.env;
  process.env.PATH = '';
  if (Path !== undefined) process.env.Path = '';
  try {
    const validator = new StartupValidator();
    assert.strictEqual(validator.validateNodeVersion(), true);
    assert.deepStrictEqual(validator.errors, []);
  } finally {
    process.env.PATH = PATH;
    if (Path !== undefined) process.env.Path = Path;
  }
});

test('dependencies are found from any working directory', () => {
  // It looked for package.json and node_modules in process.cwd(): started from elsewhere, the server
  // refused to boot with "package.json not found!".
  const cwd = process.cwd();
  process.chdir(os.tmpdir());
  try {
    const validator = new StartupValidator();
    assert.strictEqual(validator.validateDependencies(), true, validator.errors.join('\n'));
  } finally {
    process.chdir(cwd);
  }
});

test('DATA.INI is read with the server\'s parser: absolute paths and any extension', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remoteclient-validator-'));
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'remoteclient-validator-grf-'));
  const files = [{ name: 'data\\test_validator.txt', content: 'validator payload '.repeat(8) }];
  buildGrf(path.join(elsewhere, 'data.grf'), files);
  buildGrf(path.join(dir, 'patch.gpf'), files);
  fs.writeFileSync(path.join(dir, 'DATA.INI'), `[Data]\n0=patch.gpf\n1=${path.join(elsewhere, 'data.grf')}\n`);

  const saved = configs.DATA_INI_PATH;
  configs.DATA_INI_PATH = path.join(dir, 'DATA.INI');
  try {
    const validator = new StartupValidator();
    assert.strictEqual(await validator.validateGrfs(), true, validator.errors.join('\n'));
    const checked = validator.validationResults.grfs.files.map((f) => f.path);
    assert.deepStrictEqual(checked, [path.join(dir, 'patch.gpf'), path.join(elsewhere, 'data.grf')]);
  } finally {
    configs.DATA_INI_PATH = saved;
  }
});

test('a client folder named in .env must exist and be a folder', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'remoteclient-notadir-')), 'file.txt');
  fs.writeFileSync(file, 'not a folder');

  const saved = { ...configs.ASSET_DIRS };
  configs.ASSET_DIRS.bgm = path.join(os.tmpdir(), 'remoteclient-does-not-exist');
  configs.ASSET_DIRS.ai = file;
  try {
    const validator = new StartupValidator();
    validator.validateRequiredFiles(); // must not throw on the file
    assert.ok(validator.errors.some((e) => e.startsWith('BGM_PATH')), 'a missing BGM_PATH was not reported');
    assert.ok(validator.errors.some((e) => e.startsWith('AI_PATH')), 'an AI_PATH that is a file was not reported');
  } finally {
    Object.assign(configs.ASSET_DIRS, saved);
  }
});
