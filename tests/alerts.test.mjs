// The haze banner and the alert log behind the feeds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { banner, newAlerts, recordAlerts, validateAlerts, loadAlerts } from '../scripts/lib/alerts.mjs';
import { MAX_ALERTS_KEPT } from '../scripts/lib/config.mjs';
import { snapshot, withAqi, tmpDir } from './helpers.mjs';

const base = snapshot();
const calm = (s) => ({ ...s, locations: s.locations.map((l) => ({ ...l, aqiPeak24: 40 })) });

test('the recorded day gives a notice: four places over 100, none over 150', () => {
  const b = banner(base);
  assert.equal(b.level, 'notice');
  assert.deepEqual(b.affected.map((a) => a.id), ['putrajaya', 'kuala-lumpur', 'shah-alam', 'melaka']);
  assert.equal(b.forecast, null);
});

test('no banner when every place is at 100 or below', () => {
  assert.equal(banner(calm(withAqi(base, {}))).level, null);
});

test('one place at 151 or more makes it an alert, worst place first', () => {
  const b = banner(calm(withAqi(base, { ipoh: 180, kuching: 120 })));
  assert.equal(b.level, 'alert');
  assert.deepEqual(b.affected.map((a) => [a.id, a.level]), [['ipoh', 'alert'], ['kuching', 'notice']]);
});

test('a KL forecast peak of 151+ within 24 hours raises an alert even while the air is fine now', () => {
  const s = withAqi(base, {});
  const s2 = { ...s, locations: s.locations.map((l, i) => (i === 0 ? { ...l, aqiPeak24: 165 } : { ...l, aqiPeak24: 40 })) };
  const b = banner(s2);
  assert.equal(b.level, 'alert');
  assert.equal(b.forecast.aqi, 165);
  const a = newAlerts(s2);
  assert.equal(a.length, 1);
  assert.equal(a[0].kind, 'forecast');
  assert.equal(a[0].id, '2026-11-24:kuala-lumpur:forecast:unhealthy');
});

test('alerts are recorded once per place, day and category; a worse category adds one more', () => {
  const s = calm(withAqi(base, { 'kota-bharu': 160 }));
  const first = newAlerts(s);
  assert.equal(first.length, 1);
  assert.equal(first[0].id, '2026-11-24:kota-bharu:now:unhealthy');
  assert.deepEqual(newAlerts(s, first), []);
  const worse = newAlerts(calm(withAqi(base, { 'kota-bharu': 240 })), first);
  assert.equal(worse[0].band, 'very-unhealthy');
});

test('notice-level air (101-150) is not written to the feed', () => {
  assert.deepEqual(newAlerts(calm(base)), []);
});

test('recordAlerts appends, validates and caps the log', () => {
  const root = tmpDir();
  const file = path.join(root, 'data', 'alerts.json');
  assert.equal(recordAlerts({ file, root, snapshot: calm(withAqi(base, { ipoh: 170, labuan: 210 })) }), 2);
  assert.equal(recordAlerts({ file, root, snapshot: calm(withAqi(base, { ipoh: 170 })) }), 0);
  assert.equal(loadAlerts(file).alerts.length, 2);
  const many = Array.from({ length: MAX_ALERTS_KEPT }, (_, i) => ({ id: `2026-01-${String((i % 28) + 1).padStart(2, '0')}:ipoh:now:${['unhealthy', 'very-unhealthy', 'hazardous'][Math.floor(i / 28) % 3]}`, kind: 'now', location: 'ipoh', name: 'Ipoh', state: 'Perak', aqi: [160, 250, 350][Math.floor(i / 28) % 3], pm25: 50, band: ['unhealthy', 'very-unhealthy', 'hazardous'][Math.floor(i / 28) % 3], observedAt: '2026-01-01T12:00', recordedAt: '2026-01-01T04:00:00.000Z' }));
  const uniq = [...new Map(many.map((a) => [a.id, a])).values()];
  fs.writeFileSync(file, JSON.stringify({ schema: 1, alerts: uniq }));
  recordAlerts({ file, root, snapshot: calm(withAqi(base, { kangar: 155 })) });
  const after = loadAlerts(file).alerts;
  assert.ok(after.length <= MAX_ALERTS_KEPT);
  assert.equal(after.at(-1).location, 'kangar');
});

test('validateAlerts rejects unknown places, bad ids, bands that do not match, and markup in names', () => {
  const good = newAlerts(calm(withAqi(base, { ipoh: 170 })))[0];
  assert.ok(validateAlerts({ schema: 1, alerts: [good] }));
  assert.throws(() => validateAlerts({ schema: 1, alerts: [{ ...good, location: 'atlantis' }] }), /unknown location/);
  assert.throws(() => validateAlerts({ schema: 1, alerts: [{ ...good, id: '<script>' }] }), /bad id/);
  assert.throws(() => validateAlerts({ schema: 1, alerts: [{ ...good, band: 'good' }] }), /band does not match/);
  assert.throws(() => validateAlerts({ schema: 1, alerts: [{ ...good, name: 'x'.repeat(200) }] }), /bad name/);
  assert.throws(() => validateAlerts({ schema: 2, alerts: [] }), /schema/);
});

test('a missing alert log reads as empty; a symlinked one is refused', () => {
  const root = tmpDir();
  assert.deepEqual(loadAlerts(path.join(root, 'none.json')).alerts, []);
  const real = path.join(root, 'real.json');
  fs.writeFileSync(real, JSON.stringify({ schema: 1, alerts: [] }));
  fs.symlinkSync(real, path.join(root, 'alerts.json'));
  assert.throws(() => loadAlerts(path.join(root, 'alerts.json')), /not a regular file/);
});
