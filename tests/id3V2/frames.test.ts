import {
  type Chap,
  type Ctoc,
  decompressData,
  parseApic,
  parseChap,
  parseChapters,
  parseCtoc,
  parseSyncSafeSize,
  parseText,
  parseTit2,
  parseTpex,
  parseV23FrameBody,
  parseV23FrameHeader,
  parseV24FrameBody,
  parseV24FrameHeader,
  splitText,
} from "../../src/id3V2/frames.ts";
import { concat, encodeAscii, encodeU32 } from "../utils.ts";
import {
  compressData,
  makeV23Frame,
  makeV23FrameBody,
  makeV23FrameHeader,
  makeV24Frame,
  makeV24FrameBody,
  makeV24FrameHeader,
} from "./utils.ts";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

describe("parseSyncSafeSize", () => {
  it("should parse data", () => {
    const size = parseSyncSafeSize(0x00, 0x00, 0x02, 0x01);
    assert.equal(size, 257);
  });
});

describe("decompressData", () => {
  it("should decompress compressed data", async () => {
    const data = await compressData(new Uint8Array([0x00, 0x01, 0x02, 0x03]));
    const decompressed = await decompressData(data);

    assert.deepEqual(decompressed, new Uint8Array([0x00, 0x01, 0x02, 0x03]));
  });
});

describe("parseV23FrameHeader", () => {
  it("should parse data", () => {
    const data = makeV23FrameHeader("ABCD", 0x12, {
      hasCompression: true,
      hasGroupingIdentity: true,
    });
    const header = parseV23FrameHeader(data);

    assert.equal(header.id, "ABCD");
    assert.equal(header.size, 0x12);
    assert.ok(header.hasCompression);
    assert.ok(!header.hasEncryption);
    assert.ok(header.hasGroupingIdentity);
  });
});

describe("parseV23FrameBody", () => {
  it("should parse data with compression", async () => {
    const data = await makeV23FrameBody(new Uint8Array([0x00, 0x01, 0x02, 0x03]), {
      compress: true,
    });
    const body = await parseV23FrameBody(
      {
        id: "",
        size: data.length,
        hasCompression: true,
        hasEncryption: false,
        hasGroupingIdentity: false,
      },
      data,
    );

    assert.deepEqual(body, new Uint8Array([0x00, 0x01, 0x02, 0x03]));
  });

  it("should parse data with no compression", async () => {
    const data = await makeV23FrameBody(new Uint8Array([0x00, 0x01, 0x02, 0x03]));
    const body = await parseV23FrameBody(
      {
        id: "",
        size: data.length,
        hasCompression: false,
        hasEncryption: false,
        hasGroupingIdentity: false,
      },
      data,
    );

    assert.deepEqual(body, new Uint8Array([0x00, 0x01, 0x02, 0x03]));
  });
});

describe("parseV24FrameHeader", () => {
  it("should parse data", () => {
    const data = makeV24FrameHeader("ABCD", 0x12, {
      hasGroupingIdentity: true,
      hasCompression: true,
    });
    const header = parseV24FrameHeader(data);

    assert.equal(header.id, "ABCD");
    assert.equal(header.size, 0x12);
    assert.ok(header.hasGroupingIdentity);
    assert.ok(header.hasCompression);
    assert.ok(!header.hasEncryption);
    assert.ok(!header.hasUnsynchronisation);
    assert.ok(header.hasDataLengthIndicator);
  });
});

