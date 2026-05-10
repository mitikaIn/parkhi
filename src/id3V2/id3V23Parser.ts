import { Buffer } from "../buffer.ts";
import { ErrorCode, ParkhiError } from "../error.ts";
import { useLogging } from "../logging.ts";
import { MetadataType } from "../metadataType.ts";
import { type Metadata, type Parser } from "../parser.ts";
import { decodeAscii, parseU32 } from "../utils.ts";
import {
  type Chap,
  type Ctoc,
  FrameType,
  type V23FrameHeader,
  parseApic,
  parseChap,
  parseChapters,
  parseCtoc,
  parseSyncSafeSize,
  parseTit2,
  parseTpex,
  parseV23FrameBody,
  parseV23FrameHeader,
} from "./frames.ts";
import { SyncBuffer } from "./syncBuffer.ts";

const { debug } = useLogging("id3V23Parser");

enum State {
  HeaderIdentifier,
  HeaderVersion,
  HeaderFlags,
  HeaderSize,
  ExtendedHeaderSize,
  ExtendedHeaderRest,
  FrameHeader,
  FrameData,
}

export class Id3V23Parser implements Parser {
  name = "Id3V23Parser";

  private buffer: Pick<Buffer, keyof Buffer> = new Buffer();
  private state = State.HeaderIdentifier;

  private hasUnsynchronisation = false;
  private hasExtendedHeader = false;

  private extendedHeaderSize = 0;

  private frameHeader: V23FrameHeader | null = null;

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
      if (this.state == State.HeaderIdentifier) {
        throw new ParkhiError(ErrorCode.Unknown, "type can not be determined");
      } else if (this.state <= State.HeaderVersion) {
        throw new ParkhiError(ErrorCode.Unknown, "version can not be determined");
      } else {
        throw new ParkhiError(ErrorCode.Corrupt, "data is smaller than expected");
      }
    }

    this.buffer.push(chunk);

    if (this.state == State.HeaderIdentifier && this.buffer.length >= 3) {
      const data = this.buffer.pop(3);
      if (decodeAscii(data) != "ID3")
        throw new ParkhiError(ErrorCode.Unknown, "header does not match ID3");

      debug("identified data to be ID3");

      this.state = State.HeaderVersion;
    }

    if (this.state == State.HeaderVersion && this.buffer.length >= 2) {
      const [b1, b0] = this.buffer.pop(2);
      if (!(b1 == 3 && b0 == 0)) throw new ParkhiError(ErrorCode.Unknown, "version is not 30");

      debug("identified data to be version 2.30");

      this.state = State.HeaderFlags;
    }

    if (this.state == State.HeaderFlags && this.buffer.length >= 1) {
      const flags = this.buffer.pop(1)[0]!;
      this.hasUnsynchronisation = (flags & 0b10000000) != 0;
      this.hasExtendedHeader = (flags & 0b01000000) != 0;

      this.state = State.HeaderSize;
    }

    if (this.state == State.HeaderSize && this.buffer.length >= 4) {
      const [b3, b2, b1, b0] = this.buffer.pop(4);
      const size = parseSyncSafeSize(b3!, b2!, b1!, b0!);

      const chunks = this.buffer.pop(this.buffer.length);
      if (this.hasUnsynchronisation) this.buffer = new SyncBuffer([chunks], size);
      else this.buffer = new Buffer([chunks], size);

      if (this.hasExtendedHeader) this.state = State.ExtendedHeaderSize;
      else this.state = State.FrameHeader;
    }

    if (this.state == State.ExtendedHeaderSize && this.buffer.length >= 4) {
      const [b3, b2, b1, b0] = this.buffer.pop(4);
      this.extendedHeaderSize = parseU32(b3!, b2!, b1!, b0!);

      this.state = State.ExtendedHeaderRest;
    }

    if (this.state == State.ExtendedHeaderRest && this.buffer.length >= this.extendedHeaderSize) {
      this.buffer.pop(this.extendedHeaderSize);

      this.state = State.FrameHeader;
    }

    let consumed = true;
    let lastLength = this.buffer.length;
    while (consumed) {
      const done = await this.parseFrame();
      if (done || (this.buffer.done && this.buffer.length == 0)) {
        this.parseChapters();
        this.metadata.type = MetadataType.Id3V23;
        return true;
      }

      consumed = lastLength != this.buffer.length;
      lastLength = this.buffer.length;
    }

    return false;
  }

  private async parseFrame(): Promise<boolean> {
    if (this.state == State.FrameHeader && this.buffer.length >= 1) {
      if (this.buffer.peek(0) == 0x00) {
        debug("found padding, finishing parsing");
        return true;
      }
    }

    if (this.state == State.FrameHeader && this.buffer.length >= 10) {
      const data = this.buffer.pop(10);
      this.frameHeader = parseV23FrameHeader(data);

      this.state = State.FrameData;
    }

    if (this.state == State.FrameData && this.buffer.length >= this.frameHeader!.size) {
      const data = this.buffer.pop(this.frameHeader!.size);
      await this.parseFrameData(data);

      this.state = State.FrameHeader;
    }

    return false;
  }

  private async parseFrameData(data: Uint8Array) {
    debug(`parsing frame ${this.frameHeader!.id}`);

    if (this.frameHeader!.hasEncryption) return;
    if (!Object.values(FrameType).includes(this.frameHeader!.id as FrameType)) return;

    data = await parseV23FrameBody(this.frameHeader!, data);

    const id = this.frameHeader!.id;

    if (id == FrameType.Apic) {
      this.metadata.cover = parseApic(data);
      return;
    }

    if (id == FrameType.Chap) {
      const chap = await parseChap("2.3", data);
      this.chaps.set(chap.id, chap);
      return;
    }

    if (id == FrameType.Ctoc) {
      const ctoc = await parseCtoc("2.3", data);
      this.ctocs.set(ctoc.id, ctoc);
      return;
    }

    if (id == FrameType.Tit2) {
      this.metadata.name = parseTit2(data);
    }

    if (
      id == FrameType.Tpe1 ||
      id == FrameType.Tpe2 ||
      id == FrameType.Tpe3 ||
      id == FrameType.Tpe4
    ) {
      const authors = parseTpex("2.3", data);
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
