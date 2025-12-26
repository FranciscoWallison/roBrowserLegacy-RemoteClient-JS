Aqui está o arquivo inteiro em **português**. 

---

# roBrowser Legacy Remote Client (Node.js)

Cliente remoto que permite jogar Ragnarok Online baixando recursos de um servidor externo, sem precisar ter o FullClient instalado localmente.

## Recursos

* Suporte a arquivos de múltiplos domínios (Cross-Origin Resource Sharing — CORS)
* Extração automática de arquivos GRF (versão 0x200 — sem criptografia DES)
* Conversão automática de BMP para PNG para otimizar transferências
* Sistema de cache para evitar processamento redundante
* API REST para servir os arquivos do client

---

## Estrutura de diretórios

```text
roBrowserLegacy-RemoteClient-JS/
│
├── index.js                    # Arquivo principal do servidor Express
├── index.html                  # Página inicial servida na raiz do servidor
├── package.json                # Dependências e scripts do projeto
├── README.md                   # Documentação do projeto
│
├── src/                        # Código-fonte da aplicação
│   ├── config/                 # Arquivos de configuração
│   │   └── configs.js          # Configurações do client e do servidor
│   │
│   ├── controllers/            # Lógica dos controllers
│   │   ├── clientController.js # Gerencia operações de arquivos do client
│   │   └── grfController.js    # Gerencia extração de GRF
│   │
│   ├── middlewares/            # Middlewares do Express
│   │   └── debugMiddleware.js  # Middleware de log de debug
│   │
│   ├── routes/                 # Definições de rotas da API
│   │   └── index.js            # Rotas principais (GET, POST /search, /list-files)
│   │
│   └── utils/                  # Utilitários
│       └── bmpUtils.js         # Conversão BMP para PNG
│
├── resources/                  #  ARQUIVOS DO CLIENT RAGNAROK
│   ├── DATA.INI                # Arquivo de configuração do client (obrigatório)
│   └── *.grf                   # GRFs do client (data.grf, rdata.grf, etc.)
│
├── BGM/                        #  Músicas de fundo do jogo
│   └── *.mp3, *.wav            # Arquivos de áudio
│
├── data/                       #  Arquivos de dados do client
│   ├── sprite/                 # Sprites do jogo
│   ├── texture/                # Texturas
│   ├── wav/                    # Efeitos sonoros
│   └── ...                     # Outros assets
│
├── System/                     #  Arquivos de sistema do client
│   └── *                       # Arquivos de configuração e sistema
│
└── AI/                         #  Scripts de IA para homúnculos/mercenários
    └── USER_AI/                # Scripts de IA customizados
        └── *                   # Arquivos Lua de IA
```

---

## 📂 Descrição detalhada dos arquivos

### Arquivos na raiz

| Arquivo                 | Descrição                                                           | Obrigatório      |
| ----------------------- | ------------------------------------------------------------------- | ---------------- |
| `index.js`              | Servidor Express principal. Define porta, CORS, middlewares e rotas | Sim              |
| `index.html`            | Página HTML servida ao acessar a raiz do servidor (`/`)             | Sim              |
| `package.json`          | Dependências do Node.js e scripts npm                               | Sim              |
| `test-grf.js`           | Script de teste para extração de GRF                                | Não (desenvolv.) |
| `test-ini-normalize.js` | Script de teste para normalização de INI                            | Não (desenvolv.) |

### src/config/

| Arquivo      | Conteúdo                | Configurações                                                                                                                                                                                                   |
| ------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `configs.js` | Configuração do sistema | `DEBUG`: habilita logs de debug<br>`CLIENT_RESPATH`: caminho para resources/<br>`CLIENT_DATAINI`: nome do DATA.INI<br>`CLIENT_AUTOEXTRACT`: extração automática de GRF<br>`CLIENT_ENABLESEARCH`: habilita busca |

### src/controllers/

| Arquivo               | Responsabilidade                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `clientController.js` | - Inicialização do client<br>- Leitura do DATA.INI<br>- Busca de arquivos<br>- Servir arquivos do client<br>- Conversão BMP→PNG |
| `grfController.js`    | - Carregar GRFs<br>- Extrair assets dos GRFs<br>- Cache dos arquivos extraídos                                                  |

### src/routes/

