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

/**
 * Search through the remote client, exactly as FileManager.search does: a POST to the remote client's
 * root with `filter=<regex.source>` -- the flags are dropped -- then the body decoded as ISO-8859-1 and
 * split on newlines.
 *
 * @returns {Promise<{ list: string[], res: Response, body: Buffer }>}
 */
async function clientSearch(base, regex, { route = '/' } = {}) {
  const res = await fetch(base + route, {
    method: 'POST',
    headers: { 'Content-type': 'application/x-www-form-urlencoded' },
    body: 'filter=' + encodeURIComponent(regex.source),
  });
  const body = Buffer.from(await res.arrayBuffer());
  return { list: windows1252.decode(body).split('\n'), res, body };
}

/**
 * The same search over an archive the client loaded itself (FileManager.search with local game files):
 * `table.data.match(regex)` over every name followed by a NUL, duplicates removed. This is the answer
 * the remote search must give.
 *
 * @param {Array<{ name: string }>} files the archive, in table order
 */
function localSearch(files, regex) {
  const tableData = files.map((file) => `${clientName(file.name)}\0`).join('');
  return Array.from(new Set(tableData.match(regex) || []));
}

// The patterns the viewers send, each built the way the viewer builds it -- copied, not paraphrased.

/** MapViewer.js: every map. */
const MAP_VIEWER = /data\\([^\0]+\.rsw)/gi;

/**
 * GrfViewer.js showDirectory(): the entries directly under a folder. The viewer always passes the folder
 * with a trailing slash -- 'data/' at the start, `${data-path}/` in onDirectoryClick -- and the pattern
 * depends on it.
 */
function grfViewerDirectory(path) {
  path = decodeURIComponent(path) || '/';
  path = path.replace(/\\/g, '/');
  if (path.substr(0, 1) === '/') path = path.substr(1);
  const directory = path.replace(/\//g, '\\\\');
  return new RegExp(`${directory}([^(\\0|\\\\)]+)`, 'gi');
}

/** GrfViewer.js search(): the search box. */
function grfViewerKeyword(keyword) {
  const escapedSearch = keyword.replace(/(\.|\\|\+|\*|\?|\[|\^|\]|\$|\(|\)|\{|\}|\=|\!|<|>|\||\:|\-)/g, '\\$1');
  return new RegExp(`data\\\\([^(\\0\\)]+)?${escapedSearch}([^(\\0|\\\\)]+)?`, 'gi');
}

module.exports = {
  clientName,
  clientUrlPath,
  urlPathFor,
  clientSearch,
  localSearch,
  MAP_VIEWER,
  grfViewerDirectory,
  grfViewerKeyword,
};
