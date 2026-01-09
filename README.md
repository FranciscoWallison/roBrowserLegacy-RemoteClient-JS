# roBrowser Legacy Remote Client (Node.js)

Remote client that lets users play Ragnarok Online by downloading resources from an external server, without needing the FullClient installed locally.

## Features

* Support for files from multiple domains (Cross-Origin Resource Sharing — CORS)
* Automatic extraction of GRF files (version 0x200 — without DES encryption)
* **LRU file cache** for fast repeated file access
* **GRF file indexing** for O(1) file lookups
* **HTTP cache headers** (ETag, Cache-Control) for browser caching
* **Gzip/Deflate compression** for text-based responses
* **Korean filename encoding support** (CP949/EUC-KR) with mojibake detection/fixing
* **Path mapping system** for encoding conversion (Korean path → GRF path)
* **Missing files logging** with notifications
* REST API to serve client files

---

## Directory Structure

```text
roBrowserLegacy-RemoteClient-JS/
│
├── index.js                    # Main Express server file
├── index.html                  # Home page served at the server root
├── doctor.js                   # Diagnostic tool for troubleshooting
├── prepare.js                  # Pre-startup optimization script
├── package.json                # Project dependencies and scripts
├── path-mapping.json           # Generated encoding conversion mappings
│
├── src/                        # Application source code
│   ├── config/                 # Configuration files
│   │   └── configs.js          # Client and server settings
│   │
│   ├── controllers/            # Controller logic
│   │   ├── clientController.js # File operations, caching, indexing
│   │   └── grfController.js    # GRF extraction using @chicowall/grf-loader
│   │
│   ├── middlewares/            # Express middlewares
│   │   └── debugMiddleware.js  # Debug logging middleware
│   │
│   ├── routes/                 # API route definitions
│   │   └── index.js            # Routes with HTTP cache headers
│   │
│   ├── utils/                  # Utilities
│   │   ├── bmpUtils.js         # BMP to PNG conversion
│   │   └── LRUCache.js         # LRU cache implementation
│   │
│   └── validators/             # Validation system
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
├── data/                       # Client data files
├── System/                     # Client system files
└── AI/                         # AI scripts for homunculus/mercenaries
```

---

## Performance Features

### LRU File Cache

The server implements an in-memory LRU (Least Recently Used) cache for file content:

- **Default**: 100 files, 256MB max memory
- **O(1)** get/set operations
- Automatic eviction of least recently used files
- Configurable via environment variables

```env
CACHE_MAX_FILES=100
CACHE_MAX_MEMORY_MB=256
```

### GRF File Index

At startup, the server builds a unified index from all GRF files:

- **O(1) file lookups** instead of sequential GRF iteration
- Normalized paths (case-insensitive, slash direction)
- Integrates path mapping for Korean → mojibake resolution
- Index statistics available via `/api/cache-stats`

### HTTP Cache Headers

Static game assets receive proper cache headers:

- **ETag** for content validation
- **Cache-Control**: `max-age=86400, immutable` for game assets
- **304 Not Modified** responses for conditional requests
- Reduces bandwidth and speeds up repeated requests

### Response Compression

- Gzip/Deflate compression for text-based responses
- Only compresses responses > 1KB
- Automatic content-type detection

---

## Korean Filename Encoding Support

Many Ragnarok GRF files contain Korean filenames encoded in CP949/EUC-KR. When these are read on non-Korean systems, they appear as mojibake (garbled characters).

### The Problem

Client requests: `/data/texture/유저인터페이스/t_배경3-3.tga`
GRF contains: `/data/texture/À¯ÀúÀÎÅÍÆäÀÌ½º/t_¹è°æ3-3.tga`

### The Solution

The server provides tools to:

1. **Detect** encoding issues in GRF files
2. **Generate** path mappings (Korean → GRF path)
3. **Automatically resolve** requests using path mapping

### Usage

```bash
# Deep encoding validation
npm run doctor:deep

# Generate path-mapping.json
npm run convert:encoding

# The server automatically uses path-mapping.json for lookups
npm start
```

---

## Installation and Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Prepare for Optimal Startup (Recommended)

Run the prepare command to optimize everything before starting:

```bash
# Full preparation (validates config, generates path mapping, builds index)
npm run prepare

# Quick preparation (skips deep encoding validation)
npm run prepare:quick
```

This will:
- Validate configuration files
- Generate `path-mapping.json` for encoding conversion
- Build file index for fast lookups
- Validate encoding (full mode only)
- Create logs directory

