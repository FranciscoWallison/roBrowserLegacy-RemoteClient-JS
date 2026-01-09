# roBrowser Legacy Remote Client (Node.js)

Cliente remoto que permite jogar Ragnarok Online baixando recursos de um servidor externo, sem precisar ter o FullClient instalado localmente.

## Recursos

* Suporte a arquivos de múltiplos domínios (Cross-Origin Resource Sharing — CORS)
* Extração automática de arquivos GRF (versão 0x200 — sem criptografia DES)
* **Cache LRU de arquivos** para acesso rápido a arquivos repetidos
* **Indexação de arquivos GRF** para buscas O(1)
* **Headers de cache HTTP** (ETag, Cache-Control) para cache do navegador
* **Compressão Gzip/Deflate** para respostas baseadas em texto
* **Suporte a encoding de nomes coreanos** (CP949/EUC-KR) com detecção/correção de mojibake
* **Sistema de mapeamento de paths** para conversão de encoding (path coreano → path GRF)
* **Log de arquivos ausentes** com notificações
* API REST para servir arquivos do client

---

## Estrutura de Diretórios

```text
roBrowserLegacy-RemoteClient-JS/
│
├── index.js                    # Arquivo principal do servidor Express
├── index.html                  # Página inicial servida na raiz
├── doctor.js                   # Ferramenta de diagnóstico
├── prepare.js                  # Script de otimização pré-inicialização
├── package.json                # Dependências e scripts do projeto
├── path-mapping.json           # Mapeamentos de conversão de encoding gerados
│
├── src/                        # Código-fonte da aplicação
│   ├── config/                 # Arquivos de configuração
│   │   └── configs.js          # Configurações do client e servidor
│   │
│   ├── controllers/            # Lógica dos controllers
│   │   ├── clientController.js # Operações de arquivo, cache, indexação
│   │   └── grfController.js    # Extração GRF usando @chicowall/grf-loader
│   │
│   ├── middlewares/            # Middlewares do Express
│   │   └── debugMiddleware.js  # Middleware de log de debug
│   │
│   ├── routes/                 # Definições de rotas da API
│   │   └── index.js            # Rotas com headers de cache HTTP
│   │
│   ├── utils/                  # Utilitários
│   │   ├── bmpUtils.js         # Conversão BMP para PNG
│   │   └── LRUCache.js         # Implementação do cache LRU
│   │
│   └── validators/             # Sistema de validação
│       └── startupValidator.js # Validação de inicialização e encoding
│
├── tools/                      # Ferramentas CLI para validação e conversão
│   ├── validate-grf.mjs        # Validação de GRF único
│   ├── validate-all-grfs.mjs   # Validação em lote de GRFs
│   ├── validate-grf-iconv.mjs  # Validação de encoding com iconv-lite
│   ├── convert-encoding.mjs    # Gerar path-mapping.json
│   └── test-mojibake.mjs       # Testar detecção de mojibake
│
├── logs/                       # Arquivos de log
│   └── missing-files.log       # Log de arquivos ausentes
│
├── resources/                  # ARQUIVOS DO CLIENT RAGNAROK
│   ├── DATA.INI                # Arquivo de configuração do client (obrigatório)
│   └── *.grf                   # Arquivos GRF do client
│
├── BGM/                        # Músicas de fundo do jogo
├── data/                       # Arquivos de dados do client
├── System/                     # Arquivos de sistema do client
└── AI/                         # Scripts de IA para homúnculos/mercenários
```

---

## Recursos de Performance

### Cache LRU de Arquivos

O servidor implementa um cache LRU (Least Recently Used) em memória para conteúdo de arquivos:

- **Padrão**: 100 arquivos, 256MB de memória máxima
- Operações get/set **O(1)**
- Remoção automática de arquivos menos usados recentemente
- Configurável via variáveis de ambiente

```env
CACHE_MAX_FILES=100
CACHE_MAX_MEMORY_MB=256
```

### Índice de Arquivos GRF

Na inicialização, o servidor constrói um índice unificado de todos os arquivos GRF:

- **Buscas O(1)** em vez de iteração sequencial nos GRFs
- Paths normalizados (case-insensitive, direção das barras)
- Integra mapeamento de paths para resolução Coreano → mojibake
- Estatísticas do índice disponíveis via `/api/cache-stats`

