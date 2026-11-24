// Rendering, the site build and its checks, and the alert feeds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { html, esc, raw, localHref, isSafeUrl, fmt } from '../scripts/lib/html.mjs';
import { chart, dataTable, niceTicks, heatStrip } from '../scripts/lib/render/charts.mjs';
import { gauge, hazeBanner, tileMap } from '../scripts/lib/render/components.mjs';
import { buildSite, checkSite, headersFile, checkSiteUrl } from '../scripts/lib/site.mjs';
import { rss, jsonFeed, alertTitle } from '../scripts/lib/feeds.mjs';
import { newAlerts, banner } from '../scripts/lib/alerts.mjs';
import { minutesMath } from '../scripts/lib/render/method.mjs';
import { CSP } from '../scripts/lib/render/layout.mjs';
import { snapshot, withAqi, tmpDir, ROOT } from './helpers.mjs';

const EVIL = `<script>alert(1)</script>"'\`&<img src=x onerror=alert(2)>`;
const SITE = 'https://air.example.org/';

function project({ alerts = [], history = null } = {}) {
  const root = tmpDir();
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(path.join(dataDir, 'history'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'latest.json'), JSON.stringify(snapshot()));
  fs.writeFileSync(path.join(dataDir, 'alerts.json'), JSON.stringify({ schema: 1, alerts }));
  if (history) fs.writeFileSync(path.join(dataDir, 'history', '2026-11.json'), JSON.stringify(history));
  return { root, dataDir, outDir: path.join(root, 'dist') };
}

const build = (p) => buildSite({ root: p.root, dataDir: p.dataDir, assetsDir: path.join(ROOT, 'assets'), outDir: p.outDir, siteUrl: SITE });

function xmlOk(xml) {
  const r = spawnSync('python3', ['-I', '-c', 'import sys, xml.etree.ElementTree as E; E.fromstring(sys.stdin.read()); print("ok")'], { input: xml, encoding: 'utf8', env: { PATH: process.env.PATH } });
  return r.stdout.trim() === 'ok';
}

test('html escapes every interpolated value unless it is already safe markup', () => {
  assert.equal(html`<p>${EVIL}</p>`.toString().includes('<script>'), false);
  assert.equal(esc('a&b<c>"\'`'), 'a&amp;b&lt;c&gt;&quot;&#39;&#96;');
  assert.equal(html`<p>${raw('<b>ok</b>')}</p>`.toString(), '<p><b>ok</b></p>');
  assert.equal(html`${['<', html`<i>`]}`.toString(), '&lt;<i>');
  assert.equal(esc('a‮b\u0000c'), 'abc');
});

test('local links allow only relative paths; outside links only https', () => {
  assert.equal(localHref('../../states/ipoh/index.html'), '../../states/ipoh/index.html');
  for (const bad of ['/etc/passwd', 'javascript:alert(1)', 'a/../../b', '"onmouseover=x']) assert.throws(() => localHref(bad), /unsafe/);
  assert.ok(isSafeUrl('https://open-meteo.com/'));
  for (const bad of ['http://x.org', 'javascript:alert(1)', 'https://u:p@x.org/', 'x'.repeat(3000)]) assert.equal(isSafeUrl(bad), false);
  assert.equal(fmt(null), '–');
  assert.equal(fmt(12.345, 1), '12.3');
});

test('nice ticks cover the range with round steps', () => {
  assert.deepEqual(niceTicks(0, 100), [0, 25, 50, 75, 100]);
  assert.deepEqual(niceTicks(22, 35), [20, 25, 30, 35]);
  assert.deepEqual(niceTicks(5, 5).length > 1, true);
});

