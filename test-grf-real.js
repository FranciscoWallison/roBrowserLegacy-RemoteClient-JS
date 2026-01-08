#!/usr/bin/env node

/**
 * REAL GRF reading test (fixed)
 *
 * What this fixes/improves:
 *  - Normalizes paths for lookups (slash/backslash + case)
 *  - Shows extension/type stats (so you can verify "missing types" quickly)
 *  - Probes extraction across common file types if present
 *  - Warns about suspicious filename decoding (U+FFFD "�") and key collisions
 *
 * Usage:
 *   node test-grf-real.fixed.js <path-to-file.grf>
 *   node test-grf-real.fixed.js              # auto-tests resources/*.grf
 */

const fs = require("fs");
const path = require("path");
const { GrfNode } = require("@chicowall/grf-loader");

// Common RO file types to probe (adjust if you want)
const PROBE_EXTS = [
  "spr",
  "act",
  "bmp",
  "tga",
  "pal",
  "wav",
  "mp3",
  "gat",
  "rsw",
  "gnd",
  "str",
  "lub",
  "lua",
  "xml",
  "txt",
];

// ---------- helpers ----------

function norm(p) {
  // Normalize path separators + case, and keep Unicode stable
  return String(p)
    .replace(/[\\/]+/g, "/")
    .toLowerCase()
    .normalize("NFC");
}

function extOf(p) {
  const s = String(p).replace(/[\\\/]+/g, "/");
  const base = s.slice(s.lastIndexOf("/") + 1);
  const idx = base.lastIndexOf(".");
  return idx >= 0 ? base.slice(idx + 1).toLowerCase() : "";
}

function topNFromMapCount(map, n) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function sampleUnique(arr, k) {
  if (arr.length <= k) return arr.slice();
  const out = [];
  const used = new Set();
  while (out.length < k) {
    const i = Math.floor(Math.random() * arr.length);
    if (used.has(i)) continue;
    used.add(i);
    out.push(arr[i]);
  }
  return out;
}

async function extractAndReport(grf, fileKey) {
  const { data, error } = await grf.getFile(fileKey);
  if (error) return { ok: false, error: String(error) };
  return { ok: true, bytes: data?.length ?? 0 };
}

/**
 * Builds a normalized lookup map:
 *   normKey -> rawKey
 *
 * Also detects collisions (different raw keys that normalize to same normKey),
 * which can happen with case-only differences or bad charset decoding.
 */
function buildNormalizedIndex(files) {
  const idx = new Map();
  const collisions = [];
  for (const raw of files) {
    const k = norm(raw);
    const prev = idx.get(k);
    if (prev && prev !== raw) {
      collisions.push({ norm: k, a: prev, b: raw });
      // Keep the first one to avoid thrashing; collisions are reported.
      continue;
    }
    idx.set(k, raw);
  }
  return { idx, collisions };
}

/**
 * Attempts to find a file key in GRF regardless of slash/backslash/case.
 */
function findKey(normIndex, query) {
  const k = norm(query);
  return normIndex.get(k) || null;
}

function printDivider() {
  console.log("\n" + "═".repeat(80));
}

// ---------- main test ----------

