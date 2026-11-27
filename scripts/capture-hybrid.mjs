#!/usr/bin/env node
/**
 * Final-site visual and behavioural QA.
 *
 * Requires the dev server at http://localhost:4321/:
 *   npm run dev
 * Then:
 *   npm run capture:hybrid
 *
 * Captures the promoted design in light/dark/mobile and verifies identity,
 * contact, resume PDF, project routes, theme behaviour and axe results.
 * Screenshots go to a temp directory so review artifacts stay out of the repo.
 */

import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const require = createRequire(import.meta.url);
const axeSource = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8');

const edgeCandidates = [
  process.env.EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
].filter((candidate) => candidate && existsSync(candidate));

const origin = process.env.DESIGN_URL ?? 'http://localhost:4321';
const outDir = process.env.CAPTURE_OUT ?? join(tmpdir(), 'portfolio-final-capture');
const themeKey = 'portfolio-theme';
const displayName = 'Gaston Zabala - Technical Artist';
const expectedHeroLead =
  'Technical Artist with 5+ years of experience in game development, focused on ' +
  'real-time rendering, shader development, and computer graphics. Driven by a ' +
  'passion for graphics programming, technical experimentation, and exploring ' +
  'new rendering techniques.';

const projects = [
  ['ps1-rendering-pipeline', 'Retro Render Pipeline', 7],
  ['vfx-judgement-cut', 'VFX: Judgement Cut DMC5 - Fan Art', 1],
  ['vfx-explosion-practice', 'VFX - Explosion Practice', 1],
  ['study-journeys-sand', "Study: Journey's Sand", 11],
  ['weather-effect-rain', 'Weather Effect: Rain', 7],
];

const failures = [];

function check(label, ok, detail = '') {
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
  return ok ? 'ok' : `FAIL${detail ? `(${detail})` : ''}`;
}

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch(
  edgeCandidates.length > 0
    ? { executablePath: edgeCandidates[0], headless: true }
    : { channel: process.env.PW_CHANNEL ?? 'chrome', headless: true },
);

const context = await browser.newContext({
  reducedMotion: 'reduce',
  colorScheme: 'light',
  deviceScaleFactor: 1,
});

const shots = [
  { name: 'home-light', theme: 'light', width: 1440, height: 900 },
  { name: 'home-dark', theme: 'dark', width: 1440, height: 900 },
  { name: 'home-mobile-dark', theme: 'dark', width: 390, height: 844 },
  { name: 'home-full-light', theme: 'light', width: 1440, height: 900, fullPage: true },
];

async function auditPage(page) {
  await page.addScriptTag({ content: axeSource });
  const violations = await page.evaluate(async () => {
    const results = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
    });
    return results.violations.map(
      (violation) =>
        `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`,
    );
  });
  return violations;
}

async function withTheme(theme) {
  const page = await context.newPage();
  await page.addInitScript(
    ({ key, value }) => {
      try {
        localStorage.setItem(key, value);
      } catch (error) {
        /* Ignore storage failures in review captures. */
      }
    },
    { key: themeKey, value: theme },
  );
  await page.emulateMedia({ colorScheme: theme });
  return page;
}

