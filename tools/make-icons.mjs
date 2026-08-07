/**
 * Rasterises `icons/icon.svg` into the PNGs the two platforms actually read.
 *
 * Why PNGs exist at all when the SVG is the source: iOS ignores the web app
 * manifest when adding to the home screen and reads `apple-touch-icon`, which
 * must be raster. Chrome's installability check wants 192 and 512. TD8 makes
 * installation a functional requirement rather than polish, so the icons are on
 * that path and cannot be "nice to have later".
 *
 * They are committed rather than generated at deploy time. Unlike `vendor/`,
 * these are a few kilobytes each, they are *ours*, and a deployment that has to
 * launch a browser to produce an icon is a deployment with a browser in it.
 *
 * Chromium comes from Playwright, which is already a dev dependency — no new
 * one is added, and nothing here runs in the app.
 */

import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from '@playwright/test';

import { repoRoot } from './source-modules.mjs';

const iconsDir = path.join(repoRoot, 'icons');

/**
 * `apple-touch-icon` is 180 because that is what iOS asks for; 192 and 512 are
 * the sizes Chrome's install criteria name. The maskable variant is the same
 * art — it is drawn inside the safe zone, so it needs no separate composition.
 */
const sizes = [
  { file: 'icon-180.png', size: 180 },
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
];

async function main() {
  const svg = await readFile(path.join(iconsDir, 'icon.svg'), 'utf8');
  await mkdir(iconsDir, { recursive: true });

  // Same escape hatch as playwright.config.js: an environment with a
  // preinstalled browser points at it instead of downloading a matching build.
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  );

  try {
    for (const { file, size } of sizes) {
      const page = await browser.newPage({
        viewport: { width: size, height: size },
        deviceScaleFactor: 1,
      });

      // A transparent page behind the art, so nothing of the browser's own
      // white leaks into the corners when a mask rounds them.
      await page.setContent(
        `<style>html,body{margin:0;padding:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
        { waitUntil: 'load' },
      );

      await page.screenshot({
        path: path.join(iconsDir, file),
        omitBackground: true,
      });
      await page.close();
    }
  } finally {
    await browser.close();
  }

  for (const { file } of sizes) {
    const { size } = await stat(path.join(iconsDir, file));
    console.log(`icons/${file}: ${(size / 1024).toFixed(1)} KB`);
  }
}

await main();
