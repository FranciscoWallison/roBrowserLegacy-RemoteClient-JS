# roBrowser Legacy Remote Client (Node.js)

Remote client server for [roBrowserLegacy](https://github.com/MrAntares/roBrowserLegacy) that serves Ragnarok Online game assets from GRF files over HTTP. Players can play directly in the browser without needing the full client installed locally.

With **Unified Server Mode**, this single Node.js process replaces three separate services — serving game assets, static files, and proxying WebSocket connections to rAthena — all on one port.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
  - [Unified Mode (Default)](#unified-mode-default)
  - [Separate Mode (Legacy)](#separate-mode-legacy)
- [Installation and Setup](#installation-and-setup)
  - [1. Install Dependencies](#1-install-dependencies)
  - [2. Add Ragnarok Client Files](#2-add-ragnarok-client-files)
  - [3. Configure Environment](#3-configure-environment)
  - [4. Prepare for Optimal Startup](#4-prepare-for-optimal-startup-recommended)
  - [5. Run the Server](#5-run-the-server)
- [Unified Server Mode](#unified-server-mode)
  - [Embedded WebSocket Proxy](#embedded-websocket-proxy)
  - [Embedded Static File Server](#embedded-static-file-server)
  - [Switching to Separate Mode](#switching-to-separate-mode)
- [Performance Features](#performance-features)
  - [LRU File Cache](#lru-file-cache)
  - [Cache Warm-Up](#cache-warm-up)
  - [GRF File Index](#grf-file-index)
  - [HTTP Cache Headers](#http-cache-headers)
  - [Response Compression](#response-compression)
  - [Auto-Extract to Disk](#auto-extract-to-disk)
- [Environment Variables](#environment-variables)
- [API Endpoints](#api-endpoints)
- [NPM Scripts](#npm-scripts)
- [Korean Filename Encoding Support](#korean-filename-encoding-support)
- [Directory Structure](#directory-structure)
- [Troubleshooting](#troubleshooting)
- [License](#license)
- [Authors](#authors)

---

## Features

- **Unified Server Mode** — single process replaces wsproxy + live-server + asset server
- **Embedded WebSocket proxy** — bridges browser WebSocket to rAthena TCP (replaces standalone wsproxy)
- **Embedded static file server** — serves roBrowserLegacy client files (replaces live-server)
- **LRU file cache** with configurable size (up to 5000 files / 1GB+)
- **Cache warm-up** — pre-loads frequently used assets on startup
- **GRF file indexing** — O(1) file lookups across all GRF archives
- **HTTP cache headers** (ETag, Cache-Control) for browser caching
- **Gzip/Deflate compression** for text-based responses
- **Korean filename encoding support** (CP949/EUC-KR) with mojibake detection/fixing
- **Path mapping system** for encoding conversion (Korean path → GRF path)
- **Auto-extraction** — saves GRF files to disk for faster subsequent access
- **Missing files logging** with notifications
- **REST API** for health checks, cache stats, and file search
- Cross-Origin Resource Sharing (CORS)

---

## Architecture

### Unified Mode (Default)

One Node.js process on a single port handles everything:

```
Browser ──HTTP──→ Express (:3338)
                   ├── /applications/pwa/*  → roBrowserLegacy static files
                   ├── /data/*              → GRF asset serving
                   ├── /api/*               → Health, cache stats, search
                   └── /ws/*                → WebSocket proxy → rAthena TCP

Docker (rAthena)
  ├── MariaDB  :3306
  ├── Login    :6900  ←──┐
  ├── Char     :6121  ←──┤ TCP via /ws/ proxy
  └── Map      :5121  ←──┘
```

**Before (3 Node.js processes):**

| Process | Port | Purpose |
|---------|------|---------|
| wsproxy | 5999 | WebSocket → TCP bridge |
| RemoteClient-JS | 3338 | GRF asset server |
| live-server | 8000 | Static file server |

**After (1 Node.js process):**

| Process | Port | Purpose |
|---------|------|---------|
| RemoteClient-JS | 3338 | Everything |

### Separate Mode (Legacy)

Set `ENABLE_WSPROXY=false` and `ENABLE_STATIC_SERVE=false` in `.env` to run in legacy mode with separate processes.

---

## Installation and Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Add Ragnarok Client Files

Place your GRF files in the `resources/` directory:

```text
resources/
├── DATA.INI          # REQUIRED - lists GRF files to load
├── data.grf          # Main GRF file
├── rdata.grf         # Additional GRF file
└── *.grf             # Other GRF files
```

**GRF Compatibility:** This project works with GRF versions **0x200** and **0x300** without DES encryption.

To ensure compatibility, repack your GRFs using [GRF Builder/Editor](https://github.com/Tokeiburu/GRFEditor):
1. Open your `.grf` file in GRF Builder
2. Go to: **File → Options → Repack type → Decrypt**
3. Click: **Tools → Repack**
4. Wait for completion and replace the original file

### 3. Configure Environment

Copy the example file and adjust as needed:

```bash
cp .env.example .env
```

See [Environment Variables](#environment-variables) for all options.

### 4. Prepare for Optimal Startup (Recommended)

```bash
# Full preparation (validates config, generates path mapping, builds index)
npm run prepare

# Quick preparation (skips deep encoding validation)
npm run prepare:quick
```

### 5. Run the Server

```bash
# Development mode (verbose logging, debug middleware, validation report)
npm start

# Production mode (minimal logging, no debug middleware, quiet startup)
npm run start:prod
```

**Development output:**

```text
Starting roBrowser Remote Client... [development]

📋 VALIDATION REPORT
================================================================================
✓ INFO:
  Node.js: v18.12.0
  Valid GRF: data.grf (version 0x200, no DES)
================================================================================

Static serve enabled: D:\projeto\roBrowserLegacy
WebSocket proxy enabled on /ws/ (allowed: 127.0.0.1:6900, 127.0.0.1:6121, 127.0.0.1:5121)
Client initialized in 1250ms (450,000 files indexed)
File index built in 320ms
Added 12000 mojibake path mappings for roBrowser compatibility

Server ready on http://localhost:3338 | Game: http://localhost:3338/applications/pwa/index.html | WS Proxy: /ws/

Warming cache (up to 500 files)...
Cache warmed with 500 files in 3200ms
```

**Production output:**

```text
Starting roBrowser Remote Client... [production]
Client initialized in 1250ms (450,000 files indexed)
Server ready on http://localhost:3338 | Game: http://localhost:3338/applications/pwa/index.html | WS Proxy: /ws/
Cache warmed with 500 files in 3200ms
```

### Development vs Production

| Feature | Development | Production |
|---------|-------------|------------|
| Request logging | Every request logged | Disabled |
| Validation report | Full report on startup | Only on errors |
| WS proxy connect/disconnect | Logged | Silent |
| File index details | Logged | Silent |
| Missing file per-file log | Logged to console | Only to file |
| Startup info | Verbose | One-line summary |
| Errors and warnings | Always shown | Always shown |

Switch modes by:
- `npm start` (development) / `npm run start:prod` (production)
- Or change `NODE_ENV=production` in `.env`

---

## Unified Server Mode

### Embedded WebSocket Proxy

When `ENABLE_WSPROXY=true`, the server embeds a WebSocket-to-TCP proxy that replaces the standalone [wsproxy](https://github.com/herenow/wsProxy) package.

**How it works:**
1. Browser connects via WebSocket to `ws://localhost:3338/ws/127.0.0.1:6900`
2. Server extracts the target (`127.0.0.1:6900`) from the URL path
3. Server opens a TCP connection to rAthena
4. Packets are bridged bidirectionally: `WS ↔ TCP`

**Security:** Only connections to whitelisted targets are allowed (default):
- `127.0.0.1:6900` (Login server)
- `127.0.0.1:6121` (Char server)
- `127.0.0.1:5121` (Map server)

**Custom targets (Docker/Kubernetes):**

When rAthena runs on a different host (e.g., Docker containers), configure allowed targets via the `WS_ALLOWED_TARGETS` environment variable:

```env
# Docker Desktop (macOS/Windows):
WS_ALLOWED_TARGETS=host.docker.internal:6900,host.docker.internal:6121,host.docker.internal:5121

# Remote rAthena server:
WS_ALLOWED_TARGETS=10.0.0.5:6900,10.0.0.5:6121,10.0.0.5:5121
```

When not set, defaults to localhost targets (`127.0.0.1:6900/6121/5121`).

**roBrowserLegacy configuration** (`Config.local.js`):
```js
socketProxy: 'ws://127.0.0.1:3338/ws/'  // unified mode
// socketProxy: 'ws://127.0.0.1:5999/'  // separate mode (legacy)
```

### Embedded Static File Server

When `ENABLE_STATIC_SERVE=true`, the server serves roBrowserLegacy client files via Express static middleware, replacing the need for `live-server`.

**Access the game at:** `http://localhost:3338/applications/pwa/index.html`

The `ROBROWSER_PATH` variable points to the roBrowserLegacy directory (default: `../roBrowserLegacy`).

### Switching to Separate Mode

To revert to the legacy 3-process architecture, update your `.env`:

```env
ENABLE_WSPROXY=false
ENABLE_STATIC_SERVE=false
```

And revert `Config.local.js`:
```js
socketProxy: 'ws://127.0.0.1:5999/'
```

Then start wsproxy and live-server separately as before.

---

## Performance Features

### LRU File Cache

In-memory LRU (Least Recently Used) cache for file content with O(1) get/set operations.

```env
CACHE_MAX_FILES=5000        # Max cached files (default: 5000)
CACHE_MAX_MEMORY_MB=1024    # Max memory in MB (default: 1024)
```

- Files larger than 10% of max memory are not cached
- Automatic eviction when limits are reached
- Cache stats available at `/api/cache-stats`

**Sizing guide:**

| GRF Size | Recommended Files | Recommended Memory (MB) |
|----------|-------------------|-------------------------|
| < 500MB  | 2000 | 512 |
| 500MB - 2GB | 5000 | 1024 |
| > 2GB | 10000 | 2048 |

### Cache Warm-Up

Pre-loads frequently accessed assets into cache on startup, so the first player to connect gets fast load times.

```env
CACHE_WARM_UP=true          # Enable/disable warm-up
CACHE_WARM_UP_LIMIT=500     # Max files to pre-load
```

**Pre-loaded asset categories (in priority order):**
1. UI/interface textures
2. Loading screens and card images
3. Default spawn map data (prontera)
4. Common map formats (`.gat`, `.rsw`)
5. Player sprites (all classes)
6. Palette files (`.pal`)
7. Lua/Lub config files

The warm-up runs **after** the server is ready and does not block incoming requests.

### GRF File Index

At startup, the server builds a unified index from all GRF files for O(1) lookups:

- Normalized paths (case-insensitive, slash direction)
- Mojibake path variants for roBrowser compatibility
- Path mapping integration for Korean → GRF path resolution
- Index statistics available via `/api/cache-stats`

### HTTP Cache Headers

Static game assets receive proper cache headers for browser-side caching:

| Header | Value | Purpose |
|--------|-------|---------|
| ETag | MD5 hash | Content validation |
| Cache-Control | `max-age=86400, immutable` | 1-day cache for game assets |
| 304 Not Modified | — | Skip re-download if unchanged |

### Response Compression

- Gzip/Deflate compression for text-based responses (JSON, XML, HTML, JS)
- Only compresses responses larger than 1KB
- Automatic content-type detection and encoding negotiation

### Auto-Extract to Disk

When `CLIENT_AUTOEXTRACT=true` (default in `src/config/configs.js`), files extracted from GRF archives are saved to the local filesystem. On subsequent requests, files are served from disk instead of re-extracting from the GRF — significantly faster for repeated access.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3338` | Server port |
| `CLIENT_PUBLIC_URL` | `http://localhost:8000` | Allowed CORS origin |
| `NODE_ENV` | `development` | Node environment |
| `CACHE_MAX_FILES` | `5000` | Max files in LRU cache |
| `CACHE_MAX_MEMORY_MB` | `1024` | Max cache memory (MB) |
| `CACHE_WARM_UP` | `true` | Enable cache warm-up on startup |
| `CACHE_WARM_UP_LIMIT` | `500` | Max files to pre-load on warm-up |
| `ENABLE_WSPROXY` | `true` | Embed WebSocket proxy (replaces wsproxy) |
| `WS_ALLOWED_TARGETS` | `127.0.0.1:6900,...` | Comma-separated `host:port` pairs for WS proxy allowlist |
| `ENABLE_STATIC_SERVE` | `true` | Serve roBrowserLegacy static files (replaces live-server) |
| `ROBROWSER_PATH` | `../roBrowserLegacy` | Path to roBrowserLegacy directory |

---

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/` | Returns `index.html` |
| GET | `/api/health` | Full system status (validation, cache, index, missing files) |
| GET | `/api/cache-stats` | Cache and index statistics |
| GET | `/api/missing-files` | List of files not found |
| GET | `/*` | Serves any client file (from disk, cache, or GRF) |
| POST | `/search` | Search files by regex filter |
| GET | `/list-files` | List all available files |
| WS | `/ws/{host}:{port}` | WebSocket proxy to TCP (when `ENABLE_WSPROXY=true`) |

### Usage Examples

```bash
# Check system health
curl http://localhost:3338/api/health

# Check cache performance
curl http://localhost:3338/api/cache-stats

# Check missing files
curl http://localhost:3338/api/missing-files

# Search files by regex
curl -X POST http://localhost:3338/search \
  -H "Content-Type: application/json" \
  -d '{"filter": "sprite.*\\.spr"}'
```

**Cache stats response example:**

```json
{
  "cache": {
    "size": 500,
    "maxSize": 5000,
    "memoryUsedMB": "384.50",
    "maxMemoryMB": "1024",
    "hits": 12500,
    "misses": 500,
    "hitRate": "96.15%"
  },
  "index": {
    "totalFiles": 450000,
    "grfCount": 3,
    "indexBuilt": true
  }
}
```

---

## NPM Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start the server (development, verbose) |
| `npm run start:prod` | Start the server (production, minimal logging) |
| `npm run prepare` | Full pre-startup optimization |
| `npm run prepare:quick` | Quick pre-startup (skip deep validation) |
| `npm run doctor` | Run diagnostic validation |
| `npm run doctor:deep` | Deep validation with encoding check |
| `npm run debug-grf` | Debug GRF file loading |
| `npm run convert:encoding` | Generate path-mapping.json |
| `npm run validate:grf` | Validate a single GRF file |
| `npm run validate:all` | Validate all GRFs in resources/ |
| `npm run validate:encoding` | Validate encoding with iconv-lite |
| `npm run test:mojibake` | Test mojibake detection |

---

## Korean Filename Encoding Support

Many Ragnarok GRF files contain Korean filenames encoded in CP949/EUC-KR. When read on non-Korean systems, they appear as mojibake (garbled characters).

**The problem:**
```
Client requests: /data/texture/유저인터페이스/t_배경3-3.tga
GRF contains:    /data/texture/À¯ÀúÀÎÅÍÆäÀÌ½º/t_¹è°æ3-3.tga
```

**The solution:**

The server handles this automatically through:
1. **Mojibake indexing** — builds GRF index with both Korean Unicode and mojibake variants
2. **Runtime decoding** — decodes mojibake paths back to Korean Unicode on request
3. **Path mapping** — optional `path-mapping.json` for explicit Korean → GRF path mappings

```bash
# Deep encoding validation
npm run doctor:deep

# Generate path-mapping.json
npm run convert:encoding
```

---

## Directory Structure

```text
roBrowserLegacy-RemoteClient-JS/
│
├── index.js                    # Main server (Express + WS proxy + static serve)
├── start-prod.js               # Production launcher (sets NODE_ENV=production)
├── index.html                  # Home page served at the server root
├── doctor.js                   # Diagnostic tool for troubleshooting
├── prepare.js                  # Pre-startup optimization script
├── package.json                # Project dependencies and scripts
├── .env                        # Environment configuration
├── .env.example                # Environment template
├── path-mapping.json           # Generated encoding conversion mappings
│
├── src/                        # Application source code
│   ├── config/
│   │   └── configs.js          # Client and server settings
│   ├── controllers/
│   │   ├── clientController.js # File operations, caching, indexing, warm-up
│   │   └── grfController.js    # GRF extraction using @chicowall/grf-loader
│   ├── middlewares/
│   │   └── debugMiddleware.js  # Debug logging middleware (dev only)
│   ├── routes/
│   │   └── index.js            # Routes with HTTP cache headers
│   ├── utils/
│   │   ├── bmpUtils.js         # BMP to PNG conversion
│   │   ├── logger.js           # Logger utility (respects NODE_ENV)
│   │   └── LRUCache.js         # LRU cache implementation
│   └── validators/
│       └── startupValidator.js # Startup and encoding validation
│
├── tools/                      # CLI tools for validation and conversion
│   ├── validate-grf.mjs        # Single GRF validation
│   ├── validate-all-grfs.mjs   # Batch GRF validation
│   ├── validate-grf-iconv.mjs  # Encoding validation with iconv-lite
│   ├── convert-encoding.mjs    # Generate path-mapping.json
│   └── test-mojibake.mjs       # Test mojibake detection
│
├── logs/                       # Log files
│   └── missing-files.log       # Missing files log
│
├── resources/                  # RAGNAROK CLIENT FILES
│   ├── DATA.INI                # Client configuration file (required)
│   └── *.grf                   # Client GRF files
│
├── BGM/                        # Game background music
├── data/                       # Client data files (auto-extracted)
├── System/                     # Client system files
└── AI/                         # AI scripts for homunculus/mercenaries
```

---

## Troubleshooting

### Encoding Issues

If files are not found due to encoding issues:

1. Run deep validation: `npm run doctor:deep`
2. Generate path mapping: `npm run convert:encoding`
3. Restart the server

### Missing Files

The server logs missing files to `logs/missing-files.log`. Check:

- `/api/missing-files` endpoint for recent missing files
- Console output for missing file alerts (triggers after 10+ missing files)

### Performance Issues

1. Check cache hit rate: `curl http://localhost:3338/api/cache-stats`
2. Increase cache size via `.env` (see [Environment Variables](#environment-variables))
3. Enable cache warm-up: `CACHE_WARM_UP=true`
4. Run `npm run prepare` to pre-build indexes

### WebSocket Proxy Not Working

1. Verify `ENABLE_WSPROXY=true` in `.env`
2. Check `Config.local.js` has `socketProxy: 'ws://127.0.0.1:3338/ws/'`
3. Ensure rAthena is running (login:6900, char:6121, map:5121)
4. Check server logs for `WS proxy blocked connection` messages
5. For Docker/remote rAthena: set `WS_ALLOWED_TARGETS` in `.env` (see [Environment Variables](#environment-variables))

### Common Issues

| Problem | Solution |
|---------|----------|
| Dependencies not installed | Run `npm install` |
| Incompatible GRF | Repack with GRF Builder (version 0x200, no DES) |
| Missing DATA.INI | Create `resources/DATA.INI` |
| Encoding issues | Run `npm run convert:encoding` |
| Slow file access | Increase cache size, enable warm-up, run `npm run prepare` |
| WS proxy connection refused | Check rAthena is running, verify target ports |
| Static files not served | Check `ROBROWSER_PATH` points to roBrowserLegacy directory |

---

## License

GNU GPL V3

## Authors

- Vincent Thibault
- Francisco Wallison
