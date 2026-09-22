/**
 * @chicowall/grf-loader, in one place.
 *
 * Korean names only decode correctly when the loader has iconv-lite: `TextDecoder('euc-kr')` in Node
 * does not know CP949's extension syllables, and a name using one comes out as a C1 control or U+FFFD --
 * on the bRO data.grf, 13 names the client could no longer reach. Until 1.2.0 the package's ES module
 * build lost iconv-lite silently, so this file loaded the CommonJS build through `createRequire`; that
 * build is fixed, and tests/grf-loader.test.js pins the behaviour whichever build resolves here.
 */
import * as grfLoader from '@chicowall/grf-loader';

export const { GrfNode } = grfLoader;
export default grfLoader;
