import { ErrorCode, ParkhiError } from "./error.ts";
import { Level, setHandler, useLogger } from "./logging.ts";
import { Parkhi, ParserType } from "./parkhi.ts";
import type { Chapter, Metadata } from "./parser.ts";
import { createReadStream } from "node:fs";
import { argv, argv0 } from "node:process";
import { type InspectColor, styleText } from "node:util";

const { error } = useLogger("parkhi");

function bold(text: string): string {
  return styleText("bold", text);
}

function printChapter(level: number, i: number, chapter: Chapter) {
  const padding = " ".repeat(level);
  console.log(`${padding}${i}. ${bold(chapter.name)}`, `(${Math.round(chapter.position)}s)`);

  chapter.children.forEach((subChapter, i) => printChapter(level + 1, i + 1, subChapter));
}

async function printMetadata(metadata: Metadata | null) {
  if (!metadata) throw new ParkhiError(ErrorCode.Internal, "metadata is null after parsing");

  let cover = null;
  if (metadata.cover) {
    cover =
      `${metadata.cover.type.length != 0 ? metadata.cover.type : "unknown"} ` +
      `(${metadata.cover.size} bytes)`;
  }

  console.log();
  console.log(bold("Type"), "    :", metadata.type);
  console.log(bold("Name"), "    :", metadata.name);
  console.log(bold("Authors"), " :", metadata.authors.join(", "));
  console.log(bold("Cover"), "   :", cover);

  if (metadata.chapters.length == 0) return;

  console.log(bold("Chapters"), ":");
  metadata.chapters.forEach((chapter, i) => printChapter(0, i + 1, chapter));
}

async function main(path: string) {
  const stream = createReadStream(path);
  const parkhi = new Parkhi(ParserType.All);

  for await (const chunk of stream) {
    if (await parkhi.feed(chunk)) {
      const metadata = await parkhi.getMetadata();
      await printMetadata(metadata);
      return;
    }
  }
  if (await parkhi.feed(null)) {
    const metadata = await parkhi.getMetadata();
    await printMetadata(metadata);
  }
}

function format(color: InspectColor, level: string, component: string, message: string): string {
  return `${styleText(["bold", color], level)} ${styleText("bold", component)}: ${message}`;
}

function consoleLogger(level: Level, component: string, message: string) {
  if (level == Level.Debug) console.debug(format("cyan", "DEBUG", component, message));
  else if (level == Level.Info) console.info(format("blue", "INFO", component, message));
  else if (level == Level.Warn) console.warn(format("yellow", "WARN", component, message));
  else if (level == Level.Error) console.error(format("red", "ERROR", component, message));
  else throw new ParkhiError(ErrorCode.Internal, `unknown level ${level}`);
}

setHandler(consoleLogger);

const path = argv[2];
if (!path) {
  error("path not provided");
  error(`usage: ${argv0} ${argv[1]} /path/to/media/file`);
  process.exit(1);
}

try {
  await main(path);
} catch (e) {
  if (e instanceof Error) error(e.message);
  else error(`${e}`);
  process.exit(1);
}
