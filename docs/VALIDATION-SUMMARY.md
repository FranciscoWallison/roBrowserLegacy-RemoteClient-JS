# Resumo Consolidado: Ferramentas de Validação GRF

## Status: Prioridades Definidas

A partir de agora, as prioridades são:
1. **Validação completa dos arquivos dentro dos GRFs**
2. **Padronização de paths + encoding**
3. **Conversão automática de encoding**

---

## Inventário de Ferramentas

### Ferramentas em `/tools/` (Novas/Expandidas)

| Ferramenta | Arquivo | Função Principal |
|------------|---------|------------------|
| **Validador Completo** | `validate-grf.mjs` | Valida índice, normalização de paths, extração |
| **Validador em Lote** | `validate-all-grfs.mjs` | Valida todos os GRFs de uma pasta |
| **Validador de Encoding** | `validate-grf-iconv.mjs` | Round-trip de encoding, detecção de mojibake |
| **Teste de Mojibake** | `test-mojibake.mjs` | Testa funções de detecção/correção de mojibake |
| **Teste de Leitura** | `test-grf-read.mjs` | Testa extração real de arquivos |
| **Teste Básico** | `test-grf.mjs` | Teste básico de carregamento |

### Ferramentas na Raiz (Existentes)

| Ferramenta | Arquivo | Função |
|------------|---------|--------|
| **Doctor** | `doctor.js` | Diagnóstico completo do sistema |
| **Debug GRF** | `debug-grf.js` | Análise de headers GRF |
| **Scanner de Encoding** | `grf-path-encoding-scan.js` | Detecta encoding de paths |
| **Teste Real** | `test-grf-real.js` | Testes de leitura real |

---

## Capacidades de Validação

### 1. Validação de Índice (`validate-grf.mjs`)

```bash
node tools/validate-grf.mjs <grfPath> [encoding=auto] [mode] [sampleN]
```

**O que valida:**
- Contagem de arquivos
- Nomes com `U+FFFD` (replacement character)
- Colisões de paths normalizados
- Resolução de paths (case-insensitive, slash-insensitive)
- Extração de arquivos (amostragem ou completa)

**Modos:**
- `lookup` - Apenas validação de índice e normalização
- `extract-sample` - Validação + extração de amostra (N arquivos)
- `extract-all` - Validação + extração de TODOS os arquivos (pesado)

**Output:** Relatório JSON com detalhes completos

### 2. Validação em Lote (`validate-all-grfs.mjs`)

```bash
node tools/validate-all-grfs.mjs <pasta> [encoding=auto] [--read=100] [--examples=20]
```

**O que valida por GRF:**
- `U+FFFD` - Caracteres de substituição
- `C1 Controls` - Bytes 0x80-0x9F (sinal de mojibake CP949)
- **Round-trip RAW** - str → encode → decode = str?
- **Round-trip Repairable** - Falha RAW mas passa após reparo heurístico
- **Round-trip Final** - Continua falhando mesmo após reparo
- Testes de leitura real (amostragem inteligente)

**Heurísticas de Reparo:**
1. Mojibake latin1→cp949
2. C1 prefix em segmentos

**Resumo Final:**
```
GRFs loaded:              3/3
Total files:              655,144
Bad U+FFFD:               12
Bad C1 Control:           40
Round-trip fails (RAW):   52
Round-trip repairable:    40
Round-trip fails (FINAL): 12
Read tests passed:        300
Read tests failed:        0

Encoding Health: 99.99% (655,092/655,144 clean)
```

### 3. Validação de Encoding (`validate-grf-iconv.mjs`)

```bash
node tools/validate-grf-iconv.mjs <grfPath> [encoding=auto]
```

**O que valida:**
- `U+FFFD` em nomes
- Round-trip do path inteiro
- Mojibake check (encode→latin1→decode)
- Round-trip por segmento (pasta/arquivo)

### 4. Teste de Mojibake (`test-mojibake.mjs`)

```bash
node tools/test-mojibake.mjs
```

**Testa funções do `@chicowall/grf-loader`:**
- `isMojibake()` - Detecta se string é mojibake
- `fixMojibake()` - Corrige mojibake para coreano
- `toMojibake()` - Converte coreano para mojibake (debug)
- `normalizeEncodingPath()` - Normaliza path completo

---

## Biblioteca `@chicowall/grf-loader`

### Funcionalidades de Encoding

```typescript
// Detecção de mojibake
isMojibake('À¯ÀúÀÎÅÍÆäÀÌ½º'); // true
isMojibake('유저인터페이스');     // false

// Correção de mojibake
fixMojibake('À¯ÀúÀÎÅÍÆäÀÌ½º'); // '유저인터페이스'

// Normalização de path completo
normalizeEncodingPath('data\\texture\\À¯ÀúÀÎÅÍÆäÀÌ½º\\test.bmp');
// 'data\\texture\\유저인터페이스\\test.bmp'

// Contagem de chars problemáticos
countBadChars('test�file.txt'); // 1

// Verificar se iconv-lite disponível
hasIconvLite(); // true (Node.js) / false (browser)
```

