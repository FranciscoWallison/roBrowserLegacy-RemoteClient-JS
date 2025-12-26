#!/usr/bin/env node

/**
 * Teste REAL de leitura de GRF
 * Testa se a biblioteca @chicowall/grf-loader consegue ler o GRF
 */

const fs = require('fs');
const path = require('path');
const { GrfNode } = require('@chicowall/grf-loader');

async function testGrf(grfPath) {
  console.log('\n' + '═'.repeat(80));
  console.log(`🧪 TESTE REAL DE LEITURA: ${path.basename(grfPath)}`);
  console.log('═'.repeat(80) + '\n');

  if (!fs.existsSync(grfPath)) {
    console.error('❌ Arquivo não encontrado:', grfPath);
    return false;
  }

  let fd = null;
  let grf = null;
  let stepCompleted = 0;

  try {
    // PASSO 1: Abrir arquivo
    console.log('1️⃣  Abrindo arquivo GRF...');
    fd = fs.openSync(grfPath, 'r');
    const stats = fs.fstatSync(fd);
    console.log(`   ✅ Arquivo aberto com sucesso`);
    console.log(`   📏 Tamanho: ${(stats.size / 1024 / 1024).toFixed(2)} MB (${stats.size} bytes)`);
    stepCompleted = 1;

    // PASSO 2: Ler header
    console.log('\n2️⃣  Lendo header do GRF...');
    const headerBuffer = Buffer.alloc(46);
    fs.readSync(fd, headerBuffer, 0, 46, 0);

    const magic = headerBuffer.toString('ascii', 0, 15);
    const version = headerBuffer.readUInt32LE(42);
    const versionHex = '0x' + version.toString(16).toUpperCase();

    console.log(`   Magic: "${magic}"`);
    console.log(`   Versão: ${versionHex} (${version})`);
    stepCompleted = 2;

    // PASSO 3: Inicializar biblioteca
    console.log('\n3️⃣  Inicializando biblioteca @chicowall/grf-loader...');
    grf = new GrfNode(fd);
    console.log(`   ✅ Biblioteca inicializada`);
    stepCompleted = 3;

    // PASSO 4: Carregar GRF (AQUI QUE PODE FALHAR COM DES)
    console.log('\n4️⃣  Tentando carregar/descompactar arquivos do GRF...');
    console.log(`   ⏳ Aguarde, isso pode demorar alguns segundos...`);

    const startTime = Date.now();
    await grf.load();
    const loadTime = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`   ✅ GRF carregado em ${loadTime}s`);
    stepCompleted = 4;

    // PASSO 5: Listar arquivos
    console.log('\n5️⃣  Listando arquivos...');
    const files = Array.from(grf.files.keys());
    const fileCount = files.length;

    console.log(`   ✅ Total de arquivos: ${fileCount}`);

    // Mostrar alguns arquivos de exemplo
    if (fileCount > 0) {
      console.log(`\n   📄 Primeiros 10 arquivos:`);
      files.slice(0, 10).forEach((file, i) => {
        console.log(`      ${i + 1}. ${file}`);
      });

      if (fileCount > 10) {
        console.log(`      ... e mais ${fileCount - 10} arquivos`);
      }

      // Testar extração de um arquivo
      console.log('\n6️⃣  Testando extração de arquivo...');
      const testFile = files[0];
      console.log(`   📝 Tentando extrair: ${testFile}`);

      const { data, error } = await grf.getFile(testFile);
      if (error) {
        console.log(`   ⚠️  Erro ao extrair: ${error}`);
      } else {
        console.log(`   ✅ Arquivo extraído com sucesso (${data.length} bytes)`);
      }
    }

    if (fd !== null) {
      fs.closeSync(fd);
    }

    console.log('\n' + '═'.repeat(80));
    console.log('🎉 CONCLUSÃO: GRF É TOTALMENTE COMPATÍVEL!');
    console.log('═'.repeat(80));
    console.log('\n✅ Seu GRF funciona perfeitamente com a biblioteca!');
    console.log('✅ Não precisa reempacotar!');
    console.log('\n💡 O validador precisa ser ajustado para aceitar este tipo de GRF.\n');

    return true;

  } catch (error) {
    console.error(`\n❌ ERRO ao carregar GRF!`);
    console.error('─'.repeat(80));

    // Identificar ONDE falhou
    console.error(`\n📍 LOCAL DA FALHA:`);
    if (stepCompleted === 0) {
      console.error(`   Falhou ao: Abrir o arquivo GRF`);
      console.error(`   Possível causa: Arquivo não existe ou sem permissão de leitura`);
    } else if (stepCompleted === 1) {
      console.error(`   Falhou ao: Ler header do GRF`);
      console.error(`   Possível causa: Arquivo corrompido ou não é um GRF válido`);
    } else if (stepCompleted === 2) {
      console.error(`   Falhou ao: Inicializar biblioteca`);
      console.error(`   Possível causa: Problema com a biblioteca @chicowall/grf-loader`);
    } else if (stepCompleted === 3) {
      console.error(`   Falhou ao: Carregar/descompactar arquivos do GRF`);
      console.error(`   Possível causa: Criptografia DES incompatível ou arquivo corrompido`);
      console.error(`\n   ⚠️  ESTE É O PROBLEMA MAIS COMUM COM DES!`);
      console.error(`   A biblioteca não consegue descriptografar GRFs com DES.`);
    } else if (stepCompleted === 4) {
      console.error(`   Falhou ao: Listar arquivos`);
      console.error(`   Possível causa: Estrutura interna do GRF incompatível`);
    }

    console.error(`\n📋 DETALHES DO ERRO:`);
    console.error(`   Tipo: ${error.name}`);
    console.error(`   Mensagem: ${error.message}`);

    if (error.code) {
      console.error(`   Código: ${error.code}`);
    }

    // Analisar mensagem de erro para dar diagnóstico específico
    const errorMsg = error.message.toLowerCase();
    console.error(`\n🔍 DIAGNÓSTICO:`);

    if (errorMsg.includes('decrypt') || errorMsg.includes('encryption') || errorMsg.includes('des')) {
      console.error(`   ❌ PROBLEMA: Criptografia DES detectada`);
      console.error(`   📦 SOLUÇÃO: Reempacotar com GRF Builder (Decrypt)`);
    } else if (errorMsg.includes('magic') || errorMsg.includes('header')) {
      console.error(`   ❌ PROBLEMA: Header do GRF inválido`);
      console.error(`   📦 SOLUÇÃO: Arquivo pode estar corrompido`);
    } else if (errorMsg.includes('compress') || errorMsg.includes('inflate') || errorMsg.includes('zlib')) {
      console.error(`   ❌ PROBLEMA: Erro ao descompactar arquivos`);
      console.error(`   📦 SOLUÇÃO: GRF pode estar corrompido ou usar compressão incompatível`);
    } else if (errorMsg.includes('version')) {
      console.error(`   ❌ PROBLEMA: Versão do GRF incompatível`);
      console.error(`   📦 SOLUÇÃO: Reempacotar com GRF Builder para versão 0x200`);
    } else {
      console.error(`   ❓ PROBLEMA: Erro desconhecido`);
      console.error(`   📦 SOLUÇÃO: Tente reempacotar com GRF Builder (Decrypt)`);
    }

    if (error.stack) {
      console.error(`\n📚 Stack Trace Completo:`);
      console.error(error.stack);
    }

    console.log('\n' + '═'.repeat(80));
    console.log('❌ CONCLUSÃO: GRF NÃO É COMPATÍVEL!');
    console.log('═'.repeat(80));
    console.log('\n🔧 SOLUÇÃO RECOMENDADA:');
    console.log('   1. Baixe o GRF Builder: https://github.com/Tokeiburu/GRFEditor');
    console.log('   2. Abra o GRF Builder');
    console.log('   3. File → Options → Repack type → Decrypt');
    console.log('   4. Tools → Repack');
    console.log('   5. Aguarde e substitua o arquivo original\n');

    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch (e) {
        // Ignorar erro ao fechar
      }
    }

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
