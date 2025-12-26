# roBrowser Legacy Remote Client (Node.js)

Cliente remoto que permite aos usuários jogar Ragnarok Online baixando recursos de um servidor externo, sem necessidade de ter o FullClient instalado localmente.

## 📋 Funcionalidades

- Suporte para arquivos de múltiplos domínios (Cross-origin resource sharing)
- Extração automática de arquivos GRF (versão 0x200 - sem criptografia DES)
- Conversão automática de BMP para PNG para otimizar transferências
- Sistema de cache para evitar processamento redundante
- API REST para servir arquivos do cliente

---

## 📁 Estrutura de Diretórios

```
roBrowserLegacy-RemoteClient-JS/
│
├── index.js                    # Arquivo principal do servidor Express
├── index.html                  # Página inicial servida na raiz do servidor
├── package.json                # Dependências e scripts do projeto
├── README.md                   # Documentação do projeto
│
├── src/                        # Código fonte da aplicação
│   ├── config/                 # Arquivos de configuração
│   │   └── configs.js          # Configurações do cliente e servidor
│   │
│   ├── controllers/            # Lógica de controle
│   │   ├── clientController.js # Gerencia operações com arquivos do cliente
│   │   └── grfController.js    # Gerencia extração de arquivos GRF
│   │
│   ├── middlewares/            # Middlewares Express
│   │   └── debugMiddleware.js  # Middleware para logs de debug
│   │
│   ├── routes/                 # Definição de rotas da API
│   │   └── index.js            # Rotas principais (GET, POST /search, /list-files)
│   │
│   └── utils/                  # Utilitários
│       └── bmpUtils.js         # Conversão de BMP para PNG
│
├── resources/                  # ⚠️ ARQUIVOS DO CLIENTE RAGNAROK
│   ├── DATA.INI                # Arquivo de configuração do cliente (obrigatório)
│   └── *.grf                   # Arquivos GRF do cliente (data.grf, rdata.grf, etc)
│
├── BGM/                        # 🎵 Músicas de fundo do jogo
│   └── *.mp3, *.wav            # Arquivos de áudio
│
├── data/                       # 📦 Arquivos de dados do cliente
│   ├── sprite/                 # Sprites do jogo
│   ├── texture/                # Texturas
│   ├── wav/                    # Efeitos sonoros
│   └── ...                     # Outros recursos
│
├── System/                     # ⚙️ Arquivos de sistema do cliente
│   └── *                       # Arquivos de configuração e sistema
│
└── AI/                         # 🤖 Scripts de AI para homunculus/mercenários
    └── USER_AI/                # Scripts customizados de AI
        └── *                   # Arquivos Lua de AI

```

---

## 📂 Descrição Detalhada dos Arquivos

### Arquivos Raiz

| Arquivo | Descrição | Obrigatório |
|---------|-----------|-------------|
| `index.js` | Servidor Express principal. Define porta, CORS, middlewares e rotas | ✅ Sim |
| `index.html` | Página HTML servida quando acessar a raiz (`/`) do servidor | ✅ Sim |
| `package.json` | Dependências do Node.js e scripts npm | ✅ Sim |
| `test-grf.js` | Script de teste para extração de GRF | ❌ Não (desenvolvimento) |
| `test-ini-normalize.js` | Script de teste para normalização de arquivos INI | ❌ Não (desenvolvimento) |

### src/config/

| Arquivo | Conteúdo | Configurações |
|---------|----------|---------------|
| `configs.js` | Configurações do sistema | `DEBUG`: ativa logs de debug<br>`CLIENT_RESPATH`: caminho para resources/<br>`CLIENT_DATAINI`: nome do arquivo DATA.INI<br>`CLIENT_AUTOEXTRACT`: extração automática de GRF<br>`CLIENT_ENABLESEARCH`: habilita busca de arquivos |

### src/controllers/

| Arquivo | Responsabilidade |
|---------|------------------|
| `clientController.js` | - Inicialização do cliente<br>- Leitura de DATA.INI<br>- Busca de arquivos<br>- Servir arquivos do cliente<br>- Conversão BMP→PNG |
| `grfController.js` | - Carregamento de arquivos GRF<br>- Extração de recursos dos GRFs<br>- Cache de arquivos extraídos |

### src/routes/

| Arquivo | Rotas Definidas |
|---------|-----------------|
| `index.js` | `GET /` - Serve index.html<br>`GET /*` - Serve qualquer arquivo do cliente<br>`POST /search` - Busca arquivos por regex<br>`GET /list-files` - Lista todos os arquivos disponíveis |

### src/middlewares/

| Arquivo | Função |
|---------|--------|
| `debugMiddleware.js` | Registra logs de requisições HTTP quando DEBUG=true |

### src/utils/