### Headers de Cache HTTP

Assets estáticos do jogo recebem headers de cache apropriados:

- **ETag** para validação de conteúdo
- **Cache-Control**: `max-age=86400, immutable` para assets do jogo
- Respostas **304 Not Modified** para requisições condicionais
- Reduz banda e acelera requisições repetidas

### Compressão de Respostas

- Compressão Gzip/Deflate para respostas baseadas em texto
- Só comprime respostas > 1KB
- Detecção automática de content-type

---

## Suporte a Encoding de Nomes Coreanos

Muitos arquivos GRF do Ragnarok contêm nomes de arquivos em coreano codificados em CP949/EUC-KR. Quando lidos em sistemas não-coreanos, aparecem como mojibake (caracteres embaralhados).

### O Problema

Cliente solicita: `/data/texture/유저인터페이스/t_배경3-3.tga`
GRF contém: `/data/texture/À¯ÀúÀÎÅÍÆäÀÌ½º/t_¹è°æ3-3.tga`

### A Solução

O servidor fornece ferramentas para:

1. **Detectar** problemas de encoding nos arquivos GRF
2. **Gerar** mapeamentos de path (Coreano → path GRF)
3. **Resolver automaticamente** requisições usando mapeamento de paths

### Uso

```bash
# Validação profunda de encoding
npm run doctor:deep

# Gerar path-mapping.json
npm run convert:encoding

# O servidor usa automaticamente path-mapping.json para buscas
npm start
```

---

## Instalação e Configuração

### 1. Instalar Dependências

```bash
npm install
```

### 2. Preparar para Inicialização Otimizada (Recomendado)

Execute o comando prepare para otimizar tudo antes de iniciar:

```bash
# Preparação completa (valida config, gera mapeamento de paths, constrói índice)
npm run prepare

# Preparação rápida (pula validação profunda de encoding)
npm run prepare:quick
```

Isso vai:
- Validar arquivos de configuração
- Gerar `path-mapping.json` para conversão de encoding
- Construir índice de arquivos para buscas rápidas
- Validar encoding (apenas modo completo)
- Criar diretório de logs

### 3. Executar Validação

```bash
npm run doctor        # Validação básica
npm run doctor:deep   # Validação profunda incluindo verificação de encoding
```

### 4. Adicionar Arquivos do Client Ragnarok

#### Diretório `resources/`

```text
resources/
├── DATA.INI          # OBRIGATÓRIO - arquivo de configuração do client
├── data.grf          # Arquivo GRF principal
├── rdata.grf         # Arquivo GRF adicional
└── *.grf             # Outros arquivos GRF necessários
```

**Compatibilidade de GRF:**

Este projeto **SÓ** funciona com GRF versão **0x200** sem criptografia DES.

Para garantir compatibilidade, repack seus GRFs usando **GRF Builder**:

1. Baixe [GRF Builder/Editor](https://github.com/Tokeiburu/GRFEditor)
2. Abra seu arquivo .grf no GRF Builder
3. Vá em: **File → Options → Repack type → Decrypt**
4. Clique: **Tools → Repack**
5. Aguarde completar e substitua o arquivo original

### 5. Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
PORT=3338
CLIENT_PUBLIC_URL=http://127.0.0.1:8000
NODE_ENV=development

# Configuração de cache (opcional)
CACHE_MAX_FILES=100
CACHE_MAX_MEMORY_MB=256
```

---

## Scripts NPM

| Script | Descrição |
|--------|-----------|
| `npm start` | Iniciar o servidor |
| `npm run prepare` | Otimização completa pré-inicialização |
| `npm run prepare:quick` | Pré-inicialização rápida (pula validação profunda) |
| `npm run doctor` | Executar validação de diagnóstico |
| `npm run doctor:deep` | Validação profunda com verificação de encoding |
| `npm run convert:encoding` | Gerar path-mapping.json |
| `npm run validate:grf` | Validar um único arquivo GRF |
| `npm run validate:all` | Validar todos os GRFs em resources/ |
| `npm run validate:encoding` | Validar encoding com iconv-lite |
| `npm run test:mojibake` | Testar detecção de mojibake |

---

## Executar o Servidor

```bash
npm start
```

Exemplo de saída:

```text
🚀 Iniciando roBrowser Remote Client...

🔍 Validando configuração de inicialização...

================================================================================
📋 RELATÓRIO DE VALIDAÇÃO
================================================================================

✓ INFORMAÇÕES:
  Node.js: v18.12.0
  Dependências instaladas corretamente
  PORT: 3338
  GRF válido: data.grf (versão 0x200, sem DES)

================================================================================
✅ Validação concluída com sucesso!
================================================================================

Client inicializado em 1250ms (450.000 arquivos indexados)
Índice de arquivos construído em 320ms

✅ Servidor iniciado com sucesso!
🌐 URL: http://localhost:3338
📊 Status: http://localhost:3338/api/health
```

---

## Endpoints da API

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/` | Retorna `index.html` |
| GET | `/api/health` | Status completo do sistema (validação, cache, índice, arquivos ausentes) |
| GET | `/api/cache-stats` | Estatísticas de cache e índice |
| GET | `/api/missing-files` | Lista de arquivos não encontrados |
| GET | `/*` | Serve qualquer arquivo do client (com cache) |
| POST | `/search` | Busca arquivos por regex |
| GET | `/list-files` | Lista todos os arquivos disponíveis |

### Exemplos de Uso

**Verificar saúde do sistema:**

```bash
curl http://localhost:3338/api/health
```

A resposta inclui:
- Status de validação
- Estatísticas de cache (hits, misses, hit rate, uso de memória)
- Estatísticas do índice (total de arquivos, quantidade de GRFs)
- Resumo de arquivos ausentes

**Verificar performance do cache:**

```bash
curl http://localhost:3338/api/cache-stats
```

```json
{
  "cache": {
    "size": 45,
    "maxSize": 100,
    "memoryUsedMB": "128.50",
    "maxMemoryMB": "256",
    "hits": 1250,
    "misses": 45,
    "hitRate": "96.52%"
  },
  "index": {
    "totalFiles": 450000,
    "grfCount": 3,
    "indexBuilt": true
  }
}
```

**Verificar arquivos ausentes:**

```bash
curl http://localhost:3338/api/missing-files
```

**Buscar arquivos:**

```bash
curl -X POST http://localhost:3338/search \
  -H "Content-Type: application/json" \
  -d '{"filter": "sprite.*\\.spr"}'
```

---

## Solução de Problemas

### Problemas de Encoding

Se arquivos não são encontrados devido a problemas de encoding:

1. Execute validação profunda: `npm run doctor:deep`
2. Gere mapeamento de paths: `npm run convert:encoding`
3. Reinicie o servidor

### Arquivos Ausentes

O servidor registra arquivos ausentes em `logs/missing-files.log`. Verifique:

- Endpoint `/api/missing-files` para arquivos ausentes recentes
- Saída do console para alertas de arquivos ausentes (dispara após 10+ arquivos ausentes)

### Problemas de Performance

1. Verifique hit rate do cache: `/api/cache-stats`
2. Aumente tamanho do cache via variáveis de ambiente
3. Execute `npm run prepare` para pré-construir índices

### Problemas Comuns

| Problema | Solução |
|----------|---------|
| Dependências não instaladas | Execute `npm install` |
| CLIENT_PUBLIC_URL não definido | Crie arquivo `.env` |
| GRF incompatível | Repack com GRF Builder |
| DATA.INI ausente | Crie `resources/DATA.INI` |
| Problemas de encoding | Execute `npm run convert:encoding` |
| Acesso lento a arquivos | Execute `npm run prepare`, verifique stats do cache |

---

## Desenvolvimento

### Estrutura do Código

- **Padrão MVC**: Controllers tratam lógica, Routes definem endpoints
- **Cache LRU**: Cache de arquivos O(1) com limites de memória
- **Índice de Arquivos**: Buscas O(1) em arquivos GRF
- **Mapeamento de Paths**: Resolução Coreano → mojibake
- **Cache HTTP**: Headers ETag, Cache-Control

### Arquivos Principais

| Arquivo | Propósito |
|---------|-----------|
| `src/utils/LRUCache.js` | Implementação do cache LRU |
| `src/controllers/clientController.js` | Serviço de arquivos, cache, indexação |
| `src/validators/startupValidator.js` | Validação e verificação de encoding |
| `tools/convert-encoding.mjs` | Geração de mapeamento de paths |

---

## Licença

GNU GPL V3

## Autores

- Vincent Thibault
- Francisco Wallison
