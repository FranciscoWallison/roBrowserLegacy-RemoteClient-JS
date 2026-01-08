#!/usr/bin/env node
"use strict";

/**
 * GRF Path Encoding Scanner (0x200 + 0x300)
 * - Reads resources/DATA.INI to list GRFs (fallback: *.grf in resources/)
 * - Parses GRF header (46 bytes)
 * - Inflates file table (zlib) and inspects filename bytes
 * - Detects invalid UTF-8 sequences => "iso-8859-1" recommendation (i.e., non-UTF-8)
 * - For 0x300 tries both entry layouts (offset32 vs offset64) and keeps best fit
 *
 * Output: grf-path-encoding-report.json
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { TextDecoder } = require("util");

const DEFAULT_RESOURCES_DIR = path.join(process.cwd(), "resources");
const DEFAULT_REPORT_PATH = path.join(process.cwd(), "grf-path-encoding-report.json");

// ---- helpers ---------------------------------------------------------------

function u32le(buf, off) {
  return (
    buf[off] |
    (buf[off + 1] << 8) |
    (buf[off + 2] << 16) |
    (buf[off + 3] << 24)
  ) >>> 0;
}

function safeRead(fd, size, position) {
  const b = Buffer.alloc(size);
  const n = fs.readSync(fd, b, 0, size, position);
  return n === size ? b : b.subarray(0, n);
}

function trimNullTerminatedAscii(buf) {
  const idx = buf.indexOf(0x00);
  const slice = idx >= 0 ? buf.subarray(0, idx) : buf;
  return slice.toString("ascii");
}

function decodeLatin1(bytes) {
  // Node TextDecoder supports "latin1" reliably
  try {
    return new TextDecoder("latin1").decode(bytes);
  } catch {
    return Buffer.from(bytes).toString("latin1");
  }
}

function isUtf8(bytes, utf8Decoder) {
  // Fast path: ASCII only
  let hasHigh = false;
  for (let i = 0; i < bytes.length; i += 1) {
    if (bytes[i] >= 0x80) {
      hasHigh = true;
      break;
    }
  }
  if (!hasHigh) return true;

  try {
    utf8Decoder.decode(bytes);
    return true;
  } catch {
    return false;
  }
}

// ---- DATA.INI parsing ------------------------------------------------------

function parseDataIni(content) {
  const lines = content.split(/\r?\n/);
  const grfs = [];
  let inData = false;

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) continue;

    if (line.toLowerCase() === "[data]") {
      inData = true;
      continue;
    }

    if (line.startsWith("[") && line.endsWith("]")) {
      inData = false;
      continue;
    }

    if (!inData) continue;

    // e.g. 0=my.grf
    const eq = line.indexOf("=");
    if (eq < 0) continue;

    const value = line.slice(eq + 1).trim();
    if (!value) continue;

    if (value.toLowerCase().endsWith(".grf")) {
      grfs.push(value);
    }
  }

  // Dedup, keep order
  const seen = new Set();
  const out = [];
  for (const g of grfs) {
    const k = g.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(g);
    }
  }
  return out;
}

function listGrfs(resourcesDir) {
  const dataIniPath = path.join(resourcesDir, "DATA.INI");
  if (fs.existsSync(dataIniPath)) {
    const txt = fs.readFileSync(dataIniPath, "utf8");
    const grfs = parseDataIni(txt);
    if (grfs.length > 0) return { mode: "DATA.INI", grfs };
  }

  // fallback: *.grf directly in resources (non-recursive)
  if (!fs.existsSync(resourcesDir) || !fs.statSync(resourcesDir).isDirectory()) {
    return { mode: "none", grfs: [] };
  }

  const files = fs.readdirSync(resourcesDir);
  const grfs = files.filter((f) => f.toLowerCase().endsWith(".grf"));
  return { mode: "resources/*.grf", grfs };
}

// ---- GRF parsing -----------------------------------------------------------

function readGrfHeader46(fd) {
  const header = safeRead(fd, 46, 0);
  if (header.length < 46) {
    return { ok: false, reason: "Header too small (<46 bytes)" };
  }

  const signatureRaw = header.subarray(0, 16);
  const signature = trimNullTerminatedAscii(signatureRaw);

  // signature should be "Master of Magic"
  if (signature !== "Master of Magic") {
    return { ok: false, reason: `Invalid signature: "${signature}"` };
  }

  // header layout (46 bytes):
  // 0..15 signature (16)
  // 16..29 encryption (14)
  // 30..33 tableOffset (u32) => filetable starts at (tableOffset + 46)
  // 34..37 seed (u32)
  // 38..41 nFiles (u32)
  // 42..45 version (u32)
  const tableOffset = u32le(header, 30);
  const seed = u32le(header, 34);
  const nFiles = u32le(header, 38);
  const version = u32le(header, 42);

  const fileCount = Math.max(nFiles - seed - 7, 0);

  return {
    ok: true,
    signature,
    tableOffset,
    seed,
    nFiles,
    fileCount,
    version,
  };
}

function inflateFileTable(fd, fileTablePos) {
  const tableHeader = safeRead(fd, 8, fileTablePos);
  if (tableHeader.length < 8) {
    return { ok: false, reason: "File table header too small (<8 bytes)" };
  }

  const compressedSize = u32le(tableHeader, 0);
  const uncompressedSize = u32le(tableHeader, 4);

  if (!compressedSize || !uncompressedSize) {
    return { ok: false, reason: "Invalid file table sizes (0)" };
  }

  // Guardrail (avoid exploding memory on corrupted files)
  // If you really have massive GRFs, increase this.
  const MAX_UNCOMPRESSED = 512 * 1024 * 1024; // 512MB
  if (uncompressedSize > MAX_UNCOMPRESSED) {
    return {
      ok: false,
      reason: `Uncompressed file table too large (${uncompressedSize} bytes)`,
    };
  }

  const compressed = safeRead(fd, compressedSize, fileTablePos + 8);
  if (compressed.length !== compressedSize) {
    return { ok: false, reason: "Failed reading compressed file table bytes" };
  }

  try {
    const data = zlib.inflateSync(compressed); // zlib stream (not raw deflate)
    return {
      ok: true,
      compressedSize,
      uncompressedSize,
      data,
    };
  } catch (e) {
    return { ok: false, reason: `zlib inflate failed: ${e.message}` };
  }
}

/**
 * Parse filename entries from the inflated file table.
 * layout:
 *  - filename: null-terminated bytes
 *  - compSize (4) + compAligned (4) + realSize (4) + flags (1) + offset (4 or 8)
 */
