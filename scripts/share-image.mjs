#!/usr/bin/env node
// Renders assets/share.png, the 1200x630 picture link previews show (WhatsApp, LinkedIn, X,
// Slack...). The card is drawn with the site's own stylesheet, fonts and AQI gauge, then
// screenshotted in headless Chrome. Run again after changing the card: npm run share-image
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { gauge } from './lib/render/components.mjs';
import { SHARE_IMAGE } from './lib/share.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'http://card.local';
const MAX_BYTES = 300 * 1024;
const CHROME_CANDIDATES = [process.env.AIRWATCH_CHROME, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const findChrome = () => CHROME_CANDIDATES.find((c) => c && fs.existsSync(c)) ?? null;

const CSS = `
html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
body { background: color-mix(in oklch, var(--bg) 94%, var(--moderate)); }
.card { box-sizing: border-box; width: 1200px; height: 630px; padding: 0 60px; display: grid; grid-template-columns: 1fr 432px; grid-template-rows: 104px 1fr 66px; column-gap: 48px; }
.top { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--rule-strong); }
.top .mark { width: 54px; height: 54px; }
.top .wordmark { gap: 16px; margin: 0; }
.top .wordmark-text { font-size: 30px; }
.top .wordmark-ms { font-size: 20px; margin-top: 2px; }
.top .site { font-family: var(--font-mono); font-size: 20px; color: var(--ink); font-weight: 600; }
.copy { align-self: center; }
.eyebrow { font-size: 22px; margin: 0 0 6px; }
.place { margin: 4px 0 0; white-space: nowrap; font-size: 112px; font-weight: 300; font-style: italic; line-height: 1; letter-spacing: -0.035em; font-variation-settings: 'opsz' 144; }
.rest { margin: 18px 0 0; font-size: 44px; line-height: 1.15; letter-spacing: -0.01em; }
.rest .ms { display: block; font-size: 32px; margin-top: 6px; }
.hero-air { align-self: center; margin: 0; padding: 26px 34px 28px; }
.hero-air .eyebrow { font-size: 20px; }
.gauge { max-width: none; width: 340px; margin: 18px auto 0; }
.g-tick { font-size: 12.5px; }
.gauge text:last-of-type { transform: translateX(12px); }
.aqi-band { font-size: 25px; white-space: nowrap; margin-top: 10px; line-height: 1.2; }
.aqi-band .ms { font-size: 21px; margin-top: 2px; }
.foot { grid-column: 1 / -1; display: flex; align-items: center; gap: 28px; border-top: 1px solid var(--rule); font-size: 21px; color: var(--ink-2); }
.foot span + span::before { content: ''; display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--sensitive); margin: 0 28px 4px 0; }
`;

function cardHtml() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<link rel="stylesheet" href="/assets/style.css"><style>${CSS}</style></head>
<body><div class="card">
  <div class="top">
    <span class="wordmark"><svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="6.5" class="mark-sun"/><path d="M3 21 Q9.5 17 16 21 T29 21" class="mark-haze"/><path d="M3 26 Q9.5 22 16 26 T29 26" class="mark-haze mark-haze-2"/></svg>
    <span class="wordmark-text"><b>KL Air</b> &amp; Weather Watch<span class="ms wordmark-ms" lang="ms">Pemantau Udara &amp; Cuaca KL</span></span></span>
    <span class="site">Open data · Open-Meteo</span>
  </div>
  <div class="copy">
    <p class="eyebrow">Weather and haze, now <span class="ms" lang="ms">Cuaca dan jerebu, kini</span></p>
    <p class="place">Kuala Lumpur</p>
    <p class="rest">and every Malaysian state<span class="ms" lang="ms">dan setiap negeri di Malaysia</span></p>
  </div>
  <div class="hero-air aqi-moderate">
    <p class="eyebrow"><b>Air quality · haze</b> <span class="ms" lang="ms">Kualiti udara · jerebu</span></p>
    ${gauge(78)}
    <p class="aqi-band">What the haze means for you<span class="ms" lang="ms">Apa maksud jerebu untuk anda</span></p>
  </div>
  <div class="foot"><span>Updated every three hours</span><span>7-day forecast</span><span>Haze alerts</span></div>
</div></body></html>`;
}

const TYPES = { '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };

export async function renderShareImage({ out = path.join(ROOT, SHARE_IMAGE.path) } = {}) {
  const chrome = findChrome();
  if (!chrome) throw new Error('no Chrome found; set AIRWATCH_CHROME');
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: SHARE_IMAGE.width, height: SHARE_IMAGE.height }, colorScheme: 'light', reducedMotion: 'reduce', deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.route(`${ORIGIN}/**`, (route) => {
      const p = new URL(route.request().url()).pathname;
      if (p === '/') return route.fulfill({ contentType: 'text/html', body: cardHtml() });
      const file = path.resolve(ROOT, `.${decodeURIComponent(p)}`);
      if (!file.startsWith(path.join(ROOT, 'assets') + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ contentType: TYPES[path.extname(file)] ?? 'application/octet-stream', body: fs.readFileSync(file) });
    });
    await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const png = await page.screenshot({ type: 'png' });
    if (png.length > MAX_BYTES) throw new Error(`share image is ${png.length} bytes, over ${MAX_BYTES}`);
    fs.writeFileSync(out, png);
    return { out, bytes: png.length };
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { out, bytes } = await renderShareImage();
  process.stderr.write(`${path.relative(ROOT, out)} ${Math.round(bytes / 1024)} KB\n`);
}
