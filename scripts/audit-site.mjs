#!/usr/bin/env node
/**
 * Runtime QA against the local preview server.
 *
 * - loads every route at desktop and mobile widths
 * - checks for horizontal overflow and the system font stack
 * - runs axe-core accessibility scans
 * - exercises the shared light/dark toggle
 *
 * Start the preview server first:
 *   npm run build && npm run preview -- --port 4322
 *
 * Then:
 *   node scripts/audit-site.mjs
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';

const require = createRequire(import.meta.url);
const axeSource = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8');
const edgeCandidates = [
  process.env.EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/microsoft-edge',
  '/usr/bin/google-chrome',
].filter((candidate) => candidate && existsSync(candidate));
const origin = process.env.AUDIT_URL ?? 'http://localhost:4321/web-portfolio';

const routes = [
  '/',
  '/projects/ps1-rendering-pipeline/',
  '/projects/vfx-judgement-cut/',
  '/projects/vfx-explosion-practice/',
  '/projects/study-journeys-sand/',
  '/projects/weather-effect-rain/',
  '/404.html',
];
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

const failures = [];
const notes = [];

const browser = await chromium.launch(
  edgeCandidates.length > 0
    ? { executablePath: edgeCandidates[0], headless: true }
    : { channel: process.env.PW_CHANNEL ?? 'chrome', headless: true },
);
const context = await browser.newContext({ reducedMotion: 'reduce', colorScheme: 'light' });

for (const viewport of viewports) {
  const page = await context.newPage();
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  const consoleErrors = [];
  const failedMedia = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('response', (response) => {
    if (
      response.status() >= 400 &&
      /\.(?:mp4|png|jpe?g|webp|avif|gif)(?:[?#]|$)/i.test(response.url())
    ) {
      failedMedia.push(`${response.status()} ${response.url()}`);
    }
  });

  for (const route of routes) {
    const errorStart = consoleErrors.length;
    const mediaStart = failedMedia.length;
    const expects404 = route === '/404.html';
    const response = await page.goto(`${origin}${route}`, { waitUntil: 'networkidle' });
    const status = response?.status() ?? 0;
    if (!response || (!response.ok() && !(expects404 && status === 404))) {
      failures.push(`${viewport.name} ${route}: HTTP ${status || 'no response'}`);
      continue;
    }

    await page.evaluate(() => document.fonts.ready);

    const layout = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      fontBody: getComputedStyle(document.body).fontFamily,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      h1Count: document.querySelectorAll('h1').length,
    }));

    if (layout.scrollWidth > layout.clientWidth + 1) {
      failures.push(
        `${viewport.name} ${route}: horizontal overflow (${layout.scrollWidth}px > ${layout.clientWidth}px)`,
      );
    }
    if (!/system-ui|Segoe UI|-apple-system/i.test(layout.fontBody)) {
      failures.push(`${viewport.name} ${route}: system font stack not applied (${layout.fontBody})`);
    }
    const routeMediaFailures = failedMedia.slice(mediaStart);
    for (const failure of routeMediaFailures) {
      failures.push(`${viewport.name} ${route}: failed media request — ${failure}`);
    }

    const axeResults = await page.evaluate(async (source) => {
      // eslint-disable-next-line no-eval
      eval(source);
      return window.axe.run(document, {
        resultTypes: ['violations'],
      });
    }, axeSource);

    for (const violation of axeResults.violations) {
      const targets = violation.nodes
        .slice(0, 3)
        .map((node) => node.target.join(' '))
        .join(' | ');
      if (violation.impact === 'critical' || violation.impact === 'serious') {
        failures.push(
          `${viewport.name} ${route}: axe ${violation.impact} — ${violation.id}: ${violation.help} [${targets}]`,
        );
      } else {
        notes.push(
          `${viewport.name} ${route}: axe ${violation.impact} — ${violation.id}: ${violation.help} [${targets}]`,
        );
      }
    }

    notes.push(
      `${viewport.name} ${route}: ${layout.h1Count} h1, ${layout.scrollWidth}px wide`,
    );

    const routeErrors = consoleErrors
      .slice(errorStart)
      .filter((error) => !(expects404 && /404/.test(error)));
    for (const error of routeErrors) {
      failures.push(`${viewport.name} ${route}: console error — ${error}`);
    }
  }

  await page.close();
}

const themePage = await context.newPage();
await themePage.addInitScript(() => {
  try {
    localStorage.removeItem('portfolio-theme');
  } catch (error) {
    /* Ignore storage failures. */
  }
});
await themePage.emulateMedia({ colorScheme: 'dark' });
await themePage.goto(`${origin}/`, { waitUntil: 'networkidle' });
const beforeToggle = await themePage.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  scheme: document.querySelector('meta[name="color-scheme"]')?.getAttribute('content'),
  pressed: document.querySelector('[data-theme-toggle]')?.getAttribute('aria-pressed'),
}));
if (beforeToggle.theme !== 'dark' || beforeToggle.scheme !== 'dark' || beforeToggle.pressed !== 'true') {
  failures.push(`theme: system dark not applied (${JSON.stringify(beforeToggle)})`);
}
await themePage.click('[data-theme-toggle]');
const afterToggle = await themePage.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  saved: localStorage.getItem('portfolio-theme'),
  pressed: document.querySelector('[data-theme-toggle]')?.getAttribute('aria-pressed'),
}));
if (afterToggle.theme !== 'light' || afterToggle.saved !== 'light' || afterToggle.pressed !== 'false') {
  failures.push(`theme: toggle did not switch and persist (${JSON.stringify(afterToggle)})`);
}
await themePage.close();

await browser.close();

console.log(`Audited ${routes.length} routes at ${viewports.length} viewports.`);
if (notes.length) {
  console.log('\nNotes:');
  for (const note of notes) console.log(`  - ${note}`);
}
if (failures.length) {
  console.error('\nFailures:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log('\nNo failures.');
}
