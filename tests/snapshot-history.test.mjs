// The snapshot built from the recorded responses, its validation, and the daily history files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { addHours, hourOf } from '../scripts/lib/snapshot.mjs';
import { validateSnapshot } from '../scripts/lib/schema.mjs';
import { summarizeDay, pastDays, mergeHistory, loadHistory, validateMonth, formatMonth, MIN_HOURS } from '../scripts/lib/history.mjs';
import { snapshot, parsed, tmpDir } from './helpers.mjs';

const clone = (o) => JSON.parse(JSON.stringify(o));

test('the snapshot has all 16 places, KL first, with today in Malaysia time', () => {
  const s = snapshot();
  assert.equal(s.locations.length, 16);
  assert.equal(s.locations[0].id, 'kuala-lumpur');
  assert.equal(s.today, '2026-11-24');
  assert.equal(s.locations[0].now.aqi, 112);
  assert.equal(s.locations[0].now.temp, 26.9);
});

test('next48 starts at the current hour and holds 48 hours with air quality joined by time', () => {
  const kl = snapshot().locations[0];
  assert.equal(kl.next48.length, 48);
  assert.equal(kl.next48[0].t, '2026-11-24T18:00');
  assert.equal(kl.next48[47].t, '2026-11-26T17:00');
  assert.equal(kl.next48[0].aqi, 112);
  assert.ok(kl.next48.every((h) => h.aqi === null || typeof h.aqi === 'number'));
});

test('seven days start today; the AQI forecast stops where the air model stops', () => {
  const kl = snapshot().locations[0];
  assert.equal(kl.days.length, 7);
  assert.equal(kl.days[0].date, '2026-11-24');
  assert.ok(kl.days.slice(0, 3).every((d) => typeof d.aqiMax === 'number'));
  assert.ok(kl.days.slice(3).every((d) => d.aqiMax === null));
});

test('the past-24-hour PM2.5 mean and the next-24-hour AQI peak are computed', () => {
  const kl = snapshot().locations[0];
  assert.equal(kl.pm25Mean24, 40.4);
  assert.ok(kl.aqiPeak24 >= 90 && kl.aqiPeak24 <= 150);
});

test('local time arithmetic crosses days and months', () => {
  assert.equal(addHours('2026-11-30T23:00', 2), '2026-12-01T01:00');
  assert.equal(addHours('2026-11-24T18:00', -24), '2026-11-23T18:00');
  assert.equal(hourOf('2026-11-24T18:30'), '2026-11-24T18:00');
  assert.throws(() => addHours('garbage', 1), /bad local time/);
});

test('a built snapshot validates; tampered ones do not', () => {
  const s = snapshot();
  assert.equal(validateSnapshot(clone(s)).locations.length, 16);
  const swapped = clone(s);
  [swapped.locations[0], swapped.locations[1]] = [swapped.locations[1], swapped.locations[0]];
  assert.throws(() => validateSnapshot(swapped), /expected kuala-lumpur/);
  const wild = clone(s);
  wild.locations[2].now.aqi = 5000;
  assert.throws(() => validateSnapshot(wild), /now.aqi/);
  const renamed = clone(s);
  renamed.locations[4].name = '<img src=x onerror=alert(1)>';
  assert.throws(() => validateSnapshot(renamed), /differs from the configuration/);
  const badTime = clone(s);
  badTime.locations[0].next48[3].t = '2026-11-24 21:00"><script>';
  assert.throws(() => validateSnapshot(badTime), /bad time/);
  const missing = clone(s);
  delete missing.locations[0].days[0].tMax;
  assert.throws(() => validateSnapshot(missing), /tMax: missing/);
  assert.throws(() => validateSnapshot({ ...clone(s), schema: 2 }), /schema/);
  assert.throws(() => validateSnapshot({ ...clone(s), locations: s.locations.slice(1) }), /all 16/);
});

test('summarizeDay needs at least MIN_HOURS hours of data', () => {
  const air = Array.from({ length: 24 }, (_, i) => ({ us_aqi: 50 + i, pm2_5: 10, pm10: 20, ozone: 30 + i, nitrogen_dioxide: 5 }));
  const wx = Array.from({ length: 24 }, (_, i) => ({ temperature_2m: 24 + (i % 10), precipitation: i === 15 ? 4.2 : 0 }));
  const s = summarizeDay(wx, air);
  assert.deepEqual(s, { aqiMax: 73, aqiMean: 62, pm25: 10, pm10: 20, o3Max: 53, no2Max: 5, hours: 24, tMax: 33, tMin: 24, rain: 4.2 });
  const thin = air.map((r, i) => (i < MIN_HOURS - 1 ? r : { ...r, us_aqi: null }));
  assert.equal(summarizeDay([], thin), null);
  assert.equal(summarizeDay(wx, thin).aqiMax, undefined);
  assert.equal(summarizeDay([], []), null);
});

