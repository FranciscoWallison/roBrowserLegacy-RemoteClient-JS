const express = require('express');
const path = require('path');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3338;
const routes = require('./src/routes'); // ajuste este caminho conforme necessário
const debugMiddleware = require('./src/middlewares/debugMiddleware'); // ajuste este caminho conforme necessário

app.use(cors()); // Adicionar esta linha
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(debugMiddleware);

// Rotas da API
app.use('/client', routes);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
