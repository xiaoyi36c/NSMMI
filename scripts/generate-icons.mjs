/**
 * 生成 Tauri 打包所需的图标（不依赖外部图片素材）。
 * 用法：npm run icons
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA

  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function distanceToSegment(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / lengthSquared));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

function inRoundedSquare(nx, ny, radius) {
  const dx = Math.max(radius - nx, nx - (1 - radius), 0);
  const dy = Math.max(radius - ny, ny - (1 - radius), 0);
  return Math.hypot(dx, dy) <= radius;
}

function inGlyph(nx, ny) {
  if (nx < 0.24 || nx > 0.76 || ny < 0.22 || ny > 0.78) {
    return false;
  }
  if (nx >= 0.26 && nx <= 0.36) {
    return true;
  }
  if (nx >= 0.64 && nx <= 0.74) {
    return true;
  }
  return distanceToSegment(nx, ny, 0.3, 0.74, 0.7, 0.26) <= 0.055;
}

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const backgroundTop = [22, 33, 56];
  const backgroundBottom = [9, 13, 24];
  const glyphTop = [125, 211, 252];
  const glyphBottom = [37, 99, 235];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const nx = (x + 0.5) / size;
      const ny = (y + 0.5) / size;

      if (!inRoundedSquare(nx, ny, 0.22)) {
        rgba[offset + 3] = 0;
        continue;
      }

      const color = inGlyph(nx, ny)
        ? mix(glyphBottom, glyphTop, 1 - ny)
        : mix(backgroundBottom, backgroundTop, 1 - ny);

      rgba[offset] = color[0];
      rgba[offset + 1] = color[1];
      rgba[offset + 2] = color[2];
      rgba[offset + 3] = 255;
    }
  }

  return encodePng(size, rgba);
}

function encodeIco(sizes, images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);

  const entries = [];
  let offset = 6 + 16 * sizes.length;

  sizes.forEach((size, index) => {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(images[index].length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += images[index].length;
    entries.push(entry);
  });

  return Buffer.concat([header, ...entries, ...images]);
}

function encodeIcns(items) {
  const parts = [];
  for (const { type, data } of items) {
    const head = Buffer.alloc(8);
    head.write(type, 0, 4, "ascii");
    head.writeUInt32BE(data.length + 8, 4);
    parts.push(head, data);
  }

  const body = Buffer.concat(parts);
  const out = Buffer.alloc(8);
  out.write("icns", 0, 4, "ascii");
  out.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([out, body]);
}

const outputDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src-tauri", "icons");
mkdirSync(outputDir, { recursive: true });

const cache = new Map();
function png(size) {
  if (!cache.has(size)) {
    cache.set(size, render(size));
  }
  return cache.get(size);
}

const targets = {
  "32x32.png": png(32),
  "128x128.png": png(128),
  "128x128@2x.png": png(256),
  "icon.png": png(512),
  "icon.ico": encodeIco([16, 32, 48, 256], [png(16), png(32), png(48), png(256)]),
  "icon.icns": encodeIcns([
    { type: "ic11", data: png(64) },
    { type: "ic07", data: png(128) },
    { type: "ic08", data: png(256) },
    { type: "ic09", data: png(512) },
  ]),
};

for (const [name, data] of Object.entries(targets)) {
  writeFileSync(join(outputDir, name), data);
  console.log(`已生成 src-tauri/icons/${name} (${data.length} bytes)`);
}
