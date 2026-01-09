const fs = require('fs');
const path = require('path');
const Grf = require('./grfController');
const configs = require('../config/configs');
const LRUCache = require('../utils/LRUCache');

// File content cache (100 files, 256MB max)
const fileCache = new LRUCache(
  parseInt(process.env.CACHE_MAX_FILES) || 100,
  parseInt(process.env.CACHE_MAX_MEMORY_MB) || 256
);

// GRF file index for O(1) lookups: filename → { grfIndex, originalPath }
let fileIndex = new Map();
let indexBuilt = false;

// Path mapping for encoding conversion (loaded from path-mapping.json if exists)
let pathMapping = null;
const pathMappingFile = path.join(__dirname, '..', '..', 'path-mapping.json');
if (fs.existsSync(pathMappingFile)) {
  try {
    pathMapping = JSON.parse(fs.readFileSync(pathMappingFile, 'utf-8'));
    console.log(`Loaded path mapping: ${Object.keys(pathMapping.paths || {}).length} entries`);
  } catch (e) {
    console.error('Failed to load path-mapping.json:', e.message);
  }
}

// Missing files log (async write queue)
const missingFilesLog = path.join(__dirname, '..', '..', 'logs', 'missing-files.log');
const missingFilesSet = new Set();
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
    console.error('Failed to write missing file log:', e.message);
  }
}