function scanFileTableNames(tableBuf, fileCount, offsetSize /* 4 or 8 */) {
  const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

  let p = 0;
  let inspected = 0;
  let invalidUtf8Count = 0;
  const invalidSamples = [];
  let parseErrors = 0;

  const metaLen = 4 + 4 + 4 + 1 + offsetSize;

  for (let i = 0; i < fileCount; i += 1) {
    if (p >= tableBuf.length) {
      parseErrors += 1;
      break;
    }

    // find null terminator for filename
    let end = p;
    while (end < tableBuf.length && tableBuf[end] !== 0x00) end += 1;

    if (end >= tableBuf.length) {
      parseErrors += 1;
      break;
    }

    const nameBytes = tableBuf.subarray(p, end);
    p = end + 1;

    // metadata must fit
    if (p + metaLen > tableBuf.length) {
      parseErrors += 1;
      break;
    }

    const flags = tableBuf[p + 12];
    // advance pointer past metadata
    p += metaLen;

    // only inspect real files (flag 0x01)
    if (!(flags & 0x01)) continue;

    inspected += 1;

    if (!isUtf8(nameBytes, utf8Decoder)) {
      invalidUtf8Count += 1;
      if (invalidSamples.length < 5) {
        invalidSamples.push(decodeLatin1(nameBytes));
      }
    }
  }

  return {
    inspected,
    invalidUtf8Count,
    invalidSamples,
    parseErrors,
    bytesConsumed: p,
  };
}

