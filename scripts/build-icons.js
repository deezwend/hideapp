// Derives the icon assets from the source artwork (assets/icon-source.png)
// using only Node built-ins, so the binary assets stay reproducible:
//   assets/icon.png       512x512 square application/window icon
//   assets/tray-icon.png  32x32 tray icon
//   assets/icon.ico       multi-size Windows icon for the packaged build
// Usage: npm run icons
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ASSETS = path.join(__dirname, '..', 'assets');
const SOURCE = path.join(ASSETS, 'icon-source.png');
// Fraction of the square canvas the artwork fills; the rest is transparent
// padding so the icon is not distorted and keeps breathing room.
const FILL = 0.94;
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

function decodePng(buffer) {
  let offset = 8;
  let width, height, bitDepth, colorType;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.slice(offset + 4, offset + 8).toString('ascii');
    const data = buffer.slice(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  if (bitDepth !== 8 || colorType !== 6) throw new Error(`Unsupported PNG: depth ${bitDepth}, color type ${colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  const pixels = Buffer.alloc(height * stride);
  let cursor = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[cursor++];
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? pixels[y * stride + x - bpp] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? pixels[(y - 1) * stride + x - bpp] : 0;
      let value = raw[cursor + x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixels[y * stride + x] = value & 255;
    }
    cursor += stride;
  }
  return { width, height, pixels };
}

function alphaBBox({ width, height, pixels }) {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

// Exact area-average downscale of the artwork into a square RGBA canvas.
// Alpha is premultiplied while averaging so edges get no dark fringe.
function renderSquare(source, box, size) {
  const boxWidth = box.x1 - box.x0;
  const boxHeight = box.y1 - box.y0;
  const scale = Math.min(size * FILL / boxWidth, size * FILL / boxHeight);
  const originX = (size - boxWidth * scale) / 2;
  const originY = (size - boxHeight * scale) / 2;
  const out = Buffer.alloc(size * size * 4);
  for (let dy = 0; dy < size; dy++) {
    const y0 = box.y0 + (dy - originY) / scale;
    const y1 = box.y0 + (dy + 1 - originY) / scale;
    if (y1 <= box.y0 || y0 >= box.y1) continue;
    const yStart = Math.max(box.y0, Math.floor(y0));
    const yEnd = Math.min(box.y1, Math.ceil(y1));
    for (let dx = 0; dx < size; dx++) {
      const x0 = box.x0 + (dx - originX) / scale;
      const x1 = box.x0 + (dx + 1 - originX) / scale;
      if (x1 <= box.x0 || x0 >= box.x1) continue;
      const xStart = Math.max(box.x0, Math.floor(x0));
      const xEnd = Math.min(box.x1, Math.ceil(x1));
      let alphaSum = 0, redSum = 0, greenSum = 0, blueSum = 0, weightSum = 0;
      for (let y = yStart; y < yEnd; y++) {
        const weightY = Math.min(y1, y + 1) - Math.max(y0, y);
        if (weightY <= 0) continue;
        for (let x = xStart; x < xEnd; x++) {
          const weightX = Math.min(x1, x + 1) - Math.max(x0, x);
          if (weightX <= 0) continue;
          const index = (y * source.width + x) * 4;
          const alpha = source.pixels[index + 3];
          const weight = weightX * weightY;
          alphaSum += alpha * weight;
          redSum += source.pixels[index] * alpha * weight;
          greenSum += source.pixels[index + 1] * alpha * weight;
          blueSum += source.pixels[index + 2] * alpha * weight;
          weightSum += weight;
        }
      }
      if (alphaSum <= 0 || weightSum <= 0) continue;
      const target = (dy * size + dx) * 4;
      out[target] = Math.round(redSum / alphaSum);
      out[target + 1] = Math.round(greenSum / alphaSum);
      out[target + 2] = Math.round(blueSum / alphaSum);
      out[target + 3] = Math.round(alphaSum / weightSum);
    }
  }
  return out;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();
function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}
function pngChunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.slice(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}
function encodePng(rgba, width, height) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ICO entries are stored as uncompressed 32-bit DIBs: BITMAPINFOHEADER,
// bottom-up BGRA pixels and a 1-bit AND mask marking fully transparent pixels.
function icoEntry(rgba, size) {
  const maskStride = ((size + 31) >> 5) * 4;
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(size * size * 4, 20);
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const source = (y * size + x) * 4;
      const target = ((size - 1 - y) * size + x) * 4;
      pixels[target] = rgba[source + 2];
      pixels[target + 1] = rgba[source + 1];
      pixels[target + 2] = rgba[source];
      pixels[target + 3] = rgba[source + 3];
    }
  }
  const mask = Buffer.alloc(maskStride * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (rgba[(y * size + x) * 4 + 3] !== 0) continue;
      const row = (size - 1 - y) * maskStride;
      mask[row + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return Buffer.concat([header, pixels, mask]);
}
function encodeIco(images) {
  const directory = Buffer.alloc(6 + images.length * 16);
  directory.writeUInt16LE(0, 0);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(images.length, 4);
  let offset = directory.length;
  images.forEach((image, index) => {
    const entry = 6 + index * 16;
    directory[entry] = image.size >= 256 ? 0 : image.size;
    directory[entry + 1] = image.size >= 256 ? 0 : image.size;
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(image.data.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += image.data.length;
  });
  return Buffer.concat([directory, ...images.map(image => image.data)]);
}

const source = decodePng(fs.readFileSync(SOURCE));
const box = alphaBBox(source);
console.log(`source ${source.width}x${source.height}, artwork box ${box.x1 - box.x0}x${box.y1 - box.y0}`);

const render = size => renderSquare(source, box, size);
const write = (name, buffer) => {
  fs.writeFileSync(path.join(ASSETS, name), buffer);
  console.log(`${name} ${buffer.length} bytes`);
};
write('icon.png', encodePng(render(512), 512, 512));
write('tray-icon.png', encodePng(render(32), 32, 32));
write('icon.ico', encodeIco(ICO_SIZES.map(size => ({ size, data: icoEntry(render(size), size) }))));
