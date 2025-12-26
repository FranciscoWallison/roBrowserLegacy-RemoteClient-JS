# Sistema de Validação de Startup

Este documento explica o sistema de validação implementado no roBrowser Remote Client.

## 📋 Visão Geral

O sistema de validação garante que todos os recursos e configurações necessários estejam corretos antes de iniciar o servidor. Ele previne problemas comuns e fornece instruções claras de correção.

## 🔍 O Que é Validado

### 1. Versão do Node.js e npm

- Verifica a versão instalada do Node.js
- Verifica a versão instalada do npm
- Alerta se a versão do Node.js for muito antiga (< v14)

### 2. Dependências (node_modules)

- Verifica se `node_modules/` existe
- Verifica se `package.json` existe
- Valida dependências essenciais:
  - `express`
  - `cors`
  - `@chicowall/grf-loader`
  - `dotenv`

**Erro se faltarem dependências:**
```
❌ Dependências não instaladas!
Execute: npm install
  Node.js: v18.12.0
  npm: 9.1.0
```

### 3. Variáveis de Ambiente

O sistema valida as seguintes variáveis:

#### `CLIENT_PUBLIC_URL` (Obrigatória)

- **Tipo**: String (URL válida)
- **Descrição**: URL onde o cliente roBrowser está rodando
- **Exemplo**: `http://127.0.0.1:8000`
- **Erro se ausente**: ❌ Servidor não inicia
- **Validação**: Verifica se é uma URL válida

#### `PORT` (Opcional)

- **Tipo**: Number
- **Padrão**: `3338`
- **Descrição**: Porta onde o servidor irá rodar
- **Aviso se ausente**: ⚠️ PORT não definida, usando padrão: 3338

#### `NODE_ENV` (Opcional)

- **Tipo**: String
- **Padrão**: `development`
- **Valores comuns**: `development`, `production`
- **Validação adicional**: Alerta se `DEBUG=true` em produção

**Exemplo de .env:**
```env
PORT=3338
CLIENT_PUBLIC_URL=http://127.0.0.1:8000
NODE_ENV=development
```

### 4. Arquivos e Pastas Obrigatórios

#### Obrigatórios (Erro Fatal)

- ✅ `resources/` - Pasta de recursos
- ✅ `resources/DATA.INI` - Arquivo de configuração do cliente

#### Recomendados (Aviso)

- ⚠️ `BGM/` - Pasta de músicas
- ⚠️ `data/` - Pasta de dados do cliente
- ⚠️ `System/` - Pasta de arquivos do sistema

**Estrutura esperada:**
```
roBrowserLegacy-RemoteClient-JS/
├── resources/
│   ├── DATA.INI          ✅ OBRIGATÓRIO
│   └── *.grf             ✅ OBRIGATÓRIO (pelo menos um)
├── BGM/                  ⚠️ RECOMENDADO
├── data/                 ⚠️ RECOMENDADO
└── System/               ⚠️ RECOMENDADO
```

### 5. Arquivos GRF (Validação de Compatibilidade)

O sistema valida cada arquivo GRF listado no `DATA.INI`:

#### Verificações:

1. **Existência**: O arquivo .grf existe em `resources/`?
2. **Magic Bytes**: O arquivo tem os bytes mágicos "Master of Magic"?
3. **Versão**: O GRF é versão `0x200`?
4. **Criptografia DES**: O GRF está sem criptografia DES?

#### Formato GRF Suportado:

- ✅ Versão: `0x200`
- ✅ Criptografia DES: **NÃO**

**Erro se incompatível:**
```
❌ GRF incompatível: data.grf
  Versão: 0x102 (esperado: 0x200)
  Criptografia DES: SIM (esperado: NÃO)

  SOLUÇÃO: Reempacotar com GRF Builder:
  1. Abra o GRF Builder
  2. File → Option → Repack type → Decrypt
  3. Clique em Repack
```

## 🚀 Como Usar

### Comando `npm run doctor`

Execute o diagnóstico completo do sistema:

```bash
npm run doctor
```

**Saída esperada (sucesso):**
```
╔════════════════════════════════════════════════════════════════════════════╗
║                    🏥 roBrowser Remote Client - Doctor                    ║
║                        Diagnóstico do Sistema                             ║
╚════════════════════════════════════════════════════════════════════════════╝

🔍 Validando configurações de startup...

================================================================================
📋 RELATÓRIO DE VALIDAÇÃO
================================================================================

✓ INFORMAÇÕES:
  Node.js: v18.12.0
  npm: 9.1.0
  Dependências instaladas corretamente
  PORT: 3338
  CLIENT_PUBLIC_URL: http://127.0.0.1:8000
  NODE_ENV: development
  Pasta resources/ OK
  Arquivo DATA.INI OK
  GRF válido: data.grf (versão 0x200, sem DES)

================================================================================
✅ Validação concluída com sucesso!
================================================================================

🎉 Sistema configurado corretamente! Pode iniciar o servidor com: npm start
```

**Saída esperada (erro):**
```
❌ ERROS:
  Dependências não instaladas!
  CLIENT_PUBLIC_URL não definida!
  GRF incompatível: data.grf

📖 GUIA DE CORREÇÃO:

1️⃣  DEPENDÊNCIAS NÃO INSTALADAS:
   Execute: npm install

2️⃣  VARIÁVEIS DE AMBIENTE:
   Crie um arquivo .env na raiz do projeto:
   ...

💡 Depois de corrigir, execute novamente: npm run doctor
```

### Validação Automática no Startup

Ao executar `npm start`, a validação ocorre automaticamente:

```bash
npm start
```

**Se houver erros**, o servidor **não inicia** e mostra:

