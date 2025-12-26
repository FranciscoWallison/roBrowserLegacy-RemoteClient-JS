require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const StartupValidator = require('./src/validators/startupValidator');

const app = express();
const port = process.env.PORT || 3338;
const routes = require('./src/routes'); // adjust this if necessary
const debugMiddleware = require('./src/middlewares/debugMiddleware'); // adjust this if necessary

const CLIENT_PUBLIC_URL = process.env.CLIENT_PUBLIC_URL || 'http://localhost:8000'; // 'https://example.com';

// Variável global para armazenar status de validação
let validationStatus = null;

// Função principal de inicialização
async function startServer() {
  // Executar validação de startup
  console.log('🚀 Iniciando roBrowser Remote Client...\n');

  const validator = new StartupValidator();
  const results = await validator.validateAll();

  // Armazenar status para endpoint de API
  validationStatus = validator.getStatusJSON();

  // Imprimir relatório
  const isValid = validator.printReport(results);

  // Se houver erros fatais, encerrar
  if (!isValid) {
    console.error('❌ Servidor não pode iniciar devido a erros de configuração.');
    console.error('💡 Execute "npm run doctor" para diagnóstico completo.\n');
    process.exit(1);
  }

  // CORS setup. change example.com to your roBrowser ip/domain and http://localhost:3338 (if necessary) to the domain/port where your client is running
  const corsOptions = {
    origin: [CLIENT_PUBLIC_URL, 'http://localhost:3338', 'http://127.0.0.1:8080' ,'http://localhost:8080'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    credentials: true,
  };
  app.use(cors(corsOptions));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(debugMiddleware);

  // Endpoint para status de validação (JSON para frontend)
  app.get('/api/health', (req, res) => {
    res.json(validationStatus);
  });

  // Rotas da API
  app.use('/', routes);

  app.listen(port, () => {
    console.log('\n✅ Servidor iniciado com sucesso!');
    console.log(`🌐 URL: http://localhost:${port}`);
    console.log(`📊 Status: http://localhost:${port}/api/health\n`);
  });
}

// Iniciar servidor
startServer().catch(error => {
  console.error('\n❌ Erro fatal ao iniciar servidor:', error);
  process.exit(1);
});
