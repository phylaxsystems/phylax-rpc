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
 * Returns `undefined` if `data` is not an `Error(string)` payload or is malformed.
 */
export function decodeErrorString(data: string): string | undefined {
  const hex = normalizeHex(data).slice(2).toLowerCase();
  if (!hex.startsWith(ERROR_STRING_SELECTOR.slice(2))) return undefined;

  const body = hex.slice(8);
  // Need at least offset (64) + length (64) words.
  if (body.length < 128) return undefined;

  const offsetBytes = Number.parseInt(body.slice(0, 64), 16);
  if (!Number.isFinite(offsetBytes) || offsetBytes < 0) return undefined;

  const lenStart = offsetBytes * 2;
  if (body.length < lenStart + 64) return undefined;

  const length = Number.parseInt(body.slice(lenStart, lenStart + 64), 16);
  if (!Number.isFinite(length) || length < 0) return undefined;

  const strStart = lenStart + 64;
  // Decode up to `length` bytes, tolerating truncated data.
  const strHex = body.slice(strStart, strStart + length * 2);
  return hexToUtf8(strHex);
}
