// Static site: the snapshot, the history and the alert log -> HTML pages, feeds and data files.
import fs from 'node:fs';
import path from 'node:path';
import { writeFileAtomic, copyFileSafe, removeTreeInside, ensureDir } from './safe-fs.mjs';
import { validateSnapshot } from './schema.mjs';
import { loadHistory } from './history.mjs';
import { loadAlerts, banner } from './alerts.mjs';
import { band } from './aqi.mjs';
import { page, CSP } from './render/layout.mjs';
import { renderPlace } from './render/place.mjs';
import { renderStates, renderHistory, renderAlerts } from './render/pages.mjs';
import { renderMethod } from './render/method.mjs';
import { rss, jsonFeed } from './feeds.mjs';
import { HOME_ID, SITE_TAGLINE } from './config.mjs';
import { addShareTags } from './share.mjs';

export const SITE_BUDGET_BYTES = 6 * 1024 * 1024;

export function checkSiteUrl(u) {
  let p;
  try {
    p = new URL(u);
  } catch {
    throw new Error(`site URL is not a URL: ${String(u).slice(0, 80)}`);
  }
  if (p.protocol !== 'https:' || !u.endsWith('/') || p.search || p.hash || p.username || p.password) throw new Error('site URL must be https and end with "/"');
  return u;
}

export function loadSnapshot(file) {
  if (!fs.existsSync(file)) throw new Error(`no snapshot at ${file}; run "airwatch update" first`);
  if (!fs.lstatSync(file).isFile()) throw new Error(`not a regular file: ${file}`);
  return validateSnapshot(JSON.parse(fs.readFileSync(file, 'utf8')));
}

function copyDir(src, dest, root) {
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const st = fs.lstatSync(s);
    if (st.isSymbolicLink()) throw new Error(`refusing to copy a symlink: ${s}`);
    if (st.isDirectory()) copyDir(s, path.join(dest, name), root);
    else if (st.isFile()) copyFileSafe(s, path.join(dest, name), root);
  }
}

// The page background follows the air in Kuala Lumpur.
const mood = (snapshot) => band(snapshot.locations.find((l) => l.id === HOME_ID)?.now.aqi).id;

export function buildSite({ root, dataDir, assetsDir, outDir, siteUrl, snapshotFile }) {
  checkSiteUrl(siteUrl);
  const snapshot = loadSnapshot(snapshotFile ?? path.join(dataDir, 'latest.json'));
  const history = loadHistory(dataDir);
  const { alerts } = loadAlerts(path.join(dataDir, 'alerts.json'));
  if (fs.existsSync(outDir)) removeTreeInside(outDir, root);
  ensureDir(outDir, root);
  copyDir(assetsDir, path.join(outDir, 'assets'), root);
  const write = (rel, content) => writeFileAtomic(path.join(outDir, rel), String(content), root);
  const bn = banner(snapshot);
  const common = { snapshot, banner: bn, mood: mood(snapshot) };
  const home = snapshot.locations.find((l) => l.id === HOME_ID);

  write('index.html', page({ ...common, title: '', description: SITE_TAGLINE, base: '', active: 'now', canonical: siteUrl, body: renderPlace(snapshot, home, { base: '', isHome: true }) }));
  for (const loc of snapshot.locations) {
    write(`states/${loc.id}/index.html`, page({ ...common, title: `${loc.name}, ${loc.state}`, description: `Weather and air quality now and for the next 7 days in ${loc.name}, ${loc.state}.`, base: '../../', active: 'states', canonical: `${siteUrl}states/${loc.id}/index.html`, body: renderPlace(snapshot, loc, { base: '../../' }) }));
  }
  write('states/index.html', page({ ...common, title: 'States', description: 'Air quality and weather now in Kuala Lumpur and every Malaysian state capital.', base: '../', active: 'states', body: renderStates(snapshot, { base: '../' }) }));
  write('history/index.html', page({ ...common, title: 'History', description: 'Daily air quality and weather history for Kuala Lumpur and Malaysia’s states.', base: '../', active: 'history', body: renderHistory(history, { base: '../' }) }));
  write('alerts/index.html', page({ ...common, title: 'Alerts', description: 'Haze alert log for Malaysia.', base: '../', active: 'alerts', body: renderAlerts(alerts, { base: '../' }) }));
  write('method/index.html', page({ ...common, title: 'Method', description: 'Data sources, thresholds, schedule and limits.', base: '../', active: 'method', body: renderMethod(snapshot) }));
  write('alerts.xml', rss(alerts, siteUrl));
  write('alerts.json', jsonFeed(alerts, siteUrl));
  const attribution = 'Weather data by Open-Meteo.com (https://open-meteo.com/), CC BY 4.0. Contains modified Copernicus Atmosphere Monitoring Service information.';
  write('latest.json', `${JSON.stringify({ attribution, ...snapshot }, null, 1)}\n`);
  write('history.json', `${JSON.stringify({ attribution, days: history })}\n`);
  write('_headers', headersFile());
  write('robots.txt', 'User-agent: *\nAllow: /\n');
  addShareTags(outDir, { siteUrl, root });
  const problems = checkSite(outDir);
  if (problems.length) throw new Error(`site check failed:\n  ${problems.join('\n  ')}`);
  return { pages: htmlFiles(outDir).length, bytes: dirBytes(outDir), banner: bn.level, historyDays: history.length, alerts: alerts.length };
}

