import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = c ^ buf[i];
    for (let j = 0; j < 8; j++) {
      c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type);
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(combined), 0);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function generatePNG(width, height, isMaskable = false) {
  // Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = makeChunk('IHDR', ihdr);

  // Raw image data with scanlines
  const rowLength = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowLength);

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.46;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowLength;
    rawData[rowOffset] = 0; // Filter: None

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Colors: Royal Navy Blue background (#1e3a8a -> #0f172a gradient), Gold / White emblem in center
      // Gradient y
      const t = y / height;
      const r_bg = Math.round(30 * (1 - t) + 15 * t);
      const g_bg = Math.round(58 * (1 - t) + 23 * t);
      const b_bg = Math.round(138 * (1 - t) + 42 * t);

      // Check if inside central emblem (graduation cap diamond + base)
      // Cap diamond
      const capTop = cy - radius * 0.45;
      const capBot = cy + radius * 0.05;
      const capYRange = capBot - capTop;
      const relY = (y - capTop) / capYRange;
      const halfWidthAtY = (relY >= 0 && relY <= 1) ? (radius * 0.65 * (1 - Math.abs(relY - 0.5) * 2)) : -1;

      let r = r_bg, g = g_bg, b = b_bg, a = 255;

      if (!isMaskable && dist > radius * 1.05) {
        // outside rounded corners for standard icon
        const cornerDist = Math.max(Math.abs(dx), Math.abs(dy));
        if (cornerDist > radius * 0.98) {
          // Keep crisp corner rounding
        }
      }

      if (relY >= 0 && relY <= 1 && Math.abs(dx) <= halfWidthAtY) {
        // Golden mortarboard
        r = 245; g = 158; b = 11;
      } else if (y >= cy && y <= cy + radius * 0.35 && Math.abs(dx) <= radius * 0.4 && (dx * dx + dy * dy < radius * radius * 0.5)) {
        // White cap base
        r = 255; g = 255; b = 255;
      } else if (y >= cy + radius * 0.38 && y <= cy + radius * 0.65 && Math.abs(dx) <= radius * 0.55) {
        // White open book pages
        r = 240; g = 249; b = 255;
      }

      // Outer gold circle accent
      if (Math.abs(dist - radius * 0.88) < Math.max(2, width * 0.012)) {
        r = 251; g = 191; b = 36;
      }

      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressedData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const outDir = path.resolve('public');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

fs.writeFileSync(path.join(outDir, 'pwa-192x192.png'), generatePNG(192, 192, false));
fs.writeFileSync(path.join(outDir, 'pwa-512x512.png'), generatePNG(512, 512, false));
fs.writeFileSync(path.join(outDir, 'pwa-maskable-512x512.png'), generatePNG(512, 512, true));
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), generatePNG(180, 180, false));
fs.writeFileSync(path.join(outDir, 'favicon.ico'), generatePNG(32, 32, false));

console.log('Icons successfully generated in /public');
