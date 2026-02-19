require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const zlib = require('zlib');
const net = require('net');
const logger = require('./src/utils/logger');
const StartupValidator = require('./src/validators/startupValidator');

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3338;
const routes = require('./src/routes');
const debugMiddleware = require('./src/middlewares/debugMiddleware');

const CLIENT_PUBLIC_URL = process.env.CLIENT_PUBLIC_URL || 'http://localhost:8000';
const ENABLE_WSPROXY = process.env.ENABLE_WSPROXY === 'true';
const ENABLE_STATIC_SERVE = process.env.ENABLE_STATIC_SERVE === 'true';
const ROBROWSER_PATH = process.env.ROBROWSER_PATH || '../roBrowserLegacy';
const IS_PROD = process.env.NODE_ENV === 'production';

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
  logger.info(`Starting roBrowser Remote Client... [${IS_PROD ? 'production' : 'development'}]\n`);

  const validator = new StartupValidator();
  const results = await validator.validateAll();

  // Store status for API endpoint
  validationStatus = validator.getStatusJSON();

  // Print report (verbose in dev, silent in prod unless errors)
  if (IS_PROD) {
    if (!results.success) {
      validator.printReport(results);
    }
  } else {
    validator.printReport(results);
  }

  // If there are fatal errors, exit
  if (!results.success) {
    logger.error('Server cannot start due to configuration errors.');
    logger.error('Run "npm run doctor" for a full diagnosis.\n');
    process.exit(1);
  }

  // CORS setup - allow all localhost variations
  const corsOptions = {
    origin: [
      CLIENT_PUBLIC_URL,
      'http://localhost:8000',
      'http://127.0.0.1:8000',
      'http://localhost:8080',
      'http://127.0.0.1:8080',
      'http://localhost:3338',
      'http://127.0.0.1:3338',
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    credentials: true,
  };

  app.use(cors(corsOptions));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(compressionMiddleware);

  // Debug middleware only in development
  if (!IS_PROD) {
    app.use(debugMiddleware);
  }

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

  // Serve roBrowserLegacy static files (replaces live-server)
  if (ENABLE_STATIC_SERVE) {
    const roBrowserAbsPath = path.resolve(__dirname, ROBROWSER_PATH);
    logger.debug(`Static serve enabled: ${roBrowserAbsPath}`);
    app.use(express.static(roBrowserAbsPath));
  }

  // API routes (GRF file serving, search, etc.)
  app.use('/', routes);

  // Embedded WebSocket proxy (replaces standalone wsproxy)
  if (ENABLE_WSPROXY) {
    const WebSocket = require('ws');
    const wss = new WebSocket.Server({ noServer: true });

    // Allowed rAthena targets (security: only local game servers)
    const ALLOWED_TARGETS = [
      '127.0.0.1:6900',  // Login
      '127.0.0.1:6121',  // Char
      '127.0.0.1:5121',  // Map
    ];

    server.on('upgrade', (req, socket, head) => {
      if (req.url.startsWith('/ws/')) {
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit('connection', ws, req);
        });
      } else {
        socket.destroy();
      }
    });

    wss.on('connection', (ws, req) => {
      const target = req.url.replace('/ws/', '');
      const [host, targetPort] = target.split(':');

      if (!ALLOWED_TARGETS.includes(target)) {
        logger.warn(`WS proxy blocked connection to: ${target}`);
        ws.close();
        return;
      }

      logger.debug(`WS proxy: connecting to ${target}`);
      const tcp = net.connect(parseInt(targetPort), host);
      tcp.setNoDelay(true);

      tcp.on('connect', () => {
        logger.debug(`WS proxy: connected to ${target}`);
      });

      ws.on('message', (data) => {
        if (tcp.writable) tcp.write(data);
      });

      tcp.on('data', (data) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
      });

      ws.on('close', () => tcp.end());
      ws.on('error', () => tcp.end());
      tcp.on('close', () => { if (ws.readyState === WebSocket.OPEN) ws.close(); });
      tcp.on('error', (err) => {
        logger.error(`WS proxy TCP error (${target}):`, err.message);
        if (ws.readyState === WebSocket.OPEN) ws.close();
      });
    });

    logger.debug(`WebSocket proxy enabled on /ws/ (allowed: ${ALLOWED_TARGETS.join(', ')})`);
  }

  server.listen(port, async () => {
    logger.info(`Server ready on http://localhost:${port}` +
      (ENABLE_STATIC_SERVE ? ` | Game: http://localhost:${port}/applications/pwa/index.html` : '') +
      (ENABLE_WSPROXY ? ` | WS Proxy: /ws/` : ''));

    // Cache warm-up (runs after server is ready, non-blocking)
    if (process.env.CACHE_WARM_UP === 'true') {
      const warmLimit = parseInt(process.env.CACHE_WARM_UP_LIMIT) || 500;
      logger.debug(`Warming cache (up to ${warmLimit} files)...`);
      const Client = require('./src/controllers/clientController');
      Client.warmCache([], warmLimit).catch(err => {
        logger.error('Cache warm-up error:', err.message);
      });
    }
  });
}

// Start server
startServer().catch((error) => {
  logger.error('Fatal error while starting server:', error);
  process.exit(1);
});
