/**
 * The archives are opened and parsed once, however many parts of the server read them.
 *
 * At boot the startup validator and Client.init() run at the same time over the same GRFs. Each used to
 * open and parse its own copy -- three parses of the file table of every archive, on the bRO data.grf
 * about 1.5 s each and three copies of it in memory.
 */
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openArchive, closeArchives, openArchiveCount } from '../src/utils/grfArchive.js';
import { GrfNode } from '../src/utils/grfLoader.js';
import StartupValidator from '../src/validators/startupValidator.js';
import Client from '../src/controllers/clientController.js';
import { buildGrf } from './helpers/grfBuilder.js';

const FILES = [
  { name: 'data\\texture\\basepic\\loading01.txt', content: 'loading '.repeat(8) },
  { name: 'data\\texture\\유저인터페이스\\basic.txt', content: 'basico '.repeat(8) },
];

/** A temporary archive, plus the DATA.INI that points at it. */
function makeArchive(name = 'test.grf') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remoteclient-archive-'));
  const archive = path.join(dir, name);
  buildGrf(archive, FILES);
  const dataIni = path.join(dir, 'DATA.INI');
  fs.writeFileSync(dataIni, `[Data]\r\n0=${archive}\r\n`);
  return { dir, archive, dataIni };
}

test.afterEach(() => closeArchives());

test('two callers get the same loaded archive', async () => {
  const { archive } = makeArchive();
  const [first, second] = await Promise.all([openArchive(archive), openArchive(archive)]);

  assert.strictEqual(first, second);
  assert.strictEqual(openArchiveCount(), 1);
  assert.strictEqual(first.files.size, FILES.length);
});

test('the validator and Client.init() parse the archive once between them', async () => {
  const { archive, dataIni } = makeArchive();
  const validator = new StartupValidator();

  // Counting loads, not open descriptors: parsing the file table is the work worth not repeating.
  const load = GrfNode.prototype.load;
  let loads = 0;
  GrfNode.prototype.load = function counted(...args) {
    loads++;
    return load.apply(this, args);
  };

  let format;
  try {
    [format] = await Promise.all([validator.validateGrfFormat(archive), Client.init({ dataIniPath: dataIni })]);
  } finally {
    GrfNode.prototype.load = load;
  }

  assert.strictEqual(format.valid, true, format.reason);
  assert.strictEqual(loads, 1, 'the archive was parsed more than once');
  assert.strictEqual(openArchiveCount(), 1);
  assert.ok(await Client.getFile(FILES[0].name), 'the server still reads from the shared archive');
});

test('an archive that fails to load is not kept', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remoteclient-archive-'));
  const broken = path.join(dir, 'broken.grf');
  fs.writeFileSync(broken, Buffer.alloc(64, 0x41)); // no "Master of Magic" signature

  await assert.rejects(openArchive(broken));
  assert.strictEqual(openArchiveCount(), 0, 'a failed load must not be cached');
});

test('closeArchives() releases them, and opening again works', async () => {
  const { archive } = makeArchive();
  await openArchive(archive);
  assert.strictEqual(openArchiveCount(), 1);

  closeArchives();
  assert.strictEqual(openArchiveCount(), 0);

  const reopened = await openArchive(archive);
  assert.strictEqual(reopened.files.size, FILES.length);
});

test('a second archive is opened on its own', async () => {
  const one = makeArchive('one.grf');
  const two = makeArchive('two.grf');

  const [a, b] = await Promise.all([openArchive(one.archive), openArchive(two.archive)]);
  assert.notStrictEqual(a, b);
  assert.strictEqual(openArchiveCount(), 2);
});
