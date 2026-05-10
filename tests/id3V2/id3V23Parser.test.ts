import { Id3V23Parser } from "../../src/id3V2/id3V23Parser.ts";
import { concat, encodeAscii, encodeU32, iterateBytes } from "../utils.ts";
import { makeV23Frame, makeV23Tag } from "./utils.ts";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

const titleFrame = await makeV23Frame("TIT2", encodeAscii("\x00Book"));

const author0Frame = await makeV23Frame("TPE1", encodeAscii("\x00John"), { compress: true });
const authors1Frame = await makeV23Frame("TPE2", encodeAscii("\x00Doe/Alice"));

const coverFrame = await makeV23Frame(
  "APIC",
  concat(
    [0x00],
    encodeAscii("image/jpeg\x00"),
    [0x03],
    encodeAscii("Cover description\x00"),
    [0xff, 0xd8, 0xff],
  ),
  { compress: true },
);

const chap1Frame = await makeV23Frame(
  "CHAP",
  concat(
    encodeAscii("chap1\x00"),
    encodeU32(10000),
    new Uint8Array(12),
    await makeV23Frame("TIT2", encodeAscii("\x00Chapter 1")),
  ),
);
const chap2Frame = await makeV23Frame(
  "CHAP",
  concat(
    encodeAscii("chap2\x00"),
    encodeU32(20000),
    new Uint8Array(12),
    await makeV23Frame("TIT2", encodeAscii("\x00Chapter 2")),
  ),
);
const chap3Frame = await makeV23Frame(
  "CHAP",
  concat(
    encodeAscii("chap3\x00"),
    encodeU32(30000),
    new Uint8Array(12),
    await makeV23Frame("TIT2", encodeAscii("\x00Chapter 3")),
  ),
);
const chap4Frame = await makeV23Frame(
  "CHAP",
  concat(
    encodeAscii("chap4\x00"),
    encodeU32(40000),
    new Uint8Array(12),
    await makeV23Frame("TIT2", encodeAscii("\x00Chapter 4")),
  ),
);

const ctoc1Frame = await makeV23Frame(
  "CTOC",
  concat(
    encodeAscii("ctoc1\x00"),
    [0b00000010, 0x03],
    encodeAscii("chap1\x00"),
    encodeAscii("ctoc2\x00"),
    encodeAscii("ctoc3\x00"),
    await makeV23Frame("TIT2", encodeAscii("\x00Table of Contents")),
  ),
);
const ctoc2Frame = await makeV23Frame(
  "CTOC",
  concat(
    encodeAscii("ctoc2\x00"),
    [0b00000000, 0x02],
    encodeAscii("chap2\x00"),
    encodeAscii("chap3\x00"),
    await makeV23Frame("TIT2", encodeAscii("\x00Part 1")),
  ),
);
const ctoc3Frame = await makeV23Frame(
  "CTOC",
  concat(
    encodeAscii("ctoc3\x00"),
    [0b00000000, 0x01],
    encodeAscii("chap4\x00"),
    await makeV23Frame("TIT2", encodeAscii("\x00Part 2")),
  ),
);

const framesData = concat(
  titleFrame,
  author0Frame,
  authors1Frame,
  coverFrame,
  chap1Frame,
  chap2Frame,
  chap3Frame,
  chap4Frame,
  ctoc1Frame,
  ctoc2Frame,
  ctoc3Frame,
);

const tag0 = makeV23Tag({}, framesData);
const tag1 = makeV23Tag({ doUnsynchronise: true }, framesData);
const tag2 = makeV23Tag({ paddingSize: 10 }, framesData);

const data0 = concat(tag0, [0x01, 0x02, 0x03, 0x04, 0x05]);
const data1 = concat(tag1, [0x01, 0x02, 0x03, 0x04, 0x05]);
const data2 = concat(tag2, [0x01, 0x02, 0x03, 0x04, 0x05]);

const metadata = {
  type: "ID3v2.3",
  name: "Book",
  authors: ["John", "Doe", "Alice"],
  cover: new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" }),
  chapters: [
    { name: "Chapter 1", position: 10, children: [] },
    {
      name: "Part 1",
      position: 20,
      children: [
        { name: "Chapter 2", position: 20, children: [] },
        { name: "Chapter 3", position: 30, children: [] },
      ],
    },
    {
      name: "Part 2",
      position: 40,
      children: [{ name: "Chapter 4", position: 40, children: [] }],
    },
  ],
};

describe("Id3V23Parser", () => {
  it("should parse simple data in single feeding", async () => {
    const parser = new Id3V23Parser();
    const source = new Uint8Array(data0);

    const done = await parser.feed(source);
    assert.ok(done);

    const actualMetadata = await parser.getMetadata();
    assert.deepEqual(actualMetadata, metadata);
  });

  it("should parse unsynchronised data in single feeding", async () => {
    const parser = new Id3V23Parser();
    const source = new Uint8Array(data1);

    const done = await parser.feed(source);
    assert.ok(done);

    const actualMetadata = await parser.getMetadata();
    assert.deepEqual(actualMetadata, metadata);
  });

  it("should parse padded data in single feeding", async () => {
    const parser = new Id3V23Parser();
    const source = new Uint8Array(data2);

    const done = await parser.feed(source);
    assert.ok(done);

    const actualMetadata = await parser.getMetadata();
    assert.deepEqual(actualMetadata, metadata);
  });

  it("should parse simple data in byte by byte feeding", async () => {
    const parser = new Id3V23Parser();
    const source = new Uint8Array(data0);

    let done = false;
    for (const chunk of iterateBytes(source)) {
      done = await parser.feed(chunk);
      if (done) break;
    }
    assert.ok(done);

    const actualMetadata = await parser.getMetadata();
    assert.deepEqual(actualMetadata, metadata);
  });

  it("should parse unsynchronised data in byte by byte feeding", async () => {
    const parser = new Id3V23Parser();
    const source = new Uint8Array(data1);

    let done = false;
    for (const chunk of iterateBytes(source)) {
      done = await parser.feed(chunk);
      if (done) break;
    }
    assert.ok(done);

    const actualMetadata = await parser.getMetadata();
    assert.deepEqual(actualMetadata, metadata);
  });

  it("should parse padded data in byte by byte feeding", async () => {
    const parser = new Id3V23Parser();
    const source = new Uint8Array(data2);

    let done = false;
    for (const chunk of iterateBytes(source)) {
      done = await parser.feed(chunk);
      if (done) break;
    }
    assert.ok(done);

    const actualMetadata = await parser.getMetadata();
    assert.deepEqual(actualMetadata, metadata);
  });
});
