/**
 * Stop the server cleanly: on SIGINT (Ctrl+C) or SIGTERM (a container stop, a process manager).
 *
 * The process used to just die. Game sessions were cut without a close frame, the requests in flight
 * were dropped, and the missing-files log lost whatever was queued in its last second -- it is written
 * in batches.
 *
 * In order: game sessions get a close frame (1001, "going away"); the server stops accepting and lets
 * the requests in flight finish; then the log is flushed, the search worker stopped and the archives
 * closed. Anything still open after `timeoutMs` is abandoned -- a stuck connection must not keep a
 * container from stopping. The idea is from Flux159/roBrowserLegacy-RemoteClient-Rust.
 */

/**
 * @param {object} parts
 * @param {import('http').Server} parts.server
 * @param {import('ws').WebSocketServer|null} [parts.wss] the game proxy, when enabled
 * @param {{ close(): void }} parts.client the file index and cache (clientController)
 * @param {{ info: Function, warn: Function }} parts.logger
 * @param {number} [parts.timeoutMs]
 * @returns {(signal: string) => Promise<'clean'|'forced'>} idempotent: a second signal gets the same
 *   promise
 */
function createShutdown({ server, wss = null, client, logger, timeoutMs = 5000 }) {
  let shuttingDown = null;

  return function shutdown(signal) {
    if (shuttingDown) return shuttingDown;

    shuttingDown = new Promise((resolve) => {
      logger.info(`${signal} received: shutting down`);

      let finished = false;
      let timer = null;
      let idleSweep = null;
      const finish = (outcome) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        clearInterval(idleSweep);
        client.close();
        resolve(outcome);
      };

      timer = setTimeout(() => {
        logger.warn(`Connections still open after ${timeoutMs} ms; stopping anyway`);
        finish('forced');
      }, timeoutMs);

      // Game sessions first: an open WebSocket would keep server.close() waiting indefinitely.
      if (wss) {
        for (const ws of wss.clients) ws.close(1001, 'Server shutting down');
        wss.close();
      }

      server.close(() => finish('clean'));
      // Keep-alive connections with no request in flight would otherwise hold close() open until their
      // own keep-alive timeout. Swept repeatedly, because a connection whose request finishes during the
      // shutdown only becomes idle then.
      server.closeIdleConnections();
      idleSweep = setInterval(() => server.closeIdleConnections(), 50);
    });

    return shuttingDown;
  };
}

export { createShutdown };