describe("parseV24FrameBody", () => {
  it("should parse data with compression", async () => {
    const data = await makeV24FrameBody(new Uint8Array([0x00, 0x01, 0x02, 0x03]), {
      compress: true,
    });
    const body = await parseV24FrameBody(
      false,
      {
        id: "",
        size: data.length,
        hasGroupingIdentity: false,
        hasCompression: true,
        hasEncryption: false,
        hasUnsynchronisation: false,
        hasDataLengthIndicator: true,
      },
      data,
    );

    assert.deepEqual(body, new Uint8Array([0x00, 0x01, 0x02, 0x03]));
  });

  it("should parse data with no compression", async () => {
    const data = await makeV24FrameBody(new Uint8Array([0x00, 0x01, 0x02, 0x03]));
    const body = await parseV24FrameBody(
      false,
      {
        id: "",
        size: data.length,
        hasGroupingIdentity: false,
        hasCompression: false,
        hasEncryption: false,
        hasUnsynchronisation: false,
        hasDataLengthIndicator: false,
      },
      data,
    );

    assert.deepEqual(body, new Uint8Array([0x00, 0x01, 0x02, 0x03]));
  });

  it("should parse data with local unsynchronisation", async () => {
    const data = await makeV24FrameBody(new Uint8Array([0x00, 0x01, 0x02, 0x03]), {
      doUnsynchronise: true,
    });
    const body = await parseV24FrameBody(
      false,
      {
        id: "",
        size: data.length,
        hasGroupingIdentity: false,
        hasCompression: false,
        hasEncryption: false,
        hasUnsynchronisation: true,
        hasDataLengthIndicator: true,
      },
      data,
    );

    assert.deepEqual(body, new Uint8Array([0x00, 0x01, 0x02, 0x03]));
  });

  it("should parse data with global unsynchronisation", async () => {
    const data = await makeV24FrameBody(new Uint8Array([0x00, 0x01, 0x02, 0x03]), {
      doUnsynchronise: true,
    });
    const body = await parseV24FrameBody(
      true,
      {
        id: "",
        size: data.length,
        hasGroupingIdentity: false,
        hasCompression: false,
        hasEncryption: false,
        hasUnsynchronisation: true,
        hasDataLengthIndicator: true,
      },
      data,
    );

    assert.deepEqual(body, new Uint8Array([0x00, 0x01, 0x02, 0x03]));
  });
});

describe("parseApic", () => {
  it("should parse data", async () => {
    const data = concat(
      [
        0x00, // Encoding: ISO-8859-1.
      ],
      encodeAscii("image/jpeg\x00"),
      [0x03], // Picture type: Cover.
      encodeAscii("Cover description\x00"),
      [
        0xff, // JPEG data.
        0xd8,
        0xff,
      ],
    );
    const picture = parseApic(data);

    assert.deepEqual(
      picture,
      new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" }),
    );
  });

  it("should skip data with MIME type '-->'", () => {
    const data = concat(
      [
        0x00, // Encoding: ISO-8859-1.
      ],
      encodeAscii("-->\x00"),
      [0x03], // Picture type: Cover.
      encodeAscii("Cover description\x00"),
      encodeAscii("http://example.com/image.jpg"),
    );
    const picture = parseApic(data);

    assert.equal(picture, null);
  });
});

describe("parseChap", () => {
  it("should parse v2.3 data", async () => {
    const data = concat(
      encodeAscii("CHAP id\x00"),
      encodeU32(8000), // Start: 8
      new Uint8Array(12),
      await makeV23Frame("TIT1", encodeAscii("\x00Chapter L1 Title")),
      await makeV23Frame("TIT2", encodeAscii("\x00Chapter Name"), { compress: true }),
      await makeV23Frame("TIT3", encodeAscii("\x00Chapter L3 Title")),
    );
    const chap = await parseChap("2.3", data);

    assert.equal(chap.id, "CHAP id");
    assert.equal(chap.start, 8);
    assert.equal(chap.name, "Chapter Name");
  });

  it("should parse v2.4 data", async () => {
    const data = concat(
      encodeAscii("CHAP id\x00"),
      encodeU32(8000), // Start: 8
      new Uint8Array(12),
      await makeV24Frame("TIT1", encodeAscii("\x00Chapter L1 Title")),
      await makeV24Frame("TIT2", encodeAscii("\x00Chapter Name")),
      await makeV24Frame("TIT3", encodeAscii("\x00Chapter L3 Title")),
    );
    const chap = await parseChap("2.4", data);

    assert.equal(chap.id, "CHAP id");
    assert.equal(chap.start, 8);
    assert.equal(chap.name, "Chapter Name");
  });
});