const Client = {
  path: '',
  data_ini: '',
  grfs: [],
  AutoExtract: configs.CLIENT_AUTOEXTRACT,
  missingFiles: [],

  async init() {
    const startTime = Date.now();
    this.data_ini = path.join(__dirname, '..', '..', configs.CLIENT_RESPATH, configs.CLIENT_DATAINI);

    if (!fs.existsSync(this.data_ini)) {
      console.error('DATA.INI file not found:', this.data_ini);
      return;
    }

    const dataIniContent = fs.readFileSync(this.data_ini, 'utf-8');
    const dataIni = parseIni(dataIniContent);

    // Check if data section exists and has GRF files configured
    if (!dataIni.data || dataIni.data.length === 0) {
      console.log('No GRF files configured in DATA.INI. Add GRF files to [data] section.');
      this.grfs = [];
      return;
    }

    this.grfs = await Promise.all(
      dataIni.data.filter(Boolean).map(async grfPath => {
        const grf = new Grf(path.join(__dirname, '..', '..', configs.CLIENT_RESPATH, grfPath));
        await grf.load();
        return grf;
      })
    );

    // Build file index for O(1) lookups
    this.buildFileIndex();

    const elapsed = Date.now() - startTime;
    console.log(`Client initialized in ${elapsed}ms (${fileIndex.size.toLocaleString()} files indexed)`);
  },

  /**
   * Build unified file index from all GRFs
   * Maps normalized paths to { grfIndex, originalPath }
   */
  buildFileIndex() {
    const startTime = Date.now();
    fileIndex.clear();

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
        }
      }
    }

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
    console.log(`File index built in ${elapsed}ms`);
  },

  async getFile(filePath) {
    // Check cache first
    const cacheKey = filePath.toLowerCase();
    const cached = fileCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Normalize paths
    let grfFilePath = filePath.replace(/\//g, '\\');
    let localPath = path.join(__dirname, '..', '..', filePath);

    // Check local file system first
    if (fs.existsSync(localPath)) {
      try {
        const content = fs.readFileSync(localPath);
        fileCache.set(cacheKey, content);
        return content;
      } catch (e) {
        console.error(`Error reading local file: ${e.message}`);
      }
    }

    // Use file index for O(1) GRF lookup
    const normalizedPath = filePath.toLowerCase().replace(/\\/g, '/');
    const normalizedBackslash = filePath.toLowerCase().replace(/\//g, '\\');

    let indexEntry = fileIndex.get(normalizedPath) || fileIndex.get(normalizedBackslash);

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
   * Extract file to local filesystem (async)
   */
  extractFile(localPath, content) {
    setImmediate(() => {
      try {
        const extractDir = path.dirname(localPath);
        if (!fs.existsSync(extractDir)) {
          fs.mkdirSync(extractDir, { recursive: true });
        }
        fs.writeFileSync(localPath, content);
      } catch (e) {
        console.error(`Failed to extract file: ${e.message}`);
      }
    });
  },

  logMissingFile(requestedPath, grfPath, mappedPath) {
    if (missingFilesSet.has(requestedPath)) return;

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

    console.error(`File not found: ${grfPath}${mappedPath ? ` (tried: ${mappedPath})` : ''}`);

    // Check if we should send notification
    this.checkNotification();
  },

  checkNotification() {
    const now = Date.now();
    if (now - lastNotificationTime < NOTIFICATION_COOLDOWN) return;
    if (this.missingFiles.length < 10) return;

    lastNotificationTime = now;

    console.log('\n⚠️  MISSING FILES ALERT:');
    console.log(`   ${this.missingFiles.length} files not found`);
    console.log('   Run "npm run doctor:deep" to validate encoding');
    console.log('   Run "npm run convert:encoding" to generate path mapping');
    console.log(`   Log file: ${missingFilesLog}`);
    console.log('   Report issue: https://github.com/FranciscoWallison/roBrowserLegacy-RemoteClient-JS/issues\n');
  },

  getMissingFilesSummary() {
    return {
      total: this.missingFiles.length,
      files: this.missingFiles.slice(-50),
      logFile: missingFilesLog,
    };
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
      const uniqueFiles = new Set();
      for (const [, entry] of fileIndex) {
        uniqueFiles.add(entry.originalPath);
      }
      return Array.from(uniqueFiles);
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

  search(regex) {
    if (!configs.CLIENT_ENABLESEARCH) {
      console.error('Search feature is disabled');
      return [];
    }

    const matchingFiles = new Set();

    // Use index for faster search
    if (indexBuilt) {
      for (const [, entry] of fileIndex) {
        if (regex.test(entry.originalPath)) {
          matchingFiles.add(entry.originalPath);
        }
      }
      return Array.from(matchingFiles);
    }

    // Fallback
    for (const grf of this.grfs) {
      if (grf && grf.listFiles) {
        const files = grf.listFiles();
        files.forEach(file => {
          if (regex.test(file)) {
            matchingFiles.add(file);
          }
        });
      }
    }

    return Array.from(matchingFiles);
  },

  /**
   * Warm up cache with frequently accessed files
   */
  async warmCache(patterns = []) {
    const defaultPatterns = [
      /\.gat$/i,
      /\.rsw$/i,
      /loading\//i,
      /cardbmp\//i,
    ];

    const patternsToUse = patterns.length > 0 ? patterns : defaultPatterns;
    let warmed = 0;

    for (const [, entry] of fileIndex) {
      if (warmed >= 50) break; // Limit warm-up to 50 files

      for (const pattern of patternsToUse) {
        if (pattern.test(entry.originalPath)) {
          const grf = this.grfs[entry.grfIndex];
          if (grf && grf.getFile) {
            const content = await grf.getFile(entry.originalPath);
            if (content) {
              const cacheKey = entry.originalPath.toLowerCase();
              fileCache.set(cacheKey, content);
              warmed++;
            }
          }
          break;
        }
      }
    }

    console.log(`Cache warmed with ${warmed} files`);
    return warmed;
  }
};

function parseIni(data) {
  const regex = {
    section: /^\s*\[\s*([^\]]*)\s*\]\s*$/,
    param: /^\s*([\w\.\-\_]+)\s*=\s*(.*?)\s*$/,
    comment: /^\s*;.*$/
  };
  const value = {};
  const lines = data.split(/[\r\n]+/);
  let section = null;

  lines.forEach(line => {
    if (regex.comment.test(line)) {
      return;
    } else if (regex.param.test(line)) {
      const match = line.match(regex.param);
      const key = parseInt(match[1], 10);
      const val = match[2];
      if (section) {
        if (!value[section]) {
          value[section] = [];
        }
        value[section][key] = val;
      } else {
        if (!value[key]) {
          value[key] = [];
        }
        value[key] = val;
      }
    } else if (regex.section.test(line)) {
      const match = line.match(regex.section);
      section = match[1];
      // Normalizar seção "Data" para lowercase
      if (section.toLowerCase() === 'data') {
        section = 'data';
      }
      if (!value[section]) {
        value[section] = [];
      }
    }
  });

  return value;
}

module.exports = Client;
