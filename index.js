require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const zlib = require('zlib');
const StartupValidator = require('./src/validators/startupValidator');

const app = express();
const port = process.env.PORT || 3338;
const routes = require('./src/routes');
const debugMiddleware = require('./src/middlewares/debugMiddleware');

const CLIENT_PUBLIC_URL = process.env.CLIENT_PUBLIC_URL || 'http://localhost:8000';

// Global variable to store validation status
let validationStatus = null;

// Compression middleware for text-based responses
function compressionMiddleware(req, res, next) {
  const acceptEncoding = req.headers['accept-encoding'] || '';

  // Skip compression for small responses or binary files
  const originalSend = res.send.bind(res);

  res.send = function (body) {
    // Only compress text-based content types
    const contentType = res.get('Content-Type') || '';
    const isCompressible = /text|json|javascript|xml|html/.test(contentType);

    if (!isCompressible || !body || body.length < 1024) {
      return originalSend(body);
    }

    if (acceptEncoding.includes('gzip')) {
      zlib.gzip(body, (err, compressed) => {
        if (err) return originalSend(body);
        res.set('Content-Encoding', 'gzip');
        res.set('Content-Length', compressed.length);
        originalSend(compressed);
      });
    } else if (acceptEncoding.includes('deflate')) {
      zlib.deflate(body, (err, compressed) => {
        if (err) return originalSend(body);
        res.set('Content-Encoding', 'deflate');
        res.set('Content-Length', compressed.length);
        originalSend(compressed);
      });
    } else {
      originalSend(body);
    }
  };

  next();
}

// Main startup function
async function startServer() {
  // Run startup validation
  console.log('🚀 Starting roBrowser Remote Client...\n');

  const validator = new StartupValidator();
  const results = await validator.validateAll();

  // Store status for API endpoint
  validationStatus = validator.getStatusJSON();

  // Print report
  const isValid = validator.printReport(results);

  // If there are fatal errors, exit
  if (!isValid) {
    console.error('❌ Server cannot start due to configuration errors.');
    console.error('💡 Run "npm run doctor" for a full diagnosis.\n');
    process.exit(1);
  }

  // CORS setup
  const corsOptions = {
    origin: [CLIENT_PUBLIC_URL, 'http://localhost:3338', 'http://127.0.0.1:8080', 'http://localhost:8080'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    credentials: true,
  };

  app.use(cors(corsOptions));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(compressionMiddleware);
  app.use(debugMiddleware);

  // Validation status endpoint (JSON for frontend)
  app.get('/api/health', (req, res) => {
    const Client = require('./src/controllers/clientController');
    const missingInfo = Client.getMissingFilesSummary ? Client.getMissingFilesSummary() : null;
    const cacheStats = Client.getCacheStats ? Client.getCacheStats() : null;
    const indexStats = Client.getIndexStats ? Client.getIndexStats() : null;

    res.json({
      ...validationStatus,
      missingFiles: missingInfo,
      cache: cacheStats,
      index: indexStats,
    });
  });

  // Missing files endpoint
  app.get('/api/missing-files', (req, res) => {
    const Client = require('./src/controllers/clientController');
    const summary = Client.getMissingFilesSummary ? Client.getMissingFilesSummary() : { total: 0, files: [] };
    res.json(summary);
  });

  // Cache stats endpoint
  app.get('/api/cache-stats', (req, res) => {
    const Client = require('./src/controllers/clientController');
    res.json({
      cache: Client.getCacheStats ? Client.getCacheStats() : null,
      index: Client.getIndexStats ? Client.getIndexStats() : null,
    });
  });

  // API routes
  app.use('/', routes);

  app.listen(port, () => {
    console.log('\n✅ Server started successfully!');
    console.log(`🌐 URL: http://localhost:${port}`);
    console.log(`📊 Status: http://localhost:${port}/api/health\n`);
  });
}

// Start server
startServer().catch((error) => {
  console.error('\n❌ Fatal error while starting server:', error);
  process.exit(1);
});
