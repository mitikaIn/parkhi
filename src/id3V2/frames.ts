import { ErrorCode, ParkhiError } from "../error.ts";
import type { Chapter } from "../parser.ts";
import { decodeAscii, decodeUtf, decodeUtf8, decodeUtf16Be, parseU32 } from "../utils.ts";
import { resynchronise } from "./syncBuffer.ts";

export function parseSyncSafeSize(b3: number, b2: number, b1: number, b0: number): number {
  const l3 = (b3! & 0x7f) << 21;
  const l2 = (b2! & 0x7f) << 14;
  const l1 = (b1! & 0x7f) << 7;
  const l0 = (b0! & 0x7f) << 0;
  const size = (l3 | l2 | l1 | l0) >>> 0;
  return size;
}

export async function decompressData(data: Uint8Array): Promise<Uint8Array> {
  try {
    const ds = new DecompressionStream("deflate");

    const writer = ds.writable.getWriter();
    await writer.write(data as Uint8Array<ArrayBuffer>);
    await writer.close();

    const buffer = await new Response(ds.readable).arrayBuffer();
    return new Uint8Array(buffer);
  } catch (e) {
    throw new ParkhiError(ErrorCode.Corrupt, `unable to decompress frame: ${e}`);
  }
}

export function throwLengthMismatchError(
  component: string,
  part: string,
  expected: number | string,
  actual: number,
) {
  throw new ParkhiError(
    ErrorCode.Corrupt,
    `${component}'s ${part} length (${actual}) is smaller than expected (${expected})`,
  );
}

export interface V23FrameHeader {
  id: string;
  size: number;
  hasCompression: boolean;
  hasEncryption: boolean;
  hasGroupingIdentity: boolean;
}

export function parseV23FrameHeader(data: Uint8Array): V23FrameHeader {
  if (data.length < 10) throwLengthMismatchError("frame", "header", 10, data.length);

  const id = decodeAscii(data.subarray(0, 4));
  const size = parseU32(data[4]!, data[5]!, data[6]!, data[7]!);
  const flags = data[9]!;
  const hasCompression = (flags & 0b10000000) != 0;
  const hasEncryption = (flags & 0b01000000) != 0;
  const hasGroupingIdentity = (flags & 0b00100000) != 0;

  return {
    id,
    size,
    hasCompression,
    hasEncryption,
    hasGroupingIdentity,
  };
}

export async function parseV23FrameBody(
  header: V23FrameHeader,
  data: Uint8Array,
): Promise<Uint8Array> {
  if (data.length < header.size)
    throwLengthMismatchError("frame", "body", header.size, data.length);

  let cursor = 0;
  if (header.hasCompression) cursor += 4;
  if (header.hasEncryption) cursor += 1;
  if (header.hasGroupingIdentity) cursor += 1;

  if (cursor >= data.length) throwLengthMismatchError("frame", "body", `>= ${cursor}`, data.length);

  data = data.subarray(cursor);

  if (header.hasCompression) data = await decompressData(data);

  return data;
}

export interface V24FrameHeader {
  id: string;
  size: number;
  hasGroupingIdentity: boolean;
  hasCompression: boolean;
  hasEncryption: boolean;
  hasUnsynchronisation: boolean;
  hasDataLengthIndicator: boolean;
}

export function parseV24FrameHeader(data: Uint8Array): V24FrameHeader {
  const id = decodeAscii(data.subarray(0, 4));
  const size = parseSyncSafeSize(data[4]!, data[5]!, data[6]!, data[7]!);
  const flags = data[9]!;
  const hasGroupingIdentity = (flags & 0b01000000) != 0;
  const hasCompression = (flags & 0b00001000) != 0;
  const hasEncryption = (flags & 0b00000100) != 0;
  const hasUnsynchronisation = (flags & 0b00000010) != 0;
  const hasDataLengthIndicator = (flags & 0b00000001) != 0;

  return {
    id,
    size,
    hasGroupingIdentity,
    hasCompression,
    hasEncryption,
    hasUnsynchronisation,
    hasDataLengthIndicator,
  };
}

export async function parseV24FrameBody(
  hasGlobalUnsynchronisation: boolean,
  header: V24FrameHeader,
  data: Uint8Array,
): Promise<Uint8Array> {
  if (data.length < header.size)
    throwLengthMismatchError("frame", "body", header.size, data.length);

  let cursor = 0;
  if (header.hasGroupingIdentity) cursor += 1;
  if (header.hasEncryption) cursor += 1;
  if (header.hasDataLengthIndicator) cursor += 4;

  if (cursor >= data.length) throwLengthMismatchError("frame", "body", `>= ${cursor}`, data.length);

  data = data.subarray(cursor);

  if (hasGlobalUnsynchronisation || header.hasUnsynchronisation)
    data = resynchronise(false, data).data;

  if (header.hasCompression) data = await decompressData(data);

  return data;
}

