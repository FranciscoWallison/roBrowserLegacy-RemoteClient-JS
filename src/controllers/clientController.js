import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import iconv from 'iconv-lite';
import Grf from './grfController.js';
import configs from '../config/configs.js';
import LRUCache from '../utils/LRUCache.js';
import logger from '../utils/logger.js';
import * as searchPool from '../utils/searchPool.js';
import { decodeMojibake } from '../utils/mojibake.js';
import { readDataIni } from '../utils/dataIni.js';
import { isSafeFileName } from '../utils/safePath.js';

const { PROJECT_ROOT } = configs;

/**
 * Top-level directories the client is allowed to read from disk.
 *
 * These are the Ragnarok client asset trees (the same ones .gitignore excludes).
 * The project root itself is NOT a document root: it also holds .env, .git/,
 * logs/ and the server source, none of which may ever be reachable over HTTP.
 */
const SERVABLE_ROOTS = ['data', 'bgm', 'system', 'ai'];

/**
 * Resolve a client-supplied path inside `base`, or return null if it escapes.
 *
 * Rejects NUL bytes, absolute paths (which would make path.resolve discard the
 * base entirely) and any sequence that climbs out of the base with "..".
 */
function resolveContained(base, requestPath) {
  if (typeof requestPath !== 'string' || requestPath.length === 0) return null;
  if (requestPath.includes('\0')) return null;

  const resolved = path.resolve(base, requestPath);
  const relative = path.relative(base, resolved);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  return resolved;
}

/** True when a contained path sits under one of the servable asset trees. */
function isServable(resolvedPath) {
  const [top] = path.relative(PROJECT_ROOT, resolvedPath).split(/[\\/]/);
  return SERVABLE_ROOTS.includes(top.toLowerCase());
}

/**
 * A regular file's contents, or null when the path is missing or is not a file. A request for a folder
 * ("/data/", "/BGM") must not reach readFile. Asynchronous, like every disk access on the request path:
 * a slow disk or network share delays that request, not every other one.
 */
async function readRegularFile(p) {
  try {
    if (!(await fsp.stat(p)).isFile()) return null;
    return await fsp.readFile(p);
  } catch (e) {
    if (e.code !== 'ENOENT' && e.code !== 'ENOTDIR') logger.error(`Error reading ${p}: ${e.message}`);
    return null;
  }
}

/**
 * The file for a request under BGM/, System/ or AI/ in the folder BGM_PATH, SYSTEM_PATH or AI_PATH
 * points to, or null.
 *
 * Those folders are read-only and confined by real path, not just by name: a junction or symlink inside
 * one cannot lead a request out of it.
 */
async function resolveAssetDirFile(requestPath) {
  const [top, ...rest] = requestPath.split(/[\\/]/);
  const base = configs.ASSET_DIRS[top.toLowerCase()];
  if (!base || rest.length === 0) return null;

  const candidate = resolveContained(base, rest.join('/'));
  if (!candidate) return null;
  try {
    const realBase = await fsp.realpath(base);
    const real = await fsp.realpath(candidate);
    const relative = path.relative(realBase, real);
    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return null;
    return real;
  } catch (e) {
    return null; // does not exist
  }
}

// File content cache (5000 files, 1024MB max)
const fileCache = new LRUCache(
  parseInt(process.env.CACHE_MAX_FILES) || 5000,
  parseInt(process.env.CACHE_MAX_MEMORY_MB) || 1024
);

// GRF file index for O(1) lookups: filename → { grfIndex, originalPath }
let fileIndex = new Map();
let indexBuilt = false;

/**
 * Memoized result of listFiles(). Rebuilding it walks every index entry into a Set -- 67 ms for a
 * full data.grf. Cleared whenever the index is rebuilt.
 */
let cachedFileList = null;

/**
 * Memoized name tables for search, one per GRF (see Grf#nameTable). Built on the first search rather
 * than at startup: the game itself never searches, only the map, model and GRF viewers do. Identity
 * matters: the search worker keeps its copy keyed on this array, and a fresh array each call would
 * re-send ~10 MB per query. Cleared whenever the index is rebuilt.
 */
let cachedSearchTables = null;