// Cloudflare Pages reads _headers (it is not served). Sends as real headers what a <meta> CSP
// cannot: frame-ancestors, X-Frame-Options and nosniff, plus caching and the feed media types.
export function headersFile() {
  const lines = [
    '/*',
    `  Content-Security-Policy: ${CSP}; frame-ancestors 'none'`,
    '  X-Frame-Options: DENY',
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
    '  Cache-Control: public, max-age=600',
    '/assets/fonts/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '/alerts.xml',
    '  Content-Type: application/rss+xml; charset=utf-8',
    '/alerts.json',
    '  Content-Type: application/feed+json; charset=utf-8',
    '  Access-Control-Allow-Origin: *',
    '/latest.json',
    '  Access-Control-Allow-Origin: *',
  ];
  return `${lines.join('\n')}\n`;
}

export function dirBytes(dir) {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? dirBytes(p) : fs.lstatSync(p).size;
  }
  return total;
}

function htmlFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...htmlFiles(p));
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

// After a build: local links resolve, no inline script or style, CSP present, size budget.
export function checkSite(outDir) {
  const problems = [];
  for (const file of htmlFiles(outDir)) {
    const rel = path.relative(outDir, file);
    const src = fs.readFileSync(file, 'utf8');
    if (!src.includes('http-equiv="Content-Security-Policy"')) problems.push(`${rel}: no CSP`);
    if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(src)) problems.push(`${rel}: inline <script>`);
    if (/<style[\s>]/i.test(src)) problems.push(`${rel}: inline <style>`);
    if ((src.match(/<h1[\s>]/g) ?? []).length !== 1) problems.push(`${rel}: needs exactly one <h1>`);
    if (!src.includes('Weather data by Open-Meteo.com')) problems.push(`${rel}: Open-Meteo attribution missing`);
    for (const tag of src.matchAll(/<[a-zA-Z][^>]*>/g)) {
      const names = tag[0].replace(/"[^"]*"/g, '""');
      if (/\sstyle=/i.test(names)) problems.push(`${rel}: style attribute`);
      if (/\son[a-z]+=/i.test(names)) problems.push(`${rel}: inline event handler`);
    }
    const ids = new Set([...src.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    for (const m of src.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
      const link = m[1].replace(/&amp;/g, '&');
      if (/^https:\/\//.test(link)) continue;
      if (/^[a-z]+:/i.test(link) || link.startsWith('//')) {
        problems.push(`${rel}: non-https link ${link.slice(0, 60)}`);
        continue;
      }
      if (link.startsWith('#')) {
        if (link.length > 1 && !ids.has(link.slice(1))) problems.push(`${rel}: missing anchor ${link}`);
        continue;
      }
      const target = path.resolve(path.dirname(file), link.split('#')[0]);
      if (!target.startsWith(path.resolve(outDir)) || !fs.existsSync(target)) problems.push(`${rel}: broken link ${link}`);
    }
  }
  const bytes = dirBytes(outDir);
  if (bytes > SITE_BUDGET_BYTES) problems.push(`site is ${bytes} bytes, over the ${SITE_BUDGET_BYTES}-byte budget`);
  return problems;
}