export enum FrameType {
  Apic = "APIC",
  Chap = "CHAP",
  Ctoc = "CTOC",
  Tit2 = "TIT2",
  Tpe1 = "TPE1",
  Tpe2 = "TPE2",
  Tpe3 = "TPE3",
  Tpe4 = "TPE4",
}

enum TextEncoding {
  Iso8859 = 0x00,
  Utf16 = 0x01,
  Utf16Be = 0x02,
  Utf8 = 0x03,
}

enum PictureType {
  Cover = 0x03,
}

export function parseApic(data: Uint8Array): Blob | null {
  let cursor = 0;

  const encoding = data[cursor]!;
  cursor = 1;

  const mimeTypeEnd = data.indexOf(0x00, cursor);
  if (mimeTypeEnd == -1)
    throw new ParkhiError(ErrorCode.Corrupt, "APIC MIME type does not end with 0x00");

  const mimeTypeData = data.subarray(cursor, mimeTypeEnd);
  const mimeType = decodeAscii(mimeTypeData);
  if (mimeType == "-->") return null;
  cursor = mimeTypeEnd + 1;

  const pictureType = data[cursor]!;
  if (pictureType != PictureType.Cover) return null;
  cursor += 1;

  if (encoding == TextEncoding.Iso8859 || encoding == TextEncoding.Utf8) {
    while (cursor < data.length - 1) {
      if (data[cursor] == 0x00) {
        cursor += 1;
        break;
      }
      cursor += 1;
    }
  } else if (encoding == TextEncoding.Utf16 || encoding == TextEncoding.Utf16Be) {
    while (cursor < data.length - 1) {
      if (data[cursor] == 0x00 && data[cursor + 1] == 0x00) {
        cursor += 2;
        break;
      }
      cursor += 2;
    }
  } else {
    throw new ParkhiError(ErrorCode.Corrupt, `APIC description has unknown encoding ${encoding}`);
  }

  if (cursor > data.length)
    throw new ParkhiError(ErrorCode.Corrupt, "APIC description does not end with 0x00");

  const picData = data.subarray(cursor);
  const picture = new Blob([picData as Uint8Array<ArrayBuffer>], { type: mimeType });

  return picture;
}

export interface Chap {
  id: string;
  start: number;
  name: string;
}

export async function parseChap(version: "2.3" | "2.4", data: Uint8Array): Promise<Chap> {
  let cursor = 0;

  const idEnd = data.indexOf(0, cursor);
  if (idEnd == -1) throw new ParkhiError(ErrorCode.Corrupt, "CHAP id does not end with 0x00");

  const idData = data.subarray(cursor, idEnd);
  const id = decodeAscii(idData);
  cursor = idEnd + 1;

  if (data.length - cursor < 4)
    throwLengthMismatchError("CHAP", "data", `>= ${cursor + 4}`, data.length);

  const [b3, b2, b1, b0] = data.subarray(cursor, cursor + 4);
  const start = parseU32(b3!, b2!, b1!, b0!) / 1000;
  cursor += 16;

  let name = "";
  while (cursor < data.length) {
    if (data.length - cursor < 4)
      throwLengthMismatchError("CHAP", "subframe header", `>= ${cursor + 10}`, data.length);

    const headerData = data.subarray(cursor, cursor + 10);
    cursor += 10;

    let header;
    if (version == "2.3") header = parseV23FrameHeader(headerData);
    else if (version == "2.4") header = parseV24FrameHeader(headerData);
    else throw new ParkhiError(ErrorCode.Internal, `unknown version ${version}`);

    if (data.length - cursor < header.size)
      throwLengthMismatchError("CHAP", "subframe body", `>= ${cursor + header.size}`, data.length);

    const bodyData = data.subarray(cursor, cursor + header.size);
    cursor += header.size;

    if (header.hasEncryption || header.id != FrameType.Tit2) continue;

    let payload;
    if (version == "2.3") {
      payload = await parseV23FrameBody(header, bodyData);
    } else if (version == "2.4") {
      payload = await parseV24FrameBody(false, header as V24FrameHeader, bodyData);
    } else {
      throw new ParkhiError(ErrorCode.Internal, `unknown version ${version}`);
    }

    name = parseTit2(payload);
    break;
  }

  return { id, start, name };
}

export interface Ctoc {
  id: string;
  name: string;
  root: boolean;
  children: string[];
}