| Arquivo | Função |
|---------|--------|
| `bmpUtils.js` | Converte imagens BMP para PNG automaticamente |

---

## 🚀 Instalação e Configuração

### 1. Instalar Dependências

```bash
npm install
```

### 2. Adicionar Arquivos do Cliente Ragnarok

#### 📦 Diretório `resources/`

Coloque aqui os arquivos GRF do seu cliente:

```
resources/
├── DATA.INI          # OBRIGATÓRIO - arquivo de configuração do cliente
├── data.grf          # Arquivo GRF principal
├── rdata.grf         # Arquivo GRF adicional
└── *.grf             # Outros arquivos GRF necessários
```

**⚠️ IMPORTANTE:** Para garantir compatibilidade, use o **GRF Builder** para reempacotar seus GRFs:
1. Abra o GRF Builder
2. File → Option → Repack type → **Decrypt**
3. Repack

Isso garante que os GRFs estejam na versão 0x200 sem criptografia DES.

#### 🎵 Diretório `BGM/`

Substitua o conteúdo pelo diretório BGM do seu cliente:

```
BGM/
├── 01.mp3
├── 02.mp3
└── ...
```

#### 📦 Diretório `data/`

Substitua o conteúdo pelo diretório data do seu cliente:

```
data/
├── sprite/
├── texture/
├── wav/
└── ...
```

#### ⚙️ Diretório `System/`

Substitua o conteúdo pelo diretório System do seu cliente:

```
System/
├── itemInfo.lua
├── skillInfo.lua
└── ...
```

#### 🤖 Diretório `AI/` (Opcional)

Adicione scripts customizados de AI:

```
AI/
└── USER_AI/
    ├── AI.lua
    └── ...
```

### 3. Configurar o Servidor

#### Editar `src/config/configs.js`

```javascript
module.exports = {
	DEBUG: true,                      // true = ativa logs, false = desativa
	CLIENT_RESPATH: "resources/",     // Caminho para os recursos do cliente
	CLIENT_DATAINI: "DATA.INI",       // Nome do arquivo DATA.INI
	CLIENT_AUTOEXTRACT: true,         // true = extrai GRF automaticamente
	CLIENT_ENABLESEARCH: true,        // true = habilita rota POST /search
};
```

#### Editar `index.js` - Configurar CORS

```javascript
const CLIENT_PUBLIC_URL = process.env.CLIENT_PUBLIC_URL || 'https://seu-dominio.com';

const corsOptions = {
  origin: [CLIENT_PUBLIC_URL, 'http://localhost:3338'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  credentials: true,
};
```

Substitua `https://seu-dominio.com` pelo domínio onde o roBrowser está rodando.

### 4. Configurar Variáveis de Ambiente (Opcional)

Crie um arquivo `.env` na raiz do projeto:

```env
PORT=3338
CLIENT_PUBLIC_URL=https://seu-dominio.com
```

---

## Executar o Servidor

```bash
npm run start
```

O servidor iniciará na porta **3338** (ou na porta definida em `PORT`).

Acesse: `http://localhost:3338`

---

## 🔌 API Endpoints

| Método | Rota | Descrição | Parâmetros |
|--------|------|-----------|------------|
| GET | `/` | Retorna o arquivo `index.html` | - |
| GET | `/*` | Serve qualquer arquivo do cliente | Caminho do arquivo na URL |
| POST | `/search` | Busca arquivos por regex | `{ "filter": "regex" }` |
| GET | `/list-files` | Lista todos os arquivos disponíveis | - |

### Exemplos de Uso

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

**Baixar arquivo:**
```bash
curl http://localhost:3338/data/sprite/player.spr
```

---

## Notas Importantes

1. **GRF Version**: Apenas GRF versão 0x200 sem criptografia DES é suportado
2. **DATA.INI**: Obrigatório no diretório `resources/`
3. **Cache**: Arquivos extraídos são cacheados para melhor performance
4. **CORS**: Configure corretamente o `CLIENT_PUBLIC_URL` para evitar erros de CORS
5. **Gitignore**: Os diretórios `BGM/`, `data/`, `resources/`, `System/` e `AI/` estão no `.gitignore` para não versionar arquivos do cliente

---

## 🛠️ Desenvolvimento

### Scripts de Teste

- `test-grf.js` - Testa extração de arquivos GRF
- `test-ini-normalize.js` - Testa normalização de arquivos INI

### Estrutura do Código

- **MVC Pattern**: Controllers gerenciam lógica, Routes definem endpoints
- **Middleware**: Debug e CORS configuráveis
- **Utils**: Funções utilitárias para conversão de arquivos

---

## 📄 Licença

GNU GPL V3

## 👤 Autor

Vincent Thibault

Francisco Wallison