const fs = require('fs');
const path = require('path');
const Grf = require('./grfController');
const configs = require('../config/configs');

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

// Missing files log
const missingFilesLog = path.join(__dirname, '..', '..', 'logs', 'missing-files.log');
const missingFilesSet = new Set();
let lastNotificationTime = 0;
const NOTIFICATION_COOLDOWN = 60000; // 1 minute cooldown between notifications

const Client = {
  path: '',
  data_ini: '',
  grfs: [],
  AutoExtract: configs.CLIENT_AUTOEXTRACT,
  missingFiles: [],

  async init() {
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
  },

  async getFile(filePath) {
    // Converter barras para barras invertidas
    let grfFilePath = filePath.replace(/\//g, '\\');
    let localPath = path.join(__dirname, '..', '..', filePath);

    // Try path mapping if available (Korean path → GRF path)
    let mappedPath = null;
    if (pathMapping && pathMapping.paths) {
      // Try exact match first
      mappedPath = pathMapping.paths[grfFilePath] || pathMapping.paths[filePath];

      // Try normalized (lowercase, forward slash)
      if (!mappedPath) {
        const normalized = filePath.replace(/\\/g, '/').toLowerCase();
        mappedPath = pathMapping.paths[normalized];
      }
    }

    // Verificar se o arquivo já existe na pasta de dados
    if (fs.existsSync(localPath)) {
      console.log(`File found on folder: ${grfFilePath}`);
      return fs.readFileSync(localPath);
    }

    // Buscar o arquivo nos GRFs
    const pathsToTry = [grfFilePath];
    if (mappedPath) {
      pathsToTry.push(mappedPath);
    }

    for (const grf of this.grfs) {
      if (grf && grf.getFile) {
        for (const tryPath of pathsToTry) {
          const fileContent = await grf.getFile(tryPath);
          if (fileContent) {
            // Salvar o arquivo na pasta de dados se AutoExtract estiver habilitado
            if (this.AutoExtract) {
              const extractDir = path.dirname(localPath);
              if (!fs.existsSync(extractDir)) {
                fs.mkdirSync(extractDir, { recursive: true });
              }
              fs.writeFileSync(localPath, fileContent);
            }

            console.log(`File found on ${grf.fileName}: ${tryPath}`);
            return fileContent;
          }
        }
      } else {
        console.error('GRF not loaded or getFile method missing');
      }
    }

    // Log missing file
    this.logMissingFile(filePath, grfFilePath, mappedPath);
    return null;
  },

  logMissingFile(requestedPath, grfPath, mappedPath) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      requestedPath,
      grfPath,
      mappedPath: mappedPath || null,
    };

    // Add to in-memory list (max 1000 entries)
    if (!missingFilesSet.has(requestedPath)) {
      missingFilesSet.add(requestedPath);
      this.missingFiles.push(logEntry);
      if (this.missingFiles.length > 1000) {
        this.missingFiles.shift();
      }

      // Write to log file
      try {
        const logsDir = path.dirname(missingFilesLog);
        if (!fs.existsSync(logsDir)) {
          fs.mkdirSync(logsDir, { recursive: true });
        }
        fs.appendFileSync(missingFilesLog, JSON.stringify(logEntry) + '\n');
      } catch (e) {
        console.error('Failed to write missing file log:', e.message);
      }

      console.error(`File not found: ${grfPath}${mappedPath ? ` (tried: ${mappedPath})` : ''}`);

      // Check if we should send notification
      this.checkNotification();
    }
  },

  checkNotification() {
    const now = Date.now();
    if (now - lastNotificationTime < NOTIFICATION_COOLDOWN) return;
    if (this.missingFiles.length < 10) return; // Only notify if 10+ missing files

    lastNotificationTime = now;

    // Generate summary for notification
    const summary = {
      totalMissing: this.missingFiles.length,
      recentFiles: this.missingFiles.slice(-10),
      timestamp: new Date().toISOString(),
    };

    console.log('\n⚠️  MISSING FILES ALERT:');
    console.log(`   ${summary.totalMissing} files not found`);
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

  listFiles() {
    const allFiles = new Set();

    for (const grf of this.grfs) {
      if (grf && grf.listFiles) {
        const files = grf.listFiles();
        files.forEach(file => allFiles.add(file));
      } else {
        console.error('GRF not loaded or listFiles method missing');
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

    for (const grf of this.grfs) {
      if (grf && grf.listFiles) {
        const files = grf.listFiles();
        files.forEach(file => {
          if (regex.test(file)) {
            matchingFiles.add(file);
          }
        });
      } else {
        console.error('GRF not loaded or listFiles method missing');
      }
    }

    return Array.from(matchingFiles);
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
