const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const router = express.Router();
const Client = require('../controllers/clientController');
const configs = require('../config/configs');
const { toLatin1 } = require('../utils/mojibake');

// Cache duration settings (in seconds)
const CACHE_DURATIONS = {
  static: 86400,      // 1 day for static game assets
  dynamic: 0,         // No cache for dynamic content
  index: 60,          // 1 minute for index.html
};

// Generate ETag from content
function generateETag(content) {
  return crypto.createHash('md5').update(content).digest('hex').slice(0, 16);
}

// Static game asset extensions
const staticExtensions = [
  '.grf', '.gat', '.rsw', '.gnd', '.rsm', '.str',
  '.spr', '.act', '.pal', '.bmp', '.tga', '.jpg', '.jpeg', '.png', '.gif',
  '.wav', '.mp3', '.ogg',
  '.txt', '.xml', '.lub', '.lua'
];

// Set cache headers based on file type, returns ETag
function setCacheHeaders(res, filePath, content, cachedETag) {
  const ext = path.extname(filePath).toLowerCase();

  if (staticExtensions.includes(ext)) {
    // Use pre-computed ETag from cache when available, otherwise compute
    const etag = cachedETag || generateETag(content);
    res.set('ETag', `"${etag}"`);
    res.set('Cache-Control', `public, max-age=${CACHE_DURATIONS.static}, immutable`);
    res.set('Last-Modified', new Date().toUTCString());
    return etag;
  }

  // Default - no cache
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  return null;
}

// Longest accepted search pattern. The client sends RegExp.source, which is short in practice -- the
// longest GRF Viewer directory pattern the bRO data.grf can produce is 105 characters -- and the cap
// keeps a hostile pattern from being arbitrarily complex.
const MAX_FILTER_LENGTH = 256;

// Ceiling on the raw bytes one /batch response may assemble in memory. Bodies are
// base64-encoded on top of this, so the socket sees roughly 4/3 of it.
const MAX_BATCH_BYTES = 32 * 1024 * 1024;

/**
 * Wrap an async handler so a rejected promise reaches Express instead of
 * surfacing as an unhandled rejection. Express 4 does not await handlers, so
 * without this an async throw crashes the process.
 */
function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

// Check if client has valid cached version
function checkConditionalRequest(req, etag) {
  const ifNoneMatch = req.headers['if-none-match'];
  if (ifNoneMatch && etag && ifNoneMatch === `"${etag}"`) {
    return true;
  }
  return false;
}

// The GRF index is built by index.js, which awaits it before listening. It used to be started here, as a
// side effect of requiring this module -- which also made the app impossible to import without parsing
// every configured GRF.

/**
 * File search, as roBrowser's FileManager.search calls it: a synchronous POST to the remote client's
 * root URL, form-encoded `filter=<RegExp.source>`. Only the map, model, STR, Granny and GRF viewers
 * search; the game does not.
 *
 * The contract, all of it dictated by the client:
 * - The answer is the matched substrings, one per line, as Client.search describes -- not whole paths.
 * - The body is the name bytes as they are in the GRF, labelled ISO-8859-1. The client decodes it that
 *   way (overrideMimeType) and reuses each line as a path, so re-encoding the names as UTF-8 would hand
 *   it names that exist nowhere.
 * - Anything that is not a result -- search disabled, a bad pattern, a timeout -- is an empty 200. The
 *   client ignores the status and splits whatever body it gets on newlines, so an error message would
 *   come back to it as file names. X-Search-Error says what happened, for anyone debugging.
 */
