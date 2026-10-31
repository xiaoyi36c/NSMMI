/**
 * 生成 Tauri 打包所需图标。
 * 源图：assets/icon-source.png（512x512，右下角已替换为 MOD 字样）
 * 用法：npm run icons
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";

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

// ---------- PNG 解码（支持 8bit 的 RGB/RGBA/灰度/调色板，非隔行） ----------

function unfilterLine(line, prev, filter, bpp) {
  const n = line.length;
  switch (filter) {
    case 1:
      for (let i = bpp; i < n; i += 1) {
        line[i] = (line[i] + line[i - bpp]) & 255;
      }
      break;
    case 2:
      for (let i = 0; i < n; i += 1) {
        line[i] = (line[i] + prev[i]) & 255;
      }
      break;
    case 3:
      for (let i = 0; i < n; i += 1) {
        const a = i >= bpp ? line[i - bpp] : 0;
        line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255;
      }
      break;
    case 4:
      for (let i = 0; i < n; i += 1) {
        const a = i >= bpp ? line[i - bpp] : 0;
        const b = prev[i];
        const c = i >= bpp ? prev[i - bpp] : 0;
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        line[i] = (line[i] + predictor) & 255;
      }
      break;
    default:
      break;
  }
}

function decodePng(buffer) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let palette = null;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8) {
        throw new Error("仅支持 8bit PNG 源图");
      }
      if (data[12] !== 0) {
        throw new Error("不支持隔行扫描的 PNG 源图");
      }
      colorType = data[9];
    } else if (type === "PLTE") {
      palette = data;
    } else if (type === "IDAT") {
      idat.push(data);
    }
    offset += 12 + length;
  }

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (channels === undefined || (colorType === 3 && palette === null)) {
    throw new Error(`不支持的 PNG 颜色类型: ${colorType}`);
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rgba = Buffer.alloc(width * height * 4);
  const prev = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    unfilterLine(line, prev, raw[y * (stride + 1)], channels);

    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      if (colorType === 6) {
        rgba.set(line.subarray(x * 4, x * 4 + 4), o);
      } else if (colorType === 2) {
        rgba[o] = line[x * 3];
        rgba[o + 1] = line[x * 3 + 1];
        rgba[o + 2] = line[x * 3 + 2];
        rgba[o + 3] = 255;
      } else if (colorType === 3) {
        const idx = line[x] * 3;
        rgba[o] = palette[idx];
        rgba[o + 1] = palette[idx + 1];
        rgba[o + 2] = palette[idx + 2];
        rgba[o + 3] = 255;
      } else if (colorType === 4) {
        rgba[o] = line[x * 2];
        rgba[o + 1] = line[x * 2];
        rgba[o + 2] = line[x * 2];
        rgba[o + 3] = line[x * 2 + 1];
      } else {
        rgba[o] = line[x];
        rgba[o + 1] = line[x];
        rgba[o + 2] = line[x];
        rgba[o + 3] = 255;
      }
    }
    prev.set(line);
  }

  return { width, height, rgba };
}

// ---------- 面积平均缩放（缩小清晰） ----------

function resize({ width, height, rgba }, size) {
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const sy0 = (y * height) / size;
    const sy1 = ((y + 1) * height) / size;
    for (let x = 0; x < size; x += 1) {
      const sx0 = (x * width) / size;
      const sx1 = ((x + 1) * width) / size;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let coverage = 0;

      for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy += 1) {
        const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
        for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx += 1) {
          const wx = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
          const w = wy * wx;
          const o = (sy * width + sx) * 4;
          r += rgba[o] * w;
          g += rgba[o + 1] * w;
          b += rgba[o + 2] * w;
          a += rgba[o + 3] * w;
          coverage += w;
        }
      }

      const o = (y * size + x) * 4;
      out[o] = Math.round(r / coverage);
      out[o + 1] = Math.round(g / coverage);
      out[o + 2] = Math.round(b / coverage);
      out[o + 3] = Math.round(a / coverage);
    }
  }
  return out;
}

// ---------- ICO / ICNS 封装 ----------

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

// ---------- 主流程 ----------

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = decodePng(readFileSync(join(root, "assets", "icon-source.png")));

const outputDir = join(root, "src-tauri", "icons");
mkdirSync(outputDir, { recursive: true });

const cache = new Map();
function png(size) {
  if (!cache.has(size)) {
    cache.set(size, encodePng(size, resize(source, size)));
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
