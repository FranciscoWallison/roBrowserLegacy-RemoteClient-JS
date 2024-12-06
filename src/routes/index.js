const express = require('express');
const path = require('path');
const fs = require('fs);
const router = express.Router();
const Client = require('../controllers/clientController');
const configs = require('../config/configs');

// Inicializa o cliente ao iniciar a aplicação
(async () => {
  await Client.init();
})();

router.post('/search', (req, res) => {
  const filter = req.body.filter;
  if (!configs.CLIENT_ENABLESEARCH || !filter) {
    return res.status(400).send('Search feature is disabled or invalid filter');
  }

  const regex = new RegExp(filter, 'i');
  const files = Client.search(regex);
  res.send(files.join('\n'));
});

router.get('/*', async (req, res) => {
  const filePath = req.params[0];

  if (filePath === '') {
    res.type(path.extname('index.html'));
    return res.send(fs.readFileSync('index.html','utf8'));
  }
  
  const fileContent = await Client.getFile(filePath);

  if (!fileContent) {
    return res.status(404).send('File not found');
  }

  res.type(path.extname(filePath));
  res.send(fileContent);
});

// Nova rota para listar arquivos
router.get('/list-files', async (req, res) => {
  const files = Client.listFiles();
  res.json(files);
});

module.exports = router;
