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
