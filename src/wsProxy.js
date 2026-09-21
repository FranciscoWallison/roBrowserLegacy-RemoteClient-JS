/**
 * Embedded WebSocket -> TCP proxy (replaces the standalone wsproxy).
 *
 * The browser cannot open raw TCP, so roBrowser connects to ws://<server>/ws/<host>:<port> and this
 * relays bytes to rAthena's login, char and map servers.
 */
const net = require('net');
const WebSocket = require('ws');
const logger = require('./utils/logger');

// Allowed rAthena targets when WS_ALLOWED_TARGETS is not set: localhost only.
const DEFAULT_ALLOWED_TARGETS = [
  '127.0.0.1:6900', // Login
  '127.0.0.1:6121', // Char
  '127.0.0.1:5121', // Map
];

/**
 * Parse WS_ALLOWED_TARGETS (comma-separated host:port). Override it for deployments that cannot use
 * host networking (Kubernetes, Docker Desktop on macOS/Windows, remote rAthena hosts). The
 * localhost-only default is preserved when the variable is absent or empty.
 */
function parseAllowedTargets(value) {
  return value ? value.split(',').map((s) => s.trim()) : [...DEFAULT_ALLOWED_TARGETS];
}

/**
 * Attach the proxy to an HTTP server's upgrade event.
 *
 * @param {import('http').Server} server
 * @param {{ allowedTargets: string[] }} options
 * @returns {WebSocket.Server} so callers (shutdown, tests) can close it
 */
function attachWsProxy(server, { allowedTargets }) {
  const wss = new WebSocket.Server({ noServer: true });

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
    // Strip the /ws/ prefix to get "host:port"
    // Use slice (not replace) so a misconfigured socketProxy with no /ws path
    // produces an obviously-invalid target rather than a partial match.
    const target = req.url.slice('/ws/'.length);

    // Validate target format before allowlist check
    const colonIdx = target.lastIndexOf(':');
    const host = colonIdx !== -1 ? target.slice(0, colonIdx) : '';
    const targetPort = colonIdx !== -1 ? parseInt(target.slice(colonIdx + 1), 10) : NaN;

    if (!host || !Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) {
      logger.warn(`WS proxy rejected malformed target: "${target}"`);
      ws.close();
      return;
    }

    logger.info(`WS attempt: ${target}`);

    if (!allowedTargets.includes(target)) {
      logger.warn(`WS proxy blocked: ${target} (allowed: ${allowedTargets.join(', ')})`);
      ws.close();
      return;
    }

    logger.info(`WS proxy: connecting to ${target}`);
    const tcp = net.connect(targetPort, host);
    tcp.setNoDelay(true);

    // Buffer messages received before the TCP connection is established.
    // roBrowser sends the first game packet synchronously in its onopen handler,
    // which races with net.connect()'s async 'connect' event. Without buffering,
    // packets arriving before 'connect' fires are silently dropped.
    const MAX_PENDING = 64;
    const pending = [];
    let connected = false;

    // Single cleanup guard: ensures tcp and ws are torn down exactly once
    // regardless of which side closes first or whether an error occurs.
    // Prevents double tcp.end() and misleading "client closed" log on errors.
    let cleaned = false;
    const cleanup = (reason) => {
      if (cleaned) return;
      cleaned = true;
      logger.info(`WS proxy: closed ${target} (${reason})`);
      if (!tcp.destroyed) tcp.destroy();
      if (ws.readyState === WebSocket.OPEN) ws.close();
    };

    tcp.on('connect', () => {
      connected = true;
      logger.info(`WS proxy: connected  to ${target}`);
      pending.splice(0).forEach((d) => tcp.write(d));
    });

    ws.on('message', (data) => {
      if (connected) {
        tcp.write(data);
      } else if (pending.length < MAX_PENDING) {
        pending.push(data);
      } else {
        logger.warn(`WS proxy: pending queue full for ${target}, dropping message`);
      }
    });

    tcp.on('data', (data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });

    ws.on('close', () => cleanup('client closed'));
    ws.on('error', (err) => cleanup(`client error: ${err.message}`));
    tcp.on('close', () => cleanup('server closed'));
    tcp.on('error', (err) => cleanup(`server error: ${err.message}`));
  });

  logger.info(`WebSocket proxy enabled on /ws/ (allowed: ${allowedTargets.join(', ')})`);
  return wss;
}

module.exports = { attachWsProxy, parseAllowedTargets, DEFAULT_ALLOWED_TARGETS };
