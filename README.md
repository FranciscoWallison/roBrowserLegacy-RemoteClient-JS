Here’s the full file translated to English (same structure/formatting). 

---

# roBrowser Legacy Remote Client (Node.js)

Remote client that lets users play Ragnarok Online by downloading resources from an external server, without needing the FullClient installed locally.

## Features

* Support for files from multiple domains (Cross-Origin Resource Sharing — CORS)
* Automatic extraction of GRF files (version 0x200 — without DES encryption)
* Automatic BMP to PNG conversion to optimize transfers
* Cache system to avoid redundant processing
* REST API to serve client files

---

## Directory Structure

```text
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

| File                    | Description                                                     | Required         |
| ----------------------- | --------------------------------------------------------------- | ---------------- |
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

## Installation and Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Run Validation (Recommended)

Before starting the server, run the diagnostic tool to validate your setup:

```bash
npm run doctor
```

This will check:

* ✓ Node.js and npm versions
* ✓ Dependencies installed correctly
* ✓ Environment variables configured
* ✓ Required files and folders exist
* ✓ GRF files compatibility (version 0x200, no DES encryption)

If any errors are found, the tool will provide specific instructions to fix them.

### 3. Add Ragnarok Client Files

#### `resources/` directory

Put your client GRF files here:

```text
resources/
├── DATA.INI          # REQUIRED - client configuration file
├── data.grf          # Main GRF file
├── rdata.grf         # Additional GRF file
└── *.grf             # Other required GRF files
```

**⚠️ CRITICAL - GRF Compatibility:**

This project **ONLY** works with GRF version **0x200** without DES encryption.

To ensure compatibility, repack your GRFs using **GRF Builder**:

1. Download [GRF Builder/Editor](https://github.com/Tokeiburu/GRFEditor)
2. Open your .grf file in GRF Builder
3. Go to: **File → Options → Repack type → Decrypt**
4. Click: **Tools → Repack**
5. Wait for completion and replace the original file

This guarantees the GRFs are in the correct format (0x200 / no DES).

The `npm run doctor` command will validate your GRF files and warn you if they're incompatible.

#### `BGM/` directory

Replace the contents with your client’s BGM folder:

```text
BGM/
├── 01.mp3
├── 02.mp3
└── ...
```

#### `data/` directory

Replace the contents with your client’s data folder:

```text
data/
├── sprite/
├── texture/
├── wav/
└── ...
```

#### `System/` directory

Replace the contents with your client’s System folder:

```text
System/
├── itemInfo.lua
├── skillInfo.lua
└── ...
```

#### `AI/` directory (Optional)

Add custom AI scripts:

```text
AI/
└── USER_AI/
    ├── AI.lua
    └── ...
```

### 4. Configure the Server

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
const CLIENT_PUBLIC_URL = process.env.CLIENT_PUBLIC_URL || 'http://localhost:8000'; // 'https://your-domain.com';

const corsOptions = {
  origin: [CLIENT_PUBLIC_URL, 'http://localhost:3338'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  credentials: true,
};
```

Replace `https://your-domain.com` with the domain where roBrowser is running.

### 5. Environment Variables (Required)

Create a `.env` file in the project root:

```env
PORT=3338
CLIENT_PUBLIC_URL=http://127.0.0.1:8000
NODE_ENV=development
```

**Important**: `CLIENT_PUBLIC_URL` is **required**. The server will not start without it.

---

## 🚀 Run the Server

### Validation on Startup

The server automatically validates your setup before starting. If any critical errors are found, the server will not start and will display detailed error messages.

```bash
npm start
```

Output example:

```text
🚀 Starting roBrowser Remote Client...

🔍 Validating startup configuration...

================================================================================
📋 VALIDATION REPORT
================================================================================

✓ INFORMATION:
  Node.js: v18.12.0
  npm: 9.1.0
  Dependencies installed correctly
  PORT: 3338
  CLIENT_PUBLIC_URL: http://127.0.0.1:8000
  NODE_ENV: development
  resources/ folder OK
  DATA.INI file OK
  Valid GRF: data.grf (version 0x200, no DES)

⚠️  WARNINGS:
  BGM/ folder is empty - may cause issues depending on the client

================================================================================
✅ Validation completed successfully!
⚠️  1 warning(s) found
================================================================================

✅ Server started successfully!
🌐 URL: http://localhost:3338
📊 Status: http://localhost:3338/api/health
```

### Manual Validation

Run the diagnostic tool anytime:

```bash
npm run doctor
```

This provides a detailed report and troubleshooting steps for any issues found.

Access the server: `http://localhost:3338`

Check validation status: `http://localhost:3338/api/health`

---

## 🔌 API Endpoints

| Method | Route         | Description               | Params                  |
| ------ | ------------- | ------------------------- | ----------------------- |
| GET    | `/`           | Returns `index.html`      | -                       |
| GET    | `/api/health` | Validation status (JSON)  | -                       |
| GET    | `/*`          | Serves any client file    | File path in the URL    |
| POST   | `/search`     | Searches files by regex   | `{ "filter": "regex" }` |
| GET    | `/list-files` | Lists all available files | -                       |

### Usage Examples

**Check system health:**

```bash
curl http://localhost:3338/api/health
```

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

## ⚠️ Important Notes

1. **Startup Validation**: The server validates all requirements before starting. If validation fails, the server will not start.
2. **GRF Version**: Only GRF version 0x200 without DES encryption is supported. Use GRF Builder to repack incompatible files.
3. **Environment Variables**: `CLIENT_PUBLIC_URL` is **required**. The server will not start without it.
4. **DATA.INI**: Required inside `resources/`. Must list at least one .grf file.
5. **Dependencies**: Run `npm install` before starting. The server checks for missing dependencies.
6. **Cache**: Extracted files are cached for better performance
7. **CORS**: Configure `CLIENT_PUBLIC_URL` correctly to avoid CORS errors
8. **Gitignore**: `BGM/`, `data/`, `resources/`, `System/` and `AI/` directories are in `.gitignore` to avoid versioning client files

## 🩺 Troubleshooting

If you encounter errors:

1. **Run diagnostics**: `npm run doctor`
2. **Check logs**: The validation report shows exactly what's wrong
3. **Common issues**:

   * **Dependencies not installed**: Run `npm install`
   * **CLIENT_PUBLIC_URL not set**: Create `.env` file with `CLIENT_PUBLIC_URL=http://your-url`
   * **Incompatible GRF**: Repack with GRF Builder (see GRF Compatibility section)
   * **Missing DATA.INI**: Create `resources/DATA.INI` with your GRF list
   * **Empty resources/**: Add at least one .grf file to `resources/`

The startup validation and `npm run doctor` command will guide you through fixing any issues.

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

## Author

Vincent Thibault
Francisco Wallison
