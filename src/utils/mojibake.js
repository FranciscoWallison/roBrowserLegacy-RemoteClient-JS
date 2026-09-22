/**
 * Korean GRF names as roBrowser spells them.
 *
 * GRF archives store names as CP949 bytes. The client never decodes them as Korean: it holds each byte
 * as one character ("mojibake" -- "유저인터페이스" becomes "À¯ÀúÀÎÅÍÆäÀÌ½º") and builds URLs and search
 * patterns from that. Bytes 0xA0-0xFF are the same character whichever way they are read, but bytes
 * 0x80-0x9F are not: Latin-1 gives the C1 controls U+0080-U+009F, windows-1252 gives printable characters
 * ('Œ' for 0x8C, 'Ÿ' for 0x9F). And the client reads them as windows-1252 -- both its CodepageManager and
 * the browser, which decodes a response labelled ISO-8859-1 as windows-1252 because the Encoding Standard
 * makes the two labels synonyms.
 *
 * So one CP949 byte in that range can reach this server spelled two ways. In the bRO data.grf, 13 names
 * contain such a byte -- "똠양꿍.spr" is "Œc¾ç²á.spr" -- and they were unreachable in the windows-1252
 * spelling.
 */
import iconv from 'iconv-lite';

/**
 * The printable windows-1252 characters for bytes 0x80-0x9F, mapped back to their byte. The five bytes
 * windows-1252 leaves undefined (0x81, 0x8D, 0x8F, 0x90, 0x9D) decode to U+FFFD in iconv-lite and to the
 * C1 control in a browser; the C1 control is already its own byte, and U+FFFD has no byte to go back to.
 */
const REPLACEMENT_CHARACTER = 0xfffd;
const WINDOWS_1252_TO_BYTE = new Map();
for (let byte = 0x80; byte <= 0x9f; byte++) {
  const char = iconv.decode(Buffer.from([byte]), 'windows-1252');
  const code = char.charCodeAt(0);
  if (code > 0xff && code !== REPLACEMENT_CHARACTER) WINDOWS_1252_TO_BYTE.set(char, byte);
}

/**
 * The bytes a mojibake string stands for, or null if it holds a character no single byte maps to -- real
 * Korean, for instance, which means the string was never mojibake.
 *
 * @param {string} str
 * @returns {Buffer|null}
 */
function toBytes(str) {
  const bytes = Buffer.alloc(str.length);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code <= 0xff) {
      bytes[i] = code;
      continue;
    }
    const byte = WINDOWS_1252_TO_BYTE.get(str[i]);
    if (byte === undefined) return null;
    bytes[i] = byte;
  }
  return bytes;
}

/**
 * Rewrite the windows-1252 spelling into the Latin-1 one, one character per byte. Characters that stand
 * for no byte are left alone.
 *
 * @param {string} str
 * @returns {string}
 */
function toLatin1(str) {
  return str.replace(/[^\x00-\xff]/g, (char) => {
    const byte = WINDOWS_1252_TO_BYTE.get(char);
    return byte === undefined ? char : String.fromCharCode(byte);
  });
}

/**
 * Turn mojibake back into Korean: "À¯ÀúÀÎÅÍÆäÀÌ½º" -> "유저인터페이스". Accepts either spelling. A string
 * that is not mojibake comes back unchanged.
 *
 * @param {string} str
 * @returns {string}
 */
function decodeMojibake(str) {
  const bytes = toBytes(str);
  return bytes ? iconv.decode(bytes, 'cp949') : str;
}

export { decodeMojibake, toLatin1 };
