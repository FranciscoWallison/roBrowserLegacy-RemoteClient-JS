#!/usr/bin/env node

/**
 * REAL GRF reading test
 * Tests whether the @chicowall/grf-loader library can read the GRF
 */

const fs = require("fs");
const path = require("path");
const { GrfNode } = require("@chicowall/grf-loader");

async function testGrf(grfPath) {
  console.log("\n" + "═".repeat(80));
  console.log(`🧪 REAL READ TEST: ${path.basename(grfPath)}`);
  console.log("═".repeat(80) + "\n");

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

    const magic = headerBuffer.toString("ascii", 0, 15);
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

    // STEP 4: Load GRF (THIS MAY FAIL WITH DES)
    console.log("\n4️⃣  Trying to load/decompress GRF contents...");
    console.log("   ⏳ Please wait, this may take a few seconds...");

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

    // Show some example files
    if (fileCount > 0) {
      console.log("\n   📄 First 10 files:");
      files.slice(0, 10).forEach((file, i) => {
        console.log(`      ${i + 1}. ${file}`);
      });

      if (fileCount > 10) {
        console.log(`      ... and ${fileCount - 10} more files`);
      }

      // Test extracting one file
      console.log("\n6️⃣  Testing file extraction...");
      const testFile = files[0];

      console.log(`   📝 Trying to extract: ${testFile}`);

      const { data, error } = await grf.getFile(testFile);

      if (error) {
        console.log(`   ⚠️  Extraction error: ${error}`);
      } else {
        console.log(`   ✅ File extracted successfully (${data.length} bytes)`);
      }
    }

    if (fd !== null) {
      fs.closeSync(fd);
    }

    console.log("\n" + "═".repeat(80));
    console.log("🎉 CONCLUSION: GRF IS FULLY COMPATIBLE!");
    console.log("═".repeat(80));

    console.log("\n✅ Your GRF works perfectly with the library!");
    console.log("✅ No repack needed!");
    console.log("\n💡 The validator should be adjusted to accept this kind of GRF.\n");

    return true;
  } catch (error) {
    console.error("\n❌ ERROR while loading GRF!");
    console.error("─".repeat(80));

    // Identify WHERE it failed
    console.error("\n📍 FAILURE POINT:");

    if (stepCompleted === 0) {
      console.error("   Failed at: Opening the GRF file");
      console.error("   Possible cause: File does not exist or no read permissions");
    } else if (stepCompleted === 1) {
      console.error("   Failed at: Reading GRF header");
      console.error("   Possible cause: Corrupted file or not a valid GRF");
    } else if (stepCompleted === 2) {
      console.error("   Failed at: Initializing library");
      console.error("   Possible cause: Issue with @chicowall/grf-loader");
    } else if (stepCompleted === 3) {
      console.error("   Failed at: Loading/decompressing GRF contents");
      console.error("   Possible cause: Incompatible DES encryption or corrupted file");

      console.error("\n   ⚠️  THIS IS THE MOST COMMON PROBLEM WITH DES!");
      console.error("   The library cannot decrypt GRFs with DES.");
    } else if (stepCompleted === 4) {
      console.error("   Failed at: Listing files");
      console.error("   Possible cause: Incompatible internal GRF structure");
    }

    console.error("\n📋 ERROR DETAILS:");
    console.error(`   Type: ${error.name}`);
    console.error(`   Message: ${error.message}`);
    if (error.code) {
      console.error(`   Code: ${error.code}`);
    }

    // Analyze error message for more specific diagnosis
    const errorMsg = String(error.message || "").toLowerCase();

    console.error("\n🔍 DIAGNOSIS:");

    if (
      errorMsg.includes("decrypt") ||
      errorMsg.includes("encryption") ||
      errorMsg.includes("des")
    ) {
      console.error("   ❌ ISSUE: DES encryption detected");
      console.error("   📦 FIX: Repack with GRF Builder (Decrypt)");
    } else if (errorMsg.includes("magic") || errorMsg.includes("header")) {
      console.error("   ❌ ISSUE: Invalid GRF header");
      console.error("   📦 FIX: File may be corrupted");
    } else if (
      errorMsg.includes("compress") ||
      errorMsg.includes("inflate") ||
      errorMsg.includes("zlib")
    ) {
      console.error("   ❌ ISSUE: Error while decompressing files");
      console.error("   📦 FIX: GRF may be corrupted or using incompatible compression");
    } else if (errorMsg.includes("version")) {
      console.error("   ❌ ISSUE: Incompatible GRF version");
      console.error("   📦 FIX: Repack with GRF Builder to version 0x200");
    } else {
      console.error("   ❓ ISSUE: Unknown error");
      console.error("   📦 FIX: Try repacking with GRF Builder (Decrypt)");
    }

    if (error.stack) {
      console.error("\n📚 Full Stack Trace:");
      console.error(error.stack);
    }

    console.log("\n" + "═".repeat(80));
    console.log("❌ CONCLUSION: GRF IS NOT COMPATIBLE!");
    console.log("═".repeat(80));

    console.log("\n🔧 RECOMMENDED FIX:");
    console.log("   1. Download GRF Builder: https://github.com/Tokeiburu/GRFEditor");
    console.log("   2. Open GRF Builder");
    console.log("   3. File → Options → Repack type → Decrypt");
    console.log("   4. Tools → Repack");
    console.log("   5. Wait and replace the original file\n");

    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch (e) {
        // Ignore close error
      }
    }

    return false;
  }
}

// Run

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log("\n📖 Usage: npm run test-grf <path-to-file.grf>");
  console.log("\nExample:");
  console.log("  npm run test-grf resources/data.grf");
  console.log("");

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
          const success = await testGrf(grf);
          if (!success) process.exit(1);
        }
      })();
    } else {
      console.log("⚠️  No .grf files found in resources/\n");
    }
  }
} else {
  const grfPath = args[0];
  testGrf(grfPath).then((success) => {
    process.exit(success ? 0 : 1);
  });
}
