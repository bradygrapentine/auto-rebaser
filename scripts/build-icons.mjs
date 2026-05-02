#!/usr/bin/env node
// Rasterize icons/logo.svg → icons/icon{16,48,128}.png for the extension manifest.
// Chrome MV3 manifests don't accept SVG, so the toolbar/store icons must be PNG.
import sharp from 'sharp';
import { readFileSync } from 'fs';

const svg = readFileSync('icons/logo.svg');

for (const size of [16, 48, 128]) {
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(`icons/icon${size}.png`);
  console.log(`wrote icons/icon${size}.png`);
}
