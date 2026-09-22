/**
 * @chicowall/grf-loader, loaded through its CommonJS build -- never `import ... from` it.
 *
 * Imported from an ES module, the package resolves to its ESM build, and that build silently loses
 * iconv-lite: the bundler's shim looks for a global `require`, which ES modules do not have, so the
 * loader falls back to TextDecoder('euc-kr'), which does not know CP949's extension syllables. Measured
 * on the bRO data.grf, 13 names came out wrong -- C1 control characters, U+FFFD in 4 of them -- assets
 * the client can no longer reach. The CommonJS build loads iconv-lite normally. tests/grf-loader.test.js
 * pins this.
 *
 * Every module that needs the loader imports it from here.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const grfLoader = require('@chicowall/grf-loader');

export const { GrfNode } = grfLoader;
export default grfLoader;
