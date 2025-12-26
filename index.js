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

// Global variable to store validation status
let validationStatus = null;

// Main startup function
async function startServer() {
  // Run startup validation
  console.log('🚀 Starting roBrowser Remote Client...\n');

  const validator = new StartupValidator();
  const results = await validator.validateAll();

  // Store status for API endpoint
  validationStatus = validator.getStatusJSON();

  // Print report
  const isValid = validator.printReport(results);

  // If there are fatal errors, exit
  if (!isValid) {
    console.error('❌ Server cannot start due to configuration errors.');
    console.error('💡 Run "npm run doctor" for a full diagnosis.\n');
    process.exit(1);
  }

  // CORS setup. Change example.com to your roBrowser ip/domain and http://localhost:3338 (if necessary)
  // to the domain/port where your client is running
  const corsOptions = {
    origin: [CLIENT_PUBLIC_URL, 'http://localhost:3338', 'http://127.0.0.1:8080', 'http://localhost:8080'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    credentials: true,
  };

  app.use(cors(corsOptions));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(debugMiddleware);

  // Validation status endpoint (JSON for frontend)
  app.get('/api/health', (req, res) => {
    res.json(validationStatus);
  });

  // API routes
  app.use('/', routes);

  app.listen(port, () => {
    console.log('\n✅ Server started successfully!');
    console.log(`🌐 URL: http://localhost:${port}`);
    console.log(`📊 Status: http://localhost:${port}/api/health\n`);
  });
}

// Start server
startServer().catch((error) => {
  console.error('\n❌ Fatal error while starting server:', error);
  process.exit(1);
});
