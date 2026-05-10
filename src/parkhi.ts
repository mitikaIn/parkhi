import { ErrorCode, ParkhiError } from "./error.ts";
import { useLogging } from "./logging.ts";
import { type Metadata, type Parser } from "./parser.ts";

const { debug } = useLogging("parkhi");

export enum ParserType {
  None = 0,
  All = None,
}

export class Parkhi {
  private parsers: Set<Parser> = new Set();
  private parser: Parser | null = null;
  private done = false;

  constructor(parserType: ParserType = ParserType.All, customParsers: Parser[] = []) {
    for (const parser of customParsers) {
      debug(`adding ${parser.name}`);
      this.parsers.add(parser);
    }
  }

  async feed(chunk: Uint8Array | null): Promise<boolean> {
    if (this.done) return true;

    const toDrop = [];

    for (const parser of this.parsers) {
      let done;
      try {
        done = await parser.feed(chunk);
      } catch (e) {
        if (e instanceof ParkhiError) {
          if (e.code == ErrorCode.Unknown) {
            debug(`${parser.name} says unknown: ${e.message}`);
            toDrop.push(parser);
          } else {
            throw e;
          }
        } else {
          throw new ParkhiError(ErrorCode.Internal, `${e}`);
        }
      }

      if (done) {
        debug(`${parser.name} parsed the data`);
        this.parsers.clear();
        this.parser = parser;
        this.done = true;
        return this.done;
      }
    }

    for (const parser of toDrop) this.parsers.delete(parser);
    if (this.parsers.size == 0)
      throw new ParkhiError(ErrorCode.Unknown, "no parser is able to parse the data");

    return false;
  }

  async getMetadata(): Promise<Metadata | null> {
    if (this.parser) return this.parser.getMetadata();

    return null;
  }
}
