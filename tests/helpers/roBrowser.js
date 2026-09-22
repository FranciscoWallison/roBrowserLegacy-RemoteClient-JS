/**
 * What the roBrowser client does, reproduced for tests.
 *
 * The server's contract is whatever the client actually sends and expects, so these follow the client's
 * code line by line (roBrowserLegacy, src/Core/FileManager.js and src/Loaders/GameFile.js). A server that
 * only handles its own idea of a request passes its tests and fails the real client.
 */
const iconv = require('iconv-lite');

// The client reads GRF names as windows-1252 (CodepageManager, its default charset), and the browser
// decodes a search response labelled ISO-8859-1 as windows-1252 too -- the Encoding Standard makes the
// two labels synonyms. Node's TextDecoder follows the same standard.
const windows1252 = new TextDecoder('windows-1252');

// Bytes windows-1252 leaves undefined: the client's iconv-lite turns them into U+FFFD, the browser into
// C1 controls. The client itself cannot round-trip them, so a test name that contains one proves nothing.
const UNDEFINED_1252 = new Set([0x81, 0x8d, 0x8f, 0x90, 0x9d]);

/** A GRF name as the client holds it: its CP949 bytes, decoded as windows-1252. */
function clientName(name) {
  const bytes = iconv.encode(name, 'cp949');
  if (bytes.some((b) => UNDEFINED_1252.has(b))) {
    throw new Error(`"${name}" has a CP949 byte windows-1252 leaves undefined; pick another test name`);
  }
  return windows1252.decode(bytes);
}

/**
 * The URL path the client requests for a name it holds (FileManager.getHTTP): backslashes become
 * slashes, then encodeURIComponent on each segment.
 */
function urlPathFor(clientSideName) {
  return '/' + clientSideName.replace(/\\/g, '/').replace(/[^/]+/g, (segment) => encodeURIComponent(segment));
}

/** The URL path the client requests for a GRF name. */
function clientUrlPath(name) {
  return urlPathFor(clientName(name));
}

module.exports = { clientName, clientUrlPath, urlPathFor };
