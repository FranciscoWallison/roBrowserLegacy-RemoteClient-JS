/**
 * Path segments Windows would reinterpret instead of treating as a name.
 *
 * AutoExtract turns a request path into a file name, so on Windows a request could name something
 * that is not a file: `nul.txt` is the NUL device just as much as `nul` is, `x.txt:stream` writes to
 * an alternate data stream of x.txt, and a trailing dot or space is silently dropped, so two different
 * requests would write one file. None of these can occur in a real asset name: CP949 bytes read as
 * one character each are either ASCII letters or characters above U+007F. The rule is from
 * Flux159/roBrowserLegacy-RemoteClient-Rust (src/util.rs).
 */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * @param {string} requestPath slash- or backslash-separated
 * @param {string} [platform] process.platform by default; elsewhere these are ordinary names
 * @returns {boolean} false when some segment is one Windows would reinterpret
 */
function isSafeFileName(requestPath, platform = process.platform) {
  if (platform !== 'win32') return true;

  return requestPath.split(/[\\/]/).every((segment) => {
    if (segment === '') return true;
    if (/[<>:"|?*\x00-\x1f]/.test(segment)) return false;
    if (/[. ]$/.test(segment)) return false;
    return !RESERVED.test(segment.split('.')[0]);
  });
}

export { isSafeFileName };
