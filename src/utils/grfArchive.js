/**
 * One open archive per file, shared by everything that reads it.
 *
 * At boot the startup validator and `Client.init()` run at the same time, and both used to open and
 * parse the same GRFs -- the validator twice, counting its encoding check. On the bRO data.grf that was
 * the whole file table parsed three times and three copies of it in memory. Now the first caller starts
 * the load and the others wait on the same promise.
 *
 * The archives stay open for the life of the process; `closeArchives()` releases them at shutdown.
 */
import fs from 'node:fs';
import path from 'node:path';
import { GrfNode } from './grfLoader.js';

/** resolved path -> { fd, promise } */
const archives = new Map();

function forget(key) {
  const archive = archives.get(key);
  if (!archive) return;
  archives.delete(key);
  try {
    fs.closeSync(archive.fd);
  } catch {
    // Already closed, or the descriptor never opened: nothing to release.
  }
}

/**
 * The archive at `filePath`, loaded and ready to read. Callers share one loader per file.
 *
 * @param {string} filePath
 * @returns {Promise<object>} the GrfNode
 */
export function openArchive(filePath) {
  const key = path.resolve(filePath);
  const open = archives.get(key);
  if (open) return open.promise;

  const fd = fs.openSync(key, 'r');
  // No cache inside the loader: clientController keeps its own, with a byte budget and the ETags the
  // responses need. Two caches would hold the same files twice.
  const grf = new GrfNode(fd, { cacheMaxFiles: 0 });
  const promise = grf.load().then(() => grf);
  archives.set(key, { fd, promise });

  // A failed load is not kept: the caller sees the error, and the next one gets to try again.
  promise.catch(() => forget(key));

  return promise;
}

/** Close every open archive. For shutdown: they cannot be read afterwards. */
export function closeArchives() {
  for (const key of [...archives.keys()]) forget(key);
}

/** How many archives are open. For tests. */
export function openArchiveCount() {
  return archives.size;
}
