/**
 * The two spellings of a Korean GRF name, and the way back to Korean.
 */
import test from 'node:test';
import assert from 'node:assert';
import iconv from 'iconv-lite';
import { decodeMojibake, toLatin1 } from '../src/utils/mojibake.js';

// 똠테스트: its first byte, 0x8C, is a C1 control in Latin-1 and "Œ" in windows-1252.
const KOREAN = '똠테스트';
const BYTES = iconv.encode(KOREAN, 'cp949');
const LATIN1 = BYTES.toString('latin1');
const WINDOWS_1252 = new TextDecoder('windows-1252').decode(BYTES);

test('both spellings decode back to the Korean name', () => {
  assert.notStrictEqual(LATIN1, WINDOWS_1252);
  assert.strictEqual(decodeMojibake(LATIN1), KOREAN);
  assert.strictEqual(decodeMojibake(WINDOWS_1252), KOREAN);
});

test('toLatin1 rewrites the windows-1252 spelling into one character per byte', () => {
  assert.strictEqual(toLatin1(WINDOWS_1252), LATIN1);
  assert.strictEqual(toLatin1(LATIN1), LATIN1);
});

test('text that is not mojibake is left alone', () => {
  assert.strictEqual(decodeMojibake(KOREAN), KOREAN);
  assert.strictEqual(decodeMojibake('data/texture/basepic.bmp'), 'data/texture/basepic.bmp');
  assert.strictEqual(toLatin1(KOREAN), KOREAN);
});

test('U+FFFD is not mistaken for one of the bytes windows-1252 leaves undefined', () => {
  // iconv-lite decodes all five undefined bytes to U+FFFD, so none of them can be recovered from it.
  const replacement = String.fromCharCode(0xfffd);
  assert.strictEqual(toLatin1(replacement), replacement);
  assert.strictEqual(decodeMojibake(`a${replacement}`), `a${replacement}`);
});
