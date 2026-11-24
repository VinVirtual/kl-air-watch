// Test helpers: recorded Open-Meteo responses, a fake fetch (no network in tests), a budget that never sleeps.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Budget } from '../scripts/lib/budget.mjs';
import { createHttp } from '../scripts/lib/http.mjs';
import { parseForecast, parseAir } from '../scripts/lib/openmeteo.mjs';
import { buildSnapshot } from '../scripts/lib/snapshot.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FIX = path.join(ROOT, 'tests', 'fixtures');

export const fixture = (name) => fs.readFileSync(path.join(FIX, name), 'utf8');
export const fixtureJson = (name) => JSON.parse(fixture(name));
// Recorded on 24 November 2026 at 18:30 Malaysia time, past_days=3.
export const forecastRaw = () => fixtureJson('forecast-2026-11-24.json');
export const airRaw = () => fixtureJson('air-2026-11-24.json');
export const GENERATED_AT = '2026-11-24T10:33:00.000Z';

export function parsed() {
  return { forecast: parseForecast(forecastRaw()), air: parseAir(airRaw()) };
}

export function snapshot(over = {}) {
  const { forecast, air } = parsed();
  return buildSnapshot({ forecast, air, generatedAt: GENERATED_AT, requests: { forecastCost: 28.8, airCost: null, requests: 2, bytes: 1, cacheHits: 0 }, ...over });
}

// A copy of a snapshot with one place's current AQI set (for alert and banner tests).
export function withAqi(snap, values) {
  return {
    ...snap,
    locations: snap.locations.map((l) => (l.id in values ? { ...l, now: { ...l.now, aqi: values[l.id] } } : { ...l, now: { ...l.now, aqi: Math.min(l.now.aqi, 40) } })),
  };
}

export function tmpDir(prefix = 'airwatch-test-') {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

export function makeResponse(status, body, headers = {}) {
  return new Response(status === 204 || status === 304 || (status >= 300 && status < 400) ? null : body, { status, headers });
}

// routes: [[predicate(url) | substring, handler(url, init) -> {status, body, headers} | Response]]
export function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, init });
    if (init.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    for (const [match, handler] of routes) {
      const ok = typeof match === 'function' ? match(url) : url.includes(match);
      if (!ok) continue;
      const r = await handler(url, init);
      return r instanceof Response ? r : makeResponse(r.status ?? 200, r.body ?? '', r.headers ?? {});
    }
    return makeResponse(404, 'not found');
  };
  fn.calls = calls;
  return fn;
}

export function testBudget(over = {}) {
  let t = 1_000_000;
  const sleeps = [];
  const b = new Budget({
    maxRequests: 10,
    maxBytes: 20 * 1024 * 1024,
    wallClockMs: 600_000,
    hostIntervalMs: {},
    now: () => t,
    sleep: async (ms) => {
      sleeps.push(ms);
      t += ms;
    },
    ...over,
  });
  b.sleeps = sleeps;
  b.advance = (ms) => {
    t += ms;
  };
  return b;
}

export function testHttp(fetchImpl, over = {}) {
  return createHttp({
    fetchImpl,
    budget: over.budget ?? testBudget(),
    cache: over.cache ?? null,
    userAgent: 'kl-air-watch-test/0 (+https://example.org)',
    timeoutMs: over.timeoutMs ?? 2000,
    maxResponseBytes: over.maxResponseBytes ?? 4 * 1024 * 1024,
    maxRetries: over.maxRetries ?? 1,
    maxRetryAfterMs: 5000,
    offline: over.offline ?? false,
  });
}

// The two recorded responses, served by host.
export function recordedRoutes({ forecastCost = '28.8' } = {}) {
  return [
    ['air-quality-api.open-meteo.com', () => ({ body: fixture('air-2026-11-24.json') })],
    ['api.open-meteo.com', () => ({ body: fixture('forecast-2026-11-24.json'), headers: { 'x-ratelimit-cost': forecastCost } })],
  ];
}