// Path mapping for encoding conversion (loaded from path-mapping.json if exists)
let pathMapping = null;
const pathMappingFile = path.join(PROJECT_ROOT, 'path-mapping.json');
if (fs.existsSync(pathMappingFile)) {
  try {
    pathMapping = JSON.parse(fs.readFileSync(pathMappingFile, 'utf-8'));
    logger.debug(`Loaded path mapping: ${Object.keys(pathMapping.paths || {}).length} entries`);
  } catch (e) {
    logger.error('Failed to load path-mapping.json:', e.message);
  }
}

// Missing files log (async write queue)
const missingFilesLog = path.join(PROJECT_ROOT, 'logs', 'missing-files.log');
const missingFilesSet = new Set();
// Bounded: every distinct path that 404s is remembered, and anyone can request as many as they like.
const MAX_TRACKED_MISSING = 10000;
let lastNotificationTime = 0;
const NOTIFICATION_COOLDOWN = 60000; // 1 minute cooldown between notifications

// Async log queue
let logQueue = [];
let logFlushTimer = null;

function flushLogQueue() {
  if (logQueue.length === 0) return;

  const entries = logQueue.splice(0, logQueue.length);
  const logsDir = path.dirname(missingFilesLog);

  try {
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    fs.appendFileSync(missingFilesLog, entries.join(''));
  } catch (e) {
    logger.error('Failed to write missing file log:', e.message);
  }
}