describe("parseCtoc", () => {
  it("should parse v2.3 data", async () => {
    const data = concat(
      encodeAscii("CTOC id\x00"),
      [0b00000010, 0x03], // Flags: root and count: 3.
      encodeAscii("Chapter 1\x00"),
      encodeAscii("Chapter 2\x00"),
      encodeAscii("Chapter 3\x00"),
      await makeV23Frame("TIT2", encodeAscii("\x00Table of Contents")),
    );
    const ctoc = await parseCtoc("2.3", data);

    assert.equal(ctoc.id, "CTOC id");
    assert.equal(ctoc.name, "Table of Contents");
    assert.ok(ctoc.root);
    assert.deepEqual(ctoc.children, ["Chapter 1", "Chapter 2", "Chapter 3"]);
  });

  it("should parse v2.4 data", async () => {
    const data = concat(
      encodeAscii("CTOC id\x00"),
      [0b00000010, 0x03], // Flags: root and count: 3.
      encodeAscii("Chapter 1\x00"),
      encodeAscii("Chapter 2\x00"),
      encodeAscii("Chapter 3\x00"),
      await makeV24Frame("TIT2", encodeAscii("\x00Table of Contents")),
    );
    const ctoc = await parseCtoc("2.4", data);

    assert.equal(ctoc.id, "CTOC id");
    assert.equal(ctoc.name, "Table of Contents");
    assert.ok(ctoc.root);
    assert.deepEqual(ctoc.children, ["Chapter 1", "Chapter 2", "Chapter 3"]);
  });
});

describe("parseChapters", () => {
  it("should parse data", () => {
    const chaps: Map<string, Chap> = new Map();
    chaps.set("chap1", { id: "chap1", name: "Chapter 1", start: 10 });
    chaps.set("chap2", { id: "chap2", name: "Chapter 2", start: 20 });
    chaps.set("chap3", { id: "chap3", name: "Chapter 3", start: 30 });
    chaps.set("chap4", { id: "chap4", name: "Chapter 4", start: 40 });

    const ctocs: Map<string, Ctoc> = new Map();
    ctocs.set("ctoc1", {
      id: "ctoc1",
      name: "Table of Contents",
      root: true,
      children: ["chap1", "ctoc2", "ctoc3"],
    });
    ctocs.set("ctoc2", { id: "ctoc2", name: "Part 1", root: false, children: ["chap2", "chap3"] });
    ctocs.set("ctoc3", { id: "ctoc3", name: "Part 2", root: false, children: ["chap4"] });

    const chapters = parseChapters(chaps, ctocs);

    assert.deepEqual(chapters, [
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
    ]);
  });
});

describe("parseText", () => {
  it("should parse IS0-8859 encoded data", () => {
    const text = parseText(new Uint8Array([0x00, 0x48, 0x65, 0x6c, 0x6c, 0x6f]));

    assert.equal(text, "Hello");
  });

  it("should parse UTF-16 encoded data", () => {
    const text = parseText(
      new Uint8Array([
        0x01, 0xff, 0xfe, 0x48, 0x00, 0x65, 0x00, 0x6c, 0x00, 0x6c, 0x00, 0x6f, 0x00,
      ]),
    );

    assert.equal(text, "Hello");
  });

  it("should parse UTF-16 BE encoded data", () => {
    const text = parseText(
      new Uint8Array([0x02, 0x00, 0x48, 0x00, 0x65, 0x00, 0x6c, 0x00, 0x6c, 0x00, 0x6f]),
    );

    assert.equal(text, "Hello");
  });

  it("should parse UTF-8 encoded data", () => {
    const text = parseText(new Uint8Array([0x03, 0x48, 0x65, 0x6c, 0x6c, 0x6f]));

    assert.equal(text, "Hello");
  });
});

describe("parseTit2", () => {
  it("should parse data", () => {
    const text = parseTit2(new Uint8Array([0x03, 0x48, 0x65, 0x6c, 0x6c, 0x6f]));
    assert.equal(text, "Hello");
  });
});

describe("splitText", () => {
  it("should split text with v2.3 separator", () => {
    const splits = splitText("2.3", "a/b/c");

    assert.deepEqual(splits, ["a", "b", "c"]);
  });

  it("should split text with v2.4 separator", () => {
    const splits = splitText("2.4", "a\x00b\x00c");

    assert.deepEqual(splits, ["a", "b", "c"]);
  });
});

describe("parseTpex", () => {
  it("should parse v2.3 data", () => {
    const tpex = parseTpex("2.3", new Uint8Array([0x00, 0x48, 0x65, 0x6c, 0x6c, 0x6f]));

    assert.deepEqual(tpex, ["Hello"]);
  });

  it("should parse v2.4 data", () => {
    const tpex = parseTpex("2.4", new Uint8Array([0x03, 0x48, 0x65, 0x6c, 0x6c, 0x6f]));

    assert.deepEqual(tpex, ["Hello"]);
  });
});
