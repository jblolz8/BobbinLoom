/** PNG signature bytes (0x89 'P' 'N' 'G' CR LF 0x1A LF). Exported for the
 *  import route's PNG/JSON sniffing. */
export const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Extract the base64 JSON payload stored under the `chara` keyword in a PNG's
 *  tEXt (or iTXt) chunk. Returns null when the PNG is invalid or has no card. */
export function extractCharaPayload(png: Buffer): string | null {
  if (png.length < 8 || !png.subarray(0, 8).equals(PNG_SIG)) return null;
  let offset = 8;
  while (offset + 8 <= png.length) {
    const len = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + len;
    if (dataEnd + 4 > png.length) return null; // truncated
    if (type === "IEND") return null;
    if (type === "tEXt" || type === "iTXt") {
      const data = png.subarray(dataStart, dataEnd);
      const nul = data.indexOf(0);
      if (nul > 0 && data.toString("latin1", 0, nul) === "chara") {
        if (type === "tEXt") return data.toString("latin1", nul + 1);
        // iTXt: keyword\0 compressionFlag\0 compressionMethod\0 lang\0 translated\0 text
        let i = nul + 1;
        if (i + 2 > data.length) return null;
        i += 2; // compression flag + method
        const langEnd = data.indexOf(0, i);
        if (langEnd < 0) return null;
        i = langEnd + 1;
        const transEnd = data.indexOf(0, i);
        if (transEnd < 0) return null;
        return data.toString("utf8", transEnd + 1);
      }
    }
    offset = dataEnd + 4; // skip CRC
  }
  return null;
}