### Configurações de Encoding

```typescript
const grf = new GrfNode(fd, {
  filenameEncoding: 'auto',      // 'auto' | 'cp949' | 'euc-kr' | 'utf-8' | 'latin1'
  autoDetectThreshold: 0.01,     // Limiar para auto-detecção (1%)
});

// Recarregar com encoding diferente
await grf.reloadWithEncoding('cp949');

// Obter encoding detectado
grf.getDetectedEncoding(); // 'cp949'
```

### APIs de Busca

```typescript
// Resolução case-insensitive
const result = grf.resolvePath('DATA\\Sprite\\Test.spr');
// { status: 'found' | 'not_found' | 'ambiguous', matchedPath?, candidates? }

// Busca com filtros
const files = grf.find({
  ext: 'spr',              // Por extensão
  contains: 'monster',      // Por substring
  endsWith: 'poring.spr',  // Por sufixo
  regex: /^data\\sprite/,  // Por regex
  limit: 100
});

// Estatísticas
const stats = grf.getStats();
// { fileCount, badNameCount, collisionCount, extensionStats, detectedEncoding }
```

---

## Padronização de Paths

### Função de Normalização

```javascript
function norm(p) {
  return String(p)
    .replace(/[\\/]+/g, "/")  // Backslash → forward slash
    .toLowerCase()             // Case normalization
    .normalize("NFC");         // Unicode normalization
}
```

### Problema de Colisões

Paths que normalizam para o mesmo valor são "colisões":
```
data\sprite\MONSTER.spr  →  data/sprite/monster.spr
data/sprite/monster.spr  →  data/sprite/monster.spr
```

A biblioteca usa indexação collision-safe para não perder arquivos.

### Resolução de Paths

```typescript
// Todas estas variantes resolvem para o mesmo arquivo:
await grf.getFile('data\\sprite\\monster.spr');
await grf.getFile('DATA\\SPRITE\\MONSTER.SPR');
await grf.getFile('data/sprite/monster.spr');
```

---

## Fluxo de Trabalho Recomendado

### 1. Validação Inicial

```bash
# Diagnóstico rápido do sistema
npm run doctor

# Validação completa de encoding de um GRF
node tools/validate-grf-iconv.mjs ./resources/data.grf auto
```

### 2. Validação em Lote

```bash
# Validar todos os GRFs com testes de leitura
node tools/validate-all-grfs.mjs ./resources auto --read=200
```

### 3. Análise Profunda

```bash
# Validação completa com extração de amostra
node tools/validate-grf.mjs ./resources/data.grf auto extract-sample 500

# Extração de TODOS os arquivos (demorado)
node tools/validate-grf.mjs ./resources/data.grf auto extract-all
```

### 4. Teste de Funções de Reparo

```bash
# Testar detecção e correção de mojibake
node tools/test-mojibake.mjs
```

---

## Métricas de Saúde

### Indicadores Chave

| Métrica | Bom | Aceitável | Problema |
|---------|-----|-----------|----------|
| `U+FFFD` | 0 | < 0.01% | > 0.1% |
| `C1 Controls` | 0 | < 0.1% | > 1% |
| Round-trip Final Fail | 0 | < 0.01% | > 0.1% |
| Read Tests Failed | 0 | 0 | > 0 |

### Fórmula de Health Score

```
Health% = (totalFiles - badUfffd - badC1) / totalFiles × 100
```

### Códigos de Saída

| Código | Significado |
|--------|-------------|
| 0 | Tudo OK |
| 1 | Warnings (problemas reparáveis) |
| 2 | Erros (falha de load ou problemas irreversíveis) |

---

## Próximos Passos

### Prioridade 1: Validação Completa

- [ ] Executar `validate-all-grfs.mjs` em todos os GRFs do projeto
- [ ] Documentar métricas de baseline
- [ ] Identificar arquivos com problemas irreversíveis

### Prioridade 2: Padronização Automática

- [ ] Implementar conversão automática de encoding no servidor
- [ ] Cache de paths normalizados para lookup rápido
- [ ] Fallback automático para encoding detectado

### Prioridade 3: Integração

- [ ] Adicionar validação de encoding no startup
- [ ] Endpoint `/api/encoding-health` para monitoramento
- [ ] Logs de conversão de encoding em runtime

---

## Comandos NPM Disponíveis

```bash
npm start          # Inicia servidor (com validação)
npm run doctor     # Diagnóstico completo
npm run debug-grf  # Debug de headers GRF
npm run test-grf   # Teste de leitura real
```

### Sugestão: Novos Scripts

```json
{
  "validate:encoding": "node tools/validate-grf-iconv.mjs",
  "validate:all": "node tools/validate-all-grfs.mjs ./resources auto",
  "validate:deep": "node tools/validate-grf.mjs",
  "test:mojibake": "node tools/test-mojibake.mjs"
}
```
