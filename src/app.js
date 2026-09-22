/**
 * Build the Express application, without starting anything.
 *
 * Everything that has side effects -- startup validation, loading the GRFs, loading the ESRGAN plugin,
 * binding a port, the WebSocket proxy -- stays in index.js. Keeping this function pure is what lets the
 * tests exercise the real routes over HTTP instead of pattern-matching the source of index.js.
 *
 * The middleware order below is load-bearing and must not change: the ESRGAN plugin has to intercept
 * asset requests before the GRF routes, and the static roBrowser mount has to see requests before the
 * catch-all asset route.
 */
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const routes = require('./routes');
const Client = require('./controllers/clientController');
const debugMiddleware = require('./middlewares/debugMiddleware');
const createRawImportMiddleware = require('./middlewares/rawImportMiddleware');

// Game asset extensions that benefit from compression
const COMPRESSIBLE_GAME_EXTENSIONS = /\.(spr|act|rsm|gnd|gat|rsw|str|bmp|tga|pal|lub|lua|txt|xml)$/i;

/** The origins allowed by default: the configured client URL plus the usual local dev ports. */
function defaultCorsOrigins(clientPublicUrl) {
  return [
    clientPublicUrl,
    'http://localhost:8000',
    'http://127.0.0.1:8000',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'http://localhost:3338',
    'http://127.0.0.1:3338',
  ];
}

/**
 * The CORS origins to allow, from the CORS_ORIGINS environment variable.
 *
 * Unset or empty keeps the defaults above. Otherwise it is the complete list, comma-separated -- the
 * defaults are not added to it -- or "*" for any origin. "*" is safe to use here: every response is a
 * public game asset, and the client never sends credentials.
 *
 * @param {string|undefined} value
 * @param {string} clientPublicUrl
 * @returns {string[]|'*'}
 */
function resolveCorsOrigins(value, clientPublicUrl) {
  const origins = (value || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, '')) // an origin never has a trailing slash
    .filter(Boolean);

  if (origins.length === 0) return defaultCorsOrigins(clientPublicUrl);
  if (origins.includes('*')) return '*';
  return origins;
}

/**
 * @param {object} [options]
 * @param {boolean} [options.isProd=false] production mode: diagnostic endpoints are gated
 * @param {string[]|'*'} [options.corsOrigins] allowed CORS origins, or '*' for any
 * @param {object|null} [options.validationStatus] startup validation report, served by /api/health
 * @param {object|null} [options.esrganInstance] loaded ESRGAN plugin, if any
 * @param {string|null} [options.staticRoot] roBrowserLegacy checkout to serve, when ENABLE_STATIC_SERVE
 * @param {boolean} [options.requestLogging] log every request (defaults to on outside production)
 * @returns {import('express').Express}
 */
function createApp({
  isProd = false,
  corsOrigins = defaultCorsOrigins('http://localhost:8000'),
  validationStatus = null,
  esrganInstance = null,
  staticRoot = null,
  requestLogging = !isProd,
} = {}) {
  const app = express();

  app.use(cors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    credentials: true,
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Compression middleware - compresses text AND binary game assets
  app.use(compression({
    threshold: 1024,
    filter: (req, res) => {
      // Compress game assets (SPR, RSM, GND, etc.) that are highly compressible
      if (COMPRESSIBLE_GAME_EXTENSIONS.test(req.path)) {
        return true;
      }
      // Default compression filter for text/json/etc
      return compression.filter(req, res);
    },
  }));

  if (requestLogging) {
    app.use(debugMiddleware);
  }

  // ESRGAN upscaling middleware - serves upscaled assets from disk cache
  if (esrganInstance) {
    app.use(esrganInstance.middleware);
  }

  // Validation status endpoint (JSON for frontend).
  //
  // Unlike the two diagnostic endpoints below this one cannot 404 in production:
  // load balancers and container health checks call it. So it stays reachable but
  // answers with liveness only, withholding the reconnaissance detail -- absolute
  // paths, GRF names, Node/npm versions, cache and index internals -- that the
  // full payload carries.
  app.get('/api/health', (req, res) => {
    const status = validationStatus || {};

    if (isProd) {
      return res.json({
        timestamp: status.timestamp,
        status: status.status,
        hasWarnings: status.hasWarnings,
        summary: status.summary,
      });
    }

    res.json({
      ...status,
      missingFiles: Client.getMissingFilesSummary(),
      cache: Client.getCacheStats(),
      index: Client.getIndexStats(),
      esrgan: esrganInstance ? esrganInstance.getStats() : { enabled: false },
    });
  });

  // Missing files endpoint (diagnostics: dev-only, hidden in production to avoid
  // leaking file structure/index internals to unauthenticated callers)
  app.get('/api/missing-files', (req, res) => {
    if (isProd) return res.status(404).end();
    res.json(Client.getMissingFilesSummary());
  });

  // Cache stats endpoint (diagnostics: dev-only, same rationale as above)
  app.get('/api/cache-stats', (req, res) => {
    if (isProd) return res.status(404).end();
    res.json({
      cache: Client.getCacheStats(),
      index: Client.getIndexStats(),
    });
  });

  // Serve roBrowserLegacy static files (replaces live-server)
  if (staticRoot) {
    // Handle Vite-style ?raw imports (must come before express.static)
    app.use(createRawImportMiddleware(staticRoot));

    // dotfiles: 'deny' keeps .git/ and .env out of reach. The doc root is the
    // roBrowserLegacy checkout itself (the raw-import middleware above serves its
    // src/ as ES modules), so without this the whole repository is downloadable.
    app.use(express.static(staticRoot, { dotfiles: 'deny' }));
  }

  // API routes (GRF file serving, search, etc.)
  app.use('/', routes);

  return app;
}

module.exports = { createApp, defaultCorsOrigins, resolveCorsOrigins };
