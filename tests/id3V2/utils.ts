import { concat, encodeAscii, encodeU32 } from "../utils.ts";

function encodeSyncSafeSize(size: number): Uint8Array {
  const b3 = (size >> 21) & 0b01111111;
  const b2 = (size >> 14) & 0b01111111;
  const b1 = (size >> 7) & 0b01111111;
  const b0 = (size >> 0) & 0b01111111;
  return new Uint8Array([b3, b2, b1, b0]);
}

export async function compressData(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();

  await writer.write(data as Uint8Array<ArrayBuffer>);
  await writer.close();

  const buffer = await new Response(cs.readable).arrayBuffer();
  return new Uint8Array(buffer);
}

export function unsynchronise(data: Uint8Array): Uint8Array {
  const ffsCount = data.reduce((count, value) => (value == 0xff ? count + 1 : count), 0);
  const result = new Uint8Array(data.length + ffsCount);

  let i = 0;
  for (const value of data) {
    result[i] = value;
    i += 1;
    if (value == 0xff) {
      result[i] = 0x00;
      i += 1;
    }
  }

  return result;
}

export function makeV23FrameHeader(
  id: string,
  size: number,
  { hasCompression = false, hasEncryption = false, hasGroupingIdentity = false } = {},
): Uint8Array {
  const idData = encodeAscii(id);
  const sizeData = encodeU32(size);

  let flags = 0x00;
  if (hasCompression) flags |= 0b10000000;
  if (hasEncryption) flags |= 0b01000000;
  if (hasGroupingIdentity) flags |= 0b00100000;

  const header = concat(idData, sizeData, new Uint8Array([0x00, flags]));

  return header;
}

export async function makeV23FrameBody(
  data: Uint8Array,
  { compress = false, encrypt = false, addGroupingIdentity = false } = {},
): Promise<Uint8Array> {
  let uncompressedSize = new Uint8Array(0);
  if (compress) {
    uncompressedSize = encodeU32(data.length) as Uint8Array<ArrayBuffer>;
    data = await compressData(data);
  }

  let encryptionId = new Uint8Array(0);
  if (encrypt) data = new Uint8Array(data.length);

  let groupingIdentity = new Uint8Array(0);
  if (addGroupingIdentity) groupingIdentity = new Uint8Array(4);

  const body = concat(uncompressedSize, encryptionId, groupingIdentity, data);
  return body;
}

export async function makeV23Frame(
  id: string,
  data: Uint8Array,
  { compress = false, encrypt = false, addGroupingIdentity = false } = {},
): Promise<Uint8Array> {
  const body = await makeV23FrameBody(data, { compress, encrypt, addGroupingIdentity });
  const header = makeV23FrameHeader(id, body.length, {
    hasCompression: compress,
    hasEncryption: encrypt,
    hasGroupingIdentity: addGroupingIdentity,
  });
  const frame = concat(header, body);

  return frame;
}

export function makeV24FrameHeader(
  id: string,
  size: number,
  {
    hasGroupingIdentity = false,
    hasCompression = false,
    hasEncryption = false,
    hasUnsynchronisation = false,
  } = {},
): Uint8Array {
  const idData = encodeAscii(id);
  const sizeData = encodeU32(size);

  let flags = 0x00;
  if (hasGroupingIdentity) flags |= 0b01000000;
  if (hasCompression) flags |= 0b00001000;
  if (hasEncryption) flags |= 0b00000100;
  if (hasUnsynchronisation) flags |= 0b00000010;
  if (hasCompression || hasEncryption || hasUnsynchronisation) flags |= 0b00000001;

  const header = concat(idData, sizeData, new Uint8Array([0x00, flags]));

  return header;
}

export async function makeV24FrameBody(
  data: Uint8Array,
  { addGroupingIdentity = false, compress = false, encrypt = false, doUnsynchronise = false } = {},
): Promise<Uint8Array> {
  let dataLengthIndicator = new Uint8Array(0);
  if (compress || encrypt || doUnsynchronise)
    dataLengthIndicator = encodeSyncSafeSize(data.length) as Uint8Array<ArrayBuffer>;

  let groupingIdentity = new Uint8Array(0);
  if (addGroupingIdentity) groupingIdentity = new Uint8Array(4);

  if (compress) data = await compressData(data);

  let encryptionId = new Uint8Array(0);
  if (encrypt) data = new Uint8Array(data.length);

  if (doUnsynchronise) data = unsynchronise(data);

  const body = concat(groupingIdentity, encryptionId, dataLengthIndicator, data);

  return body;
}

export async function makeV24Frame(
  id: string,
  data: Uint8Array,
  { addGroupingIdentity = false, compress = false, encrypt = false, doUnsynchronise = false } = {},
): Promise<Uint8Array> {
  const body = await makeV24FrameBody(data, {
    addGroupingIdentity,
    compress,
    encrypt,
    doUnsynchronise,
  });
  const header = makeV24FrameHeader(id, body.length, {
    hasGroupingIdentity: addGroupingIdentity,
    hasCompression: compress,
    hasEncryption: encrypt,
    hasUnsynchronisation: doUnsynchronise,
  });
  const frame = concat(header, body);

  return frame;
}

export function makeV23Tag(
  { doUnsynchronise = false, paddingSize = 0 } = {},
  framesData: Uint8Array,
): Uint8Array {
  const padding = new Uint8Array(paddingSize);

  if (doUnsynchronise) framesData = unsynchronise(framesData);

  let extendedHeader = new Uint8Array(0) as Uint8Array<ArrayBufferLike>;
  if (paddingSize != 0) {
    const extendedHeaderSize = 10;
    const extendedHeaderFlags = 0b10000000;
    const crc = new Uint8Array(4);
    extendedHeader = concat(
      encodeU32(extendedHeaderSize),
      [extendedHeaderFlags, 0x00],
      encodeU32(paddingSize),
      crc,
    );
  }

  let flags = 0x00;
  if (doUnsynchronise) flags |= 0b10000000;
  if (paddingSize != 0) flags |= 0b01000000;
  const header = concat(
    encodeAscii("ID3"),
    [0x03, 0x00],
    [flags],
    encodeSyncSafeSize(extendedHeader.length + framesData.length + padding.length),
  );

  const tag = concat(header, extendedHeader, framesData, padding);

  return tag;
}

export function makeV24Tag(
  { paddingSize = 0, addFooter = false, isUpdate = false },
  framesData: Uint8Array,
): Uint8Array {
  const padding = new Uint8Array(paddingSize);

  let extendedHeader = new Uint8Array(0) as Uint8Array<ArrayBufferLike>;
  if (isUpdate) {
    const extendedHeaderSize = 6;
    let extendedHeaderFlags = 0b01000000;
    extendedHeader = concat(encodeSyncSafeSize(extendedHeaderSize), [0x01, extendedHeaderFlags]);
  }

  let flags = 0x00;
  if (isUpdate) flags |= 0b01000000;
  if (addFooter) flags |= 0b00010000;

  const size = encodeSyncSafeSize(extendedHeader.length + framesData.length + padding.length);

  let footer = new Uint8Array(0) as Uint8Array<ArrayBufferLike>;
  if (addFooter) footer = concat(encodeAscii("3DI"), [0x00, 0x04], [flags], size);

  const header = concat(encodeAscii("ID3"), [0x04, 0x00], [flags], size);

  const tag = concat(header, extendedHeader, framesData, padding, footer);

  return tag;
}
