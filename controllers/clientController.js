const fs = require('fs');
const path = require('path');
const Grf = require('./grfController');
const configs = require('../config/configs');

const Client = {
  path: '',
  data_ini: '',
  grfs: [],
  AutoExtract: configs.CLIENT_AUTOEXTRACT,

  async init() {
    this.data_ini = path.join(__dirname, '..', configs.CLIENT_RESPATH, configs.CLIENT_DATAINI);
    if (!fs.existsSync(this.data_ini)) {
      console.error('DATA.INI file not found:', this.data_ini);
      return;
    }

    const dataIniContent = fs.readFileSync(this.data_ini, 'utf-8');
    const dataIni = parseIni(dataIniContent);
    this.grfs = await Promise.all(
      dataIni.Data.map(async grfPath => {
        const grf = new Grf(path.join(__dirname, '..', configs.CLIENT_RESPATH, grfPath));
        await grf.load();
        return grf;
      })
    );
  },

  async getFile(filePath) {
    // Converter barras para barras invertidas
    const grfFilePath = filePath.replace(/\//g, '\\');
    let localPath = path.join(__dirname, '..', filePath);

    // Verificar se o arquivo já existe na pasta de dados
    if (fs.existsSync(localPath)) {
      return fs.readFileSync(localPath);
    }

    // Buscar o arquivo nos GRFs
    for (const grf of this.grfs) {
      if (grf && grf.getFile) {
        const fileContent = await grf.getFile(grfFilePath);
        console.log('===========fileContent==============');
        console.log(fileContent);
        console.log('====================================');
        if (fileContent) {
          // Salvar o arquivo na pasta de dados se AutoExtract estiver habilitado
          if (this.AutoExtract) {
            const extractDir = path.dirname(localPath);
            if (!fs.existsSync(extractDir)) {
              fs.mkdirSync(extractDir, { recursive: true });
            }
            fs.writeFileSync(localPath, fileContent);
          }
          return fileContent;
        }
      } else {
        console.error('GRF not loaded or getFile method missing');
      }
    }

    return null;
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
      if (!value[section]) {
        value[section] = [];
      }
    }
  });

  return value;
}

module.exports = Client;
