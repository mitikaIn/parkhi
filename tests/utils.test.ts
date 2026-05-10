import {
  decodeAscii,
  decodeUtf,
  decodeUtf8,
  decodeUtf16Be,
  decodeUtf16Le,
  parseU32,
} from "../src/utils.ts";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

describe("parseU32", () => {
  it("should parse data", () => {
    const u32 = parseU32(0x49, 0x96, 0x02, 0xd2);
    assert.equal(u32, 1234567890);
  });

  it("should parse data without overflow", () => {
    const u32 = parseU32(0x80, 0xab, 0xcd, 0xef);
    assert.equal(u32, 2158743023);
  });
});

describe("decodeAscii", () => {
  it("should parse data", () => {
    const text = decodeAscii(new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]));
    assert.equal(text, "Hello");
  });
});

describe("decodeUtf8", () => {
  it("should parse data with BOM", () => {
    const text = decodeUtf8(new Uint8Array([0xef, 0xbb, 0xbf, 0x48, 0x65, 0x6c, 0x6c, 0x6f]));
    assert.equal(text, "Hello");
  });

  it("should parse data without BOM", () => {
    const text = decodeUtf8(new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]));
    assert.equal(text, "Hello");
  });
});

describe("decodeUtf16Be", () => {
  it("should parse data with BOM", () => {
    const text = decodeUtf16Be(
      new Uint8Array([0xfe, 0xff, 0x00, 0x48, 0x00, 0x65, 0x00, 0x6c, 0x00, 0x6c, 0x00, 0x6f]),
    );
    assert.equal(text, "Hello");
  });

  it("should parse data without BOM", () => {
    const text = decodeUtf16Be(
      new Uint8Array([0x00, 0x48, 0x00, 0x65, 0x00, 0x6c, 0x00, 0x6c, 0x00, 0x6f]),
    );
    assert.equal(text, "Hello");
  });
});

describe("decodeUtf16Le", () => {
  it("should parse data with BOM", () => {
    const text = decodeUtf16Le(
      new Uint8Array([0xff, 0xfe, 0x48, 0x00, 0x65, 0x00, 0x6c, 0x00, 0x6c, 0x00, 0x6f, 0x00]),
    );
    assert.equal(text, "Hello");
  });

  it("should parse data without BOM", () => {
    const text = decodeUtf16Le(
      new Uint8Array([0x48, 0x00, 0x65, 0x00, 0x6c, 0x00, 0x6c, 0x00, 0x6f, 0x00]),
    );
    assert.equal(text, "Hello");
  });
});

describe("decodeUtf", () => {
  it("should parse UTF-16 BE data with BOM", () => {
    const text = decodeUtf(
      new Uint8Array([0xfe, 0xff, 0x00, 0x48, 0x00, 0x65, 0x00, 0x6c, 0x00, 0x6c, 0x00, 0x6f]),
    );
    assert.equal(text, "Hello");
  });

  it("should parse UTF-16 LE data with BOM", () => {
    const text = decodeUtf(
      new Uint8Array([0xff, 0xfe, 0x48, 0x00, 0x65, 0x00, 0x6c, 0x00, 0x6c, 0x00, 0x6f, 0x00]),
    );
    assert.equal(text, "Hello");
  });

  it("should parse UTF-8 data with BOM", () => {
    const text = decodeUtf(new Uint8Array([0xef, 0xbb, 0xbf, 0x48, 0x65, 0x6c, 0x6c, 0x6f]));
    assert.equal(text, "Hello");
  });

  it("should fallback to UTF-8 for data without BOM", () => {
    const text = decodeUtf(new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]));
    assert.equal(text, "Hello");
  });
});
