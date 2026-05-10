export function concat(...buffers: (Uint8Array | number[])[]): Uint8Array {
  const size = buffers.reduce((size, buffer) => size + buffer.length, 0);
  const result = new Uint8Array(size);

  let offset = 0;
  for (const buffer of buffers) {
    result.set(buffer, offset);
    offset += buffer.length;
  }

  return result;
}

export function encodeAscii(data: string): Uint8Array {
  const array = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) array[i] = data.charCodeAt(i);
  return array;
}

export function encodeU32(u32: number): Uint8Array {
  const b3 = (u32 >>> 24) & 0xff;
  const b2 = (u32 >>> 16) & 0xff;
  const b1 = (u32 >>> 8) & 0xff;
  const b0 = (u32 >>> 0) & 0xff;
  return new Uint8Array([b3, b2, b1, b0]);
}

export function* iterateBytes(data: Uint8Array): Generator<Uint8Array, void> {
  for (let i = 0; i < data.length; i++) {
    yield data.subarray(i, i + 1);
  }
}
