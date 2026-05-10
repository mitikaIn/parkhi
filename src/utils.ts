export function parseU32(b3: number, b2: number, b1: number, b0: number): number {
  const l3 = b3 << 24;
  const l2 = b2 << 16;
  const l1 = b1 << 8;
  const l0 = b0 << 0;
  const u32 = (l3 | l2 | l1 | l0) >>> 0;
  return u32;
}

const ASCII = new TextDecoder("ascii", { fatal: true });
const UTF_8 = new TextDecoder("utf-8", { fatal: true });
const UTF_16_BE = new TextDecoder("utf-16be", { fatal: true });
const UTF_16_LE = new TextDecoder("utf-16le", { fatal: true });

export function decodeAscii(data: Uint8Array): string {
  return ASCII.decode(data);
}

export function decodeUtf8(data: Uint8Array): string {
  return UTF_8.decode(data);
}

export function decodeUtf16Be(data: Uint8Array): string {
  return UTF_16_BE.decode(data);
}

export function decodeUtf16Le(data: Uint8Array): string {
  return UTF_16_LE.decode(data);
}

export function decodeUtf(data: Uint8Array): string {
  if (data[0] == 0xfe && data[1] == 0xff) return UTF_16_BE.decode(data);
  if (data[0] == 0xff && data[1] == 0xfe) return UTF_16_LE.decode(data);
  if (data[0] == 0xef && data[1] == 0xbb && data[2] == 0xbf) return UTF_8.decode(data);
  return UTF_8.decode(data);
}
