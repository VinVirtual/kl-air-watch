// The page shell: strict CSP, no inline script or style, relative links so the site works
// under any base path. Attribution for the data is on every page, as CC BY 4.0 asks.
import { html, localHref } from '../html.mjs';
import { SITE_TITLE, SITE_TITLE_MS, REPO_URL } from '../config.mjs';
import { hazeBanner } from './components.mjs';

export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "manifest-src 'none'",
  "object-src 'none'",
].join('; ');

const NAV = [
  ['now', 'index.html', 'Now', 'Kini'],
  ['states', 'states/index.html', 'States', 'Negeri'],
  ['history', 'history/index.html', 'History', 'Sejarah'],
  ['alerts', 'alerts/index.html', 'Alerts', 'Amaran'],
  ['method', 'method/index.html', 'Method', 'Kaedah'],
];

export function page({ title, description, base, active, body, snapshot, banner = null, canonical = null, mood = 'unknown' }) {
  const b = (p) => localHref(`${base}${p}`);
  const fullTitle = title ? `${title} · ${SITE_TITLE}` : SITE_TITLE;
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="color-scheme" content="light dark">
<title>${fullTitle}</title>
<meta name="description" content="${description}">
${canonical ? html`<link rel="canonical" href="${canonical}">` : ''}
<link rel="icon" href="${b('assets/icon.svg')}" type="image/svg+xml">
<link rel="preload" href="${b('assets/fonts/fraunces-latin-opsz-normal.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${b('assets/style.css')}">
<link rel="alternate" type="application/rss+xml" title="${SITE_TITLE}: haze alerts (RSS)" href="${b('alerts.xml')}">
<link rel="alternate" type="application/feed+json" title="${SITE_TITLE}: haze alerts (JSON Feed)" href="${b('alerts.json')}">
<script src="${b('assets/theme.js')}"></script>
<script src="${b('assets/app.js')}" defer></script>
</head>
<body class="mood-${mood}">
<div class="atmosphere" aria-hidden="true"><div class="grain"></div></div>
<a class="skip" href="#main">Skip to content</a>
<header class="masthead">
  <a class="wordmark" href="${b('index.html')}">
    <svg class="mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><circle cx="16" cy="16" r="6.5" class="mark-sun"/><path d="M3 21 Q9.5 17 16 21 T29 21" class="mark-haze"/><path d="M3 26 Q9.5 22 16 26 T29 26" class="mark-haze mark-haze-2"/></svg>
    <span class="wordmark-text"><b>KL Air</b> &amp; Weather Watch<span class="ms wordmark-ms" lang="ms">${SITE_TITLE_MS}</span></span>
  </a>
  <nav aria-label="Main">
    <ul>
      ${NAV.map(([id, p, en, ms]) => html`<li><a href="${b(p)}"${id === active ? html` aria-current="page"` : ''}>${en}<span class="ms nav-ms" lang="ms">${ms}</span></a></li>`)}
    </ul>
  </nav>
  <button class="theme-toggle" type="button" data-theme-toggle aria-label="Switch colour theme" hidden>
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="5"/><path d="M12 7 A5 5 0 0 0 12 17 Z" class="half"/></svg>
  </button>
</header>
${banner ? hazeBanner(banner, base) : ''}
<p class="stale-note" data-stale role="status" hidden></p>
<main id="main" tabindex="-1">
${body}
</main>
<footer class="colophon">
  <p class="attribution"><a href="https://open-meteo.com/">Weather data by Open-Meteo.com</a>, licensed <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. Air quality: Copernicus Atmosphere Monitoring Service (CAMS) global forecasts, via Open-Meteo; contains modified Copernicus Atmosphere Monitoring Service information. Values are rounded and summarised here.</p>
  <p>Model estimates for a grid cell, not readings from a monitoring station. For Malaysia's official Air Pollutant Index see the Department of Environment's <a href="https://apims.doe.gov.my/">APIMS</a>. Not medical advice. <a href="${b('method/index.html')}">How this works</a>.</p>
  ${snapshot ? html`<p class="freshness" data-generated="${snapshot.generatedAt}">Built ${snapshot.generatedAt.slice(0, 16).replace('T', ' ')} UTC from the Open-Meteo update for ${snapshot.locations[0].now.t.replace('T', ' ')} Malaysia time.<span class="age" data-age></span></p>` : ''}
  <p><a href="${REPO_URL}">Source code</a>, MIT licence. Fonts: Fraunces and IBM Plex Mono, SIL Open Font License 1.1 (<a href="${b('assets/fonts/LICENSE-Fraunces.txt')}">text</a>, <a href="${b('assets/fonts/LICENSE-IBM-Plex-Mono.txt')}">text</a>). Haze alerts: <a href="${b('alerts.xml')}">RSS</a> · <a href="${b('alerts.json')}">JSON Feed</a> · data: <a href="${b('latest.json')}">latest.json</a>.</p>
</footer>
</body>
</html>
`;
}
