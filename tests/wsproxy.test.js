/**
 * The embedded WebSocket -> TCP proxy, against a fake rAthena.
 *
 * A plain TCP echo server stands in for the login/char/map servers, so these run anywhere. The pattern
 * follows tests/wsproxy.rs in Flux159/roBrowserLegacy-RemoteClient-Rust.
 */
import test from 'node:test';
import assert from 'node:assert';
import net from 'node:net';
import http from 'node:http';
import WebSocket from 'ws';
import { attachWsProxy, parseAllowedTargets, DEFAULT_ALLOWED_TARGETS } from '../src/wsProxy.js';

let rathena; // fake game server
let rathenaPort;
let proxy; // http server with the proxy attached
let proxyPort;
const rathenaSockets = new Set();
// Connections the fake server has ever accepted. Compare this, not rathenaSockets.size: a socket left
// over from the previous test may still be closing, which would change the open count on its own.
let acceptedConnections = 0;

test.before(async () => {
  rathena = net.createServer((socket) => {
    acceptedConnections++;
    rathenaSockets.add(socket);
    socket.on('close', () => rathenaSockets.delete(socket));
    socket.on('data', (d) => socket.write(d)); // echo
  });
  await new Promise((r) => rathena.listen(0, '127.0.0.1', r));
  rathenaPort = rathena.address().port;

  proxy = http.createServer((req, res) => res.end());
  attachWsProxy(proxy, { allowedTargets: [`127.0.0.1:${rathenaPort}`] });
  await new Promise((r) => proxy.listen(0, '127.0.0.1', r));
  proxyPort = proxy.address().port;
});

test.after(async () => {
  for (const s of rathenaSockets) s.destroy();
  await new Promise((r) => rathena.close(r));
  await new Promise((r) => proxy.close(r));
});

function open(target) {
  return new WebSocket(`ws://127.0.0.1:${proxyPort}/ws/${target}`);
}

/** Resolve with the close event's code once the socket closes. */
function closed(ws) {
  return new Promise((resolve) => ws.on('close', (code) => resolve(code)));
}

test('relays bytes both ways to an allowed target', async () => {
  const ws = open(`127.0.0.1:${rathenaPort}`);
  await new Promise((r) => ws.on('open', r));
  const reply = new Promise((r) => ws.once('message', (d) => r(Buffer.from(d))));
  ws.send(Buffer.from([0x64, 0x00, 0x01, 0x02])); // shaped like a CA_LOGIN header
  assert.deepStrictEqual(await reply, Buffer.from([0x64, 0x00, 0x01, 0x02]));
  ws.close();
  await closed(ws);
});

test('buffers a packet sent before the TCP connection is up', async () => {
  // roBrowser sends its first packet synchronously in onopen, racing net.connect(). Dropping it hangs
  // the login screen. On loopback the connect completes almost instantly, so the race never happens on
  // its own; delay it, so the packet provably arrives while the TCP side is still connecting.
  //
  // Only the proxy's own dial to the fake server is delayed. The ws client in this test also goes through
  // net.connect -- with an options object -- to reach the proxy, and delaying that too breaks the test
  // harness rather than exercising the proxy.
  const realConnect = net.connect;
  net.connect = (...args) => {
    if (args[0] !== rathenaPort) return realConnect(...args);
    const socket = new net.Socket();
    setTimeout(() => {
      if (!socket.destroyed) socket.connect(...args);
    }, 300);
    return socket;
  };

  try {
    const ws = open(`127.0.0.1:${rathenaPort}`);
    const reply = new Promise((resolve, reject) => {
      ws.once('message', (d) => resolve(Buffer.from(d)));
      setTimeout(() => reject(new Error('the packet sent before connect was dropped')), 3000);
    });
    ws.on('open', () => ws.send(Buffer.from('first-packet')));
    assert.strictEqual((await reply).toString(), 'first-packet');
    ws.close();
    await closed(ws);
  } finally {
    net.connect = realConnect;
  }
});

test('refuses a target outside the allowlist without connecting', async () => {
  // Aim at the fake server's port under a different host spelling, so the only thing stopping the
  // connection is the allowlist -- an unreachable port would pass this test even with no check at all.
  const before = acceptedConnections;
  const ws = open(`localhost:${rathenaPort}`);
  await closed(ws);
  await new Promise((r) => setTimeout(r, 100)); // time for a connection that should not happen
  assert.strictEqual(acceptedConnections, before, 'the proxy connected to a target outside the allowlist');
});

test('refuses a malformed target', async () => {
  for (const target of ['nohost', ':6900', '127.0.0.1:0', '127.0.0.1:70000', '127.0.0.1:abc']) {
    const ws = open(target);
    await closed(ws);
  }
});

test('when the game server hangs up, the browser gets a real Close frame', async () => {
  // rAthena closes the login socket right after authentication, while roBrowser is handing over to the
  // char server. An abrupt drop (1006) there bounces the player back to the login screen.
  const ws = open(`127.0.0.1:${rathenaPort}`);
  await new Promise((r) => ws.on('open', r));
  ws.send(Buffer.from('x')); // make sure the TCP side is connected and registered
  await new Promise((r) => ws.once('message', r));

  const code = closed(ws);
  for (const s of rathenaSockets) s.end();
  assert.notStrictEqual(await code, 1006, 'the proxy dropped the socket instead of closing it');
});

test('when the browser disconnects, the game connection is released', async () => {
  const ws = open(`127.0.0.1:${rathenaPort}`);
  await new Promise((r) => ws.on('open', r));
  ws.send(Buffer.from('x'));
  await new Promise((r) => ws.once('message', r));
  assert.strictEqual(rathenaSockets.size, 1);

  ws.close();
  await closed(ws);
  const deadline = Date.now() + 2000;
  while (rathenaSockets.size > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(rathenaSockets.size, 0, 'the TCP connection to the game server was left open');
});

test('an upgrade outside /ws/ is rejected', async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${proxyPort}/not-the-proxy/127.0.0.1:${rathenaPort}`);
  const outcome = await new Promise((resolve) => {
    ws.on('open', () => resolve('opened'));
    ws.on('error', () => resolve('rejected'));
  });
  assert.strictEqual(outcome, 'rejected');
});

test('WS_ALLOWED_TARGETS parsing keeps the localhost default when unset', () => {
  assert.deepStrictEqual(parseAllowedTargets(undefined), DEFAULT_ALLOWED_TARGETS);
  assert.deepStrictEqual(parseAllowedTargets(''), DEFAULT_ALLOWED_TARGETS);
  assert.deepStrictEqual(parseAllowedTargets(' 10.0.0.5:6900 , 10.0.0.5:6121 '), ['10.0.0.5:6900', '10.0.0.5:6121']);
});
