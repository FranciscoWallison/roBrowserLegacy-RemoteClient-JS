/**
 * Shutting down: game sessions closed properly, requests in flight finished, the log flushed -- and a
 * stuck connection not allowed to hold the process forever.
 */
import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import net from 'node:net';
import WebSocket from 'ws';
import { attachWsProxy } from '../src/wsProxy.js';
import { createShutdown } from '../src/shutdown.js';

const quiet = { info() {}, warn() {} };

/** A fake game server, an HTTP server with the proxy on it, and a spy for client.close(). */
async function setUp() {
  const game = net.createServer((socket) => socket.on('data', (d) => socket.write(d)));
  await new Promise((r) => game.listen(0, '127.0.0.1', r));
  const gamePort = game.address().port;

  const server = http.createServer((req, res) => {
    if (req.url === '/slow') setTimeout(() => res.end('finished'), 300);
    else res.end('ok');
  });
  const wss = attachWsProxy(server, { allowedTargets: [`127.0.0.1:${gamePort}`] });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));

  const client = { closed: 0, close() { this.closed++; } };
  return {
    game, server, wss, client,
    base: `http://127.0.0.1:${server.address().port}`,
    wsUrl: `ws://127.0.0.1:${server.address().port}/ws/127.0.0.1:${gamePort}`,
    teardown: () => new Promise((r) => game.close(r)),
  };
}

test('a game session gets a close frame, a request in flight finishes, then everything is released', async () => {
  const t = await setUp();
  try {
    const ws = new WebSocket(t.wsUrl);
    await new Promise((r) => ws.on('open', r));
    const closeCode = new Promise((r) => ws.on('close', (code) => r(code)));

    // Keep-alive connection with nothing in flight, and one request still being answered.
    const agent = new http.Agent({ keepAlive: true });
    await fetch(t.base + '/');
    const slow = new Promise((resolve, reject) => {
      http.get(t.base + '/slow', { agent }, (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => resolve(body));
      }).on('error', reject);
    });
    await new Promise((r) => setTimeout(r, 50)); // let the slow request reach the server

    const shutdown = createShutdown({ server: t.server, wss: t.wss, client: t.client, logger: quiet, timeoutMs: 5000 });
    const outcome = shutdown('SIGTERM');

    assert.strictEqual(await closeCode, 1001, 'the game session was not closed with 1001 (going away)');
    assert.strictEqual(await slow, 'finished', 'the request in flight was cut');
    assert.strictEqual(await outcome, 'clean');
    assert.strictEqual(t.client.closed, 1, 'the log was not flushed / the archives not closed');
    assert.strictEqual(t.server.listening, false);
    agent.destroy();
  } finally {
    await t.teardown();
  }
});

test('a connection that never finishes is abandoned after the timeout', async () => {
  const t = await setUp();
  try {
    // Half a request: headers never completed, so the server keeps waiting for it.
    const stuck = net.connect(t.server.address().port, '127.0.0.1');
    await new Promise((r) => stuck.on('connect', r));
    stuck.write('GET / HTTP/1.1\r\nHost: x\r\n');
    await new Promise((r) => setTimeout(r, 50));

    const started = Date.now();
    const shutdown = createShutdown({ server: t.server, wss: t.wss, client: t.client, logger: quiet, timeoutMs: 300 });
    assert.strictEqual(await shutdown('SIGINT'), 'forced');
    assert.ok(Date.now() - started < 2000, 'the timeout was not enforced');
    assert.strictEqual(t.client.closed, 1, 'cleanup must still run when forced');
    stuck.destroy();
  } finally {
    await t.teardown();
  }
});

test('a second signal waits on the same shutdown instead of starting another', async () => {
  const t = await setUp();
  try {
    const shutdown = createShutdown({ server: t.server, wss: t.wss, client: t.client, logger: quiet });
    const first = shutdown('SIGINT');
    assert.strictEqual(shutdown('SIGINT'), first);
    await first;
    assert.strictEqual(t.client.closed, 1);
  } finally {
    await t.teardown();
  }
});