### 3. Run Validation

```bash
npm run doctor        # Basic validation
npm run doctor:deep   # Deep validation including encoding check
```

### 4. Add Ragnarok Client Files

#### `resources/` directory

```text
resources/
├── DATA.INI          # REQUIRED - client configuration file
├── data.grf          # Main GRF file
├── rdata.grf         # Additional GRF file
└── *.grf             # Other required GRF files
```

**GRF Compatibility:**

This project **ONLY** works with GRF version **0x200** without DES encryption.

To ensure compatibility, repack your GRFs using **GRF Builder**:

1. Download [GRF Builder/Editor](https://github.com/Tokeiburu/GRFEditor)
2. Open your .grf file in GRF Builder
3. Go to: **File → Options → Repack type → Decrypt**
4. Click: **Tools → Repack**
5. Wait for completion and replace the original file

### 5. Environment Variables

Create a `.env` file in the project root:

```env
PORT=3338
CLIENT_PUBLIC_URL=http://127.0.0.1:8000
NODE_ENV=development

# Cache configuration (optional)
CACHE_MAX_FILES=100
CACHE_MAX_MEMORY_MB=256
```

---

## NPM Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start the server |
| `npm run prepare` | Full pre-startup optimization |
| `npm run prepare:quick` | Quick pre-startup (skip deep validation) |
| `npm run doctor` | Run diagnostic validation |
| `npm run doctor:deep` | Deep validation with encoding check |
| `npm run convert:encoding` | Generate path-mapping.json |
| `npm run validate:grf` | Validate a single GRF file |
| `npm run validate:all` | Validate all GRFs in resources/ |
| `npm run validate:encoding` | Validate encoding with iconv-lite |
| `npm run test:mojibake` | Test mojibake detection |

---

## Run the Server

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
  Dependencies installed correctly
  PORT: 3338
  Valid GRF: data.grf (version 0x200, no DES)

================================================================================
✅ Validation completed successfully!
================================================================================

Client initialized in 1250ms (450,000 files indexed)
File index built in 320ms

✅ Server started successfully!
🌐 URL: http://localhost:3338
📊 Status: http://localhost:3338/api/health
```

---

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/` | Returns `index.html` |
| GET | `/api/health` | Full system status (validation, cache, index, missing files) |
| GET | `/api/cache-stats` | Cache and index statistics |
| GET | `/api/missing-files` | List of files not found |
| GET | `/*` | Serves any client file (with caching) |
| POST | `/search` | Searches files by regex |
| GET | `/list-files` | Lists all available files |

### Usage Examples

**Check system health:**

```bash
curl http://localhost:3338/api/health
```

Response includes:
- Validation status
- Cache statistics (hits, misses, hit rate, memory usage)
- Index statistics (total files, GRF count)
- Missing files summary

**Check cache performance:**

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

**Check missing files:**

```bash
curl http://localhost:3338/api/missing-files
```

**Search files:**

```bash
curl -X POST http://localhost:3338/search \
  -H "Content-Type: application/json" \
  -d '{"filter": "sprite.*\\.spr"}'
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

1. Check cache hit rate: `/api/cache-stats`
2. Increase cache size via environment variables
3. Run `npm run prepare` to pre-build indexes

### Common Issues

| Problem | Solution |
|---------|----------|
| Dependencies not installed | Run `npm install` |
| CLIENT_PUBLIC_URL not set | Create `.env` file |
| Incompatible GRF | Repack with GRF Builder |
| Missing DATA.INI | Create `resources/DATA.INI` |
| Encoding issues | Run `npm run convert:encoding` |
| Slow file access | Run `npm run prepare`, check cache stats |

---

## Development

### Code Structure

- **MVC Pattern**: Controllers handle logic, Routes define endpoints
- **LRU Cache**: O(1) file caching with memory limits
- **File Index**: O(1) GRF file lookups
- **Path Mapping**: Korean → mojibake path resolution
- **HTTP Caching**: ETag, Cache-Control headers

### Key Files

| File | Purpose |
|------|---------|
| `src/utils/LRUCache.js` | LRU cache implementation |
| `src/controllers/clientController.js` | File serving, caching, indexing |
| `src/validators/startupValidator.js` | Validation and encoding checks |
| `tools/convert-encoding.mjs` | Path mapping generation |

---

## License

GNU GPL V3

## Authors

- Vincent Thibault
- Francisco Wallison
