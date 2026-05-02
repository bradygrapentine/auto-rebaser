#!/usr/bin/env node
// Generates solid-color PNG icons (16/48/128) for the extension.
// Run: node scripts/generate-icons.cjs

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// CRC32 table — RFC 2083 §15.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makePng(size, [r, g, b]) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // color type: truecolor (RGB)
  ihdr[10] = 0;  // compression: deflate
  ihdr[11] = 0;  // filter: standard
  ihdr[12] = 0;  // interlace: none

  // One row = 1 filter byte (None) + size * 3 RGB bytes.
  const rowBytes = 1 + size * 3;
  const raw = Buffer.alloc(size * rowBytes);
  for (let y = 0; y < size; y++) {
    raw[y * rowBytes] = 0; // filter type None
    for (let x = 0; x < size; x++) {
      const off = y * rowBytes + 1 + x * 3;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
    }
  }

  const idat = zlib.deflateSync(raw);

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const COLOR = [0x2d, 0xa4, 0x4e]; // GitHub green
const SIZES = [16, 48, 128];

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });

for (const size of SIZES) {
  const buf = makePng(size, COLOR);
  const outPath = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(outPath, buf);
  console.log(`wrote ${outPath} (${buf.length} bytes)`);
}
