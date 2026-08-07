/**
 * Which JavaScript modules exist under a directory.
 *
 * Shared by the site build and the precache test on purpose: they are answering
 * the same question — what is actually on disk — and two implementations of it
 * would be two chances to disagree about whether a file gets deployed.
 */

import { readdir } from 'node:fs/promises';
import path from 'node:path';

export const repoRoot = path.resolve(import.meta.dirname, '..');

/**
 * @param {string} dir  Repo-relative.
 * @returns {Promise<string[]>} repo-relative paths, with forward slashes
 */
export async function jsModulesUnder(dir) {
  const entries = await readdir(path.join(repoRoot, dir), {
    withFileTypes: true,
    recursive: true,
  });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => path.relative(repoRoot, path.join(entry.parentPath, entry.name)))
    .map((relative) => relative.split(path.sep).join('/'));
}
