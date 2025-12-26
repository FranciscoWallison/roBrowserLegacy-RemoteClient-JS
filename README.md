# roBrowser Legacy Remote Client (Node.js)

Remote client that lets users play Ragnarok Online by downloading resources from an external server, without needing the FullClient installed locally.

## 📋 Features

* Support for files from multiple domains (Cross-Origin Resource Sharing — CORS)
* Automatic extraction of GRF files (version 0x200 — without DES encryption)
* Automatic BMP to PNG conversion to optimize transfers
* Cache system to avoid redundant processing
* REST API to serve client files

---

## Directory Structure

```
roBrowserLegacy-RemoteClient-JS/
│
├── index.js                    # Main Express server file
├── index.html                  # Home page served at the server root
├── package.json                # Project dependencies and scripts
├── README.md                   # Project documentation
│
├── src/                        # Application source code
│   ├── config/                 # Configuration files
│   │   └── configs.js          # Client and server settings
│   │
│   ├── controllers/            # Controller logic
│   │   ├── clientController.js # Manages client file operations
│   │   └── grfController.js    # Manages GRF extraction
│   │
│   ├── middlewares/            # Express middlewares
│   │   └── debugMiddleware.js  # Debug logging middleware
│   │
│   ├── routes/                 # API route definitions
│   │   └── index.js            # Main routes (GET, POST /search, /list-files)
│   │
│   └── utils/                  # Utilities
│       └── bmpUtils.js         # BMP to PNG conversion
│
├── resources/                  #  RAGNAROK CLIENT FILES
│   ├── DATA.INI                # Client configuration file (required)
│   └── *.grf                   # Client GRF files (data.grf, rdata.grf, etc.)
│
├── BGM/                        #  Game background music
│   └── *.mp3, *.wav            # Audio files
│
├── data/                       #  Client data files
│   ├── sprite/                 # Game sprites
│   ├── texture/                # Textures
│   ├── wav/                    # Sound effects
│   └── ...                     # Other assets
│
├── System/                     #  Client system files
│   └── *                       # Config and system files
│
└── AI/                         #  AI scripts for homunculus/mercenaries
    └── USER_AI/                # Custom AI scripts
        └── *                   # Lua AI files
```

---

## 📂 Detailed File Description

### Root Files

| File                    | Description                                                     | Required           |
| ----------------------- | --------------------------------------------------------------- | ------------------ |
| `index.js`              | Main Express server. Defines port, CORS, middlewares and routes | Yes              |
| `index.html`            | HTML page served when accessing the server root (`/`)           | Yes              |
| `package.json`          | Node.js dependencies and npm scripts                            | Yes              |
| `test-grf.js`           | Test script for GRF extraction                                  | No (development) |
| `test-ini-normalize.js` | Test script for INI normalization                               | No (development) |

### src/config/

| File         | Content              | Settings                                                                                                                                                                                              |
| ------------ | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `configs.js` | System configuration | `DEBUG`: enables debug logs<br>`CLIENT_RESPATH`: path to resources/<br>`CLIENT_DATAINI`: DATA.INI filename<br>`CLIENT_AUTOEXTRACT`: auto GRF extraction<br>`CLIENT_ENABLESEARCH`: enables file search |

### src/controllers/

| File                  | Responsibility                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `clientController.js` | - Client initialization<br>- Reading DATA.INI<br>- File search<br>- Serving client files<br>- BMP→PNG conversion |
| `grfController.js`    | - Loading GRF files<br>- Extracting assets from GRFs<br>- Extracted file cache                                   |

### src/routes/

