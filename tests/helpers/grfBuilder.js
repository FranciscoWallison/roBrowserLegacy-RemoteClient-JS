/**
 * Write a minimal GRF 0x200 archive, for tests.
 *
 * Lets a test put arbitrary file names in an archive -- including Korean names stored as CP949 bytes,
 * which is what real client archives contain -- without shipping any Ragnarok assets. The layout
 * follows roBrowserLegacy's src/Loaders/GameFile.js and the validator:
 *
 *   header (46 bytes)   "Master of Magic" NUL, 14-byte zero key, u32 tableOffset, u32 seed,
 *                       u32 nFiles (= count + seed + 7), u32 version 0x200
 *   file bodies         zlib, back to back
 *   table header        u32 packSize, u32 realSize
 *   table (zlib)        per entry: name bytes, NUL, u32 packSize, u32 lengthAligned, u32 realSize,
 *                       u8 flags (0x01 = file), u32 offset
 *
 * Both tableOffset and each entry's offset are relative to the end of the header.
 */
import fs from 'fs';
import zlib from 'zlib';
import iconv from 'iconv-lite';

const HEADER_SIZE = 46;

/**
 * @param {string} outPath where to write the .grf
 * @param {Array<{ name: string|Buffer, content: Buffer|string }>} files names use backslashes, as in
 *   real archives; a string is stored as CP949 bytes, a Buffer as the bytes themselves -- for names no
 *   encoder produces, which real archives do contain
 */
function buildGrf(outPath, files) {
  const bodies = [];
  const entries = [];
  let cursor = 0; // relative to the end of the header

  for (const file of files) {
    const content = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content);
    const packed = zlib.deflateSync(content);
    // The loader treats packSize === realSize as a stored (uncompressed) entry and would hand back the
    // deflated bytes verbatim. Tests must use payloads that deflate to a different length.
    if (packed.length === content.length) {
      throw new Error(`grfBuilder: "${file.name}" deflates to its own length; use a different payload`);
    }
    bodies.push(packed);
    const name = Buffer.isBuffer(file.name) ? file.name : iconv.encode(file.name, 'cp949');
    entries.push({ name, packed, realSize: content.length, offset: cursor });
    cursor += packed.length;
  }

  const tableParts = [];
  for (const e of entries) {
    const meta = Buffer.alloc(17);
    meta.writeUInt32LE(e.packed.length, 0);
    meta.writeUInt32LE(e.packed.length, 4);
    meta.writeUInt32LE(e.realSize, 8);
    meta.writeUInt8(0x01, 12);
    meta.writeUInt32LE(e.offset, 13);
    tableParts.push(e.name, Buffer.from([0]), meta);
  }
  const table = Buffer.concat(tableParts);
  const packedTable = zlib.deflateSync(table);

  const tableHeader = Buffer.alloc(8);
  tableHeader.writeUInt32LE(packedTable.length, 0);
  tableHeader.writeUInt32LE(table.length, 4);

  const header = Buffer.alloc(HEADER_SIZE);
  header.write('Master of Magic\0', 0, 'ascii');
  header.writeUInt32LE(cursor, 30); // table follows the bodies
  header.writeUInt32LE(0, 34); // seed
  header.writeUInt32LE(files.length + 7, 38);
  header.writeUInt32LE(0x200, 42);

  fs.writeFileSync(outPath, Buffer.concat([header, ...bodies, tableHeader, packedTable]));
}

export { buildGrf };