const Client = {
  path: '',
  data_ini: '',
  grfs: [],
  AutoExtract: configs.CLIENT_AUTOEXTRACT,
  missingFiles: [],
  maxTrackedMissing: MAX_TRACKED_MISSING,

  /**
   * Load the GRFs listed in DATA.INI and build the file index.
   *
   * Archives are loaded in DATA.INI's priority order (src/utils/dataIni.js); an entry may be an absolute
   * path, or relative to DATA.INI's folder. The option exists so tests can point the server at
   * synthetic archives instead of a real client.
   *
   * @param {{ dataIniPath?: string }} [options]
   */
  async init({ dataIniPath } = {}) {
    const startTime = Date.now();
    this.data_ini = dataIniPath || configs.DATA_INI_PATH;

    if (!fs.existsSync(this.data_ini)) {
      logger.error('DATA.INI file not found:', this.data_ini);
      return;
    }

    const { grfPaths } = readDataIni(this.data_ini);
    if (grfPaths.length === 0) {
      logger.warn('No GRF files configured in DATA.INI. Add GRF files to [data] section.');
      this.grfs = [];
      return;
    }

    this.grfs = await Promise.all(
      grfPaths.map(async (grfPath) => {
        const grf = new Grf(grfPath);
        await grf.load();
        return grf;
      })
    );

    // Build file index for O(1) lookups
    this.buildFileIndex();

    const elapsed = Date.now() - startTime;
    logger.info(`Client initialized in ${elapsed}ms (${fileIndex.size.toLocaleString()} files indexed)`);
  },

  /**
   * Build unified file index from all GRFs
   * Maps normalized paths to { grfIndex, originalPath }
   */
  buildFileIndex() {
    const startTime = Date.now();
    fileIndex.clear();
    let mojibakeCount = 0;

    for (let i = 0; i < this.grfs.length; i++) {
      const grf = this.grfs[i];
      if (grf && grf.listFiles) {
        const files = grf.listFiles();
        for (const file of files) {
          // Normalize: lowercase, forward slashes
          const normalized = file.toLowerCase().replace(/\\/g, '/');

          // Only store first occurrence (first GRF has priority)
          if (!fileIndex.has(normalized)) {
            fileIndex.set(normalized, { grfIndex: i, originalPath: file });
          }

          // Also index with backslashes
          const normalizedBackslash = file.toLowerCase().replace(/\//g, '\\');
          if (!fileIndex.has(normalizedBackslash)) {
            fileIndex.set(normalizedBackslash, { grfIndex: i, originalPath: file });
          }

          // Also index the mojibake version of the path (for roBrowser compatibility)
          // roBrowser sends Korean paths as CP949 bytes interpreted as Latin-1
          try {
            const cp949Buf = iconv.encode(file, 'cp949');
            const mojibakePath = iconv.decode(cp949Buf, 'iso-8859-1');
            if (mojibakePath !== file) {
              const normalizedMojibake = mojibakePath.toLowerCase().replace(/\\/g, '/');
              if (!fileIndex.has(normalizedMojibake)) {
                fileIndex.set(normalizedMojibake, { grfIndex: i, originalPath: file });
                mojibakeCount++;
              }
              const mojibakeBackslash = mojibakePath.toLowerCase().replace(/\//g, '\\');
              if (!fileIndex.has(mojibakeBackslash)) {
                fileIndex.set(mojibakeBackslash, { grfIndex: i, originalPath: file });
              }
            }
          } catch (e) {
            // Skip files that can't be encoded
          }
        }
      }
    }
    if (mojibakeCount > 0) {
      logger.debug(`Added ${mojibakeCount} mojibake path mappings for roBrowser compatibility`);
    }

    // The file list, the search tables and the search worker all cache what the index holds.
    cachedFileList = null;
    cachedSearchTables = null;
    searchPool.invalidate();

    // Add path mapping entries to index
    if (pathMapping && pathMapping.paths) {
      for (const [koreanPath, grfPath] of Object.entries(pathMapping.paths)) {
        const normalizedKorean = koreanPath.toLowerCase().replace(/\\/g, '/');
        const normalizedGrf = grfPath.toLowerCase().replace(/\\/g, '/');

        // If we have the GRF path indexed, also index the Korean path
        if (fileIndex.has(normalizedGrf)) {
          const entry = fileIndex.get(normalizedGrf);
          if (!fileIndex.has(normalizedKorean)) {
            fileIndex.set(normalizedKorean, { ...entry, mappedFrom: koreanPath });
          }
        }
      }
    }

    indexBuilt = true;
    const elapsed = Date.now() - startTime;
    logger.debug(`File index built in ${elapsed}ms`);
  },

  /**
   * Get file with pre-computed ETag from cache
   * Returns { data, etag } or null
   */
  getFileCachedETag(filePath) {
    const cacheKey = filePath.toLowerCase();
    return fileCache.get(cacheKey);
  },

  async getFile(filePath) {
    const cached = fileCache.get(filePath.toLowerCase());
    if (cached) {
      return cached.data;
    }
    return this.loadFile(filePath);
  },

  /**
   * Find a file that is not in the cache, and cache it.
   *
   * The cache lookup is the caller's. The asset route does it first, to answer from the cached ETag, and
   * used to call getFile() on a miss -- which looked again and counted every miss twice, so the reported
   * hit rate was wrong.
   */
  async loadFile(filePath) {
    const cacheKey = filePath.toLowerCase();

    // Normalize paths
    let grfFilePath = filePath.replace(/\//g, '\\');

    // Check local file system first. The path comes straight from the client, so it
    // is only read when it stays inside the project and lands in an asset tree.
    const localPath = resolveContained(PROJECT_ROOT, filePath);
    if (localPath && isServable(localPath)) {
      const content = await readRegularFile(localPath);
      if (content) {
        fileCache.set(cacheKey, content);
        return content;
      }
    }

    // BGM/, System/ and AI/ from a client installed elsewhere (BGM_PATH, SYSTEM_PATH, AI_PATH)
    const assetDirFile = await resolveAssetDirFile(filePath);
    if (assetDirFile) {
      const content = await readRegularFile(assetDirFile);
      if (content) {
        fileCache.set(cacheKey, content);
        return content;
      }
    }

    // Check DATA_OVERRIDE_PATH (external data dir with loose files not in GRF)
    if (process.env.DATA_OVERRIDE_PATH) {
      const relativePath = filePath.replace(/^data[\/\\]/, '');
      const overrideBase = path.resolve(PROJECT_ROOT, process.env.DATA_OVERRIDE_PATH);
      const overridePath = resolveContained(overrideBase, relativePath);
      if (overridePath) {
        const content = await readRegularFile(overridePath);
        if (content) {
          fileCache.set(cacheKey, content);
          return content;
        }
      }
    }

    // Use file index for O(1) GRF lookup
    const normalizedPath = filePath.toLowerCase().replace(/\\/g, '/');
    const normalizedBackslash = filePath.toLowerCase().replace(/\//g, '\\');

    let indexEntry = fileIndex.get(normalizedPath) || fileIndex.get(normalizedBackslash);

    // Try mojibake decode: convert Latin-1 mojibake back to Korean Unicode
    if (!indexEntry) {
      const decodedPath = decodeMojibake(filePath);
      if (decodedPath !== filePath) {
        const normalizedDecoded = decodedPath.toLowerCase().replace(/\\/g, '/');
        const normalizedDecodedBack = decodedPath.toLowerCase().replace(/\//g, '\\');
        indexEntry = fileIndex.get(normalizedDecoded) || fileIndex.get(normalizedDecodedBack);
      }
    }

    // Try path mapping if not in index
    if (!indexEntry && pathMapping && pathMapping.paths) {
      const mappedPath = pathMapping.paths[grfFilePath] || pathMapping.paths[filePath];
      if (mappedPath) {
        const normalizedMapped = mappedPath.toLowerCase().replace(/\\/g, '/');
        indexEntry = fileIndex.get(normalizedMapped);
      }
    }

    // Fast path: use index
    if (indexEntry) {
      const grf = this.grfs[indexEntry.grfIndex];
      if (grf && grf.getFile) {
        const fileContent = await grf.getFile(indexEntry.originalPath);
        if (fileContent) {
          // Cache the result
          fileCache.set(cacheKey, fileContent);

          // Auto-extract if enabled
          if (this.AutoExtract) {
            this.extractFile(localPath, fileContent);
          }

          return fileContent;
        }
      }
    }

    // Fallback: sequential search (for files not in index)
    const pathsToTry = [grfFilePath];
    if (pathMapping && pathMapping.paths) {
      const mappedPath = pathMapping.paths[grfFilePath] || pathMapping.paths[filePath];
      if (mappedPath) pathsToTry.push(mappedPath);
    }

    for (const grf of this.grfs) {
      if (grf && grf.getFile) {
        for (const tryPath of pathsToTry) {
          const fileContent = await grf.getFile(tryPath);
          if (fileContent) {
            fileCache.set(cacheKey, fileContent);

            if (this.AutoExtract) {
              this.extractFile(localPath, fileContent);
            }

            return fileContent;
          }
        }
      }
    }

    // Log missing file
    this.logMissingFile(filePath, grfFilePath, null);
    return null;
  },

  /**
   * Write a file read from a GRF into the project's asset folders, so later requests read it from disk
   * (CLIENT_AUTOEXTRACT, off by default). Only ever inside one of the servable folders, and never under
   * a name Windows would reinterpret; anything else is skipped -- the file was still served.
   */
  extractFile(localPath, content) {
    if (!localPath || !isServable(localPath)) return;
    if (!isSafeFileName(path.relative(PROJECT_ROOT, localPath))) return;

    fsp.mkdir(path.dirname(localPath), { recursive: true })
      .then(() => fsp.writeFile(localPath, content))
      .catch((e) => logger.error(`Failed to extract file: ${e.message}`));
  },

  logMissingFile(requestedPath, grfPath, mappedPath) {
    if (missingFilesSet.has(requestedPath)) return;

    // Forget the oldest path once the set is full: a Set iterates in insertion order.
    while (missingFilesSet.size >= this.maxTrackedMissing) {
      missingFilesSet.delete(missingFilesSet.values().next().value);
    }
    missingFilesSet.add(requestedPath);

    const logEntry = {
      timestamp: new Date().toISOString(),
      requestedPath,
      grfPath,
      mappedPath: mappedPath || null,
    };

    // Add to in-memory list (max 1000 entries)
    this.missingFiles.push(logEntry);
    if (this.missingFiles.length > 1000) {
      this.missingFiles.shift();
    }

    // Queue log entry for async write
    logQueue.push(JSON.stringify(logEntry) + '\n');

    // Flush queue after 1 second of inactivity
    if (logFlushTimer) clearTimeout(logFlushTimer);
    logFlushTimer = setTimeout(flushLogQueue, 1000);

    logger.debug(`File not found: ${grfPath}${mappedPath ? ` (tried: ${mappedPath})` : ''}`);

    // Check if we should send notification
    this.checkNotification();
  },

  checkNotification() {
    const now = Date.now();
    if (now - lastNotificationTime < NOTIFICATION_COOLDOWN) return;
    if (this.missingFiles.length < 10) return;

    lastNotificationTime = now;

    logger.warn(`MISSING FILES ALERT: ${this.missingFiles.length} files not found. Log: ${missingFilesLog}`);
  },

  getMissingFilesSummary() {
    return {
      total: this.missingFiles.length,
      tracked: missingFilesSet.size,
      files: this.missingFiles.slice(-50),
      logFile: missingFilesLog,
    };
  },

  /**
   * Flush the missing-files log, stop the search worker and close the archives. For shutdown: the log
   * is written in batches, so whatever was queued in the last second would otherwise be lost.
   */
  close() {
    if (logFlushTimer) {
      clearTimeout(logFlushTimer);
      logFlushTimer = null;
    }
    flushLogQueue();
    searchPool.invalidate();
    for (const grf of this.grfs) grf?.close?.();
  },

  getCacheStats() {
    return fileCache.getStats();
  },

  getIndexStats() {
    return {
      totalFiles: fileIndex.size,
      grfCount: this.grfs.length,
      indexBuilt,
    };
  },

  listFiles() {
    // Use index if available for faster response
    if (indexBuilt) {
      if (cachedFileList) return cachedFileList;

      const uniqueFiles = new Set();
      for (const [, entry] of fileIndex) {
        uniqueFiles.add(entry.originalPath);
      }
      cachedFileList = Array.from(uniqueFiles);
      return cachedFileList;
    }

    // Fallback to GRF iteration
    const allFiles = new Set();
    for (const grf of this.grfs) {
      if (grf && grf.listFiles) {
        const files = grf.listFiles();
        files.forEach(file => allFiles.add(file));
      }
    }
    return Array.from(allFiles);
  },

  /**
   * Run a client-supplied pattern over the GRF name tables, the way roBrowser searches an archive it
   * loaded itself: `table.data.match(regex)` with the `gi` flags, then duplicates removed.
   *
   * Each table is every name in one GRF, one character per CP949 byte, each followed by a NUL -- the
   * client's `table.data`. The result is therefore the matched substrings, not whole paths: the GRF
   * Viewer relies on that to list a directory, matching `<dir>\\([^(\0|\\)]+)` and getting back each
   * entry directly under it. Matches never span two GRFs, as in the client.
   *
   * The pattern is attacker-controlled, and a catastrophic one cannot be interrupted mid-evaluation:
   * `^(.+)+#$` backtracks exponentially, and the cost is inside a single regex call. So the matching
   * runs in a worker thread that is terminated on overrun; the process stays responsive while a
   * hostile pattern burns, and the worker is replaced for the next query.
   *
   * @param {string} pattern regex source, already in the one-character-per-byte spelling
   * @returns {Promise<string[]>} matches in table order, without duplicates
   * @throws if the query exceeds its deadline
   */
  async search(pattern, { timeoutMs = 2000 } = {}) {
    if (!cachedSearchTables) {
      cachedSearchTables = this.grfs.map((grf) => (grf && grf.nameTable ? grf.nameTable() : ''));
    }
    return searchPool.search(pattern, 'gi', cachedSearchTables, { timeoutMs });
  },

  /**
   * Warm up cache with frequently accessed files
   */
  async warmCache(patterns = [], limit = 500) {
    const defaultPatterns = [
      // UI and interface (loaded on every session)
      /data\/texture\/À¯ÀúÀÎÅÍÆäÀÌ½º/i,
      /data\/texture\/userinterface/i,
      /loading\//i,
      /cardbmp\//i,
      // Map data (prontera = default spawn)
      /prontera\.gat$/i,
      /prontera\.gnd$/i,
      /prontera\.rsw$/i,
      // Common map formats (altitude, ground, world)
      /\.gat$/i,
      /\.rsw$/i,
      // Player sprites (all classes)
      /data\/sprite\/ÀÎ°£Á·/i,
      /data\/sprite\/인간족/i,
      // Palette files (small, frequently accessed)
      /\.pal$/i,
      // Lua/lub config files (small, loaded early)
      /\.lub$/i,
    ];

    const patternsToUse = patterns.length > 0 ? patterns : defaultPatterns;
    const maxFiles = limit;
    let warmed = 0;
    const startTime = Date.now();

    for (const [, entry] of fileIndex) {
      if (warmed >= maxFiles) break;

      for (const pattern of patternsToUse) {
        if (pattern.test(entry.originalPath)) {
          const grf = this.grfs[entry.grfIndex];
          if (grf && grf.getFile) {
            try {
              const content = await grf.getFile(entry.originalPath);
              if (content) {
                const cacheKey = entry.originalPath.toLowerCase();
                fileCache.set(cacheKey, content);
                warmed++;
              }
            } catch (e) {
              // Skip files that fail to extract
            }
          }
          break;
        }
      }
    }

    const elapsed = Date.now() - startTime;
    logger.info(`Cache warmed with ${warmed} files in ${elapsed}ms`);
    return warmed;
  }
};

export default Client;
