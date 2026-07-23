import { isHex } from './brands';
import { ERROR_STRING_SELECTOR } from './constants';
import { getSelector, hexToUtf8, normalizeHex } from './hex';

/** Whether `data` is a Solidity `Error(string)` revert (selector `0x08c379a0`). */
export function isErrorStringRevert(data: string): boolean {
  return getSelector(data) === ERROR_STRING_SELECTOR;
}

/**
 * Decode the string argument of a Solidity `Error(string)` revert.
 *
 * Layout after the 4-byte selector: `offset (32 bytes) | length (32 bytes) | utf8 bytes`.
 * Returns `undefined` unless the payload is a well-formed `Error(string)`: whole-byte hex,
 * a safe in-bounds offset/length, enough bytes to cover the declared length (no silent
 * truncation), and valid UTF-8.
 */
export function decodeErrorString(data: string): string | undefined {
  const normalized = normalizeHex(data);
  if (!isHex(normalized)) return undefined;
  const hex = normalized.slice(2).toLowerCase();
  if (!hex.startsWith(ERROR_STRING_SELECTOR.slice(2))) return undefined;

  const body = hex.slice(8);
  // Need at least offset (64) + length (64) words.
  if (body.length < 128) return undefined;

  const offsetBytes = safeWord(body.slice(0, 64));
  // The string tuple is a single dynamic arg; its head offset is always 32 bytes.
  if (offsetBytes !== 32) return undefined;

  const lenStart = offsetBytes * 2;
  if (body.length < lenStart + 64) return undefined;

  const length = safeWord(body.slice(lenStart, lenStart + 64));
  if (length === undefined) return undefined;

  const strStart = lenStart + 64;
  // Reject truncated payloads: the body must actually carry `length` bytes.
  if (body.length < strStart + length * 2) return undefined;

  const strHex = body.slice(strStart, strStart + length * 2);
  try {
    return hexToUtf8(strHex, true);
  } catch {
    // Declared as `string` but not valid UTF-8 — treat as undecodable.
    return undefined;
  }
}

/** Parse a 32-byte word as a non-negative safe integer, or `undefined` if out of range. */
function safeWord(word: string): number | undefined {
  const n = Number.parseInt(word, 16);
  if (!Number.isSafeInteger(n) || n < 0) return undefined;
  return n;
}
