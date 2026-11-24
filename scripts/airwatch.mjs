#!/usr/bin/env node
// kl-air-watch command line. Run "node scripts/airwatch.mjs help".
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { BUDGET, HOST_INTERVAL_MS, USER_AGENT, CACHE_TTL_MS, DEFAULT_SITE_URL, MAX_BACKFILL_DAYS, PAST_DAYS } from './lib/config.mjs';
import { Budget } from './lib/budget.mjs';
import { ResponseCache } from './lib/cache.mjs';
import { createHttp } from './lib/http.mjs';
import { runUpdate } from './lib/update.mjs';
import { buildSite, checkSiteUrl, loadSnapshot } from './lib/site.mjs';
import { loadHistory } from './lib/history.mjs';
import { loadAlerts } from './lib/alerts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');

const HELP = `kl-air-watch: weather and air quality for Kuala Lumpur and Malaysia's states

  airwatch update [--backfill N] [--no-cache | --offline]
                  fetch Open-Meteo (2 requests), write data/latest.json, add finished days to
                  data/history/ and new haze alerts to data/alerts.json.
                  --backfill N asks for the past N days (1-${MAX_BACKFILL_DAYS}) once, to start the history.
  airwatch site   [--out dist] [--site-url https://.../]
                  build the static site (pages, RSS and JSON Feed, _headers) and check it
  airwatch check  validate the committed history and alert log (and the snapshot if present)
  airwatch test   run the unit tests (no network)

Environment (optional): AIRWATCH_SITE_URL (absolute links in feeds and canonical URLs).`;

const FLAGS = { update: ['backfill', 'no-cache', 'offline'], site: ['out', 'site-url'], check: [], test: [], help: [] };
const BOOLEAN = new Set(['no-cache', 'offline']);

export function parseArgs(argv) {
  const [cmd = 'help', ...rest] = argv;
  if (!Object.hasOwn(FLAGS, cmd)) throw new Error(`unknown command "${cmd}". Try: airwatch help`);
  const opts = {};
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (!a.startsWith('--')) throw new Error(`unexpected argument "${a}"`);
    const name = a.slice(2);
    if (!FLAGS[cmd].includes(name)) throw new Error(`unknown option --${name} for "${cmd}"`);
    if (BOOLEAN.has(name)) opts[name] = true;
    else {
      const v = rest[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Error(`--${name} needs a value`);
      opts[name] = v;
      i += 1;
    }
  }
  if (opts.offline && opts['no-cache']) throw new Error('--offline needs the cache; drop --no-cache');
  if (opts.backfill !== undefined) {
    const n = Number(opts.backfill);
    if (!/^\d+$/.test(opts.backfill) || n < 1 || n > MAX_BACKFILL_DAYS) throw new Error(`--backfill must be a whole number from 1 to ${MAX_BACKFILL_DAYS}`);
    opts.backfill = n;
  }
  return { cmd, opts };
}

// Node tries IPv6 and IPv4 in turn with a 250 ms step by default; on slow links to Open-Meteo
// both attempts can time out before either connects. Give each attempt longer.
net.setDefaultAutoSelectFamilyAttemptTimeout(2500);

const log = (m) => process.stderr.write(`${m}\n`);

async function cmdUpdate(opts) {
  const budget = new Budget({ maxRequests: BUDGET.maxRequests, maxBytes: BUDGET.maxBytes, wallClockMs: BUDGET.wallClockMs, hostIntervalMs: HOST_INTERVAL_MS });
  const cache = opts['no-cache'] ? null : new ResponseCache({ dir: path.join(ROOT, '.cache', 'http'), root: ROOT, ttlMs: opts.offline ? Infinity : CACHE_TTL_MS });
  const http = createHttp({ budget, cache, userAgent: USER_AGENT, timeoutMs: BUDGET.requestTimeoutMs, maxResponseBytes: BUDGET.maxResponseBytes, maxRetries: BUDGET.maxRetries, maxRetryAfterMs: BUDGET.maxRetryAfterMs, offline: Boolean(opts.offline) });
  const res = await runUpdate({ http, root: ROOT, dataDir: DATA, pastDays: opts.backfill ?? PAST_DAYS, log });
  const kl = res.snapshot.locations[0];
  const r = res.snapshot.requests;
  log(`update: ${kl.name} ${kl.now.temp}°C, US AQI ${kl.now.aqi} at ${kl.now.t} MYT; ${r.requests} requests, ${(r.bytes / 1024).toFixed(0)} KB, ${r.cacheHits} cached; Open-Meteo cost ${r.forecastCost ?? '?'} + ${r.airCost ?? '?'} calls`);
  log(`history: ${res.historyAdded.length ? `added ${res.historyAdded.join(', ')}` : 'no new days'}; alerts: ${res.alertsAdded} new`);
  return 0;
}

function cmdSite(opts) {
  const out = path.resolve(ROOT, opts.out ?? 'dist');
  const rel = path.relative(ROOT, out);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('--out must be a folder inside the project');
  const siteUrl = checkSiteUrl(opts['site-url'] ?? (process.env.AIRWATCH_SITE_URL || DEFAULT_SITE_URL));
  const res = buildSite({ root: ROOT, dataDir: DATA, assetsDir: path.join(ROOT, 'assets'), outDir: out, siteUrl });
  log(`site: ${res.pages} pages, ${(res.bytes / 1024).toFixed(0)} KB in ${rel}/; banner ${res.banner ?? 'none'}; ${res.historyDays} history days; ${res.alerts} alerts (links, CSP, attribution and size checked)`);
  return 0;
}

function cmdCheck() {
  const history = loadHistory(DATA);
  const { alerts } = loadAlerts(path.join(DATA, 'alerts.json'));
  log(`history: ${history.length} valid days${history.length ? ` (${history[0].date} to ${history.at(-1).date})` : ''}`);
  log(`alerts: ${alerts.length} valid`);
  const snap = path.join(DATA, 'latest.json');
  if (fs.existsSync(snap)) log(`snapshot: valid, generated ${loadSnapshot(snap).generatedAt}`);
  else log('snapshot: none yet (run "airwatch update")');
  return 0;
}

function cmdTest() {
  const files = fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.test.mjs')).map((f) => path.join('tests', f));
  const r = spawnSync(process.execPath, ['--test', ...files], { cwd: ROOT, stdio: 'inherit' });
  return r.status ?? 1;
}

export async function main(argv) {
  const { cmd, opts } = parseArgs(argv);
  if (cmd === 'help') {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  if (cmd === 'update') return cmdUpdate(opts);
  if (cmd === 'site') return cmdSite(opts);
  if (cmd === 'check') return cmdCheck();
  return cmdTest();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      log(`error: ${err.message}`);
      process.exit(1);
    },
  );
}