async function search(req, res) {
  res.set('Content-Type', 'text/plain; charset=ISO-8859-1');
  res.set('Cache-Control', 'no-store');

  const reply = (matches, error) => {
    if (error) res.set('X-Search-Error', error);
    res.send(Buffer.from(matches.join('\n'), 'latin1'));
  };

  const filter = req.body && req.body.filter;
  if (!configs.CLIENT_ENABLESEARCH) return reply([], 'disabled');
  if (typeof filter !== 'string' || filter.length === 0) return reply([], 'invalid-filter');
  if (filter.length > MAX_FILTER_LENGTH) return reply([], 'filter-too-long');

  // A pattern built from a previous result, like a GRF Viewer folder, holds the windows-1252 spelling of
  // bytes 0x80-0x9F; the tables hold one character per byte.
  const pattern = toLatin1(filter);
  try {
    new RegExp(pattern, 'gi');
  } catch (e) {
    return reply([], 'invalid-pattern');
  }

  try {
    reply(await Client.search(pattern));
  } catch (err) {
    // The pattern overran its deadline and the worker was terminated -- the expected outcome for a
    // catastrophic pattern, not a server fault.
    reply([], 'timeout');
  }
}

router.post('/', asyncRoute(search));
// The route this server used to answer on. The client never called it, but other tools may.
router.post('/search', asyncRoute(search));

// Batch file endpoint - fetch multiple files in a single request
router.post('/batch', asyncRoute(async (req, res) => {
  const { files } = req.body;
  if (!Array.isArray(files) || files.length === 0 || files.length > 50) {
    return res.status(400).json({ error: 'Invalid files array (1-50 files)' });
  }

  const results = {};
  let totalBytes = 0;
  let truncated = false;

  await Promise.all(files.map(async (filePath) => {
    if (typeof filePath !== 'string') return;
    try {
      const content = await Client.getFile(filePath);
      if (!content) return;

      // 50 files carry no size limit of their own; without this a caller can ask
      // for the largest assets in the archive and pin them all in memory at once.
      if (totalBytes + content.length > MAX_BATCH_BYTES) {
        truncated = true;
        return;
      }
      totalBytes += content.length;
      results[filePath] = content.toString('base64');
    } catch (e) {
      // Skip files that fail
    }
  }));

  if (truncated) {
    res.set('X-Batch-Truncated', '1');
  }
  res.json(results);
}));

// List files endpoint
router.get('/list-files', asyncRoute(async (req, res) => {
  const files = Client.listFiles();
  res.set('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
  res.json(files);
}));

// Wildcard route for file serving
router.get('/*', asyncRoute(async (req, res) => {
  const filePath = req.params[0];

  // Serve index.html for root
  if (filePath === '') {
    const indexPath = path.join(__dirname, '..', '..', 'index.html');
    if (!fs.existsSync(indexPath)) {
      return res.status(404).send('index.html not found. Please create an index.html file in the project root.');
    }
    res.set('Cache-Control', `public, max-age=${CACHE_DURATIONS.index}`);
    res.type(path.extname('index.html'));
    return res.send(fs.readFileSync(indexPath, 'utf8'));
  }

  // Try to get pre-computed ETag from cache first (avoids MD5 on every request)
  const cachedEntry = Client.getFileCachedETag ? Client.getFileCachedETag(filePath) : null;

  if (cachedEntry) {
    // Check conditional request using cached ETag before sending data
    if (checkConditionalRequest(req, cachedEntry.etag)) {
      return res.status(304).end();
    }

    // Set content type and cache headers using cached ETag
    res.type(path.extname(filePath));
    setCacheHeaders(res, filePath, cachedEntry.data, cachedEntry.etag);
    return res.send(cachedEntry.data);
  }

  // Cache miss - fetch from GRF or local filesystem
  const fileContent = await Client.getFile(filePath);

  if (!fileContent) {
    res.set('Cache-Control', 'no-store');
    return res.status(404).send('File not found');
  }

  // Set content type
  res.type(path.extname(filePath));

  // Set cache headers and get ETag (computed fresh since not in cache)
  const etag = setCacheHeaders(res, filePath, fileContent, null);

  // Check if client has valid cached version (304 Not Modified)
  if (checkConditionalRequest(req, etag)) {
    return res.status(304).end();
  }

  res.send(fileContent);
}));

module.exports = router;
