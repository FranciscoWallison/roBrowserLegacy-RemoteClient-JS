#!/usr/bin/env node

/**
 * Doctor Command - Full system diagnosis
 * Run: npm run doctor
 */

require('dotenv').config();

const StartupValidator = require('./src/validators/startupValidator');

async function runDoctor() {
  console.log('\n╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    🏥 roBrowser Remote Client - Doctor                    ║');
  console.log('║                        System Diagnosis                                   ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

  const validator = new StartupValidator();
  const results = await validator.validateAll();

  // Print detailed report
  validator.printReport(results);

  // If there are errors, show fix instructions
  if (!results.success) {
    console.log('\n📖 FIX GUIDE:\n');

    // Check each error type and provide specific instructions
    const { details } = results;

    // Dependency errors
    if (details.dependencies && !details.dependencies.installed) {
      console.log('1️⃣  DEPENDENCIES NOT INSTALLED:');
      console.log('   Run: npm install');
      if (details.nodeVersion) {
        console.log(`   Versions: Node ${details.nodeVersion.node} | npm ${details.nodeVersion.npm}`);
      }
      console.log('');
    }

    // Environment variable errors
    if (details.env && !details.env.valid) {
      console.log('2️⃣  ENVIRONMENT VARIABLES:');
      console.log('   Create a .env file at the project root:');
      console.log('   ');
      console.log('   PORT=3338');
      console.log('   CLIENT_PUBLIC_URL=http://127.0.0.1:8000');
      console.log('   NODE_ENV=development');
      console.log('');
    }

    // Required files errors
    if (details.files && !details.files.valid) {
      console.log('3️⃣  REQUIRED FILES AND FOLDERS:');
      console.log('   Make sure these exist:');
      console.log('   - resources/');
      console.log('   - resources/DATA.INI');
      console.log('   - At least one .grf file in resources/');
      console.log('');
    }

    // GRF errors
    if (details.grfs && !details.grfs.valid) {
      console.log('4️⃣  INCOMPATIBLE GRF FILES:');
      console.log('   This project only supports GRF version 0x200 with no DES encryption.');
      console.log('');
      console.log('   📦 FIX: Repack with GRF Builder');
      console.log('   ');
      console.log('   1. Download GRF Builder (https://github.com/Tokeiburu/GRFEditor)');
      console.log('   2. Open your .grf file in GRF Builder');
      console.log('   3. Go to: File → Options → Repack type → Decrypt');
      console.log('   4. Click: Tools → Repack');
      console.log('   5. Wait for completion and replace the original file');
      console.log('');
      console.log('   This will convert it to version 0x200 without DES.');
      console.log('');
    }

    console.log('═'.repeat(80));
    console.log('💡 After fixing, run again: npm run doctor');
    console.log('═'.repeat(80) + '\n');

    process.exit(1);
  } else {
    console.log('🎉 System is configured correctly! You can start the server with: npm start\n');
    process.exit(0);
  }
}

// Run doctor
runDoctor().catch((error) => {
  console.error('\n❌ Error while running diagnosis:', error);
  process.exit(1);
});
