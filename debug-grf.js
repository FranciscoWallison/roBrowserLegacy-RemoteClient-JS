#!/usr/bin/env node

/**
 * Script de Debug de GRF
 * Mostra o conteúdo do header do GRF em detalhe
 */

const fs = require('fs');
const path = require('path');

// Função para converter bytes em string hexadecimal
function bytesToHex(bytes) {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
}

// Função para verificar se um arquivo GRF tem DES
function debugGrf(grfPath) {
  console.log('\n' + '═'.repeat(80));
  console.log(`🔍 DEBUG GRF: ${path.basename(grfPath)}`);
  console.log('═'.repeat(80) + '\n');

  if (!fs.existsSync(grfPath)) {
    console.error('❌ Arquivo não encontrado:', grfPath);
    return;
  }

  try {
    // Ler os primeiros 46 bytes (header do GRF)
    const fd = fs.openSync(grfPath, 'r');
    const buffer = Buffer.alloc(46);
    fs.readSync(fd, buffer, 0, 46, 0);
    fs.closeSync(fd);

    console.log('📋 HEADER COMPLETO (46 bytes):');
    console.log('─'.repeat(80));

    // Mostrar todo o header em hex
    for (let i = 0; i < 46; i += 16) {
      const chunk = buffer.slice(i, Math.min(i + 16, 46));
      const offset = i.toString().padStart(2, '0');
      const hex = bytesToHex(chunk);
      const ascii = Array.from(chunk)
        .map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.')
        .join('');

      console.log(`  Offset ${offset}: ${hex.padEnd(48, ' ')}  ${ascii}`);
    }

    console.log('\n📍 ANÁLISE DETALHADA:');
    console.log('─'.repeat(80));

    // 1. Magic bytes (0-14)
    const magic = buffer.toString('ascii', 0, 15);
    console.log(`\n1️⃣  Magic Bytes (offset 0-14, 15 bytes):`);
    console.log(`   Hex: ${bytesToHex(buffer.slice(0, 15))}`);
    console.log(`   ASCII: "${magic}"`);
    console.log(`   Válido: ${magic === 'Master of Magic' ? '✅ SIM' : '❌ NÃO'}`);

    // 2. Encryption key (15-28)
    const encryptionKey = buffer.slice(15, 29);
    console.log(`\n2️⃣  Chave de Criptografia DES (offset 15-28, 14 bytes):`);
    console.log(`   Hex: ${bytesToHex(encryptionKey)}`);

    // Verificar byte por byte
    console.log(`\n   Análise byte por byte:`);
    let allZeros = true;
    for (let i = 0; i < encryptionKey.length; i++) {
      const byte = encryptionKey[i];
      const isZero = byte === 0;
      if (!isZero) allZeros = false;

      console.log(`   Byte ${i.toString().padStart(2, ' ')}: 0x${byte.toString(16).padStart(2, '0').toUpperCase()} ${isZero ? '✅ (zero)' : '❌ (diferente de zero)'}`);
    }

    console.log(`\n   Resultado:`);
    console.log(`   - Todos os bytes são zero? ${allZeros ? '✅ SIM' : '❌ NÃO'}`);
    console.log(`   - Tem criptografia DES? ${allZeros ? '✅ NÃO (correto)' : '❌ SIM (incompatível)'}`);

    // 3. Versão (42-45)
    const version = buffer.readUInt32LE(42);
    const versionHex = '0x' + version.toString(16).toUpperCase();
    console.log(`\n3️⃣  Versão do GRF (offset 42-45, 4 bytes little-endian):`);
    console.log(`   Bytes: ${bytesToHex(buffer.slice(42, 46))}`);
    console.log(`   Decimal: ${version}`);
    console.log(`   Hex: ${versionHex}`);
    console.log(`   Válido: ${version === 0x200 ? '✅ SIM (0x200)' : '❌ NÃO (esperado: 0x200)'}`);

    // Resultado final
    console.log('\n' + '═'.repeat(80));
    console.log('📊 RESULTADO FINAL:');
    console.log('═'.repeat(80));

    const isValid = version === 0x200 && allZeros;

    if (isValid) {
      console.log('\n✅ GRF COMPATÍVEL!');
      console.log('   - Versão: 0x200 ✅');
      console.log('   - Sem DES: SIM ✅');
    } else {
      console.log('\n❌ GRF INCOMPATÍVEL!');
      if (version !== 0x200) {
        console.log(`   - Versão: ${versionHex} ❌ (esperado: 0x200)`);
      } else {
        console.log(`   - Versão: 0x200 ✅`);
      }

      if (!allZeros) {
        console.log(`   - Criptografia DES: SIM ❌ (esperado: NÃO)`);
        console.log(`\n   📦 SOLUÇÃO: Reempacotar com GRF Builder (Decrypt)`);
      } else {
        console.log(`   - Sem DES: SIM ✅`);
      }
    }

    console.log('\n' + '═'.repeat(80) + '\n');

  } catch (error) {
    console.error('\n❌ Erro ao ler GRF:', error.message);
  }
}

// Executar
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('\n📖 Uso: node debug-grf.js <caminho-do-arquivo.grf>');
  console.log('\nExemplos:');
  console.log('  node debug-grf.js resources/data.grf');
  console.log('  node debug-grf.js resources/rdata.grf');
  console.log('');

  // Se não passar argumento, tenta debugar todos os GRFs em resources/
  const resourcesPath = path.join(__dirname, 'resources');
  if (fs.existsSync(resourcesPath)) {
    const grfFiles = fs.readdirSync(resourcesPath)
      .filter(f => f.toLowerCase().endsWith('.grf'))
      .map(f => path.join(resourcesPath, f));

    if (grfFiles.length > 0) {
      console.log('🔍 Encontrei GRFs em resources/. Analisando todos:\n');
      grfFiles.forEach(grf => debugGrf(grf));
    } else {
      console.log('⚠️  Nenhum arquivo .grf encontrado em resources/\n');
    }
  }
} else {
  // Debugar o arquivo especificado
  const grfPath = args[0];
  debugGrf(grfPath);
}
