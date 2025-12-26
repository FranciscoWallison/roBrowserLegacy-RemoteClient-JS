#!/usr/bin/env node

/**
 * Doctor Command - Diagnóstico completo do sistema
 * Execute: npm run doctor
 */

require('dotenv').config();

const StartupValidator = require('./src/validators/startupValidator');

async function runDoctor() {
  console.log('\n╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    🏥 roBrowser Remote Client - Doctor                    ║');
  console.log('║                        Diagnóstico do Sistema                             ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

  const validator = new StartupValidator();
  const results = await validator.validateAll();

  // Imprimir relatório detalhado
  validator.printReport(results);

  // Se houver erros, mostrar instruções de correção
  if (!results.success) {
    console.log('\n📖 GUIA DE CORREÇÃO:\n');

    // Verificar cada tipo de erro e dar instruções específicas
    const { details } = results;

    // Erros de dependências
    if (details.dependencies && !details.dependencies.installed) {
      console.log('1️⃣  DEPENDÊNCIAS NÃO INSTALADAS:');
      console.log('   Execute: npm install');
      if (details.nodeVersion) {
        console.log(`   Versões: Node ${details.nodeVersion.node} | npm ${details.nodeVersion.npm}`);
      }
      console.log('');
    }

    // Erros de variáveis de ambiente
    if (details.env && !details.env.valid) {
      console.log('2️⃣  VARIÁVEIS DE AMBIENTE:');
      console.log('   Crie um arquivo .env na raiz do projeto:');
      console.log('   ');
      console.log('   PORT=3338');
      console.log('   CLIENT_PUBLIC_URL=http://127.0.0.1:8000');
      console.log('   NODE_ENV=development');
      console.log('');
    }

    // Erros de arquivos
    if (details.files && !details.files.valid) {
      console.log('3️⃣  ARQUIVOS E PASTAS OBRIGATÓRIOS:');
      console.log('   Certifique-se de que existem:');
      console.log('   - resources/');
      console.log('   - resources/DATA.INI');
      console.log('   - Pelo menos um arquivo .grf em resources/');
      console.log('');
    }

    // Erros de GRF
    if (details.grfs && !details.grfs.valid) {
      console.log('4️⃣  ARQUIVOS GRF INCOMPATÍVEIS:');
      console.log('   Este projeto só suporta GRF versão 0x200 sem criptografia DES.');
      console.log('');
      console.log('   📦 SOLUÇÃO: Reempacotar com GRF Builder');
      console.log('   ');
      console.log('   1. Baixe o GRF Builder (https://github.com/Tokeiburu/GRFEditor)');
      console.log('   2. Abra seu arquivo .grf no GRF Builder');
      console.log('   3. Vá em: File → Options → Repack type → Decrypt');
      console.log('   4. Clique em: Tools → Repack');
      console.log('   5. Aguarde a conclusão e substitua o arquivo original');
      console.log('');
      console.log('   Isso vai converter para versão 0x200 sem DES.');
      console.log('');
    }

    console.log('═'.repeat(80));
    console.log('💡 Depois de corrigir, execute novamente: npm run doctor');
    console.log('═'.repeat(80) + '\n');

    process.exit(1);
  } else {
    console.log('🎉 Sistema configurado corretamente! Pode iniciar o servidor com: npm start\n');
    process.exit(0);
  }
}

// Executar doctor
runDoctor().catch(error => {
  console.error('\n❌ Erro ao executar diagnóstico:', error);
  process.exit(1);
});