| File       | Defined Routes                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.js` | `GET /` - Serves index.html<br>`GET /*` - Serves any client file<br>`POST /search` - Searches files by regex<br>`GET /list-files` - Lists all available files |

### src/middlewares/

| File                 | Purpose                            |
| -------------------- | ---------------------------------- |
| `debugMiddleware.js` | Logs HTTP requests when DEBUG=true |

### src/utils/

| File          | Purpose                                  |
| ------------- | ---------------------------------------- |
| `bmpUtils.js` | Automatically converts BMP images to PNG |

---

## 🚀 Installation and Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Add Ragnarok Client Files

####  `resources/` directory

Put your client GRF files here:

```
resources/
├── DATA.INI          # REQUIRED - client configuration file
├── data.grf          # Main GRF file
├── rdata.grf         # Additional GRF file
└── *.grf             # Other required GRF files
```

** IMPORTANT:** To ensure compatibility, use **GRF Builder** to repack your GRFs:

1. Open GRF Builder
2. File → Option → Repack type → **Decrypt**
3. Repack

This ensures the GRFs are in version 0x200 without DES encryption.

####  `BGM/` directory

Replace the contents with your client’s BGM folder:

```
BGM/
├── 01.mp3
├── 02.mp3
└── ...
```

####  `data/` directory

Replace the contents with your client’s data folder:

```
data/
├── sprite/
├── texture/
├── wav/
└── ...
```

####  `System/` directory

Replace the contents with your client’s System folder:

```
System/
├── itemInfo.lua
├── skillInfo.lua
└── ...
```

####  `AI/` directory (Optional)

Add custom AI scripts:

```
AI/
└── USER_AI/
    ├── AI.lua
    └── ...
```

### 3. Configure the Server

#### Edit `src/config/configs.js`

```javascript
module.exports = {
	DEBUG: true,                      // true = enables logs, false = disables
	CLIENT_RESPATH: "resources/",     // Path to client resources
	CLIENT_DATAINI: "DATA.INI",       // DATA.INI filename
	CLIENT_AUTOEXTRACT: true,         // true = auto extract GRF
	CLIENT_ENABLESEARCH: true,        // true = enables POST /search route
};
```

#### Edit `index.js` - Configure CORS

```javascript
const CLIENT_PUBLIC_URL = process.env.CLIENT_PUBLIC_URL || 'https://your-domain.com';

const corsOptions = {
  origin: [CLIENT_PUBLIC_URL, 'http://localhost:3338'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  credentials: true,
};
```

Replace `https://your-domain.com` with the domain where roBrowser is running.

### 4. Environment Variables (Optional)

Create a `.env` file in the project root:

```env
PORT=3338
CLIENT_PUBLIC_URL=https://your-domain.com
```

---

## ▶️ Run the Server

```bash
npm run start
```

The server will start on port **3338** (or the port set in `PORT`).

Access: `http://localhost:3338`

---

## 🔌 API Endpoints

| Method | Route         | Description               | Params                  |
| ------ | ------------- | ------------------------- | ----------------------- |
| GET    | `/`           | Returns `index.html`      | -                       |
| GET    | `/*`          | Serves any client file    | File path in the URL    |
| POST   | `/search`     | Searches files by regex   | `{ "filter": "regex" }` |
| GET    | `/list-files` | Lists all available files | -                       |

### Usage Examples

**Search files:**

```bash
curl -X POST http://localhost:3338/search \
  -H "Content-Type: application/json" \
  -d '{"filter": "sprite.*\\.spr"}'
```

**List files:**

```bash
curl http://localhost:3338/list-files
```

**Download a file:**

```bash
curl http://localhost:3338/data/sprite/player.spr
```

---

## Important Notes

1. **GRF Version**: Only GRF version 0x200 without DES encryption is supported
2. **DATA.INI**: Required inside `resources/`
3. **Cache**: Extracted files are cached for better performance
4. **CORS**: Configure `CLIENT_PUBLIC_URL` correctly to avoid CORS errors
5. **Gitignore**: `BGM/`, `data/`, `resources/`, `System/` and `AI/` directories are in `.gitignore` to avoid versioning client files

---

## Development

### Test Scripts

* `test-grf.js` - Tests GRF file extraction
* `test-ini-normalize.js` - Tests INI file normalization

### Code Structure

* **MVC Pattern**: Controllers handle logic, Routes define endpoints
* **Middleware**: Configurable debug and CORS
* **Utils**: Utility functions for file conversion

---

## License

GNU GPL V3

## 👤 Author

Vincent Thibault
Francisco Wallison