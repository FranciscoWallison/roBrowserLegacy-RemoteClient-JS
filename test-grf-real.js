#!/usr/bin/env node

/**
 * Teste REAL de leitura de GRF
 * Testa se a biblioteca @chicowall/grf-loader consegue ler o GRF
 */

const fs = require('fs');
const path = require('path');
const GrfNode = require('@chicowall/grf-loader');

async function testGrf(grfPath) {
  console.log('\n' + '═'.repeat(80));
  console.log(`🧪 TESTE REAL DE LEITURA: ${path.basename(grfPath)}`);
  console.log('═'.repeat(80) + '\n');

  if (!fs.existsSync(grfPath)) {
    console.error('❌ Arquivo não encontrado:', grfPath);
    return false;
  }

  try {
    console.log('1️⃣  Abrindo arquivo GRF...');
    const fd = fs.openSync(grfPath, 'r');

    console.log('2️⃣  Inicializando biblioteca @chicowall/grf-loader...');
    const grf = new GrfNode(fd);

    console.log('3️⃣  Tentando carregar GRF...');
    await grf.load();

    console.log('4️⃣  Listando arquivos...');
    const files = grf.getItems();
    const fileCount = files.length;

    console.log(`\n✅ SUCESSO! GRF carregado com êxito!`);
    console.log(`   📦 Total de arquivos: ${fileCount}`);

    // Mostrar alguns arquivos de exemplo
    if (fileCount > 0) {
      console.log(`\n   📄 Primeiros 10 arquivos:`);
      files.slice(0, 10).forEach((file, i) => {
        console.log(`      ${i + 1}. ${file}`);
      });

      if (fileCount > 10) {
        console.log(`      ... e mais ${fileCount - 10} arquivos`);
      }
    }

    fs.closeSync(fd);

    console.log('\n' + '═'.repeat(80));
    console.log('🎉 CONCLUSÃO: GRF É COMPATÍVEL COM A BIBLIOTECA!');
    console.log('═'.repeat(80) + '\n');

    return true;

  } catch (error) {
    console.error(`\n❌ ERRO ao carregar GRF!`);
    console.error(`   Tipo: ${error.name}`);
    console.error(`   Mensagem: ${error.message}`);

    if (error.stack) {
      console.error(`\n   Stack trace:`);
      console.error(error.stack);
    }

    console.log('\n' + '═'.repeat(80));
    console.log('❌ CONCLUSÃO: GRF NÃO É COMPATÍVEL!');
    console.log('   A biblioteca @chicowall/grf-loader não consegue ler este GRF.');
    console.log('   Você PRECISA reempacotar com GRF Builder (Decrypt).');
    console.log('═'.repeat(80) + '\n');

    return false;
  }
}

// Executar
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('\n📖 Uso: npm run test-grf <caminho-do-arquivo.grf>');
  console.log('\nExemplo:');
  console.log('  npm run test-grf resources/data.grf');
  console.log('');

  // Tentar testar todos os GRFs em resources/
  const resourcesPath = path.join(__dirname, 'resources');
  if (fs.existsSync(resourcesPath)) {
    const grfFiles = fs.readdirSync(resourcesPath)
      .filter(f => f.toLowerCase().endsWith('.grf'))
      .map(f => path.join(resourcesPath, f));

    if (grfFiles.length > 0) {
      console.log('🔍 Testando todos os GRFs em resources/:\n');

      (async () => {
        for (const grf of grfFiles) {
          const success = await testGrf(grf);
          if (!success) {
            process.exit(1);
          }
        }
      })();
    } else {
      console.log('⚠️  Nenhum arquivo .grf encontrado em resources/\n');
    }
  }
} else {
  const grfPath = args[0];
  testGrf(grfPath).then(success => {
    process.exit(success ? 0 : 1);
  });
}