| Arquivo    | Rotas definidas                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `index.js` | `GET /` - Serve index.html<br>`GET /*` - Serve qualquer arquivo do client<br>`POST /search` - Busca arquivos por regex<br>`GET /list-files` - Lista arquivos |

### src/middlewares/

| Arquivo              | Finalidade                              |
| -------------------- | --------------------------------------- |
| `debugMiddleware.js` | Loga requisições HTTP quando DEBUG=true |

### src/utils/

| Arquivo       | Finalidade                                  |
| ------------- | ------------------------------------------- |
| `bmpUtils.js` | Converte automaticamente imagens BMP p/ PNG |

---

## Instalação e configuração

### 1. Instalar dependências

```bash
npm install
```

### 2. Rodar validação (recomendado)

Antes de iniciar o servidor, rode a ferramenta de diagnóstico para validar o setup:

```bash
npm run doctor
```

Ela verifica:

* ✓ Versões do Node.js e npm
* ✓ Dependências instaladas corretamente
* ✓ Variáveis de ambiente configuradas
* ✓ Arquivos e pastas obrigatórios existem
* ✓ Compatibilidade dos GRFs (versão 0x200, sem DES)

Se encontrar erros, a ferramenta vai dizer exatamente como corrigir.

### 3. Adicionar arquivos do client do Ragnarok

#### Diretório `resources/`

Coloque seus GRFs aqui:

```text
resources/
├── DATA.INI          # OBRIGATÓRIO - configuração do client
├── data.grf          # GRF principal
├── rdata.grf         # GRF adicional
└── *.grf             # Outros GRFs necessários
```

**⚠️ CRÍTICO — Compatibilidade de GRF:**

Este projeto **SÓ** funciona com GRF versão **0x200** **sem** criptografia DES.

Para garantir compatibilidade, repack seus GRFs usando **GRF Builder** (GRFEditor no GitHub: *Tokeiburu/GRFEditor*):

1. Baixe o GRF Builder/Editor
2. Abra seu `.grf` no GRF Builder
3. Vá em: **File → Options → Repack type → Decrypt**
4. Clique em: **Tools → Repack**
5. Aguarde terminar e substitua o arquivo original

Isso garante o formato correto (0x200 / sem DES).

O comando `npm run doctor` valida seus GRFs e avisa se estiverem incompatíveis.

#### Diretório `BGM/`

Substitua pelo BGM do seu client:

```text
BGM/
├── 01.mp3
├── 02.mp3
└── ...
```

#### Diretório `data/`

Substitua pela pasta `data` do seu client:

```text
data/
├── sprite/
├── texture/
├── wav/
└── ...
```

#### Diretório `System/`

Substitua pela pasta `System` do seu client:

```text
System/
├── itemInfo.lua
├── skillInfo.lua
└── ...
```

#### Diretório `AI/` (opcional)

Adicione scripts de IA customizados:

```text
AI/
└── USER_AI/
    ├── AI.lua
    └── ...
```

### 4. Configurar o servidor

#### Editar `src/config/configs.js`

```javascript
module.exports = {
	DEBUG: true,                      // true = habilita logs, false = desabilita
	CLIENT_RESPATH: "resources/",     // Caminho para recursos do client
	CLIENT_DATAINI: "DATA.INI",       // Nome do arquivo DATA.INI
	CLIENT_AUTOEXTRACT: true,         // true = extrai GRF automaticamente
	CLIENT_ENABLESEARCH: true,        // true = habilita rota POST /search
};
```

#### Editar `index.js` — Configurar CORS

```javascript
const CLIENT_PUBLIC_URL = process.env.CLIENT_PUBLIC_URL || 'http://localhost:8000'; // 'https://your-domain.com';

const corsOptions = {
  origin: [CLIENT_PUBLIC_URL, 'http://localhost:3338'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  credentials: true,
};
```

Substitua `https://your-domain.com` pelo domínio onde o roBrowser está rodando.

### 5. Variáveis de ambiente (obrigatório)

Crie um arquivo `.env` na raiz do projeto:

```env
PORT=3338
CLIENT_PUBLIC_URL=http://127.0.0.1:8000
NODE_ENV=development
```

**Importante**: `CLIENT_PUBLIC_URL` é **obrigatório**. O servidor não inicia sem isso.

---

## 🚀 Rodar o servidor

