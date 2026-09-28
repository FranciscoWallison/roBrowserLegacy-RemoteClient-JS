/**
 * Embedded WebSocket -> TCP proxy (replaces the standalone wsproxy).
 *
 * The browser cannot open raw TCP, so roBrowser connects to ws://<server>/ws/<host>:<port> and this
 * relays bytes to rAthena's login, char and map servers.
 */
import net from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import logger from './utils/logger.js';

// Allowed rAthena targets when WS_ALLOWED_TARGETS is not set: localhost only.
const DEFAULT_ALLOWED_TARGETS = [
  '127.0.0.1:6900', // Login
  '127.0.0.1:6121', // Char
  '127.0.0.1:5121', // Map
];

// rAthena enforces max_clients_per_ip against the TCP source address. A web
// proxy otherwise makes every browser player appear to come from its own IP.
// Bind each visitor's game sockets to a stable loopback alias so the server's
// existing per-IP limit continues to apply to browser clients.
const PROXY_IP_GRACE_MS = 10 * 60 * 1000;

function normalizeIp(value) {
  if (typeof value !== 'string') return '';
  const ip = value.trim().replace(/^::ffff:/i, '');
  return net.isIP(ip) ? ip : '';
}

function isLoopback(value) {
  const ip = normalizeIp(value);
  return ip === '::1' || ip.startsWith('127.');
}

function getClientIp(req) {
  const peer = normalizeIp(req.socket.remoteAddress || '');
  // The production Caddy hop is local. Do not trust forwarding headers from
  // any direct peer, where a client could forge them.
  if (isLoopback(peer)) {
    const cloudflareIp = normalizeIp(req.headers['cf-connecting-ip']);
    if (cloudflareIp) return cloudflareIp;
  }
  return peer || '127.0.0.1';
}

function createProxyIpAllocator() {
  const byClient = new Map();
  const byAddress = new Map();

  function acquire(clientIp) {
    const now = Date.now();
    for (const [ip, entry] of byClient) {
      if (entry.connections === 0 && entry.expiresAt <= now) {
        byClient.delete(ip);
        byAddress.delete(entry.address);
      }
    }

    let entry = byClient.get(clientIp);
    if (!entry) {
      // Use 127.1.0.1–127.1.255.254; leave 127.0.0.1 for local services.
      let hash = 2166136261;
      for (const char of clientIp) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
      let host = (hash % 65534) + 1;
      for (let i = 0; i < 65534; i++) {
        const address = `127.1.${host >>> 8}.${host & 255}`;
        const owner = byAddress.get(address);
        if (!owner || owner === clientIp) {
          entry = { address, connections: 0, expiresAt: 0 };
          byClient.set(clientIp, entry);
          byAddress.set(address, clientIp);
          break;
        }
        host = (host % 65534) + 1;
      }
      if (!entry) throw new Error('No free loopback aliases for browser clients');
    }

    entry.connections++;
    entry.expiresAt = now + PROXY_IP_GRACE_MS;
    return entry.address;
  }

  function release(clientIp) {
    const entry = byClient.get(clientIp);
    if (!entry) return;
    entry.connections = Math.max(0, entry.connections - 1);
    entry.expiresAt = Date.now() + PROXY_IP_GRACE_MS;
  }

  return { acquire, release };
}

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
 * Limits, none of which roBrowser comes near:
 * - `allowedOrigins`: a browser always sends Origin on a WebSocket handshake, and without a check any
 *   web page a player visits could open the proxy from their browser. The list is the CORS one; a
 *   request with no Origin is not from a browser page and is let through, like a CORS-less request.
 * - `maxPayload`: the largest frame accepted. The library's default is 100 MiB; a client packet is a
 *   few hundred bytes.
 * - `connectTimeoutMs`: how long to wait for the game server to accept. Without it a target that drops
 *   packets held the socket for the operating system's own timeout, minutes on some systems.
 * - `maxPendingBytes`: what the browser may send before the game server accepts (see below). Past it
 *   the connection is closed: dropping a packet silently, as the old message-count cap did, would
 *   desynchronise the game stream.
 *
 * @param {import('http').Server} server
 * @param {object} options
 * @param {string[]} options.allowedTargets "host:port" pairs the proxy may connect to
 * @param {string[]|'*'|null} [options.allowedOrigins] browser origins allowed to connect; null skips the check
 * @param {number} [options.maxPayload]
 * @param {number} [options.connectTimeoutMs]
 * @param {number} [options.maxPendingBytes]
 * @returns {WebSocketServer} so callers (shutdown, tests) can close it
 */
function attachWsProxy(server, {
  allowedTargets,
  allowedOrigins = null,
  maxPayload = 64 * 1024,
  connectTimeoutMs = 10000,
  maxPendingBytes = 256 * 1024,
}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload });
  const proxyIpAllocator = createProxyIpAllocator();

  server.on('upgrade', (req, socket, head) => {
    if (!req.url.startsWith('/ws/')) {
      socket.destroy();
      return;
    }

    const origin = req.headers.origin;
    if (origin && allowedOrigins && allowedOrigins !== '*' && !allowedOrigins.includes(origin)) {
      logger.warn(`WS proxy refused origin ${origin}`);
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
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
    const clientIp = getClientIp(req);
    let proxyIp;
    try {
      proxyIp = proxyIpAllocator.acquire(clientIp);
    } catch (err) {
      logger.error(`WS proxy: could not assign client address: ${err.message}`);
      ws.close(1011);
      return;
    }
    const tcp = net.connect({ port: targetPort, host, localAddress: proxyIp });
    tcp.setNoDelay(true);

    // Buffer messages received before the TCP connection is established.
    // roBrowser sends the first game packet synchronously in its onopen handler,
    // which races with net.connect()'s async 'connect' event. Without buffering,
    // packets arriving before 'connect' fires are silently dropped.
    const pending = [];
    let pendingBytes = 0;
    let connected = false;

    // Single cleanup guard: ensures tcp and ws are torn down exactly once
    // regardless of which side closes first or whether an error occurs.
    // Prevents double tcp.end() and misleading "client closed" log on errors.
    let cleaned = false;
    let connectTimer = null;
    const cleanup = (reason, code) => {
      if (cleaned) return;
      cleaned = true;
      clearTimeout(connectTimer);
      logger.info(`WS proxy: closed ${target} (${reason})`);
      proxyIpAllocator.release(clientIp);
      if (!tcp.destroyed) tcp.destroy();
      if (ws.readyState === WebSocket.OPEN) ws.close(code);
    };

    connectTimer = setTimeout(() => cleanup('game server did not answer in time', 1011), connectTimeoutMs);

    tcp.on('connect', () => {
      connected = true;
      clearTimeout(connectTimer);
      logger.info(`WS proxy: connected  to ${target}`);
      pending.splice(0).forEach((d) => tcp.write(d));
      pendingBytes = 0;
    });

    ws.on('message', (data) => {
      if (connected) {
        tcp.write(data);
        return;
      }
      pendingBytes += data.length;
      if (pendingBytes > maxPendingBytes) {
        cleanup(`more than ${maxPendingBytes} bytes sent before the game server answered`, 1008);
        return;
      }
      pending.push(data);
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

export { attachWsProxy, parseAllowedTargets, DEFAULT_ALLOWED_TARGETS };