async function testGrf(grfPath) {
  printDivider();
  console.log(`🧪 REAL READ TEST (fixed): ${path.basename(grfPath)}`);
  printDivider();

  if (!fs.existsSync(grfPath)) {
    console.error("❌ File not found:", grfPath);
    return false;
  }

  let fd = null;
  let grf = null;
  let stepCompleted = 0;

  try {
    // STEP 1: Open file
    console.log("1️⃣  Opening GRF file...");
    fd = fs.openSync(grfPath, "r");
    const stats = fs.fstatSync(fd);

    console.log("   ✅ File opened successfully");
    console.log(
      `   📏 Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB (${stats.size} bytes)`
    );
    stepCompleted = 1;

    // STEP 2: Read header
    console.log("\n2️⃣  Reading GRF header...");
    const headerBuffer = Buffer.alloc(46);
    fs.readSync(fd, headerBuffer, 0, 46, 0);

    const magicRaw = headerBuffer.toString("ascii", 0, 15);
    const magic = magicRaw.replace(/\0+$/g, ""); // trim trailing NULs
    const version = headerBuffer.readUInt32LE(42);
    const versionHex = "0x" + version.toString(16).toUpperCase();

    console.log(`   Magic: "${magic}"`);
    console.log(`   Version: ${versionHex} (${version})`);

    stepCompleted = 2;

    // STEP 3: Initialize library
    console.log("\n3️⃣  Initializing @chicowall/grf-loader library...");
    grf = new GrfNode(fd);
    console.log("   ✅ Library initialized");

    stepCompleted = 3;

    // STEP 4: Load GRF
    console.log("\n4️⃣  Loading/decompressing GRF contents...");
    console.log("   ⏳ Please wait...");

    const startTime = Date.now();
    await grf.load();
    const loadTime = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`   ✅ GRF loaded in ${loadTime}s`);
    stepCompleted = 4;

    // STEP 5: List files
    console.log("\n5️⃣  Listing files...");
    const files = Array.from(grf.files.keys());
    const fileCount = files.length;

    console.log(`   ✅ Total files: ${fileCount}`);

    if (fileCount === 0) {
      console.log("   ⚠️  No files found in GRF (unexpected).");
      return false;
    }

    console.log("\n   📄 First 10 files:");
    files.slice(0, 10).forEach((file, i) => console.log(`      ${i + 1}. ${file}`));
    if (fileCount > 10) console.log(`      ... and ${fileCount - 10} more files`);

    // Step 5b: Extension stats (this catches the “missing file types” issue)
    console.log("\n   🧾 Extension stats (top 20):");
    const extCount = new Map();
    for (const f of files) {
      const e = extOf(f);
      extCount.set(e, (extCount.get(e) || 0) + 1);
    }
    const top20 = topNFromMapCount(extCount, 20);
    for (const [e, c] of top20) {
      console.log(`      ${String(e || "(no ext)").padEnd(12)} ${c}`);
    }

    // Step 5c: Detect suspicious filename decoding and collisions
    const replacementChar = "\uFFFD"; // "�"
    const badNameCount = files.reduce(
      (acc, f) => acc + (String(f).includes(replacementChar) ? 1 : 0),
      0
    );

    const { idx: normIndex, collisions } = buildNormalizedIndex(files);

    if (badNameCount > 0) {
      console.log(
        `\n   ⚠️  Warning: ${badNameCount} filename(s) contain "�" (U+FFFD).`
      );
      console.log(
        "      This usually means the filename charset was decoded wrong (common with KR GRFs)."
      );
      console.log(
        "      Lookups by name may fail or collide unless the loader decodes CP949/EUC-KR correctly."
      );
    }

    if (collisions.length > 0) {
      console.log(`\n   ⚠️  Warning: ${collisions.length} normalized-key collision(s) detected.`);
      console.log("      Example collision:");
      const ex = collisions[0];
      console.log(`      norm: ${ex.norm}`);
      console.log(`      a   : ${ex.a}`);
      console.log(`      b   : ${ex.b}`);
    }

    // STEP 6: Extraction probes
    console.log("\n6️⃣  Testing extraction (robust lookups + type probes)...");

    // 6a) Always try extracting the first file using exact key
    const firstFile = files[0];
    console.log(`   🧪 Extract (exact): ${firstFile}`);
    {
      const r = await extractAndReport(grf, firstFile);
      if (!r.ok) console.log(`      ❌ ${r.error}`);
      else console.log(`      ✅ ${r.bytes} bytes`);
    }

    // 6b) Try extracting same file via normalized variants
    const variants = [
      firstFile,
      firstFile.replace(/[\\]+/g, "/"),
      firstFile.replace(/[\/]+/g, "\\"),
      firstFile.toLowerCase(),
      firstFile.toUpperCase(),
    ];

    console.log("   🔁 Lookup variants (slash/backslash/case):");
    for (const q of variants) {
      const resolved = findKey(normIndex, q);
      if (!resolved) {
        console.log(`      ❌ Not found: ${q}`);
        continue;
      }
      const r = await extractAndReport(grf, resolved);
      if (!r.ok) console.log(`      ❌ ${q} -> ${resolved} : ${r.error}`);
      else console.log(`      ✅ ${q} -> ${resolved} : ${r.bytes} bytes`);
    }

    // 6c) Probe by extension: pick first match for each ext if present
    console.log("\n   🧪 Type probes (first match per ext if present):");
    let probeHits = 0;
    for (const ext of PROBE_EXTS) {
      // Find a file with that extension
      const match = files.find((f) => extOf(f) === ext);
      if (!match) continue;

      probeHits++;
      const r = await extractAndReport(grf, match);
      if (!r.ok) console.log(`      ❌ .${ext}  ${match} : ${r.error}`);
      else console.log(`      ✅ .${ext}  ${match} : ${r.bytes} bytes`);
    }
    if (probeHits === 0) {
      console.log("      (No files matched the probe extensions in this GRF.)");
    }

    // 6d) Random sample extraction
    console.log("\n   🎲 Random sample extraction (3 files):");
    for (const key of sampleUnique(files, 3)) {
      const r = await extractAndReport(grf, key);
      if (!r.ok) console.log(`      ❌ ${key} : ${r.error}`);
      else console.log(`      ✅ ${key} : ${r.bytes} bytes`);
    }

    printDivider();
    console.log("🎉 CONCLUSION: GRF IS READABLE WITH THIS LOADER.");
    if (badNameCount > 0) {
      console.log("⚠️  BUT: Filename charset decode looks wrong (see warning above).");
      console.log("   If your validator 'can't find' some files, it's probably lookup/encoding.");
    } else if (collisions.length > 0) {
      console.log("⚠️  BUT: Normalized-key collisions exist. Your validator should handle duplicates.");
    } else {
      console.log("✅ Lookups should be stable if you normalize paths (slash + case).");
    }
    printDivider();

    return true;
  } catch (error) {
    console.error("\n❌ ERROR while loading GRF!");
    console.error("─".repeat(80));

    console.error("\n📍 FAILURE POINT:");
    if (stepCompleted === 0) {
      console.error("   Failed at: Opening the GRF file");
    } else if (stepCompleted === 1) {
      console.error("   Failed at: Reading GRF header");
    } else if (stepCompleted === 2) {
      console.error("   Failed at: Initializing library");
    } else if (stepCompleted === 3) {
      console.error("   Failed at: Loading/decompressing GRF contents");
      console.error("   Possible cause: DES encryption not supported by loader or corrupted GRF");
    } else if (stepCompleted === 4) {
      console.error("   Failed at: Listing files / extracting");
    }

    console.error("\n📋 ERROR DETAILS:");
    console.error(`   Type: ${error.name}`);
    console.error(`   Message: ${error.message}`);
    if (error.code) console.error(`   Code: ${error.code}`);

    const errorMsg = String(error.message || "").toLowerCase();
    console.error("\n🔍 DIAGNOSIS:");
    if (errorMsg.includes("decrypt") || errorMsg.includes("encryption") || errorMsg.includes("des")) {
      console.error("   ❌ Issue: encryption/decryption problem (often DES).");
    } else if (errorMsg.includes("magic") || errorMsg.includes("header")) {
      console.error("   ❌ Issue: invalid GRF header / corrupted file.");
    } else if (errorMsg.includes("compress") || errorMsg.includes("inflate") || errorMsg.includes("zlib")) {
      console.error("   ❌ Issue: decompression error (corrupt data or incompatible compression).");
    } else if (errorMsg.includes("version")) {
      console.error("   ❌ Issue: incompatible GRF version.");
    } else {
      console.error("   ❓ Issue: unknown.");
    }

    if (error.stack) {
      console.error("\n📚 Stack trace:");
      console.error(error.stack);
    }

    printDivider();
    console.log("❌ CONCLUSION: FAILED TO READ THIS GRF WITH CURRENT LOADER.");
    printDivider();

    return false;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch (_) {}
    }
  }
}

// ---------- runner ----------

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log("\n📖 Usage: node test-grf-real.fixed.js <path-to-file.grf>");
  console.log("\nExample:");
  console.log("  node test-grf-real.fixed.js resources/data.grf\n");

  // Try testing all GRFs inside resources/
  const resourcesPath = path.join(__dirname, "resources");
  if (fs.existsSync(resourcesPath)) {
    const grfFiles = fs
      .readdirSync(resourcesPath)
      .filter((f) => f.toLowerCase().endsWith(".grf"))
      .map((f) => path.join(resourcesPath, f));

    if (grfFiles.length > 0) {
      console.log("🔍 Testing all GRFs in resources/:\n");
      (async () => {
        for (const grf of grfFiles) {
          const ok = await testGrf(grf);
          if (!ok) process.exit(1);
        }
      })();
    } else {
      console.log("⚠️  No .grf files found in resources/\n");
    }
  }
} else {
  const grfPath = args[0];
  testGrf(grfPath).then((ok) => process.exit(ok ? 0 : 1));
}
