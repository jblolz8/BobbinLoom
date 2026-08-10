import { describe, expect, it } from "vitest";
import { extractCharaPayload } from "../src/server/characterCards/pngText";
import { makePng } from "./helpers/pngBuilder";

describe("extractCharaPayload (PNG tEXt/iTXt `chara` extractor)", () => {
  const payload = '{"spec":"chara_card_v2","data":{"name":"Mira","description":"Hi"}}';

  it("returns the payload stored under the `chara` keyword in a tEXt chunk", () => {
    expect(extractCharaPayload(makePng(payload))).toBe(payload);
  });

  it("returns the payload from an iTXt chunk (uncompressed)", () => {
    expect(extractCharaPayload(makePng(payload, "iTXt"))).toBe(payload);
  });

  it("returns null for a bad PNG signature", () => {
    const bad = makePng(payload);
    bad[0] = 0x00;
    expect(extractCharaPayload(bad)).toBeNull();
  });

  it("returns null for a buffer shorter than the signature", () => {
    expect(extractCharaPayload(Buffer.from("short"))).toBeNull();
  });

  it("returns null when the `chara` keyword is missing", () => {
    expect(extractCharaPayload(makePng("some other text", "tEXt", "description"))).toBeNull();
  });

  it("returns null when the chunk data is truncated (cut mid-chunk)", () => {
    const full = makePng(payload);
    // Chop off IEND plus part of the tEXt data: the declared chunk length no
    // longer fits inside the buffer.
    const truncated = full.subarray(0, full.length - 22);
    expect(extractCharaPayload(truncated)).toBeNull();
  });

  it("returns null when a chunk length field overflows the buffer", () => {
    const full = makePng(payload);
    const corrupt = Buffer.from(full);
    corrupt.writeUInt32BE(0xffffffff, 8); // first chunk (IHDR) length field
    expect(extractCharaPayload(corrupt)).toBeNull();
  });
});
