/**
 * DATA.INI: which GRF archives to load, and in what order.
 *
 * The one parser for the whole project -- the server, the startup validator, prepare.js and the tools
 * each used to carry their own, and they disagreed on comments, sections, ordering and extensions.
 *
 *   [Data]
 *   0=custom.grf
 *   1=data.grf
 *   2=D:\RO\rdata.grf
 *
 * - Only the [Data] section counts (case-insensitive). `;` and `#` start a comment line.
 * - Entries are ordered by their number, lowest first, and the lowest wins when two archives hold the
 *   same file -- the same priority roBrowser gives them (src/Core/FileManager.js). A number used twice
 *   keeps the last value, as in the client.
 * - A path may be absolute, so an archive can live on another drive; a relative one is resolved from
 *   the folder DATA.INI is in.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * @param {string} content
 * @returns {string[]} archive entries as written, in priority order
 */
function parseDataIni(content) {
  const byIndex = new Map();
  let inData = false;

  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;

    const section = line.match(/^\[\s*(.*?)\s*\]$/);
    if (section) {
      inData = section[1].toLowerCase() === 'data';
      continue;
    }
    if (!inData) continue;

    const entry = line.match(/^(\d+)\s*=\s*(.+)$/);
    if (entry) byIndex.set(Number(entry[1]), entry[2].trim());
  }

  return [...byIndex.entries()].sort((a, b) => a[0] - b[0]).map(([, value]) => value);
}

/** An archive entry as a full path: absolute as written, or relative to DATA.INI's folder. */
function resolveGrfPath(dataIniPath, entry) {
  return path.isAbsolute(entry) ? entry : path.resolve(path.dirname(dataIniPath), entry);
}

/**
 * Read DATA.INI and resolve its archives.
 *
 * @param {string} dataIniPath
 * @returns {{ entries: string[], grfPaths: string[] }} entries as written and as full paths, in
 *   priority order
 * @throws if DATA.INI cannot be read
 */
function readDataIni(dataIniPath) {
  const entries = parseDataIni(fs.readFileSync(dataIniPath, 'utf-8'));
  return { entries, grfPaths: entries.map((entry) => resolveGrfPath(dataIniPath, entry)) };
}

export { parseDataIni, resolveGrfPath, readDataIni };
