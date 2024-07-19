const express = require('express');
const path = require('path');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3333;
const routes = require('./routes'); // ajuste este caminho conforme necessário
const debugMiddleware = require('./middlewares/debugMiddleware'); // ajuste este caminho conforme necessário

app.use(cors()); // Adicionar esta linha
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(debugMiddleware);

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname)));

// Rotas da API
app.use('/client', routes);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
