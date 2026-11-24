// Browser check of the built site (run "airwatch site" first). Needs Chrome; fails, not skips, without it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { serveDir, randomPort } from '../../scripts/lib/serve.mjs';
import { ROOT } from '../helpers.mjs';

const DIST = path.join(ROOT, 'dist');
const CHROME = [process.env.AIRWATCH_CHROME, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((c) => c && fs.existsSync(c));
const PAGES = ['index.html', 'states/index.html', 'states/kuching/index.html', 'history/index.html', 'alerts/index.html', 'method/index.html'];
let srv;
let browser;

before(async () => {
  assert.ok(fs.existsSync(path.join(DIST, 'index.html')), 'dist/ is missing: run "node scripts/airwatch.mjs site" first');
  assert.ok(CHROME, 'no Chrome found: install Google Chrome or set AIRWATCH_CHROME');
  srv = await serveDir(DIST, { port: randomPort() });
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
});

after(async () => {
  await browser?.close();
  await srv?.close();
});

async function open(urlPath, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('requestfailed', (r) => problems.push(`failed: ${r.url()}`));
  await page.goto(`http://127.0.0.1:${srv.port}/${urlPath}`, { waitUntil: 'networkidle' });
  return { page, ctx, problems };
}

test('every page loads under its CSP with no errors and no off-site requests', async () => {
  for (const p of PAGES) {
    const offsite = [];
    const { page, ctx, problems } = await open(p);
    page.on('request', (r) => !r.url().startsWith(`http://127.0.0.1:${srv.port}/`) && offsite.push(r.url()));
    await page.reload({ waitUntil: 'networkidle' });
    assert.deepEqual(problems, [], p);
    assert.deepEqual(offsite, [], p);
    await ctx.close();
  }
});

test('the self-hosted fonts load', async () => {
  const { page, ctx } = await open('index.html');
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => document.fonts.check('300 16px Fraunces')), true);
  assert.equal(await page.evaluate(() => document.fonts.check('16px "IBM Plex Mono"')), true);
  await ctx.close();
});

test('the home page shows KL temperature, AQI, advice, charts, 7 days and 16 tiles', async () => {
  const { page, ctx } = await open('index.html');
  assert.equal(await page.locator('h1').textContent(), 'Kuala Lumpur');
  assert.match(await page.locator('.temp').textContent(), /\d+°C/);
  assert.match(await page.locator('.aqi-value').textContent(), /^\d+$/);
  assert.ok((await page.locator('.advice').first().textContent()).length > 20);
  assert.equal(await page.locator('figure.chart svg[role="img"]').count(), 2);
  assert.equal(await page.locator('.days > li').count(), 7);
  assert.equal(await page.locator('.tiles > li').count(), 16);
  await ctx.close();
});

test('pointing at a chart writes the values into its readout', async () => {
  const { page, ctx } = await open('index.html');
  const fig = page.locator('figure.chart').first();
  await fig.scrollIntoViewIfNeeded();
  const box = await fig.locator('svg').boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  assert.match(await fig.locator('[data-readout]').textContent(), /Temperature \d/);
  await ctx.close();
});

test('the data tables open and hold one row per hour', async () => {
  const { page, ctx } = await open('index.html');
  await page.locator('details.chart-data summary').first().click();
  assert.equal(await page.locator('details.chart-data[open] tbody tr').count(), 48);
  await ctx.close();
});

test('the theme toggle switches and remembers the theme', async () => {
  const { page, ctx } = await open('index.html', { colorScheme: 'light' });
  await page.click('[data-theme-toggle]');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await page.reload();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await ctx.close();
});

test('at 360 px wide no page scrolls sideways', async () => {
  for (const p of PAGES) {
    const { page, ctx } = await open(p, { viewport: { width: 360, height: 780 } });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(over <= 0, `${p} overflows by ${over}px`);
    await ctx.close();
  }
});

test('every page has one h1, a main landmark, labelled buttons and lang="ms" on Malay text', async () => {
  for (const p of PAGES) {
    const { page, ctx } = await open(p);
    assert.equal(await page.locator('h1').count(), 1, p);
    assert.equal(await page.locator('main').count(), 1, p);
    const unlabeled = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => !b.hidden && !(b.textContent.trim() || b.getAttribute('aria-label'))).length);
    assert.equal(unlabeled, 0, p);
    assert.ok((await page.locator('[lang="ms"]').count()) > 0, p);
    await ctx.close();
  }
});

// Colours are oklch() in CSS; a canvas converts any computed colour to sRGB bytes.
const CONTRAST = `(pairs) => {
  const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d', { willReadFrequently: true });
  const rgb = (col) => { g.clearRect(0, 0, 1, 1); g.fillStyle = '#000'; g.fillStyle = col; g.fillRect(0, 0, 1, 1); return [...g.getImageData(0, 0, 1, 1).data].slice(0, 3); };
  const lum = ([r, gr, b]) => [r, gr, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const b = getComputedStyle(e).backgroundColor; if (b && b !== 'rgba(0, 0, 0, 0)' && b !== 'transparent') return rgb(b); } return rgb(getComputedStyle(document.body).backgroundColor); };
  return pairs.map((sel) => { const el = document.querySelector(sel); if (!el) return [sel, 0]; const fg = rgb(getComputedStyle(el).color); const [a, b] = [lum(fg), lum(bgOf(el))].sort((x, y) => y - x); return [sel, (a + 0.05) / (b + 0.05)]; });
}`;

test('text colours meet WCAG AA contrast (4.5:1) in both themes, including on AQI colours', async () => {
  const sel = ['.eyebrow', '.ms', '.hero-state', '.fine', '.model-time', '.haze-banner .hb-text', '.tile.aqi-good .tile-name', '.tile.aqi-moderate .tile-name', '.tile.aqi-sensitive .tile-name', '.day-rain', '.day-date', '.readout', '.colophon p', '.tile.aqi-sensitive .tile-meta', '.legend', '.map-legend', '.facts dt', '.pollutants dt', '.hb-kicker', 'caption', 'details.chart-data summary'];
  for (const scheme of ['light', 'dark']) {
    const { page, ctx } = await open('index.html', { colorScheme: scheme });
    const ratios = await page.evaluate(`(${CONTRAST})(${JSON.stringify(sel)})`);
    for (const [s, r] of ratios) assert.ok(r >= 4.5, `${scheme} ${s}: ${r.toFixed(2)}:1`);
    await ctx.close();
  }
});

test('the paper follows the air: a flat ground tinted by the mood, no blurred haze blobs', async () => {
  const { page, ctx } = await open('index.html');
  const r = await page.evaluate(() => ({
    mood: document.body.className,
    ground: getComputedStyle(document.body).backgroundColor,
    root: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    blobs: [...document.querySelectorAll('*')].filter((e) => /radial-gradient|linear-gradient/.test(getComputedStyle(e).backgroundImage) || /blur/.test(getComputedStyle(e).filter)).length,
  }));
  assert.match(r.mood, /mood-sensitive/);
  assert.equal(r.blobs, 0);
  const plain = await page.evaluate((bg) => { const d = document.createElement('div'); d.style.color = bg; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; }, r.root);
  assert.notEqual(r.ground, plain, 'a sensitive day tints the ground away from the plain paper');
  await ctx.close();
});