### Validação na inicialização

O servidor valida seu setup automaticamente antes de iniciar. Se houver erro crítico, ele não sobe e mostra mensagens detalhadas.

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
  npm: 9.1.0
  Dependências instaladas corretamente
  PORT: 3338
  CLIENT_PUBLIC_URL: http://127.0.0.1:8000
  NODE_ENV: development
  Pasta resources/ OK
  Arquivo DATA.INI OK
  GRF válido: data.grf (versão 0x200, sem DES)

⚠️  AVISOS:
  Pasta BGM/ está vazia - pode causar problemas dependendo do client

================================================================================
✅ Validação concluída com sucesso!
⚠️  1 aviso(s) encontrado(s)
================================================================================

✅ Servidor iniciado com sucesso!
🌐 URL: http://localhost:3338
📊 Status: http://localhost:3338/api/health
```

### Validação manual

Rode o diagnóstico a qualquer momento:

```bash
npm run doctor
```

Acesse o servidor: `http://localhost:3338`

Status da validação: `http://localhost:3338/api/health`

---

## 🔌 Endpoints da API

| Método | Rota          | Descrição                           | Parâmetros                |
| ------ | ------------- | ----------------------------------- | ------------------------- |
| GET    | `/`           | Retorna `index.html`                | -                         |
| GET    | `/api/health` | Status da validação (JSON)          | -                         |
| GET    | `/*`          | Serve qualquer arquivo do client    | Caminho do arquivo na URL |
| POST   | `/search`     | Busca arquivos por regex            | `{ "filter": "regex" }`   |
| GET    | `/list-files` | Lista todos os arquivos disponíveis | -                         |

### Exemplos de uso

**Checar saúde do sistema:**

```bash
curl http://localhost:3338/api/health
```

**Buscar arquivos:**

```bash
curl -X POST http://localhost:3338/search \
  -H "Content-Type: application/json" \
  -d '{"filter": "sprite.*\\.spr"}'
```

**Listar arquivos:**

```bash
curl http://localhost:3338/list-files
```

**Baixar um arquivo:**

```bash
curl http://localhost:3338/data/sprite/player.spr
```

---

## ⚠️ Observações importantes

1. **Validação na inicialização**: o servidor valida tudo antes de subir. Se falhar, ele não inicia.
2. **Versão do GRF**: apenas GRF 0x200 sem DES é suportado. Use GRF Builder para repack de arquivos incompatíveis.
3. **Variáveis de ambiente**: `CLIENT_PUBLIC_URL` é **obrigatório**. Sem isso, não inicia.
4. **DATA.INI**: obrigatório dentro de `resources/`. Deve listar ao menos um `.grf`.
5. **Dependências**: rode `npm install` antes de iniciar. O servidor checa dependências faltando.
6. **Cache**: arquivos extraídos são cacheados para melhor performance.
7. **CORS**: configure `CLIENT_PUBLIC_URL` corretamente para evitar erro de CORS.
8. **Gitignore**: `BGM/`, `data/`, `resources/`, `System/` e `AI/` ficam no `.gitignore` para não versionar arquivos do client.

## 🩺 Solução de problemas

Se der erro:

1. Rode: `npm run doctor`
2. Confira os logs: o relatório aponta exatamente o problema
3. Problemas comuns:

   * **Dependências não instaladas**: rode `npm install`
   * **CLIENT_PUBLIC_URL não definido**: crie `.env` com `CLIENT_PUBLIC_URL=http://seu-url`
   * **GRF incompatível**: repack com GRF Builder (ver seção de compatibilidade)
   * **DATA.INI faltando**: crie `resources/DATA.INI` com sua lista de GRFs
   * **resources/ vazio**: coloque pelo menos um `.grf` em `resources/`

A validação na inicialização e o `npm run doctor` vão te guiar para corrigir.

---

## Desenvolvimento

### Scripts de teste

* `test-grf.js` - Testa extração de GRF
* `test-ini-normalize.js` - Testa normalização de INI

### Estrutura do código

* **Padrão MVC**: Controllers lidam com a lógica; Routes definem endpoints
* **Middleware**: Debug e CORS configuráveis
* **Utils**: Funções utilitárias para conversão de arquivos

---

## Licença

GNU GPL V3

## Autor

Vincent Thibault
Francisco Wallison
