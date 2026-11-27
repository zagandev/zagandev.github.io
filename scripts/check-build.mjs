#!/usr/bin/env node
/**
 * Static build QA.
 *
 * Checks the generated `dist/` output for broken internal links and assets,
 * missing image alt text, missing document metadata, multiple h1 elements,
 * and stale references to removed concept/old-web routes.
 *
 * Usage:
 *   node scripts/check-build.mjs
 *   node scripts/check-build.mjs --base=/web-portfolio
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');

const baseArg = process.argv.find((arg) => arg.startsWith('--base='));
const base = (baseArg ? baseArg.slice('--base='.length) : process.env.BASE_PATH ?? '/web-portfolio')
  .replace(/\/+$/, '')
  .replace(/^(?!\/)/, '/');

const errors = [];
const warnings = [];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&#38;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function isLocal(url) {
  return url.startsWith('/') && !url.startsWith('//');
}

function resolveLocal(url) {
  const clean = decodeEntities(url.split('#')[0].split('?')[0]);
  if (!clean) return null;

  let path = clean;
  if (base && path.startsWith(`${base}/`)) path = path.slice(base.length);
  else if (path === base) path = '/';
  else if (base && path.startsWith(base)) path = path.slice(base.length);

  if (!path.startsWith('/')) return null;
  return path;
}

async function assertOutputExists(url, page) {
  if (!isLocal(url)) return;
  const path = resolveLocal(url);
  if (path === null) return;

  const target = join(dist, ...path.split('/').filter(Boolean));
  try {
    const info = await stat(target);
    if (info.isFile()) return;
    if (info.isDirectory()) {
      await stat(join(target, 'index.html'));
      return;
    }
  } catch {
    // Fall through to the alternate resolution below.
  }

  if (!/\.[a-z0-9]+$/i.test(path)) {
    try {
      await stat(`${target}${sep}index.html`);
      return;
    } catch {
      // Report the original path.
    }
  }

  errors.push(`${page}: broken internal reference ${url}`);
}

const files = await walk(dist);
const htmlFiles = files.filter((file) => file.endsWith('.html'));

for (const file of htmlFiles) {
  const page = relative(dist, file).split(sep).join('/');
  const html = await readFile(file, 'utf8');

  if (!/<html[^>]*\slang=/i.test(html)) errors.push(`${page}: missing <html lang>`);
  if (!/<title>[^<]+<\/title>/i.test(html)) errors.push(`${page}: missing <title>`);
  if (!/<meta\s+name="description"\s+content="[^"]+"/i.test(html)) {
    errors.push(`${page}: missing meta description`);
  }
  if (!/<main[\s>]/i.test(html)) errors.push(`${page}: missing <main>`);
  if (!/rel="canonical" href="https?:\/\//i.test(html)) {
    errors.push(`${page}: canonical URL is missing or not absolute`);
  }

  const h1Count = (html.match(/<h1[\s>]/gi) ?? []).length;
  if (h1Count !== 1) errors.push(`${page}: expected 1 <h1>, found ${h1Count}`);

  for (const match of html.matchAll(/<img\b([^>]*)>/gi)) {
    const attrs = match[1];
    if (!/\salt=("|')/i.test(` ${attrs}`)) errors.push(`${page}: <img> without alt attribute`);
  }

  const references = new Set();
  for (const match of html.matchAll(/\s(?:href|src|poster)="([^"]+)"/gi)) {
    references.add(match[1]);
  }
  for (const match of html.matchAll(/\ssrcset="([^"]+)"/gi)) {
    for (const candidate of match[1].split(',')) {
      const url = candidate.trim().split(/\s+/)[0];
      if (url) references.add(url);
    }
  }

  for (const reference of references) await assertOutputExists(reference, page);

  if (/\/work\/|concepts\/hybrid|warm-editorial|Paper Hybrid|Design concept|not the production design/i.test(html)) {
    errors.push(`${page}: stale concept or old-web reference in output`);
  }
}

for (const file of files) {
  if (file.endsWith('.html')) continue;
  if (file.endsWith('.map')) warnings.push(`${relative(dist, file)}: source map emitted`);
}

const summary = [
  `Checked ${htmlFiles.length} HTML pages and ${files.length} output files.`,
  `Base path: ${base || '/'}`,
  errors.length ? `${errors.length} error(s)` : 'No errors.',
  warnings.length ? `${warnings.length} warning(s)` : 'No warnings.',
].join('\n');

console.log(summary);

if (warnings.length) {
  console.log('\nWarnings:');
  for (const warning of warnings) console.log(`  - ${warning}`);
}

if (errors.length) {
  console.error('\nErrors:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exitCode = 1;
}