function analyzeGrf(grfPath) {
  let fd = null;

  try {
    fd = fs.openSync(grfPath, "r");

    const header = readGrfHeader46(fd);
    if (!header.ok) {
      return {
        ok: false,
        encoding: "unknown",
        reason: header.reason,
      };
    }

    const versionHex = `0x${header.version.toString(16).toUpperCase()}`;
    const supported = header.version === 0x200 || header.version === 0x300;

    if (!supported) {
      return {
        ok: false,
        encoding: "unknown",
        version: versionHex,
        reason: `Unsupported GRF version ${versionHex} (expected 0x200/0x300)`,
      };
    }

    const fileTablePos = header.tableOffset + 46; // per spec
    const table = inflateFileTable(fd, fileTablePos);
    if (!table.ok) {
      return {
        ok: false,
        encoding: "unknown",
        version: versionHex,
        reason: table.reason,
      };
    }

    // Try entry layouts:
    // - 0x200: offset is 4 bytes
    // - 0x300: could be 4 or 8 (support >4GB); try both and choose better fit
    const scans = [];

    scans.push({
      layout: "offset32",
      offsetSize: 4,
      ...scanFileTableNames(table.data, header.fileCount, 4),
    });

    if (header.version === 0x300) {
      scans.push({
        layout: "offset64",
        offsetSize: 8,
        ...scanFileTableNames(table.data, header.fileCount, 8),
      });
    }

    // Pick best scan:
    // Prefer higher inspected count, then fewer parse errors
    scans.sort((a, b) => {
      if (b.inspected !== a.inspected) return b.inspected - a.inspected;
      return a.parseErrors - b.parseErrors;
    });

    const best = scans[0];

    if (best.inspected === 0) {
      return {
        ok: true,
        version: versionHex,
        encoding: "unknown",
        reason: "No file entries inspected (table parse mismatch or empty GRF)",
        layoutTried: scans.map((s) => s.layout),
      };
    }

    const encoding = best.invalidUtf8Count > 0 ? "iso-8859-1" : "utf-8";

    return {
      ok: true,
      version: versionHex,
      encoding,
      layout: best.layout,
      totalFiles: best.inspected,
      invalidUtf8Count: best.invalidUtf8Count,
      invalidSamples: best.invalidSamples,
      reason:
        best.invalidUtf8Count > 0
          ? "Invalid UTF-8 sequences detected in filenames (non-UTF-8)"
          : "All inspected filenames are valid UTF-8",
    };
  } catch (e) {
    return {
      ok: false,
      encoding: "unknown",
      reason: `Failed to analyze GRF: ${e.message}`,
    };
  } finally {
    if (fd) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
  }
}

// ---- main ------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const resourcesDir =
    getArgValue(args, "--resources") || DEFAULT_RESOURCES_DIR;
  const reportPath = getArgValue(args, "--output") || DEFAULT_REPORT_PATH;

  const { mode, grfs } = listGrfs(resourcesDir);

  if (!grfs.length) {
    console.error(
      `[ERRO] Nenhuma GRF encontrada. Procurei em: ${resourcesDir} (modo: ${mode})`
    );
    process.exitCode = 2;
    return;
  }

  const results = [];
  let countUtf8 = 0;
  let countIso = 0;
  let countUnknown = 0;

  for (const grfRel of grfs) {
    const grfPath = path.isAbsolute(grfRel)
      ? grfRel
      : path.join(resourcesDir, grfRel);

    if (!fs.existsSync(grfPath)) {
      results.push({
        file: grfRel,
        exists: false,
        encoding: "unknown",
        reason: "GRF file not found",
      });
      countUnknown += 1;
      continue;
    }

    const analysis = analyzeGrf(grfPath);
    const out = {
      file: grfRel,
      exists: true,
      ...analysis,
    };

    results.push(out);

    if (analysis.encoding === "utf-8") countUtf8 += 1;
    else if (analysis.encoding === "iso-8859-1") countIso += 1;
    else countUnknown += 1;

    // Console line
    if (analysis.encoding === "utf-8") {
      console.log(
        `[UTF-8] ${grfRel} (${analysis.version}, ${analysis.totalFiles} entries)`
      );
    } else if (analysis.encoding === "iso-8859-1") {
      console.log(
        `[ISO-8859-1] ${grfRel} (${analysis.version}, inválidos: ${analysis.invalidUtf8Count}/${analysis.totalFiles})`
      );
      if (analysis.invalidSamples && analysis.invalidSamples.length) {
        console.log(`  exemplos: ${analysis.invalidSamples.join(" | ")}`);
      }
    } else {
      console.log(`[UNKNOWN] ${grfRel} (${analysis.version || "?"}) ${analysis.reason}`);
    }
  }

  const report = {
    scannedAt: new Date().toISOString(),
    resourcesDir,
    discoveryMode: mode,
    summary: {
      total: results.length,
      utf8: countUtf8,
      iso_8859_1: countIso,
      unknown: countUnknown,
    },
    files: results,
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`\nOK. Report: ${reportPath}`);
}

function getArgValue(args, key) {
  const idx = args.indexOf(key);
  if (idx < 0) return null;
  const val = args[idx + 1];
  return val && !val.startsWith("--") ? val : null;
}

main();
