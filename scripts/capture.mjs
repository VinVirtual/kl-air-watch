#!/usr/bin/env node
// JPEG screenshots of the built site for the README (light, dark, phone, history, method). Needs Chrome.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { serveDir, randomPort } from './lib/serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CHROME_CANDIDATES = [process.env.AIRWATCH_CHROME, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
export const findChrome = () => CHROME_CANDIDATES.find((c) => c && fs.existsSync(c)) ?? null;

const outDir = path.resolve(ROOT, process.argv[2] ?? 'docs');
const shots = [
  { name: 'home-light.jpg', url: 'index.html', viewport: { width: 1440, height: 1100 }, scheme: 'light' },
  { name: 'home-dark.jpg', url: 'index.html', viewport: { width: 1440, height: 1100 }, scheme: 'dark' },
  { name: 'home-charts.jpg', url: 'index.html#kuala-lumpur-hours', viewport: { width: 1440, height: 1100 }, scheme: 'light' },
  { name: 'home-map.jpg', url: 'index.html#map-head', viewport: { width: 1440, height: 1000 }, scheme: 'light' },
  { name: 'home-phone.jpg', url: 'index.html', viewport: { width: 390, height: 844 }, scheme: 'light', mobile: true },
  { name: 'history.jpg', url: 'history/index.html', viewport: { width: 1440, height: 1300 }, scheme: 'dark' },
  { name: 'states.jpg', url: 'states/index.html', viewport: { width: 1280, height: 1100 }, scheme: 'light' },
  { name: 'method.jpg', url: 'method/index.html', viewport: { width: 1280, height: 1000 }, scheme: 'dark' },
];

const chrome = findChrome();
if (!chrome) {
  process.stderr.write('no Chrome found; set AIRWATCH_CHROME\n');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
const srv = await serveDir(path.join(ROOT, 'dist'), { port: randomPort() });
const browser = await chromium.launch({ executablePath: chrome, headless: true });
try {
  for (const s of shots) {
    const ctx = await browser.newContext({ viewport: s.viewport, colorScheme: s.scheme, deviceScaleFactor: s.mobile ? 2 : 1, isMobile: Boolean(s.mobile), reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${srv.port}/${s.url}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(outDir, s.name), fullPage: Boolean(s.full), type: 'jpeg', quality: 82 });
    if (errors.length) throw new Error(`${s.name}: browser errors: ${errors.join(' | ')}`);
    process.stderr.write(`${path.relative(ROOT, path.join(outDir, s.name))}\n`);
    await ctx.close();
  }
} finally {
  await browser.close();
  await srv.close();
}
