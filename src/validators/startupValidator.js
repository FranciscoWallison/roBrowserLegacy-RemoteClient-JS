const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Sistema de validação de startup
 * Valida recursos, configurações e dependências antes de iniciar o servidor
 */
class StartupValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.info = [];
    this.validationResults = {
      grfs: null,
      files: null,
      env: null,
      dependencies: null,
      nodeVersion: null
    };
  }

  /**
   * Adiciona um erro fatal
   */
  addError(message) {
    this.errors.push(message);
  }

  /**
   * Adiciona um aviso
   */
  addWarning(message) {
    this.warnings.push(message);
  }

  /**
   * Adiciona informação
   */
  addInfo(message) {
    this.info.push(message);
  }

  /**
   * Valida versão do Node.js e npm
   */
  validateNodeVersion() {
    try {
      const nodeVersion = process.version;
      const npmVersion = execSync('npm --version', { encoding: 'utf-8' }).trim();

      this.validationResults.nodeVersion = {
        node: nodeVersion,
        npm: npmVersion,
        valid: true
      };

      this.addInfo(`Node.js: ${nodeVersion}`);
      this.addInfo(`npm: ${npmVersion}`);

      // Verificar versão mínima do Node
      const majorVersion = parseInt(nodeVersion.replace('v', '').split('.')[0]);
      if (majorVersion < 14) {
        this.addWarning(`Node.js versão ${nodeVersion} pode ser muito antiga. Recomendado: v14 ou superior`);
      }

      return true;
    } catch (error) {
      this.addError(`Erro ao verificar versão do Node.js/npm: ${error.message}`);
      this.validationResults.nodeVersion = { valid: false, error: error.message };
      return false;
    }
  }

  /**
   * Valida se node_modules existe e dependências estão instaladas
   */
  validateDependencies() {
    const nodeModulesPath = path.join(process.cwd(), 'node_modules');
    const packageJsonPath = path.join(process.cwd(), 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
      this.addError('package.json não encontrado!');
      this.validationResults.dependencies = { installed: false, reason: 'package.json missing' };
      return false;
    }

    if (!fs.existsSync(nodeModulesPath)) {
      const nodeVersion = this.validationResults.nodeVersion;
      const versionInfo = nodeVersion ? `\n  Node.js: ${nodeVersion.node}\n  npm: ${nodeVersion.npm}` : '';

      this.addError(
        `Dependências não instaladas!\n` +
        `Execute: npm install${versionInfo}`
      );
      this.validationResults.dependencies = { installed: false, reason: 'node_modules missing' };
      return false;
    }

    // Verificar dependências essenciais
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const requiredDeps = ['express', 'cors', '@chicowall/grf-loader'];
    const missingDeps = [];

    for (const dep of requiredDeps) {
      const depPath = path.join(nodeModulesPath, dep);
      if (!fs.existsSync(depPath)) {
        missingDeps.push(dep);
      }
    }

    if (missingDeps.length > 0) {
      this.addError(
        `Dependências essenciais faltando: ${missingDeps.join(', ')}\n` +
        `Execute: npm install`
      );
      this.validationResults.dependencies = { installed: false, missingDeps };
      return false;
    }

    this.addInfo('Dependências instaladas corretamente');
    this.validationResults.dependencies = { installed: true };
    return true;
  }

  /**
   * Valida arquivos GRF (versão 0x200 sem criptografia DES)
   */
  async validateGrfs() {
    const resourcesPath = path.join(process.cwd(), 'resources');
    const dataIniPath = path.join(resourcesPath, 'DATA.INI');

    if (!fs.existsSync(dataIniPath)) {
      this.addError('resources/DATA.INI não encontrado!');
      this.validationResults.grfs = { valid: false, reason: 'DATA.INI missing' };
      return false;
    }

    // Ler DATA.INI e extrair lista de GRFs
    const dataIniContent = fs.readFileSync(dataIniPath, 'utf-8');
    const grfFiles = this.parseDataINI(dataIniContent);

    if (grfFiles.length === 0) {
      this.addError('Nenhum arquivo GRF encontrado em resources/DATA.INI!');
      this.validationResults.grfs = { valid: false, reason: 'No GRF files in DATA.INI' };
      return false;
    }

    const grfResults = [];
    let hasInvalidGrf = false;

    for (const grfFile of grfFiles) {
      const grfPath = path.join(resourcesPath, grfFile);

      if (!fs.existsSync(grfPath)) {
        this.addError(`GRF não encontrado: ${grfFile}`);
        grfResults.push({ file: grfFile, exists: false });
        hasInvalidGrf = true;
        continue;
      }

      // Validar versão e criptografia do GRF
      const validation = this.validateGrfFormat(grfPath);
      grfResults.push({ file: grfFile, exists: true, ...validation });

      if (!validation.valid) {
        // Construir mensagem de erro específica
        let errorMsg = `GRF incompatível: ${grfFile}\n`;
        const issues = [];

        // Verificar qual é o problema específico
        const version = parseInt(validation.version.replace('0x', ''), 16);
        const isVersionWrong = version !== 0x200;
        const hasEncryption = validation.hasEncryption;

        if (isVersionWrong) {
          issues.push(`  ❌ Versão: ${validation.version} (esperado: 0x200)`);
        }

        if (hasEncryption) {
          issues.push(`  ❌ Criptografia DES: SIM (esperado: NÃO)`);
        }

        if (issues.length > 0) {
          errorMsg += issues.join('\n') + '\n\n';
        }

        errorMsg += `  📦 SOLUÇÃO: Reempacotar com GRF Builder:\n`;
        errorMsg += `  1. Abra o GRF Builder\n`;
        errorMsg += `  2. File → Options → Repack type → Decrypt\n`;
        errorMsg += `  3. Clique em: Tools → Repack\n`;
        errorMsg += `  4. Aguarde a conclusão e substitua o arquivo original`;

        this.addError(errorMsg);
        hasInvalidGrf = true;
      } else {
        this.addInfo(`GRF válido: ${grfFile} (versão 0x200, sem DES)`);
      }
    }

    this.validationResults.grfs = {
      valid: !hasInvalidGrf,
      files: grfResults,
      count: grfFiles.length
    };

    return !hasInvalidGrf;
  }

  /**
   * Parse DATA.INI para extrair lista de GRFs
   */
  parseDataINI(content) {
    const lines = content.split('\n');
    const grfFiles = [];
    let inDataSection = false;

    for (let line of lines) {
      line = line.trim();

      if (line.toLowerCase() === '[data]') {
        inDataSection = true;
        continue;
      }

      if (line.startsWith('[') && line.endsWith(']')) {
        inDataSection = false;
        continue;
      }

      if (inDataSection && line.includes('=')) {
        const [, value] = line.split('=');
        if (value && value.trim().toLowerCase().endsWith('.grf')) {
          grfFiles.push(value.trim());
        }
      }
    }

    return grfFiles;
  }

  /**
   * Valida formato do arquivo GRF
   * Verifica versão 0x200 e ausência de criptografia DES
   */
  validateGrfFormat(grfPath) {
    try {
      const fd = fs.openSync(grfPath, 'r');
      const buffer = Buffer.alloc(46); // Header GRF é 46 bytes
      fs.readSync(fd, buffer, 0, 46, 0);
      fs.closeSync(fd);

      // Magic bytes: "Master of Magic" (15 bytes)
      const magic = buffer.toString('ascii', 0, 15);
      if (magic !== 'Master of Magic') {
        return {
          valid: false,
          version: 'unknown',
          hasEncryption: false,
          reason: 'Magic bytes inválidos'
        };
      }

      // Encryption key (14 bytes no offset 15)
      const encryptionKey = buffer.slice(15, 29);

      // Version (offset 42, 4 bytes, little-endian)
      const version = buffer.readUInt32LE(42);
      const versionHex = '0x' + version.toString(16).toUpperCase();

      // Verificar se tem criptografia DES (encryption key não é zero)
      const hasEncryption = !encryptionKey.every(byte => byte === 0);

      const isValid = version === 0x200 && !hasEncryption;

      return {
        valid: isValid,
        version: versionHex,
        hasEncryption,
        reason: isValid ? 'OK' : 'Versão ou criptografia incompatível'
      };
    } catch (error) {
      return {
        valid: false,
        version: 'error',
        hasEncryption: false,
        reason: `Erro ao ler GRF: ${error.message}`
      };
    }
  }

  /**
   * Valida arquivos e pastas obrigatórios
   */
  validateRequiredFiles() {
    const checks = [
      { path: 'resources', type: 'dir', required: true, name: 'Pasta resources/' },
      { path: 'resources/DATA.INI', type: 'file', required: true, name: 'Arquivo DATA.INI' },
      { path: 'BGM', type: 'dir', required: false, name: 'Pasta BGM/' },
      { path: 'data', type: 'dir', required: false, name: 'Pasta data/' },
      { path: 'System', type: 'dir', required: false, name: 'Pasta System/' },
    ];

    let hasErrors = false;
    const results = [];

    for (const check of checks) {
      const fullPath = path.join(process.cwd(), check.path);
      const exists = fs.existsSync(fullPath);

      if (check.type === 'dir') {
        const isEmpty = exists ? fs.readdirSync(fullPath).filter(f => !f.startsWith('add-')).length === 0 : true;
        results.push({ ...check, exists, isEmpty });

        if (check.required && !exists) {
          this.addError(`${check.name} não encontrada!`);
          hasErrors = true;
        } else if (check.required && isEmpty) {
          this.addWarning(`${check.name} está vazia`);
        } else if (!check.required && isEmpty) {
          this.addWarning(`${check.name} vazia - pode causar problemas dependendo do client`);
        } else {
          this.addInfo(`${check.name} OK`);
        }
      } else {
        results.push({ ...check, exists });

        if (check.required && !exists) {
          this.addError(`${check.name} não encontrado!`);
          hasErrors = true;
        } else if (exists) {
          this.addInfo(`${check.name} OK`);
        }
      }
    }

    this.validationResults.files = {
      valid: !hasErrors,
      checks: results
    };

    return !hasErrors;
  }

  /**
   * Valida variáveis de ambiente
   */
  validateEnvironment() {
    const envVars = {
      PORT: { value: process.env.PORT, default: '3338', required: false },
      CLIENT_PUBLIC_URL: { value: process.env.CLIENT_PUBLIC_URL, default: null, required: true },
      NODE_ENV: { value: process.env.NODE_ENV, default: 'development', required: false }
    };

    let hasErrors = false;
    const results = {};

    // Validar PORT
    if (!envVars.PORT.value) {
      this.addWarning(`PORT não definida, usando padrão: ${envVars.PORT.default}`);
      results.PORT = { defined: false, usingDefault: true, value: envVars.PORT.default };
    } else {
      this.addInfo(`PORT: ${envVars.PORT.value}`);
      results.PORT = { defined: true, value: envVars.PORT.value };
    }

    // Validar CLIENT_PUBLIC_URL
    if (!envVars.CLIENT_PUBLIC_URL.value) {
      this.addError('CLIENT_PUBLIC_URL não definida! Configure no arquivo .env');
      hasErrors = true;
      results.CLIENT_PUBLIC_URL = { defined: false, error: 'Variable not set' };
    } else {
      // Validar formato de URL
      try {
        new URL(envVars.CLIENT_PUBLIC_URL.value);
        this.addInfo(`CLIENT_PUBLIC_URL: ${envVars.CLIENT_PUBLIC_URL.value}`);
        results.CLIENT_PUBLIC_URL = { defined: true, value: envVars.CLIENT_PUBLIC_URL.value };
      } catch (error) {
        this.addError(`CLIENT_PUBLIC_URL inválida: ${envVars.CLIENT_PUBLIC_URL.value}`);
        hasErrors = true;
        results.CLIENT_PUBLIC_URL = { defined: true, invalid: true, value: envVars.CLIENT_PUBLIC_URL.value };
      }
    }

    // Validar NODE_ENV
    const nodeEnv = envVars.NODE_ENV.value || envVars.NODE_ENV.default;
    results.NODE_ENV = { defined: !!envVars.NODE_ENV.value, value: nodeEnv };

    if (nodeEnv === 'production') {
      // Verificar se DEBUG está habilitado em produção
      const configs = require('../config/configs');
      if (configs.DEBUG) {
        this.addWarning('DEBUG habilitado em ambiente de PRODUÇÃO!');
      }
    }

    if (!envVars.NODE_ENV.value) {
      this.addWarning(`NODE_ENV não definida, usando: ${nodeEnv}`);
    } else {
      this.addInfo(`NODE_ENV: ${nodeEnv}`);
    }

    // Verificar se existe arquivo .env
    const envPath = path.join(process.cwd(), '.env');
    const envExamplePath = path.join(process.cwd(), '.env.example');

    if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
      this.addWarning('Arquivo .env não encontrado! Copie de .env.example e configure');
    }

    this.validationResults.env = {
      valid: !hasErrors,
      variables: results
    };

    return !hasErrors;
  }

  /**
   * Executa todas as validações
   */
  async validateAll() {
    console.log('\n🔍 Validando configurações de startup...\n');

    // 1. Validar versão do Node
    this.validateNodeVersion();

    // 2. Validar dependências
    const depsValid = this.validateDependencies();
    if (!depsValid) {
      return this.getResults();
    }

    // 3. Validar arquivos obrigatórios
    this.validateRequiredFiles();

    // 4. Validar variáveis de ambiente
    this.validateEnvironment();

    // 5. Validar GRFs
    await this.validateGrfs();

    return this.getResults();
  }

  /**
   * Retorna resultados da validação
   */
  getResults() {
    return {
      success: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      info: this.info,
      details: this.validationResults
    };
  }

  /**
   * Imprime relatório de validação
   */
  printReport(results = null) {
    if (!results) {
      results = this.getResults();
    }

    console.log('\n' + '='.repeat(80));
    console.log('📋 RELATÓRIO DE VALIDAÇÃO');
    console.log('='.repeat(80) + '\n');

    // Informações
    if (results.info.length > 0) {
      console.log('✓ INFORMAÇÕES:');
      results.info.forEach(info => console.log(`  ${info}`));
      console.log('');
    }

    // Avisos
    if (results.warnings.length > 0) {
      console.log('⚠️  AVISOS:');
      results.warnings.forEach(warning => console.log(`  ${warning}`));
      console.log('');
    }

    // Erros
    if (results.errors.length > 0) {
      console.log('❌ ERROS:');
      results.errors.forEach(error => console.log(`  ${error}`));
      console.log('');
    }

    // Resultado final
    console.log('='.repeat(80));
    if (results.success) {
      console.log('✅ Validação concluída com sucesso!');
      if (results.warnings.length > 0) {
        console.log(`⚠️  ${results.warnings.length} aviso(s) encontrado(s)`);
      }
    } else {
      console.log('❌ Validação falhou!');
      console.log(`   ${results.errors.length} erro(s) encontrado(s)`);
      console.log('\n💡 Dica: Execute "npm run doctor" para diagnóstico detalhado');
    }
    console.log('='.repeat(80) + '\n');

    return results.success;
  }

  /**
   * Gera JSON com status de validação (para API/frontend)
   */
  getStatusJSON() {
    const results = this.getResults();
    return {
      timestamp: new Date().toISOString(),
      status: results.success ? 'ok' : 'error',
      hasWarnings: results.warnings.length > 0,
      summary: {
        errors: results.errors.length,
        warnings: results.warnings.length,
        info: results.info.length
      },
      details: results.details,
      messages: {
        errors: results.errors,
        warnings: results.warnings,
        info: results.info
      }
    };
  }
}

module.exports = StartupValidator;
