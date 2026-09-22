/**
 * Start the real Express app on an ephemeral port, optionally backed by a synthetic GRF.
 *
 * node --test runs each test file in its own process, so the clientController singleton (file index,
 * LRU cache) is private to the file that uses this helper.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { buildGrf } = require('./grfBuilder');
const { clientName } = require('./roBrowser');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Refuse to run when the working tree holds a file under a test archive name.
 *
 * The server reads <project>/data before any GRF, and AutoExtract fills that folder with every file a
 * running game requests. A test name that exists there is answered from disk, with the real asset --
 * a failure that looks like a server bug. Both spellings are checked: AutoExtract writes the path as
 * requested, which is the client's.
 */
function assertNotShadowed(files) {
  for (const { name } of files) {
    for (const spelling of [name, clientName(name)]) {
      const onDisk = path.join(PROJECT_ROOT, ...spelling.split('\\'));
      if (fs.existsSync(onDisk)) {
        throw new Error(`${onDisk} exists, so the server would serve it instead of the test archive's ` +
          `"${name}". Rename the test file, or move that file out of the working tree.`);
      }
    }
  }
}

/**
 * @param {object} [appOptions] passed to createApp()
 * @param {{ files?: Array<{name: string, content: Buffer|string}> }} [data] archive contents
 * @returns {Promise<{ base: string, server: http.Server, close: () => Promise<void> }>}
 */
async function startServer(appOptions = {}, { files } = {}) {
  const Client = require('../../src/controllers/clientController');
  const { createApp } = require('../../src/app');

  // AutoExtract would write every GRF hit into the repository's data/ folder -- polluting the working
  // tree, and on the next run serving that copy instead of the archive, so tests would pass for the
  // wrong reason.
  Client.AutoExtract = false;

  if (files) {
    assertNotShadowed(files);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remoteclient-test-'));
    buildGrf(path.join(dir, 'test.grf'), files);
    fs.writeFileSync(path.join(dir, 'DATA.INI'), '[Data]\n0=test.grf\n');
    await Client.init({ dataIniPath: path.join(dir, 'DATA.INI') });
  }

  const app = createApp({ requestLogging: false, ...appOptions });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    server,
    base: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/**
 * GET with the request path sent verbatim.
 *
 * fetch() normalises the path -- it resolves "..", for one -- so it cannot express the raw requests a
 * path-traversal test needs. This goes through http.request, which puts the path on the wire as given.
 */
function rawGet(base, rawPath, headers = {}) {
  const { hostname, port } = new URL(base);
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname, port, path: rawPath, method: 'GET', headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

module.exports = { startServer, rawGet };
