import { Buffer } from "../buffer.ts";
import { ErrorCode, ParkhiError } from "../error.ts";
import { useLogging } from "../logging.ts";
import { MetadataType } from "../metadataType.ts";
import { type Metadata, type Parser } from "../parser.ts";
import {
  type Chap,
  type Ctoc,
  FrameType,
  type V24FrameHeader,
  parseApic,
  parseChap,
  parseChapters,
  parseCtoc,
  parseSyncSafeSize,
  parseTit2,
  parseTpex,
  parseV24FrameBody,
  parseV24FrameHeader,
  throwLengthMismatchError,
} from "./frames.ts";

const { debug } = useLogging("id3V24Parser");

export class Id3V24Parser implements Parser {
  name = "Id3V24Parser";

  private buffer: Buffer = new Buffer();
  private data = new Uint8Array([]);
  private cursor = 0;

  private chaps: Map<string, Chap> = new Map();
  private ctocs: Map<string, Ctoc> = new Map();

  private metadata: Metadata = {
    type: null,
    name: null,
    authors: [],
    cover: null,
    chapters: [],
  };

  async feed(chunk: Uint8Array | null): Promise<boolean> {
    if (chunk == null) {
      this.data = this.buffer.pop(this.buffer.length) as Uint8Array<ArrayBuffer>;
      while (this.cursor < this.data.length) {
        const Id3NotFound = await this.parseTag();
        if (Id3NotFound) {
          debug("no more ID3 found, finishing parsing data");
          break;
        }
        debug("parsed a tag");
      }
      this.parseChapters();
      if (this.metadata.type == null)
        throw new ParkhiError(ErrorCode.Unknown, "no ID3 tag was found");
      return true;
    }

    this.buffer.push(chunk);
    return false;
  }

  private async parseTag(): Promise<boolean> {
    const i = this.data.indexOf(0x49, this.cursor);
    if (i == -1) return true;
    if (!(this.data[i + 1] == 0x44 && this.data[i + 2] == 0x33)) return true;
    debug("identified data to be ID3");
    this.cursor = i + 3;

    if (this.data.length - this.cursor < 7)
      throwLengthMismatchError("header", "data", 7, this.data.length - this.cursor);

    if (!(this.data[this.cursor] == 4 && this.data[this.cursor + 1] == 0))
      throw new ParkhiError(ErrorCode.Unknown, "version is not 40");
    debug("identified data to be version 2.40");
    this.cursor += 2;

    const flags = this.data[this.cursor]!;
    const hasUnsynchronisation = (flags & 0b10000000) != 0;
    const hasExtendedHeader = (flags & 0b01000000) != 0;
    const hasFooter = (flags & 0b00010000) != 0;
    this.cursor += 1;

    const [b3, b2, b1, b0] = this.data.subarray(this.cursor, this.cursor + 4);
    const size = parseSyncSafeSize(b3!, b2!, b1!, b0!);
    this.cursor += 4;

    const fullSize = size + (hasFooter ? 10 : 0);
    if (this.data.length - this.cursor < fullSize)
      throwLengthMismatchError("tag", "data", fullSize, this.data.length - this.cursor);

    let extendedHeaderSize = 0;
    let isUpdate = false;
    if (hasExtendedHeader) {
      const [b3, b2, b1, b0] = this.data.subarray(this.cursor, this.cursor + 4);
      extendedHeaderSize = parseSyncSafeSize(b3!, b2!, b1!, b0!);
      const flags = this.data[this.cursor + 5]!;
      isUpdate = (flags & 0b01000000) != 0;
    }

    const tagEnd = this.cursor + extendedHeaderSize + size;
    while (this.cursor < tagEnd) {
      const foundPadding = await this.parseFrame(hasUnsynchronisation, isUpdate);
      if (foundPadding) break;
    }
    this.metadata.type = MetadataType.Id3V24;

    this.cursor = tagEnd;
    if (hasFooter) this.cursor += 10;

    return false;
  }

  private async parseFrame(hasUnsynchronisation: boolean, isUpdate: boolean): Promise<boolean> {
    if (this.data[this.cursor] == 0x00) {
      debug("found padding, finishing parsing of tag");
      return true;
    }

    if (this.data.length - this.cursor < 10)
      throwLengthMismatchError("frame", "header", 10, this.data.length - this.cursor);

    const headerData = this.data.subarray(this.cursor, this.cursor + 10);
    const frameHeader = parseV24FrameHeader(headerData);
    this.cursor += 10;

    if (this.data.length - this.cursor < frameHeader.size)
      throwLengthMismatchError("frame", "body", frameHeader.size, this.data.length - this.cursor);

    const bodyData = this.data.subarray(this.cursor, this.cursor + frameHeader.size);
    await this.parseFrameData(hasUnsynchronisation, isUpdate, frameHeader, bodyData);
    this.cursor += frameHeader.size;

    return false;
  }

  private async parseFrameData(
    hasUnsynchronisation: boolean,
    isUpdate: boolean,
    frameHeader: V24FrameHeader,
    data: Uint8Array,
  ) {
    debug(`parsing frame ${frameHeader.id}`);

    if (frameHeader.hasEncryption) return;
    if (!Object.values(FrameType).includes(frameHeader.id as FrameType)) return;

    data = await parseV24FrameBody(hasUnsynchronisation, frameHeader, data);

    const id = frameHeader.id;

    if (id == FrameType.Apic) {
      if (!isUpdate && this.metadata.cover) return;
      this.metadata.cover = parseApic(data);
      return;
    }

    if (id == FrameType.Chap) {
      const chap = await parseChap("2.4", data);
      this.chaps.set(chap.id, chap);
      return;
    }

    if (id == FrameType.Ctoc) {
      const ctoc = await parseCtoc("2.4", data);
      this.ctocs.set(ctoc.id, ctoc);
      return;
    }

    if (id == FrameType.Tit2) {
      if (!isUpdate && this.metadata.name) return;
      this.metadata.name = parseTit2(data);
    }

    if (
      id == FrameType.Tpe1 ||
      id == FrameType.Tpe2 ||
      id == FrameType.Tpe3 ||
      id == FrameType.Tpe4
    ) {
      const authors = parseTpex("2.4", data);
      this.metadata.authors.push(...authors);
      return;
    }
  }

  private parseChapters() {
    debug("parsing chapters");

    this.metadata.chapters = parseChapters(this.chaps, this.ctocs);
  }

  async getMetadata(): Promise<Metadata | null> {
    if (this.metadata.type == null) return null;
    return this.metadata;
  }
}
