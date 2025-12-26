const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

/**
 * Startup validation system
 * Validates resources, configuration and dependencies before starting the server
 */
class StartupValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.info = [];
    this.validationResults = {
      grfs: null,
      files: null,
      env: null,
      dependencies: null,
      nodeVersion: null,
    };
  }

  addError(message) {
    this.errors.push(message);
  }

  addWarning(message) {
    this.warnings.push(message);
  }

  addInfo(message) {
    this.info.push(message);
  }

  validateNodeVersion() {
    try {
      const nodeVersion = process.version;
      const npmVersion = execSync("npm --version", {
        encoding: "utf-8",
      }).trim();

      this.validationResults.nodeVersion = {
        node: nodeVersion,
        npm: npmVersion,
        valid: true,
      };

      this.addInfo(`Node.js: ${nodeVersion}`);
      this.addInfo(`npm: ${npmVersion}`);

      const majorVersion = parseInt(
        nodeVersion.replace("v", "").split(".")[0],
        10
      );
      if (majorVersion < 14) {
        this.addWarning(
          `Node.js version ${nodeVersion} may be too old. Recommended: v14 or newer`
        );
      }

      return true;
    } catch (error) {
      this.addError(`Failed to check Node.js/npm version: ${error.message}`);
      this.validationResults.nodeVersion = {
        valid: false,
        error: error.message,
      };
      return false;
    }
  }

  validateDependencies() {
    const nodeModulesPath = path.join(process.cwd(), "node_modules");
    const packageJsonPath = path.join(process.cwd(), "package.json");

    if (!fs.existsSync(packageJsonPath)) {
      this.addError("package.json not found!");
      this.validationResults.dependencies = {
        installed: false,
        reason: "package.json missing",
      };
      return false;
    }

    if (!fs.existsSync(nodeModulesPath)) {
      const nodeVersion = this.validationResults.nodeVersion;
      const versionInfo = nodeVersion
        ? `\n  Node.js: ${nodeVersion.node}\n  npm: ${nodeVersion.npm}`
        : "";

      this.addError(`Dependencies not installed!\nRun: npm install${versionInfo}`);
      this.validationResults.dependencies = {
        installed: false,
        reason: "node_modules missing",
      };
      return false;
    }

    // Check essential dependencies
    const requiredDeps = ["express", "cors", "@chicowall/grf-loader"];
    const missingDeps = [];

    for (const dep of requiredDeps) {
      const depPath = path.join(nodeModulesPath, dep);
      if (!fs.existsSync(depPath)) {
        missingDeps.push(dep);
      }
    }

    if (missingDeps.length > 0) {
      this.addError(
        `Missing essential dependencies: ${missingDeps.join(", ")}\nRun: npm install`
      );
      this.validationResults.dependencies = { installed: false, missingDeps };
      return false;
    }

    this.addInfo("Dependencies installed correctly");
    this.validationResults.dependencies = { installed: true };
    return true;
  }

  /**
   * Validate GRF files (version 0x200 with no DES encryption)
   */
  async validateGrfs() {
    const resourcesPath = path.join(process.cwd(), "resources");
    const dataIniPath = path.join(resourcesPath, "DATA.INI");

    if (!fs.existsSync(dataIniPath)) {
      this.addError("resources/DATA.INI not found!");
      this.validationResults.grfs = {
        valid: false,
        reason: "DATA.INI missing",
      };
      return false;
    }

    const dataIniContent = fs.readFileSync(dataIniPath, "utf-8");
    const grfFiles = this.parseDataINI(dataIniContent);

    if (grfFiles.length === 0) {
      this.addError("No GRF files found in resources/DATA.INI!");
      this.validationResults.grfs = {
        valid: false,
        reason: "No GRF files in DATA.INI",
      };
      return false;
    }

    const grfResults = [];
    let hasInvalidGrf = false;

    for (const grfFile of grfFiles) {
      const grfPath = path.join(resourcesPath, grfFile);

      if (!fs.existsSync(grfPath)) {
        this.addError(`GRF not found: ${grfFile}`);
        grfResults.push({ file: grfFile, exists: false });
        hasInvalidGrf = true;
        continue;
      }

      const validation = await this.validateGrfFormat(grfPath);
      grfResults.push({ file: grfFile, exists: true, ...validation });

      if (!validation.valid) {
        let errorMsg = `Incompatible GRF: ${grfFile}\n`;

        if (
          validation.version &&
          validation.version !== "0x200" &&
          validation.version !== "unknown"
        ) {
          errorMsg += `  ❌ Version: ${validation.version} (expected: 0x200)\n`;
        }

        errorMsg += `  ❌ ${validation.reason}\n`;

        errorMsg += `\n  📦 FIX: Repack with GRF Builder:\n`;
        errorMsg += `  1. Download GRF Builder: https://github.com/Tokeiburu/GRFEditor\n`;
        errorMsg += `  2. Open GRF Builder\n`;
        errorMsg += `  3. File → Options → Repack type → Decrypt\n`;
        errorMsg += `  4. Click: Tools → Repack\n`;
        errorMsg += `  5. Wait for completion and replace the original file`;

        this.addError(errorMsg);
        hasInvalidGrf = true;
      } else {
        this.addInfo(
          `Valid GRF: ${grfFile} (version 0x200, compatible with the library)`
        );
      }
    }

    this.validationResults.grfs = {
      valid: !hasInvalidGrf,
      files: grfResults,
      count: grfFiles.length,
    };

    return !hasInvalidGrf;
  }

  parseDataINI(content) {
    const lines = content.split("\n");
    const grfFiles = [];
    let inDataSection = false;

    for (let line of lines) {
      line = line.trim();

      if (!line || line.startsWith(";") || line.startsWith("#")) continue;

      if (line.toLowerCase() === "[data]") {
        inDataSection = true;
        continue;
      }

      if (line.startsWith("[") && line.endsWith("]")) {
        inDataSection = false;
        continue;
      }

      if (inDataSection && line.includes("=")) {
        const parts = line.split("=");
        const value = parts.slice(1).join("=");
        if (value && value.trim().toLowerCase().endsWith(".grf")) {
          grfFiles.push(value.trim());
        }
      }
    }

    return grfFiles;
  }

  /**
   * Validate GRF file format
   * Tests whether @chicowall/grf-loader can actually load the GRF
   */
  async validateGrfFormat(grfPath) {
    const { GrfNode } = require("@chicowall/grf-loader");

    let fd = null;

    try {
      // Open file
      fd = fs.openSync(grfPath, "r");

      // Read header to check version
      const buffer = Buffer.alloc(46);
      fs.readSync(fd, buffer, 0, 46, 0);

      // Magic bytes
      const magic = buffer.toString("ascii", 0, 15);

      if (magic !== "Master of Magic") {
        if (fd) fs.closeSync(fd);
        return {
          valid: false,
          version: "unknown",
          compatible: false,
          reason: "Invalid magic bytes - not a valid GRF file",
        };
      }

      // Version
      const version = buffer.readUInt32LE(42);
      const versionHex = "0x" + version.toString(16).toUpperCase();

      // Check version
      if (version !== 0x200) {
        if (fd) fs.closeSync(fd);
        return {
          valid: false,
          version: versionHex,
          compatible: false,
          reason: `Version ${versionHex} is not supported (expected: 0x200)`,
        };
      }

      // REAL TEST: try to load using the library
      const testFd = fs.openSync(grfPath, "r");
      const grf = new GrfNode(testFd);

      try {
        // Try loading (10s timeout)
        const loadPromise = grf.load();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("GRF load timeout")), 10000)
        );

        await Promise.race([loadPromise, timeoutPromise]);

        // If we got here, the GRF is compatible
        fs.closeSync(testFd);
        if (fd) fs.closeSync(fd);

        return {
          valid: true,
          version: versionHex,
          compatible: true,
          reason: "GRF loaded successfully by the library",
        };
      } catch (loadError) {
        // Failed to load - incompatible
        fs.closeSync(testFd);
        if (fd) fs.closeSync(fd);

        return {
          valid: false,
          version: versionHex,
          compatible: false,
          reason: `Library failed to load: ${loadError.message}`,
        };
      }
    } catch (error) {
      if (fd) {
        try {
          fs.closeSync(fd);
        } catch (e) {}
      }

      return {
        valid: false,
        version: "error",
        compatible: false,
        reason: `Failed to validate GRF: ${error.message}`,
      };
    }
  }

  validateRequiredFiles() {
    const checks = [
      { path: "resources", type: "dir", required: true, name: "resources/ folder" },
      { path: "resources/DATA.INI", type: "file", required: true, name: "DATA.INI file" },
      { path: "BGM", type: "dir", required: false, name: "BGM/ folder" },
      { path: "data", type: "dir", required: false, name: "data/ folder" },
      { path: "System", type: "dir", required: false, name: "System/ folder" },
    ];

    let hasErrors = false;
    const results = [];

    for (const check of checks) {
      const fullPath = path.join(process.cwd(), check.path);
      const exists = fs.existsSync(fullPath);

      if (check.type === "dir") {
        const isEmpty = exists
          ? fs.readdirSync(fullPath).filter((f) => !f.startsWith("add-")).length === 0
          : true;

        results.push({ ...check, exists, isEmpty });

        if (check.required && !exists) {
          this.addError(`${check.name} not found!`);
          hasErrors = true;
        } else if (check.required && isEmpty) {
          this.addWarning(`${check.name} is empty`);
        } else if (!check.required && isEmpty) {
          this.addWarning(`${check.name} is empty - may cause issues depending on the client`);
        } else {
          this.addInfo(`${check.name} OK`);
        }
      } else {
        results.push({ ...check, exists });

        if (check.required && !exists) {
          this.addError(`${check.name} not found!`);
          hasErrors = true;
        } else if (exists) {
          this.addInfo(`${check.name} OK`);
        }
      }
    }

    this.validationResults.files = { valid: !hasErrors, checks: results };
    return !hasErrors;
  }

  validateEnvironment() {
    const envVars = {
      PORT: { value: process.env.PORT, default: "3338", required: false },
      CLIENT_PUBLIC_URL: { value: process.env.CLIENT_PUBLIC_URL, default: null, required: true },
      NODE_ENV: { value: process.env.NODE_ENV, default: "development", required: false },
    };

    let hasErrors = false;
    const results = {};

    if (!envVars.PORT.value) {
      this.addWarning(`PORT not set, using default: ${envVars.PORT.default}`);
      results.PORT = { defined: false, usingDefault: true, value: envVars.PORT.default };
    } else {
      this.addInfo(`PORT: ${envVars.PORT.value}`);
      results.PORT = { defined: true, value: envVars.PORT.value };
    }

    if (!envVars.CLIENT_PUBLIC_URL.value) {
      this.addError('CLIENT_PUBLIC_URL not set! Configure it in the .env file');
      hasErrors = true;
      results.CLIENT_PUBLIC_URL = { defined: false, error: "Variable not set" };
    } else {
      try {
        new URL(envVars.CLIENT_PUBLIC_URL.value);
        this.addInfo(`CLIENT_PUBLIC_URL: ${envVars.CLIENT_PUBLIC_URL.value}`);
        results.CLIENT_PUBLIC_URL = { defined: true, value: envVars.CLIENT_PUBLIC_URL.value };
      } catch {
        this.addError(`Invalid CLIENT_PUBLIC_URL: ${envVars.CLIENT_PUBLIC_URL.value}`);
        hasErrors = true;
        results.CLIENT_PUBLIC_URL = {
          defined: true,
          invalid: true,
          value: envVars.CLIENT_PUBLIC_URL.value,
        };
      }
    }

    const nodeEnv = envVars.NODE_ENV.value || envVars.NODE_ENV.default;
    results.NODE_ENV = { defined: !!envVars.NODE_ENV.value, value: nodeEnv };

    if (nodeEnv === "production") {
      const configs = require("../config/configs");
      if (configs.DEBUG) {
        this.addWarning("DEBUG is enabled in PRODUCTION!");
      }
    }

    if (!envVars.NODE_ENV.value) {
      this.addWarning(`NODE_ENV not set, using: ${nodeEnv}`);
    } else {
      this.addInfo(`NODE_ENV: ${nodeEnv}`);
    }

    const envPath = path.join(process.cwd(), ".env");
    const envExamplePath = path.join(process.cwd(), ".env.example");
    if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
      this.addWarning(".env file not found! Copy .env.example to .env and configure it");
    }

    this.validationResults.env = { valid: !hasErrors, variables: results };
    return !hasErrors;
  }

  async validateAll() {
    console.log("\n🔍 Validating startup configuration...\n");

    this.validateNodeVersion();

    const depsValid = this.validateDependencies();
    if (!depsValid) return this.getResults();

    this.validateRequiredFiles();
    this.validateEnvironment();
    await this.validateGrfs();

    return this.getResults();
  }

  getResults() {
    return {
      success: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      info: this.info,
      details: this.validationResults,
    };
  }

  _printMultiline(prefix, text) {
    for (const line of String(text).split("\n")) {
      console.log(prefix + line);
    }
  }

  printReport(results = null) {
    if (!results) results = this.getResults();

    console.log("\n" + "=".repeat(80));
    console.log("📋 VALIDATION REPORT");
    console.log("=".repeat(80) + "\n");

    if (results.info.length > 0) {
      console.log("✓ INFO:");
      results.info.forEach((msg) => this._printMultiline("  ", msg));
      console.log("");
    }

    if (results.warnings.length > 0) {
      console.log("⚠️  WARNINGS:");
      results.warnings.forEach((msg) => this._printMultiline("  ", msg));
      console.log("");
    }

    if (results.errors.length > 0) {
      console.log("❌ ERRORS:");
      results.errors.forEach((msg) => this._printMultiline("  ", msg));
      console.log("");
    }

    console.log("=".repeat(80));
    if (results.success) {
      console.log("✅ Validation completed successfully!");
      if (results.warnings.length > 0) {
        console.log(`⚠️  ${results.warnings.length} warning(s) found`);
      }
    } else {
      console.log("❌ Validation failed!");
      console.log(`   ${results.errors.length} error(s) found`);
      console.log('\n💡 Tip: Run "npm run doctor" for a detailed diagnosis');
    }
    console.log("=".repeat(80) + "\n");

    return results.success;
  }

  getStatusJSON() {
    const results = this.getResults();
    return {
      timestamp: new Date().toISOString(),
      status: results.success ? "ok" : "error",
      hasWarnings: results.warnings.length > 0,
      summary: {
        errors: results.errors.length,
        warnings: results.warnings.length,
        info: results.info.length,
      },
      details: results.details,
      messages: {
        errors: results.errors,
        warnings: results.warnings,
        info: results.info,
      },
    };
  }
}

module.exports = StartupValidator;