export async function parseCtoc(version: "2.3" | "2.4", data: Uint8Array): Promise<Ctoc> {
  let cursor = 0;

  const idEnd = data.indexOf(0, cursor);
  if (idEnd == -1) throw new ParkhiError(ErrorCode.Corrupt, "CTOC id does not end with 0x00");

  const idData = data.subarray(cursor, idEnd);
  const id = decodeAscii(idData);
  cursor = idEnd + 1;

  if (data.length - cursor < 2)
    throwLengthMismatchError("CTOC", "data", `>= ${cursor + 2}`, data.length);

  const flags = data[cursor]!;
  const root = (flags & 0b00000010) != 0;
  cursor += 1;

  const count = data[cursor]!;
  cursor += 1;

  const children = [];
  for (let i = 0; i < count; i++) {
    const idEnd = data.indexOf(0x00, cursor);
    if (idEnd == -1)
      throw new ParkhiError(ErrorCode.Corrupt, "CTOC child id does not end with 0x00");

    const idData = data.subarray(cursor, idEnd);
    const id = decodeAscii(idData);
    children.push(id);
    cursor = idEnd + 1;
  }

  let name = "";
  while (cursor < data.length) {
    if (data.length - cursor < 4)
      throwLengthMismatchError("CTOC", "subframe header", `>= ${cursor + 10}`, data.length);

    const headerData = data.subarray(cursor, cursor + 10);
    cursor += 10;

    let header;
    if (version == "2.3") header = parseV23FrameHeader(headerData);
    else if (version == "2.4") header = parseV24FrameHeader(headerData);
    else throw new ParkhiError(ErrorCode.Internal, `unknown version ${version}`);

    if (data.length - cursor < header.size)
      throwLengthMismatchError("CTOC", "subframe body", `>= ${cursor + header.size}`, data.length);

    const bodyData = data.subarray(cursor, cursor + header.size);
    cursor += header.size;

    if (header.hasEncryption || header.id != FrameType.Tit2) continue;

    let payload;
    if (version == "2.3") {
      payload = await parseV23FrameBody(header, bodyData);
    } else if (version == "2.4") {
      payload = await parseV24FrameBody(false, header as V24FrameHeader, bodyData);
    } else {
      throw new ParkhiError(ErrorCode.Internal, `unknown version ${version}`);
    }

    name = parseTit2(payload);
    break;
  }

  return { id, name, root, children };
}

function resolveChapter(id: string, chaps: Map<string, Chap>, ctocs: Map<string, Ctoc>): Chapter {
  const chap = chaps.get(id);
  if (chap) {
    return { name: chap.name, position: chap.start, children: [] };
  }

  const ctoc = ctocs.get(id);
  if (!ctoc) throw new ParkhiError(ErrorCode.Corrupt, `unresolved CHAP or CTOC id ${id}`);

  const children = ctoc.children.map((id) => resolveChapter(id, chaps, ctocs));
  if (children.length == 0) throw new ParkhiError(ErrorCode.Corrupt, `CTOC ${id} has 0 children`);

  return {
    name: ctoc.name,
    position: children[0]!.position,
    children,
  };
}

export function parseChapters(chaps: Map<string, Chap>, ctocs: Map<string, Ctoc>): Chapter[] {
  const rootCtoc = ctocs.entries().find(([_, { root }]) => root);
  if (!rootCtoc) return [];

  const [_, { children }] = rootCtoc;

  const chapters = children.map((id) => resolveChapter(id, chaps, ctocs));

  return chapters;
}

export function parseText(data: Uint8Array): string {
  const encoding = data[0]!;
  const textData = data.subarray(1);
  let text;
  if (encoding == TextEncoding.Iso8859) text = decodeAscii(textData);
  else if (encoding == TextEncoding.Utf16) text = decodeUtf(textData);
  else if (encoding == TextEncoding.Utf16Be) text = decodeUtf16Be(textData);
  else if (encoding == TextEncoding.Utf8) text = decodeUtf8(textData);
  else throw new ParkhiError(ErrorCode.Corrupt, `text frame has unknown encoding ${encoding}`);
  return text;
}

export function parseTit2(data: Uint8Array): string {
  const text = parseText(data);
  return text;
}

export function splitText(version: "2.3" | "2.4", text: string): string[] {
  let sep;
  if (version == "2.3") sep = "/";
  else if (version == "2.4") sep = "\x00";
  else throw new ParkhiError(ErrorCode.Internal, `unknown version ${version}`);

  return text.split(sep);
}

export function parseTpex(version: "2.3" | "2.4", data: Uint8Array): string[] {
  const text = parseText(data);
  return splitText(version, text);
}
