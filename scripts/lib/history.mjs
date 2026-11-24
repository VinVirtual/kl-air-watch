// Compact daily history, one JSON file per month in data/history/. Each update completes the
// past days the API returned (past_days); a day that is already recorded is never rewritten,
// so the files change about once a day and the git history stays small.
import fs from 'node:fs';
import path from 'node:path';
import { LOCATIONS, SCHEMA_VERSION } from './config.mjs';
import { mean, max, min, round } from './aqi.mjs';
import { writeFileAtomic } from './safe-fs.mjs';

export const MONTH_FILE = /^(\d{4}-\d{2})\.json$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const MIN_HOURS = 20;

const FIELDS = Object.freeze({
  aqiMax: [0, 1000], aqiMean: [0, 1000], pm25: [0, 3000], pm10: [0, 5000], o3Max: [0, 2000], no2Max: [0, 2000],
  tMax: [-20, 60], tMin: [-20, 60], rain: [0, 1500], hours: [0, 24],
});

function count(rows, key) {
  return rows.filter((r) => r[key] !== null && r[key] !== undefined).length;
}

// One day's summary for one location, or null when fewer than MIN_HOURS hours have data.
export function summarizeDay(weatherRows, airRows) {
  const out = {};
  if (airRows.length && count(airRows, 'us_aqi') >= MIN_HOURS) {
    out.aqiMax = round(max(airRows.map((r) => r.us_aqi)));
    out.aqiMean = round(mean(airRows.map((r) => r.us_aqi)));
    out.pm25 = round(mean(airRows.map((r) => r.pm2_5)), 1);
    out.pm10 = round(mean(airRows.map((r) => r.pm10)), 1);
    out.o3Max = round(max(airRows.map((r) => r.ozone)), 1);
    out.no2Max = round(max(airRows.map((r) => r.nitrogen_dioxide)), 1);
    out.hours = count(airRows, 'us_aqi');
  }
  if (weatherRows.length && count(weatherRows, 'temperature_2m') >= MIN_HOURS) {
    out.tMax = round(max(weatherRows.map((r) => r.temperature_2m)), 1);
    out.tMin = round(min(weatherRows.map((r) => r.temperature_2m)), 1);
    out.rain = round(weatherRows.reduce((s, r) => s + (r.precipitation ?? 0), 0), 1);
  }
  for (const k of Object.keys(out)) if (out[k] === null) delete out[k];
  return Object.keys(out).length ? out : null;
}

// Every complete past day (before `today`) in the parsed responses: { date: { locId: summary } }.
export function pastDays({ forecast, air, today, locations = LOCATIONS }) {
  const days = {};
  locations.forEach((loc, i) => {
    const f = forecast.locations[i];
    const a = air.locations[i];
    const dates = new Set([...f.hourly, ...a.hourly].map((r) => r.t.slice(0, 10)).filter((d) => d < today));
    for (const d of dates) {
      const s = summarizeDay(f.hourly.filter((r) => r.t.startsWith(d)), a.hourly.filter((r) => r.t.startsWith(d)));
      if (!s) continue;
      days[d] ??= {};
      days[d][loc.id] = s;
    }
  });
  return days;
}

export function validateMonth(doc, name = 'history') {
  const fail = (m) => {
    throw new Error(`${name}: ${m}`);
  };
  if (!doc || typeof doc !== 'object' || doc.schema !== SCHEMA_VERSION) fail('bad schema');
  if (typeof doc.month !== 'string' || !/^\d{4}-\d{2}$/.test(doc.month)) fail('bad month');
  if (!doc.days || typeof doc.days !== 'object' || Array.isArray(doc.days)) fail('bad days');
  const ids = new Set(LOCATIONS.map((l) => l.id));
  for (const [date, locs] of Object.entries(doc.days)) {
    if (!DATE.test(date) || !date.startsWith(doc.month)) fail(`bad date ${String(date).slice(0, 20)}`);
    if (!locs || typeof locs !== 'object') fail(`${date}: bad entry`);
    for (const [id, s] of Object.entries(locs)) {
      if (!ids.has(id)) fail(`${date}: unknown location ${String(id).slice(0, 40)}`);
      for (const [k, v] of Object.entries(s ?? {})) {
        const r = FIELDS[k];
        if (!r) fail(`${date}.${id}: unknown field ${String(k).slice(0, 20)}`);
        if (typeof v !== 'number' || !Number.isFinite(v) || v < r[0] || v > r[1]) fail(`${date}.${id}.${k}: out of range`);
      }
    }
  }
  return doc;
}

export function loadHistory(dataDir) {
  const dir = path.join(dataDir, 'history');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const m = MONTH_FILE.exec(name);
    if (!m) continue;
    const file = path.join(dir, name);
    if (!fs.lstatSync(file).isFile()) throw new Error(`not a regular file: ${file}`);
    const doc = validateMonth(JSON.parse(fs.readFileSync(file, 'utf8')), name);
    if (doc.month !== m[1]) throw new Error(`${name}: file name and month differ`);
    for (const date of Object.keys(doc.days).sort()) out.push({ date, locations: doc.days[date] });
  }
  return out;
}

// Add days (and locations within a day) that are not recorded yet. Returns the dates added.
export function mergeHistory({ dataDir, root, days }) {
  const byMonth = {};
  for (const date of Object.keys(days).sort()) (byMonth[date.slice(0, 7)] ??= []).push(date);
  const added = [];
  for (const [month, dates] of Object.entries(byMonth)) {
    const file = path.join(dataDir, 'history', `${month}.json`);
    let doc = { schema: SCHEMA_VERSION, month, days: {} };
    if (fs.existsSync(file)) {
      if (!fs.lstatSync(file).isFile()) throw new Error(`not a regular file: ${file}`);
      doc = validateMonth(JSON.parse(fs.readFileSync(file, 'utf8')), `${month}.json`);
    }
    const next = { ...doc, days: { ...doc.days } };
    let changed = false;
    for (const date of dates) {
      const have = next.days[date] ?? {};
      const fresh = Object.fromEntries(Object.entries(days[date]).filter(([id]) => !(id in have)));
      if (!Object.keys(fresh).length) continue;
      next.days[date] = { ...have, ...fresh };
      changed = true;
      added.push(date);
    }
    if (!changed) continue;
    const sorted = Object.fromEntries(Object.keys(next.days).sort().map((d) => [d, sortLocs(next.days[d])]));
    writeFileAtomic(file, formatMonth(validateMonth({ ...next, days: sorted })), root);
  }
  return added;
}

const ORDER = new Map(LOCATIONS.map((l, i) => [l.id, i]));
function sortLocs(locs) {
  return Object.fromEntries(Object.entries(locs).sort(([a], [b]) => ORDER.get(a) - ORDER.get(b)));
}

// One line per day: small files and one-line diffs when a day is added.
export function formatMonth(doc) {
  const lines = Object.entries(doc.days).map(([d, locs]) => `    ${JSON.stringify(d)}: ${JSON.stringify(locs)}`);
  return `{\n  "schema": ${doc.schema},\n  "month": ${JSON.stringify(doc.month)},\n  "days": {\n${lines.join(',\n')}\n  }\n}\n`;
}
