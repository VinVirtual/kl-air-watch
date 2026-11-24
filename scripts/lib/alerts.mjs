// Haze alerts: the banner for the current update, and the alert log behind the feeds
// (data/alerts.json). An alert is recorded once per location, local day and category, so a
// long haze episode adds one entry a day per place, plus one each time it gets worse.
import fs from 'node:fs';
import { ALERT_AQI, HOME_ID, LOCATIONS, MAX_ALERTS_KEPT, SCHEMA_VERSION } from './config.mjs';
import { band, hazeLevel } from './aqi.mjs';
import { writeJsonAtomic } from './safe-fs.mjs';

const ID = /^\d{4}-\d{2}-\d{2}:[a-z-]{2,40}:(now|forecast):[a-z-]{2,20}$/;
const LOCAL_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

// What the banner on every page says for this update.
export function banner(snapshot) {
  const affected = snapshot.locations
    .map((l) => ({ id: l.id, name: l.name, state: l.state, aqi: l.now.aqi, level: hazeLevel(l.now.aqi), band: band(l.now.aqi) }))
    .filter((l) => l.level)
    .sort((a, b) => b.aqi - a.aqi);
  const home = snapshot.locations.find((l) => l.id === HOME_ID);
  const forecast = home && hazeLevel(home.aqiPeak24) === 'alert' && hazeLevel(home.now.aqi) !== 'alert' ? { aqi: home.aqiPeak24, band: band(home.aqiPeak24) } : null;
  const level = affected.some((a) => a.level === 'alert') || forecast ? 'alert' : affected.length ? 'notice' : null;
  return { level, affected, forecast };
}

// New alert entries this update would add to `existing` (an array). Pure.
export function newAlerts(snapshot, existing = []) {
  const have = new Set(existing.map((a) => a.id));
  const out = [];
  const add = (a) => {
    if (!have.has(a.id)) {
      have.add(a.id);
      out.push(a);
    }
  };
  for (const l of snapshot.locations) {
    if (hazeLevel(l.now.aqi) === 'alert') {
      const b = band(l.now.aqi);
      add({ id: `${l.today}:${l.id}:now:${b.id}`, kind: 'now', location: l.id, name: l.name, state: l.state, aqi: l.now.aqi, pm25: l.now.pm25, band: b.id, observedAt: l.now.airT, recordedAt: snapshot.generatedAt });
    }
    if (l.id === HOME_ID && typeof l.aqiPeak24 === 'number' && l.aqiPeak24 >= ALERT_AQI && !(l.now.aqi >= ALERT_AQI)) {
      const b = band(l.aqiPeak24);
      add({ id: `${l.today}:${l.id}:forecast:${b.id}`, kind: 'forecast', location: l.id, name: l.name, state: l.state, aqi: l.aqiPeak24, pm25: null, band: b.id, observedAt: l.now.airT, recordedAt: snapshot.generatedAt });
    }
  }
  return out;
}

export function validateAlerts(doc) {
  const fail = (m) => {
    throw new Error(`alerts.json: ${m}`);
  };
  if (!doc || doc.schema !== SCHEMA_VERSION || !Array.isArray(doc.alerts)) fail('bad schema');
  if (doc.alerts.length > MAX_ALERTS_KEPT) fail('too many alerts');
  const ids = new Set(LOCATIONS.map((l) => l.id));
  for (const a of doc.alerts) {
    if (!a || typeof a.id !== 'string' || !ID.test(a.id)) fail('bad id');
    if (!ids.has(a.location)) fail(`unknown location in ${a.id}`);
    if (a.kind !== 'now' && a.kind !== 'forecast') fail(`bad kind in ${a.id}`);
    if (typeof a.aqi !== 'number' || a.aqi < 0 || a.aqi > 1000) fail(`bad aqi in ${a.id}`);
    if (a.pm25 !== null && (typeof a.pm25 !== 'number' || a.pm25 < 0 || a.pm25 > 3000)) fail(`bad pm25 in ${a.id}`);
    if (typeof a.observedAt !== 'string' || !LOCAL_TIME.test(a.observedAt)) fail(`bad observedAt in ${a.id}`);
    if (typeof a.recordedAt !== 'string' || !Number.isFinite(Date.parse(a.recordedAt))) fail(`bad recordedAt in ${a.id}`);
    if (typeof a.name !== 'string' || a.name.length > 60 || typeof a.state !== 'string' || a.state.length > 60) fail(`bad name in ${a.id}`);
    if (band(a.aqi).id !== a.band) fail(`band does not match aqi in ${a.id}`);
  }
  return doc;
}

export function loadAlerts(file) {
  if (!fs.existsSync(file)) return { schema: SCHEMA_VERSION, alerts: [] };
  if (!fs.lstatSync(file).isFile()) throw new Error(`not a regular file: ${file}`);
  return validateAlerts(JSON.parse(fs.readFileSync(file, 'utf8')));
}

// Append new alerts, newest last, keeping at most MAX_ALERTS_KEPT. Returns how many were added.
export function recordAlerts({ file, root, snapshot }) {
  const doc = loadAlerts(file);
  const fresh = newAlerts(snapshot, doc.alerts);
  if (!fresh.length) return 0;
  const alerts = [...doc.alerts, ...fresh].slice(-MAX_ALERTS_KEPT);
  writeJsonAtomic(file, validateAlerts({ schema: SCHEMA_VERSION, alerts }), root);
  return fresh.length;
}