try {
  for (const shot of shots) {
    const page = await withTheme(shot.theme);
    const failedRequests = [];
    page.on('response', (response) => {
      if (response.status() >= 400 && response.url().startsWith(origin)) {
        failedRequests.push(`${response.status()} ${response.url()}`);
      }
    });
    await page.setViewportSize({ width: shot.width, height: shot.height });
    await page.goto(`${origin}/`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: join(outDir, `${shot.name}.png`),
      fullPage: Boolean(shot.fullPage),
    });

    const state = await page.evaluate(() => {
      const headerRule = document.querySelector('.site-header__inner');
      const sectionRule = document.querySelector('#work > .container');
      const resumeLink = [...document.querySelectorAll('.contact__actions a')].find(
        (link) => /resume/i.test(link.textContent ?? ''),
      );
      const emailLink = document.querySelector('.contact__actions a[href^="mailto:"]');
      return {
        title: document.title,
        footer: document.querySelector('.footer')?.textContent.trim() ?? 'none',
        staleText: /Paper Hybrid|Design concept|concepts\/hybrid|not the production design|\/work\//i.test(
          document.documentElement.outerHTML,
        ),
        heroTitle: document.querySelector('#home-title')?.textContent.trim() ?? 'none',
        heroLead: document.querySelector('.hero__lead')?.textContent.trim() ?? 'none',
        sections: [...document.querySelectorAll('main section')]
          .map((section) => section.id)
          .filter(Boolean),
        cards: [...document.querySelectorAll('a.card__link')].map((link) => ({
          href: link.getAttribute('href') ?? 'none',
          title: link.querySelector('.card__title')?.textContent.trim() ?? 'none',
        })),
        experience: [...document.querySelectorAll('.experience-panel')].map((panel) => ({
          date: panel.querySelector('.experience-panel__label')?.textContent.trim() ?? 'none',
          title: panel.querySelector('.experience-panel__title')?.textContent.trim() ?? 'none',
          subtitle: panel.querySelector('.experience-panel__subtitle')?.textContent.trim() ?? 'none',
          org: panel.querySelector('.experience-panel__org')?.textContent.trim() ?? 'none',
          radius: getComputedStyle(panel).borderRadius,
          borderStyle: getComputedStyle(panel).borderStyle,
          borderWidth: getComputedStyle(panel).borderWidth,
          borderColor: getComputedStyle(panel).borderColor,
          background: getComputedStyle(panel).backgroundColor,
          marker: getComputedStyle(panel).listStyleType,
          labelColor: getComputedStyle(panel.querySelector('.experience-panel__label')).color,
        })),
        cardStyle: (() => {
          const style = getComputedStyle(document.querySelector('.card'));
          return {
            style: style.borderStyle,
            width: style.borderWidth,
            color: style.borderColor,
            radius: style.borderRadius,
          };
        })(),
        eyebrowColor: getComputedStyle(document.querySelector('.eyebrow')).color,
        panelTextColor: getComputedStyle(
          document.querySelector('.experience-panel__subtitle'),
        ).color,
        toolbox: [...document.querySelectorAll('.toolbox__group')].map((group) => ({
          label: group.querySelector('h3')?.textContent.trim() ?? 'none',
          tags: [...group.querySelectorAll('.tags li')].map((li) => li.textContent.trim()),
        })),
        contactEmail: emailLink?.textContent.trim() ?? 'none',
        contactEmailHref: emailLink?.getAttribute('href') ?? 'none',
        contactSocials: [...document.querySelectorAll('#contact .social a')].map((link) => ({
          label: link.textContent.trim(),
          href: link.getAttribute('href') ?? 'none',
        })),
        resumeLabel: resumeLink?.textContent.trim() ?? 'none',
        resumeHref: resumeLink?.getAttribute('href') ?? 'none',
        navLinks: [...document.querySelectorAll('.nav__links a')].map((link) =>
          link.textContent.trim(),
        ),
        menuDisplay: getComputedStyle(document.querySelector('[data-menu-toggle]')).display,
        ruleWidths: [
          Math.round(headerRule.getBoundingClientRect().width),
          Math.round(sectionRule.getBoundingClientRect().width),
        ],
        sectionRuleWidth: getComputedStyle(sectionRule).borderBottomWidth,
        fontLoaded: document.fonts.check('16px "Google Sans Code"'),
        theme: document.documentElement.dataset.theme ?? 'none',
        scheme: document.querySelector('meta[name="color-scheme"]')?.getAttribute('content') ?? 'none',
        overflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    });

    const titleOk = check(`${shot.name} title`, state.title === displayName, state.title);
    const footerOk = check(`${shot.name} footer`, state.footer.includes(displayName), state.footer);
    const staleOk = check(`${shot.name} stale text`, state.staleText === false, state.staleText);
    const identityOk = check(
      `${shot.name} identity`,
      state.heroTitle === 'Gaston Zabala' && state.heroLead === expectedHeroLead,
      state.heroTitle,
    );
    const sectionsOk = check(
      `${shot.name} sections`,
      state.sections.join(',') === 'work,experience,toolbox,contact',
      state.sections.join(' > '),
    );
    const cardsOk = check(
      `${shot.name} cards`,
      state.cards.length === projects.length &&
        projects.every(
          ([slug, title], index) =>
            state.cards[index].title === title &&
            new URL(state.cards[index].href, origin).pathname === `/projects/${slug}/`,
        ),
      state.cards.map((card) => `${card.title}:${card.href}`).join(' | '),
    );
    const experienceOk = check(
      `${shot.name} experience`,
      state.experience.length === 4 &&
        state.experience[0].date === 'Jun. 2023 - Present' &&
        state.experience[0].title === 'Technical Artist · Whiteboard Games' &&
        state.experience[1].title === 'Senior Technical Artist · Jam City' &&
        state.experience[2].title === 'Semi-Senior Technical Artist · Jam City' &&
        state.experience[3].title === 'Professor of Visual Effects · Escuela Da Vinci' &&
        state.experience.every((entry) => entry.marker === 'none'),
    );
    const panelsOk = check(
      `${shot.name} panels`,
      state.experience.every(
        (entry) =>
          entry.radius === state.cardStyle.radius &&
          entry.borderStyle === state.cardStyle.style &&
          entry.borderWidth === state.cardStyle.width &&
          entry.borderColor === state.cardStyle.color &&
          entry.background !== 'rgba(0, 0, 0, 0)',
      ),
    );
    const accentOk = check(
      `${shot.name} accent`,
      state.experience[0].labelColor === state.eyebrowColor &&
        state.experience.slice(1).every(
          (entry) =>
            entry.labelColor === state.panelTextColor &&
            entry.labelColor !== state.eyebrowColor,
        ),
    );
    const toolboxOk = check(
      `${shot.name} toolbox`,
      JSON.stringify(state.toolbox.map((group) => [group.label, group.tags])) ===
        JSON.stringify([
          ['Languages', ['C#', 'C++', 'HLSL']],
          ['Engines', ['Unity', 'Unreal Engine']],
          ['DCC Tools', ['Blender', 'Photoshop', 'Substance 3D Designer']],
          ['Tools', ['VisualStudio/Rider', 'Git', 'NVidia Nsight Graphics', 'RenderDoc']],
        ]),
    );
    const contactOk = check(
      `${shot.name} contact`,
      state.contactEmail === 'gastonzabala.job@gmail.com' &&
        state.contactEmailHref === 'mailto:gastonzabala.job@gmail.com' &&
        JSON.stringify(state.contactSocials) ===
          JSON.stringify([
            { label: 'LinkedIn', href: 'https://www.linkedin.com/in/gastonzabala/' },
            { label: 'GitHub', href: 'https://github.com/zagandev' },
          ]),
      JSON.stringify(state.contactSocials),
    );
    const resumeOk = check(
      `${shot.name} resume`,
      state.resumeLabel === 'View Resume (PDF)' && state.resumeHref === '/gaston_zabala_resume.pdf',
      `${state.resumeLabel}/${state.resumeHref}`,
    );
    const navOk = check(
      `${shot.name} nav`,
      state.navLinks.join(',') === 'Portfolio,Contact',
      state.navLinks.join(','),
    );
    const rulesOk = check(
      `${shot.name} rules`,
      state.ruleWidths[0] === state.ruleWidths[1] && state.sectionRuleWidth !== '0px',
      `${state.ruleWidths.join('/')} ${state.sectionRuleWidth}`,
    );
    const fontOk = check(`${shot.name} font`, state.fontLoaded);
    const overflowOk = check(`${shot.name} overflow`, state.overflow === false);
    const requestsOk = check(`${shot.name} requests`, failedRequests.length === 0, failedRequests.join(' | '));
    const violations = await auditPage(page);
    const axeOk = check(`${shot.name} axe`, violations.length === 0, violations.join(' | '));

    await page.click('[data-theme-toggle]');
    const after = await page.evaluate((key) => ({
      theme: document.documentElement.dataset.theme,
      saved: localStorage.getItem(key),
      pressed: document.querySelector('[data-theme-toggle]')?.getAttribute('aria-pressed'),
    }), themeKey);
    const toggleOk = check(
      `${shot.name} toggle`,
      after.theme !== shot.theme && after.saved === after.theme,
      JSON.stringify(after),
    );

    const menuOk = check(
      `${shot.name} menu`,
      shot.width <= 680
        ? state.menuDisplay !== 'none'
        : state.menuDisplay === 'none',
      state.menuDisplay,
    );

    console.log(
      `${shot.name}.png  theme=${state.theme}/${state.scheme}  ` +
        `title=${titleOk} footer=${footerOk} identity=${identityOk} stale=${staleOk} ` +
        `cards=${cardsOk} experience=${experienceOk} panels=${panelsOk} accent=${accentOk} ` +
        `toolbox=${toolboxOk} contact=${contactOk} resume=${resumeOk} nav=${navOk} ` +
        `rules=${rulesOk} sections=${sectionsOk} font=${fontOk} overflow=${overflowOk} ` +
        `toggle=${toggleOk} menu=${menuOk} requests=${requestsOk} axe=${axeOk}`,
    );
    await page.close();
  }

  const pdfResponse = await context.request.get(`${origin}/gaston_zabala_resume.pdf`);
  check(
    'resume PDF',
    pdfResponse.ok() && /pdf/i.test(pdfResponse.headers()['content-type'] ?? ''),
    `${pdfResponse.status()} ${pdfResponse.headers()['content-type'] ?? 'none'}`,
  );

  const menuPage = await context.newPage();
  await menuPage.setViewportSize({ width: 390, height: 844 });
  await menuPage.goto(`${origin}/`, { waitUntil: 'networkidle', timeout: 30000 });
  await menuPage.click('[data-menu-toggle]');
  const menuState = await menuPage.evaluate(() => {
    const menu = document.querySelector('[data-nav-menu]');
    const box = menu.getBoundingClientRect();
    return {
      expanded: document.querySelector('[data-menu-toggle]')?.getAttribute('aria-expanded'),
      open: menu?.getAttribute('data-open'),
      display: getComputedStyle(menu).display,
      onScreen: box.top >= 0 && box.top < window.innerHeight,
    };
  });
  check(
    'mobile menu interaction',
    menuState.expanded === 'true' &&
      menuState.open === 'true' &&
      menuState.display !== 'none' &&
      menuState.onScreen,
    JSON.stringify(menuState),
  );
  await menuPage.close();

  for (const [slug, title, expectedMedia] of projects) {
    for (const theme of ['light', 'dark']) {
      const page = await withTheme(theme);
      const failedRequests = [];
      page.on('response', (response) => {
        if (response.status() >= 400 && response.url().startsWith(origin)) {
          failedRequests.push(`${response.status()} ${response.url()}`);
        }
      });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${origin}/projects/${slug}/`, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      const state = await page.evaluate(() => ({
        title: document.title,
        h1: document.querySelectorAll('h1').length,
        heading: document.querySelector('#project-title')?.textContent.trim() ?? 'none',
        footer: document.querySelector('.footer')?.textContent.trim() ?? 'none',
        backHref: document.querySelector('.back-link')?.getAttribute('href') ?? 'none',
        mediaCount: document.querySelectorAll('.media-item').length,
        mediaSources: [...document.querySelectorAll('.media-frame img, .media-frame video, .media-frame iframe')]
          .map((element) => element.getAttribute('src') ?? '')
          .filter(Boolean).length,
        staleText: /Paper Hybrid|Design concept|concepts\/hybrid|not the production design|\/work\//i.test(
          document.documentElement.outerHTML,
        ),
        overflow: document.documentElement.scrollWidth > window.innerWidth,
      }));

      const detailOk =
        state.title === `${title} - ${displayName}` &&
        state.h1 === 1 &&
        state.heading === title &&
        state.footer.includes(displayName) &&
        new URL(state.backHref, origin).pathname === '/' &&
        state.backHref.includes('#work') &&
        state.mediaCount === expectedMedia &&
        state.mediaSources === expectedMedia &&
        state.staleText === false &&
        state.overflow === false &&
        failedRequests.length === 0;
      const violations = await auditPage(page);
      const axeOk = violations.length === 0;

      if (slug === projects[0][0] && theme === 'light') {
        await page.screenshot({ path: join(outDir, 'project-light.png') });
      }
      if (slug === projects[0][0] && theme === 'dark') {
        await page.screenshot({ path: join(outDir, 'project-dark.png') });
      }

      console.log(
        `${slug}/${theme}  title=${detailOk ? 'ok' : 'FAIL'} media=${state.mediaCount}/${state.mediaSources} ` +
          `requests=${failedRequests.length === 0 ? 'ok' : `FAIL(${failedRequests.join(' | ')})`} ` +
          `axe=${axeOk ? '0' : violations.join(', ')}`,
      );
      if (!detailOk) {
        failures.push(`${slug}/${theme} detail mismatch — ${JSON.stringify(state)}`);
      }
      if (!axeOk) failures.push(`${slug}/${theme} axe — ${violations.join(' | ')}`);
      await page.close();
    }
  }

  for (const systemTheme of ['dark', 'light']) {
    const page = await context.newPage();
    await page.addInitScript((key) => {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        /* Ignore storage failures in review checks. */
      }
    }, themeKey);
    await page.emulateMedia({ colorScheme: systemTheme });
    await page.goto(`${origin}/`, { waitUntil: 'networkidle', timeout: 30000 });
    const detected = await page.evaluate(() => document.documentElement.dataset.theme);
    check(`system ${systemTheme}`, detected === systemTheme, detected);
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(`\nScreenshots: ${outDir}`);
if (failures.length) {
  console.error(`\n${failures.length} failure(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log('\nAll final-site checks passed.');
}