test('pastDays returns only complete days before today, for every place', () => {
  const { forecast, air } = parsed();
  const days = pastDays({ forecast, air, today: '2026-11-24' });
  assert.deepEqual(Object.keys(days).sort(), ['2026-11-21', '2026-11-22', '2026-11-23']);
  assert.equal(Object.keys(days['2026-11-23']).length, 16);
  assert.equal(days['2026-11-23']['kuala-lumpur'].hours, 24);
});

test('mergeHistory writes month files, one line per day, and never rewrites a recorded day', () => {
  const root = tmpDir();
  const dataDir = path.join(root, 'data');
  const { forecast, air } = parsed();
  const days = pastDays({ forecast, air, today: '2026-11-24' });
  assert.deepEqual(mergeHistory({ dataDir, root, days }), ['2026-11-21', '2026-11-22', '2026-11-23']);
  const file = path.join(dataDir, 'history', '2026-11.json');
  const text = fs.readFileSync(file, 'utf8');
  assert.equal(text.split('\n').filter((l) => l.startsWith('    "2026-11-')).length, 3);
  const changed = clone(days);
  changed['2026-11-23']['kuala-lumpur'].aqiMax = 499;
  assert.deepEqual(mergeHistory({ dataDir, root, days: changed }), []);
  assert.equal(fs.readFileSync(file, 'utf8'), text);
  assert.equal(loadHistory(dataDir).at(-1).locations['kuala-lumpur'].aqiMax, days['2026-11-23']['kuala-lumpur'].aqiMax);
});

test('mergeHistory adds a place missing from a recorded day, and splits days across months', () => {
  const root = tmpDir();
  const dataDir = path.join(root, 'data');
  const s = { aqiMax: 60, tMax: 31 };
  mergeHistory({ dataDir, root, days: { '2026-11-30': { 'kuala-lumpur': s } } });
  assert.deepEqual(mergeHistory({ dataDir, root, days: { '2026-11-30': { 'kuala-lumpur': s, ipoh: s }, '2026-12-01': { ipoh: s } } }), ['2026-11-30', '2026-12-01']);
  const h = loadHistory(dataDir);
  assert.deepEqual(h.map((d) => d.date), ['2026-11-30', '2026-12-01']);
  assert.deepEqual(Object.keys(h[0].locations), ['kuala-lumpur', 'ipoh']);
});

test('history files are validated: unknown places, fields, ranges and misplaced dates fail', () => {
  const ok = { schema: 1, month: '2026-11', days: { '2026-11-02': { ipoh: { aqiMax: 40 } } } };
  assert.equal(validateMonth(ok), ok);
  assert.throws(() => validateMonth({ ...ok, days: { '2026-11-02': { atlantis: { aqiMax: 4 } } } }), /unknown location/);
  assert.throws(() => validateMonth({ ...ok, days: { '2026-11-02': { ipoh: { evil: 4 } } } }), /unknown field/);
  assert.throws(() => validateMonth({ ...ok, days: { '2026-11-02': { ipoh: { aqiMax: -3 } } } }), /out of range/);
  assert.throws(() => validateMonth({ ...ok, days: { '2026-12-02': { ipoh: { aqiMax: 4 } } } }), /bad date/);
  assert.throws(() => validateMonth({ ...ok, schema: 9 }), /schema/);
  assert.deepEqual(JSON.parse(formatMonth(ok)), ok);
});

test('loadHistory refuses a symlinked month file and a file whose name and month differ', () => {
  const root = tmpDir();
  const dir = path.join(root, 'history');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, '2026-10.json'), JSON.stringify({ schema: 1, month: '2026-11', days: {} }));
  assert.throws(() => loadHistory(root), /file name and month differ/);
  fs.rmSync(path.join(dir, '2026-10.json'));
  const target = path.join(tmpDir(), 'x.json');
  fs.writeFileSync(target, JSON.stringify({ schema: 1, month: '2026-11', days: {} }));
  fs.symlinkSync(target, path.join(dir, '2026-11.json'));
  assert.throws(() => loadHistory(root), /not a regular file/);
});
