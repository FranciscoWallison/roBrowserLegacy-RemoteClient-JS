#!/usr/bin/env node
/**
 * test-grf-read.mjs
 *
 * Testa se arquivos podem ser LIDOS de um GRF.
 * Este é o teste mais importante - valida que a biblioteca funciona.
 *
 * Uso:
 *  node tools/test-grf-read.mjs <grfPath> [encoding=auto] [count=100]
 *
 * Ex:
 *  node tools/test-grf-read.mjs D:\\data.grf auto 500
 */

import { GrfNode } from "../dist/index.js";
import { openSync, closeSync } from "fs";
import path from "path";

const grfPath = process.argv[2];
const encoding = process.argv[3] || "auto";
const testCount = parseInt(process.argv[4] || "100", 10);

if (!grfPath) {
  console.error("Uso: node tools/test-grf-read.mjs <grfPath> [encoding=auto] [count=100]");
  process.exit(1);
}

async function main() {
  console.log("=".repeat(70));
  console.log("GRF Read Test");
  console.log("=".repeat(70));
  console.log(`File: ${path.resolve(grfPath)}`);
  console.log(`Encoding: ${encoding}`);
  console.log(`Test count: ${testCount}`);
  console.log("");

  const fd = openSync(grfPath, "r");

  try {
    console.log("[1] Loading GRF...");
    const grf = new GrfNode(fd, { filenameEncoding: encoding });

    const loadStart = Date.now();
    await grf.load();
    const loadTime = Date.now() - loadStart;

    const stats = grf.getStats?.() ?? {};
    console.log(`    Loaded in ${loadTime}ms`);
    console.log(`    Files: ${stats.fileCount}`);
    console.log(`    Detected encoding: ${stats.detectedEncoding}`);
    console.log(`    Bad names (U+FFFD/C1): ${stats.badNameCount}`);
    console.log(`    Collisions: ${stats.collisionCount}`);
    console.log("");

    // Get files to test
    const allFiles = Array.from(grf.files.keys());
    const filesToTest = [];

    // Get a variety of files
    const extensions = grf.listExtensions?.() || [];
    console.log(`    Extensions found: ${extensions.slice(0, 20).join(", ")}${extensions.length > 20 ? "..." : ""}`);
    console.log("");

    // Sample files from different extensions
    for (const ext of extensions.slice(0, 10)) {
      const filesWithExt = grf.getFilesByExtension?.(ext) || [];
      filesToTest.push(...filesWithExt.slice(0, Math.ceil(testCount / 10)));
    }

    // Add more random files if needed
    if (filesToTest.length < testCount) {
      const remaining = testCount - filesToTest.length;
      const step = Math.max(1, Math.floor(allFiles.length / remaining));
      for (let i = 0; i < allFiles.length && filesToTest.length < testCount; i += step) {
        if (!filesToTest.includes(allFiles[i])) {
          filesToTest.push(allFiles[i]);
        }
      }
    }

    console.log(`[2] Testing ${filesToTest.length} file reads...`);
    console.log("");

    let passed = 0;
    let failed = 0;
    const failures = [];

    for (let i = 0; i < filesToTest.length; i++) {
      const filename = filesToTest[i];

      if (i % 20 === 0 || i === filesToTest.length - 1) {
        const pct = ((i + 1) / filesToTest.length * 100).toFixed(1);
        process.stdout.write(`\r    Progress: ${i + 1}/${filesToTest.length} (${pct}%)`);
      }

      try {
        const result = await grf.getFile(filename);

        if (result.data && result.data.length > 0) {
          passed++;
        } else if (result.error) {
          failed++;
          if (failures.length < 20) {
            failures.push({ filename, error: result.error, size: 0 });
          }
        } else {
          // Empty file - still counts as success
          passed++;
        }
      } catch (e) {
        failed++;
        if (failures.length < 20) {
          failures.push({ filename, error: String(e?.message || e), size: 0 });
        }
      }
    }

    console.log("\n");
    console.log("=".repeat(70));
    console.log("RESULTS");
    console.log("=".repeat(70));
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Success rate: ${(passed / (passed + failed) * 100).toFixed(2)}%`);

    if (failures.length > 0) {
      console.log("");
      console.log("Failures:");
      for (const f of failures) {
        console.log(`  - ${f.filename}`);
        console.log(`    Error: ${f.error}`);
      }
    }

    console.log("");

    // Test specific file lookup
    console.log("[3] Testing path resolution...");

    // Test case-insensitive lookup
    if (allFiles.length > 0) {
      const testFile = allFiles[0];
      const upperCase = testFile.toUpperCase();
      const lowerCase = testFile.toLowerCase();

      const resolved1 = grf.resolvePath?.(upperCase);
      const resolved2 = grf.resolvePath?.(lowerCase);

      console.log(`    Original: ${testFile}`);
      console.log(`    Upper lookup: ${resolved1?.status || "N/A"}`);
      console.log(`    Lower lookup: ${resolved2?.status || "N/A"}`);
    }

    console.log("");

    // Test hasFile
    if (allFiles.length > 0) {
      const exists1 = grf.hasFile?.(allFiles[0]);
      const exists2 = grf.hasFile?.("nonexistent/file/path.txt");
      console.log(`    hasFile (exists): ${exists1}`);
      console.log(`    hasFile (not exists): ${exists2}`);
    }

    console.log("");

    if (failed === 0) {
      console.log("✅ All read tests passed!");
      process.exit(0);
    } else {
      console.log(`⚠️  ${failed} read tests failed`);
      process.exit(1);
    }

  } finally {
    closeSync(fd);
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
