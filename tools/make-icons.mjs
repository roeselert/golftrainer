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
 * 152, 167 and 180 are the three `apple-touch-icon` sizes iOS asks for — iPad,
 * iPad Pro and iPhone at @3x. 192 and 512 are the sizes Chrome's install
 * criteria name. The maskable variant is the same art: it is drawn inside the
 * safe zone, so it needs no separate composition.
 */
const sizes = [
  { file: 'icon-152.png', size: 152 },
  { file: 'icon-167.png', size: 167 },
  { file: 'icon-180.png', size: 180 },
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
];

/**
 * The icon's own background, painted behind the art.
 *
 * Opacity is not a preference here. iOS composites any alpha channel in an
 * `apple-touch-icon` onto **black**, so a transparent corner becomes a black
 * corner on the home screen. The SVG's own rect covers the canvas today, which
 * is why the current PNGs have no alpha at all — but relying on that means an
 * edit to the artwork could reintroduce transparency silently. Painting it here
 * as well makes it impossible.
 */
const BACKGROUND = '#10231a';

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

      await page.setContent(
        `<style>html,body{margin:0;padding:0;background:${BACKGROUND}}` +
          `svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
        { waitUntil: 'load' },
      );

      await page.screenshot({ path: path.join(iconsDir, file) });
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
