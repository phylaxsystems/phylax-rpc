/** Trim whitespace and ensure a leading `0x`. */
export function normalizeHex(value: string): string {
  const s = value.trim();
  if (s.startsWith('0x') || s.startsWith('0X')) return '0x' + s.slice(2);
  return '0x' + s;
}

/** The 4-byte selector (`0x` + 8 hex chars), lowercased, or `undefined` if too short. */
export function getSelector(data: string): string | undefined {
  const hex = normalizeHex(data).slice(2);
  if (hex.length < 8) return undefined;
  return ('0x' + hex.slice(0, 8)).toLowerCase();
}

/** Decode a hex byte string to a UTF-8 string. */
export function hexToUtf8(hex: string): string {
  const clean = hex.replace(/^0x/i, '');
  const len = Math.floor(clean.length / 2);
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

/** `1` → `"0x1"`. */
export function toHexChainId(chainId: number): string {
  return '0x' + chainId.toString(16);
}
