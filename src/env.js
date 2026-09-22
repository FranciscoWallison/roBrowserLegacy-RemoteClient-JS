/**
 * Load .env into process.env. Import this first, before any other module of the server.
 *
 * ES modules evaluate their imports before their own body, and several modules read the environment
 * as they load -- the logger and configs read NODE_ENV, the file cache its limits. Loading .env from the
 * body of index.js would run too late for all of them; as the first import it runs before any.
 *
 * Variables already set in the environment win over the file, so `NODE_ENV=production` from the shell
 * or from start-prod.js is not overridden. The file is looked up at the project root, whatever the
 * current directory, and is optional.
 */
import path from 'node:path';

try {
  process.loadEnvFile(path.join(import.meta.dirname, '..', '.env'));
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}
