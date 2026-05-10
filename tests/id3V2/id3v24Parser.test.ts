import { Id3V24Parser } from "../../src/id3V2/id3V24Parser.ts";
import { concat, encodeAscii, encodeU32, iterateBytes } from "../utils.ts";
import { makeV24Frame, makeV24Tag } from "./utils.ts";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

const titleFrame0 = await makeV24Frame("TIT2", encodeAscii("\x00Book"), { doUnsynchronise: true });
const titleFrame1 = await makeV24Frame("TIT2", encodeAscii("\x00The Book"));

const authorFrame0 = await makeV24Frame("TPE1", encodeAscii("\x00John"), { compress: true });
const authorsFrame1 = await makeV24Frame("TPE2", encodeAscii("\x00Doe\x00Alice"), {
  doUnsynchronise: true,
});

const coverFrame = await makeV24Frame(
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

const chapFrame0 = await makeV24Frame(
  "CHAP",
  concat(
    encodeAscii("chap1\x00"),
    encodeU32(10000),
    new Uint8Array(12),
    await makeV24Frame("TIT2", encodeAscii("\x00Chapter 1")),
  ),
);
const chapFrame1 = await makeV24Frame(
  "CHAP",
  concat(
    encodeAscii("chap2\x00"),
    encodeU32(20000),
    new Uint8Array(12),
    await makeV24Frame("TIT2", encodeAscii("\x00Chapter 2")),
  ),
);
const chapFrame2 = await makeV24Frame(
  "CHAP",
  concat(
    encodeAscii("chap3\x00"),
    encodeU32(30000),
    new Uint8Array(12),
    await makeV24Frame("TIT2", encodeAscii("\x00Chapter 3")),
  ),
);
const chapFrame3 = await makeV24Frame(
  "CHAP",
  concat(
    encodeAscii("chap4\x00"),
    encodeU32(40000),
    new Uint8Array(12),
    await makeV24Frame("TIT2", encodeAscii("\x00Chapter 4")),
  ),
);

const ctocFrame0 = await makeV24Frame(
  "CTOC",
  concat(
    encodeAscii("ctoc1\x00"),
    [0b00000010, 0x03],
    encodeAscii("chap1\x00"),
    encodeAscii("ctoc2\x00"),
    encodeAscii("ctoc3\x00"),
    await makeV24Frame("TIT2", encodeAscii("\x00Table of Contents")),
  ),
);
const ctocFrame1 = await makeV24Frame(
  "CTOC",
  concat(
    encodeAscii("ctoc2\x00"),
    [0b00000000, 0x02],
    encodeAscii("chap2\x00"),
    encodeAscii("chap3\x00"),
    await makeV24Frame("TIT2", encodeAscii("\x00Part 1")),
  ),
);
const ctocFrame2 = await makeV24Frame(
  "CTOC",
  concat(
    encodeAscii("ctoc3\x00"),
    [0b00000000, 0x01],
    encodeAscii("chap4\x00"),
    await makeV24Frame("TIT2", encodeAscii("\x00Part 2")),
  ),
);

const framesData = concat(
  titleFrame0,
  authorFrame0,
  authorsFrame1,
  coverFrame,
  chapFrame0,
  chapFrame1,
  chapFrame2,
  chapFrame3,
  ctocFrame0,
  ctocFrame1,
  ctocFrame2,
);

const tag0 = makeV24Tag({}, framesData);
const tag1 = makeV24Tag({ paddingSize: 10 }, framesData);
const tag2 = makeV24Tag({ addFooter: true }, framesData);
const tag3 = makeV24Tag({}, titleFrame1);
const tag4 = makeV24Tag({ isUpdate: true }, titleFrame1);

const data0 = concat(tag0, [0x01, 0x02, 0x03, 0x04, 0x05]);
const data1 = concat(tag1, [0x01, 0x02, 0x03, 0x04, 0x05]);
const data2 = concat(tag2, [0x01, 0x02, 0x03, 0x04, 0x05]);
const data3 = concat(tag3, tag4, [0x01, 0x02, 0x03, 0x04, 0x05]);
const data4 = concat([0x01, 0x02, 0x03, 0x04, 0x05], tag3, tag4);

const metadata = {
  type: "ID3v2.4",
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

describe("Id3V24Parser", () => {
  it("should parse simple data in single feeding", async () => {
    const parser = new Id3V24Parser();
    const source = new Uint8Array(data0);

    let done = await parser.feed(source);
    assert.ok(!done);
    done = await parser.feed(null);
    assert.ok(done);

    const actualMetadata = await parser.getMetadata();
    assert.deepEqual(actualMetadata, metadata);
  });

  it("should parse padded data in single feeding", async () => {
    const parser = new Id3V24Parser();
    const source = new Uint8Array(data1);

    let done = await parser.feed(source);
    assert.ok(!done);
    done = await parser.feed(null);
    assert.ok(done);

    const actualMetadata = await parser.getMetadata();
    assert.deepEqual(actualMetadata, metadata);
  });

  it("should parse data with footer in single feeding", async () => {
    const parser = new Id3V24Parser();
    const source = new Uint8Array(data2);

    let done = await parser.feed(source);
    assert.ok(!done);
    done = await parser.feed(null);
    assert.ok(done);

    const actualMetadata = await parser.getMetadata();
    assert.deepEqual(actualMetadata, metadata);
  });

  it("should parse data with multiple tags at start in single feeding", async () => {
    const parser = new Id3V24Parser();
    const source = new Uint8Array(data3);

    let done = await parser.feed(source);
    assert.ok(!done);
    done = await parser.feed(null);
    assert.ok(done);

    const { name = "" } = (await parser.getMetadata()) || {};
    assert.equal(name, "The Book");
  });

  it("should parse data with multiple tags at end in single feeding", async () => {
    const parser = new Id3V24Parser();
    const source = new Uint8Array(data4);

    let done = await parser.feed(source);
    assert.ok(!done);
    done = await parser.feed(null);
    assert.ok(done);

    const { name = "" } = (await parser.getMetadata()) || {};
    assert.equal(name, "The Book");
  });

  it("should parse simple data in byte by byte feeding", async () => {
    const parser = new Id3V24Parser();
    const source = new Uint8Array(data0);

    let done = false;
    for (const chunk of iterateBytes(source)) {
      done = await parser.feed(chunk);
      assert.ok(!done);
    }
    done = await parser.feed(null);
    assert.ok(done);

    const actualMetadata = await parser.getMetadata();
    assert.deepEqual(actualMetadata, metadata);
  });

  it("should parse padded data in byte by byte feeding", async () => {
    const parser = new Id3V24Parser();
    const source = new Uint8Array(data1);

    for (const chunk of iterateBytes(source)) {
      const done = await parser.feed(chunk);
      assert.ok(!done);
    }
    const done = await parser.feed(null);
    assert.ok(done);

    const actualMetadata = await parser.getMetadata();
    assert.deepEqual(actualMetadata, metadata);
  });

  it("should parse data with footer in byte by byte feeding", async () => {
    const parser = new Id3V24Parser();
    const source = new Uint8Array(data2);

    let done = false;
    for (const chunk of iterateBytes(source)) {
      done = await parser.feed(chunk);
      assert.ok(!done);
    }
    done = await parser.feed(null);
    assert.ok(done);

    const actualMetadata = await parser.getMetadata();
    assert.deepEqual(actualMetadata, metadata);
  });

  it("should parse data with multiple tags at start in byte by byte feeding", async () => {
    const parser = new Id3V24Parser();
    const source = new Uint8Array(data3);

    let done = false;
    for (const chunk of iterateBytes(source)) {
      done = await parser.feed(chunk);
      assert.ok(!done);
    }
    done = await parser.feed(null);
    assert.ok(done);

    const { name = "" } = (await parser.getMetadata()) || {};
    assert.equal(name, "The Book");
  });

  it("should parse data with multiple tags at end in byte by byte feeding", async () => {
    const parser = new Id3V24Parser();
    const source = new Uint8Array(data4);

    let done = false;
    for (const chunk of iterateBytes(source)) {
      done = await parser.feed(chunk);
      assert.ok(!done);
    }
    done = await parser.feed(null);
    assert.ok(done);

    const { name = "" } = (await parser.getMetadata()) || {};
    assert.equal(name, "The Book");
  });
});