test('a chart has a title and description, no inline style, and skips missing values', () => {
  const svg = chart({ id: 't', title: 'T', desc: EVIL, labels: ['1am', '2am', '3am'], left: { min: 0, max: 10, unit: '°C' }, series: [{ type: 'line', label: 'Temp', values: [1, null, 3], cls: 's-temp' }, { type: 'bar', label: 'Rain', values: [null, 5, 2], cls: 's-rain' }] }).toString();
  assert.match(svg, /role="img" aria-labelledby="t-t t-d"/);
  assert.match(svg, /<desc id="t-d">&lt;script&gt;/);
  assert.doesNotMatch(svg, /style=/);
  assert.equal((svg.match(/class="bar /g) ?? []).length, 2);
  assert.match(svg, /d="M[\d. ]+M[\d. ]+"/, 'a gap breaks the line instead of drawing through it');
  assert.equal((svg.match(/class="hit"/g) ?? []).length, 3);
  assert.match(chart({ id: 'e', title: 'E', desc: 'd', labels: [], left: { min: 0, max: 1, unit: '' }, series: [] }).toString(), /No data/);
});

test('data tables use row and column headers', () => {
  const t = dataTable({ caption: 'C', headers: ['Time', 'Temp'], rows: [['1am', '25']] }).toString();
  assert.match(t, /<caption>C<\/caption>/);
  assert.match(t, /<th scope="col"/);
  assert.match(t, /<th scope="row">1am<\/th><td>25<\/td>/);
});

test('the heat strip colours each cell by category and marks missing days', () => {
  const s = heatStrip({ id: 'h', title: 'H', desc: 'd', dates: ['2026-11-01', '2026-11-02'], rows: [{ label: 'Ipoh', values: [40, null] }], dateLabel: (d) => d.slice(8) }).toString();
  assert.match(s, /cell aqi-good/);
  assert.match(s, /cell aqi-unknown/);
});

test('the gauge needle angle follows the AQI and caps at 300', () => {
  assert.match(gauge(0).toString(), /rotate\(-90\.0 /);
  assert.match(gauge(150).toString(), /rotate\(0\.0 /);
  assert.match(gauge(999).toString(), /rotate\(90\.0 /);
  assert.doesNotMatch(gauge(null).toString(), /g-needle/);
});

test('the banner text names the worst places and links to the thresholds', () => {
  const b = hazeBanner(banner(snapshot()), '').toString();
  assert.match(b, /Putrajaya 115, Kuala Lumpur 112/);
  assert.match(b, /href="method\/index.html#thresholds"/);
  assert.equal(hazeBanner({ level: null }, ''), '');
});

test('the tile map links every place to its page', () => {
  const t = tileMap(snapshot().locations, '', { headingId: 'x' }).toString();
  assert.equal((t.match(/href="states\/[a-z-]+\/index.html"/g) ?? []).length, 16);
});

test('the site builds from the recorded snapshot: 21 pages, feeds, headers and data', () => {
  const p = project();
  const res = build(p);
  assert.equal(res.pages, 21);
  for (const f of ['index.html', 'states/index.html', 'states/kota-kinabalu/index.html', 'history/index.html', 'alerts/index.html', 'method/index.html', 'alerts.xml', 'alerts.json', 'latest.json', 'history.json', '_headers', 'assets/style.css', 'assets/fonts/LICENSE-Fraunces.txt']) {
    assert.ok(fs.existsSync(path.join(p.outDir, f)), f);
  }
  const home = fs.readFileSync(path.join(p.outDir, 'index.html'), 'utf8');
  assert.match(home, /<h1 class="hero-place" id="place-kuala-lumpur">Kuala Lumpur<\/h1>/);
  assert.match(home, /<a href="https:\/\/open-meteo.com\/">Weather data by Open-Meteo.com<\/a>/);
  assert.match(home, /Copernicus Atmosphere Monitoring Service/);
  assert.match(home, /data-generated="2026-11-24T10:33:00.000Z"/);
  assert.match(home, /class="haze-banner level-notice"/);
  assert.match(home, /<body class="mood-sensitive">/);
  assert.match(JSON.parse(fs.readFileSync(path.join(p.outDir, 'latest.json'), 'utf8')).attribution, /Open-Meteo/);
});

test('every page carries the CSP, one h1 and the attribution, with no inline code', () => {
  const p = project();
  build(p);
  assert.deepEqual(checkSite(p.outDir), []);
});

test('checkSite catches inline script, style attributes, handlers, broken links and missing attribution', () => {
  const p = project();
  build(p);
  const f = path.join(p.outDir, 'method', 'index.html');
  const src = fs.readFileSync(f, 'utf8');
  fs.writeFileSync(f, src.replace('</main>', '<script>alert(1)</script><p style="x" onclick="y"><a href="../nowhere.html">x</a><a href="http://insecure.example">y</a></p></main>').replace(/Weather data by Open-Meteo.com/g, 'Weather'));
  const problems = checkSite(p.outDir).join('\n');
  for (const want of ['inline <script>', 'style attribute', 'inline event handler', 'broken link ../nowhere.html', 'non-https link', 'attribution missing']) assert.match(problems, new RegExp(want), want);
});

test('the history page draws charts from history, and says so when there is none', () => {
  const day = { 'kuala-lumpur': { aqiMax: 120, aqiMean: 80, pm25: 30, tMax: 33, tMin: 24, rain: 3 }, ipoh: { aqiMax: 60 } };
  const p = project({ history: { schema: 1, month: '2026-11', days: { '2026-11-20': day, '2026-11-21': day } } });
  build(p);
  const h = fs.readFileSync(path.join(p.outDir, 'history', 'index.html'), 'utf8');
  assert.match(h, /id="h-air"/);
  assert.match(h, /id="h-heat"/);
  assert.match(h, /needs at least two months/);
  const empty = project();
  build(empty);
  assert.match(fs.readFileSync(path.join(empty.outDir, 'history', 'index.html'), 'utf8'), /No complete days recorded yet/);
});

test('the build refuses a bad site URL, a missing snapshot and an --out outside the project', () => {
  assert.throws(() => checkSiteUrl('http://x.org/'), /https/);
  assert.throws(() => checkSiteUrl('https://x.org'), /end with/);
  assert.throws(() => checkSiteUrl('https://u:p@x.org/'), /https/);
  const p = project();
  fs.rmSync(path.join(p.dataDir, 'latest.json'));
  assert.throws(() => build(p), /no snapshot/);
});

test('_headers sends the CSP with frame-ancestors, nosniff and the feed types', () => {
  const h = headersFile();
  assert.ok(h.includes(`Content-Security-Policy: ${CSP}; frame-ancestors 'none'`));
  assert.match(h, /X-Content-Type-Options: nosniff/);
  assert.match(h, /\/alerts.xml\n  Content-Type: application\/rss\+xml/);
  assert.match(h, /\/alerts.json\n  Content-Type: application\/feed\+json/);
  assert.match(CSP, /default-src 'none'/);
  assert.match(CSP, /connect-src 'none'/);
});

test('the RSS feed is well-formed XML and escapes everything; an empty log is still valid', () => {
  const s = withAqi(snapshot(), { ipoh: 175, kuching: 260 });
  const alerts = newAlerts({ ...s, locations: s.locations.map((l) => ({ ...l, aqiPeak24: 40 })) });
  const xml = rss(alerts, SITE);
  assert.ok(xmlOk(xml));
  assert.equal((xml.match(/<item>/g) ?? []).length, 2);
  assert.match(xml, /Kuching: US AQI 260 \(very unhealthy\)/);
  assert.match(xml, /Weather data by Open-Meteo.com/);
  assert.ok(xmlOk(rss([], SITE)));
  assert.ok(xmlOk(rss([{ ...alerts[0], name: EVIL }], SITE)));
});

test('the JSON Feed is valid JSON Feed 1.1 with newest first', () => {
  const s = withAqi(snapshot(), { ipoh: 175 });
  const a = newAlerts({ ...s, locations: s.locations.map((l) => ({ ...l, aqiPeak24: 40 })) })[0];
  const older = { ...a, id: '2026-11-20:ipoh:now:unhealthy', recordedAt: '2026-11-20T00:00:00.000Z' };
  const feed = JSON.parse(jsonFeed([older, a], SITE));
  assert.equal(feed.version, 'https://jsonfeed.org/version/1.1');
  assert.equal(feed.feed_url, `${SITE}alerts.json`);
  assert.equal(feed.items[0].id, `kl-air-watch:${a.id}`);
  assert.equal(feed.items[1].id, `kl-air-watch:${older.id}`);
  assert.match(feed.items[0].content_text, /Kanak-kanak|Semua orang/);
  assert.equal(alertTitle({ ...a, kind: 'forecast' }).includes('forecast to reach'), true);
});

test('the minutes math stays inside the free 2,000 minutes at every 3 hours, not hourly', () => {
  const m = minutesMath(8);
  assert.equal(m.runs, 243);
  assert.ok(m.high < 1000);
  const hourly = minutesMath(24);
  assert.ok(hourly.high > 1000);
});

test('the site writes no em dashes: built pages, feeds and data, and the templates that make them', () => {
  // Owner's house style: commas, colons, full stops or "to" instead. Open-Meteo sends only numbers
  // and codes, so every word on the built site comes from this repository; the font licences are
  // quoted third-party text and are left alone.
  const s = withAqi(snapshot(), { ipoh: 175 });
  const p = project({ alerts: newAlerts({ ...s, locations: s.locations.map((l) => ({ ...l, aqiPeak24: 40 })) }) });
  build(p);
  assert.match(fs.readFileSync(path.join(p.outDir, 'alerts.xml'), 'utf8'), /Ipoh/);
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const own = (f) => /\.(html|xml|json|css|js|mjs|txt|svg)$/.test(f) && !/LICENSE-/.test(path.basename(f));
  const files = [...walk(p.outDir), ...walk(path.join(ROOT, 'scripts')), ...walk(path.join(ROOT, 'assets'))].filter(own);
  assert.ok(files.length > 30, `scanned ${files.length} files`);
  const hits = files.filter((f) => fs.readFileSync(f, 'utf8').includes('—')).map((f) => path.relative(ROOT, f));
  assert.deepEqual(hits, []);
});
