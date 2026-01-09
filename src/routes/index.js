const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const router = express.Router();
const Client = require('../controllers/clientController');
const configs = require('../config/configs');

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

// Set cache headers based on file type
function setCacheHeaders(res, filePath, content) {
  const ext = path.extname(filePath).toLowerCase();

  // Static game assets - long cache
  const staticExtensions = [
    '.grf', '.gat', '.rsw', '.gnd', '.rsm', '.str',
    '.spr', '.act', '.pal', '.bmp', '.tga', '.jpg', '.jpeg', '.png', '.gif',
    '.wav', '.mp3', '.ogg',
    '.txt', '.xml', '.lub', '.lua'
  ];

  if (staticExtensions.includes(ext)) {
    const etag = generateETag(content);
    res.set('ETag', `"${etag}"`);
    res.set('Cache-Control', `public, max-age=${CACHE_DURATIONS.static}, immutable`);
    res.set('Last-Modified', new Date().toUTCString());
    return etag;
  }

  // Default - no cache
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  return null;
}

// Check if client has valid cached version
function checkConditionalRequest(req, etag) {
  const ifNoneMatch = req.headers['if-none-match'];
  if (ifNoneMatch && etag && ifNoneMatch === `"${etag}"`) {
    return true;
  }
  return false;
}

// Initialize client on startup
(async () => {
  await Client.init();
})();

router.post('/search', (req, res) => {
  const filter = req.body.filter;
  if (!configs.CLIENT_ENABLESEARCH || !filter) {
    return res.status(400).send('Search feature is disabled or invalid filter');
  }

  const regex = new RegExp(filter, 'i');
  const files = Client.search(regex);
  res.send(files.join('\n'));
});

// List files endpoint
router.get('/list-files', async (req, res) => {
  const files = Client.listFiles();
  res.set('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
  res.json(files);
});

// Wildcard route for file serving
router.get('/*', async (req, res) => {
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

  // Get file from GRF or local filesystem
  const fileContent = await Client.getFile(filePath);

  if (!fileContent) {
    res.set('Cache-Control', 'no-store');
    return res.status(404).send('File not found');
  }

  // Set content type
  res.type(path.extname(filePath));

  // Set cache headers and get ETag
  const etag = setCacheHeaders(res, filePath, fileContent);

  // Check if client has valid cached version (304 Not Modified)
  if (checkConditionalRequest(req, etag)) {
    return res.status(304).end();
  }

  res.send(fileContent);
});

module.exports = router;
