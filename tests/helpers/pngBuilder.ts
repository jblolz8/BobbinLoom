/** Shared PNG test builder: assembles a minimal valid PNG in-memory
 *  (signature + IHDR + tEXt/iTXt chunk + IEND) with a real CRC32, so tests
 *  exercise the real chunk-walking code paths in pngText.ts / parseCard.ts. */

export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** Standard PNG CRC-32 (reflected polynomial 0xEDB88320). */
export function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** Assemble a minimal valid PNG (1x1 RGBA) whose text chunk carries `payload`
 *  under `keyword` (default "chara"). tEXt stores latin1 text; iTXt is built
 *  uncompressed (flag 0, method 0) with empty lang/translated strings. */
export function makePng(
  charaPayload: string,
  textChunkType: "tEXt" | "iTXt" = "tEXt",
  keyword = "chara"
): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4); // 1x1
  ihdr[8] = 8;
  ihdr[9] = 6; // bit depth 8, color type 6 (RGBA)
  const kw = Buffer.from(`${keyword}\0`, "latin1");
  const text =
    textChunkType === "tEXt"
      ? Buffer.concat([kw, Buffer.from(charaPayload, "latin1")])
      : Buffer.concat([
          kw,
          Buffer.from([0, 0, 0]),
          Buffer.from("", "utf8"),
          Buffer.from([0]),
          Buffer.from(charaPayload, "utf8"),
        ]);
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk(textChunkType, text),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