```
❌ Servidor não pode iniciar devido a erros de configuração.
💡 Execute "npm run doctor" para diagnóstico completo.
```

**Se tudo estiver OK**, o servidor inicia normalmente:

```
✅ Servidor iniciado com sucesso!
🌐 URL: http://localhost:3338
📊 Status: http://localhost:3338/api/health
```

## 🔌 API Endpoint de Status

### `GET /api/health`

Retorna o status de validação em formato JSON.

**Exemplo de resposta (sucesso):**
```json
{
  "timestamp": "2025-12-26T10:30:00.000Z",
  "status": "ok",
  "hasWarnings": true,
  "summary": {
    "errors": 0,
    "warnings": 2,
    "info": 8
  },
  "details": {
    "nodeVersion": {
      "node": "v18.12.0",
      "npm": "9.1.0",
      "valid": true
    },
    "dependencies": {
      "installed": true
    },
    "env": {
      "valid": true,
      "variables": {
        "PORT": { "defined": true, "value": "3338" },
        "CLIENT_PUBLIC_URL": { "defined": true, "value": "http://127.0.0.1:8000" },
        "NODE_ENV": { "defined": true, "value": "development" }
      }
    },
    "files": {
      "valid": true,
      "checks": [...]
    },
    "grfs": {
      "valid": true,
      "files": [
        {
          "file": "data.grf",
          "exists": true,
          "valid": true,
          "version": "0x200",
          "hasEncryption": false
        }
      ],
      "count": 1
    }
  },
  "messages": {
    "errors": [],
    "warnings": ["Pasta BGM/ vazia"],
    "info": ["Node.js: v18.12.0", "Dependências instaladas", ...]
  }
}
```

**Exemplo de resposta (erro):**
```json
{
  "timestamp": "2025-12-26T10:30:00.000Z",
  "status": "error",
  "hasWarnings": false,
  "summary": {
    "errors": 2,
    "warnings": 0,
    "info": 3
  },
  "messages": {
    "errors": [
      "CLIENT_PUBLIC_URL não definida!",
      "GRF não encontrado: data.grf"
    ],
    "warnings": [],
    "info": [...]
  }
}
```

## 🖥️ Visualização no Browser

Acesse `http://localhost:3338` para ver o status de validação na interface web.

A página mostra:

- ✅ **Status OK**: Card verde com checkmarks
- ⚠️ **Avisos**: Badge amarelo com número de avisos
- ❌ **Erros**: Card vermelho com lista de erros

O status é atualizado automaticamente a cada 30 segundos.

## 🛠️ Arquitetura do Sistema

### Arquivo Principal: `src/validators/startupValidator.js`

```javascript
class StartupValidator {
  constructor()

  // Validações individuais
  validateNodeVersion()
  validateDependencies()
  validateEnvironment()
  validateRequiredFiles()
  validateGrfs()

  // Validação completa
  async validateAll()

  // Resultados
  getResults()
  getStatusJSON()
  printReport()
}
```

### Fluxo de Validação

```
1. validateNodeVersion()
   ↓
2. validateDependencies()
   ↓ (se OK)
3. validateRequiredFiles()
   ↓ (paralelo)
4. validateEnvironment()
   ↓ (paralelo)
5. validateGrfs()
   ↓
6. getResults() / printReport()
```

### Integração com o Servidor

**index.js:**
```javascript
require('dotenv').config();

async function startServer() {
  const validator = new StartupValidator();
  const results = await validator.validateAll();

  if (!validator.printReport(results)) {
    process.exit(1); // Erro fatal
  }

  // Continuar inicialização...
}
```

**doctor.js:**
```javascript
require('dotenv').config();

async function runDoctor() {
  const validator = new StartupValidator();
  const results = await validator.validateAll();

  validator.printReport(results);

  if (!results.success) {
    // Mostrar guia de correção
    process.exit(1);
  }
}
```

## 📝 Tipos de Mensagens

### ✓ INFO (Informação)

Mostra informações sobre o sistema que estão corretas.

**Exemplos:**
- `Node.js: v18.12.0`
- `Dependências instaladas corretamente`
- `GRF válido: data.grf`

### ⚠️ WARNING (Aviso)

Indica problemas não-críticos que podem causar issues dependendo da configuração.

**Exemplos:**
- `PORT não definida, usando padrão: 3338`
- `Pasta BGM/ vazia`
- `DEBUG habilitado em produção`

### ❌ ERROR (Erro Fatal)

Problemas críticos que impedem o servidor de funcionar.

**Exemplos:**
- `Dependências não instaladas!`
- `CLIENT_PUBLIC_URL não definida!`
- `GRF incompatível: data.grf`

## 🔧 Troubleshooting

### Erro: "Dependências não instaladas"

**Solução:**
```bash
npm install
```

### Erro: "CLIENT_PUBLIC_URL não definida"

**Solução:**
1. Crie arquivo `.env`:
```bash
cp .env.example .env
```

2. Edite `.env` e configure:
```env
CLIENT_PUBLIC_URL=http://seu-dominio.com
```

### Erro: "GRF incompatível"

**Solução:**
1. Baixe [GRF Builder](https://github.com/Tokeiburu/GRFEditor)
2. Abra o GRF Builder
3. File → Options → Repack type → **Decrypt**
4. Tools → **Repack**
5. Substitua o arquivo original

### Aviso: "Pasta BGM/ vazia"

**Solução (opcional):**
Copie a pasta `BGM/` do seu cliente Ragnarok para a raiz do projeto.

## 📚 Referências

- **Código fonte**: `src/validators/startupValidator.js`
- **Comando doctor**: `doctor.js`
- **Integração startup**: `index.js`
- **Interface web**: `index.html`
- **Documentação**: `README.md`
