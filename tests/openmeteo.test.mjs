// Request URLs and strict parsing of the two Open-Meteo responses (recorded 24 Nov 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forecastUrl, airUrl, parseForecast, parseAir, cleanValue, ParseError } from '../scripts/lib/openmeteo.mjs';
import { LOCATIONS, FORECAST_VARS, AIR_VARS } from '../scripts/lib/config.mjs';
import { forecastRaw, airRaw } from './helpers.mjs';

test('one forecast URL carries all 16 places, Malaysia time and the configured variables', () => {
  const u = new URL(forecastUrl());
  assert.equal(u.protocol, 'https:');
  assert.equal(u.hostname, 'api.open-meteo.com');
  assert.equal(u.searchParams.get('latitude').split(',').length, 16);
  assert.equal(u.searchParams.get('longitude').split(',').length, 16);
  assert.equal(u.searchParams.get('timezone'), 'Asia/Kuala_Lumpur');
  assert.equal(u.searchParams.get('hourly'), FORECAST_VARS.hourly.join(','));
  assert.equal(u.searchParams.get('forecast_days'), '7');
  assert.equal(u.searchParams.get('past_days'), '3');
  assert.ok(!u.searchParams.has('apikey'), 'the free API takes no key');
});

test('the air quality URL goes to the air quality host with PM, ozone, NO2 and both AQIs', () => {
  const u = new URL(airUrl());
  assert.equal(u.hostname, 'air-quality-api.open-meteo.com');
  for (const v of ['pm2_5', 'pm10', 'ozone', 'nitrogen_dioxide', 'us_aqi', 'european_aqi']) assert.ok(u.searchParams.get('current').split(',').includes(v), v);
  assert.equal(u.searchParams.get('hourly'), AIR_VARS.hourly.join(','));
  assert.equal(u.searchParams.get('latitude').split(',')[0], LOCATIONS[0].lat.toFixed(4));
});

test('past days must be a whole number from 0 to 92', () => {
  assert.equal(new URL(forecastUrl({ pastDays: 30 })).searchParams.get('past_days'), '30');
  for (const bad of [-1, 93, 1.5, '3', NaN]) assert.throws(() => forecastUrl({ pastDays: bad }), /past days/);
  assert.throws(() => airUrl({ pastDays: 100 }), /past days/);
});

test('the recorded forecast parses for all 16 places with no rejected values', () => {
  const f = parseForecast(forecastRaw());
  assert.equal(f.locations.length, 16);
  assert.deepEqual(f.locations.map((l) => l.id), LOCATIONS.map((l) => l.id));
  assert.equal(f.rejected, 0);
  const kl = f.locations[0];
  assert.equal(kl.current.t, '2026-11-24T18:30');
  assert.equal(kl.current.temperature_2m, 26.9);
  assert.equal(kl.hourly.length, 240); // 3 past days + 7 forecast days
  assert.equal(kl.daily.length, 10);
});

test('the recorded air quality parses for all 16 places', () => {
  const a = parseAir(airRaw());
  assert.equal(a.locations.length, 16);
  assert.equal(a.rejected, 0);
  assert.equal(a.locations[0].current.us_aqi, 112);
  assert.equal(a.locations[0].current.pm2_5, 38.8);
  assert.equal(a.locations[0].hourly.length, 144);
});

test('a response for the wrong number of places is refused', () => {
  assert.throws(() => parseForecast(forecastRaw().slice(0, 15)), (e) => e instanceof ParseError && /expected 16/.test(e.message));
  assert.throws(() => parseAir(airRaw()[0]), /expected 16/);
});

test('coordinates far from the place asked for are refused', () => {
  const raw = forecastRaw();
  raw[3] = { ...raw[3], latitude: 40.7, longitude: -74 };
  assert.throws(() => parseForecast(raw), /coordinates do not match seremban/);
});

test('a response not in Malaysia time is refused', () => {
  const raw = airRaw();
  raw[0] = { ...raw[0], utc_offset_seconds: 0 };
  assert.throws(() => parseAir(raw), /UTC\+8/);
});

test('an API error object becomes a clear error with the reason, cut short', () => {
  assert.throws(() => parseForecast({ error: true, reason: 'Latitude must be in range of -90 to 90°.' }), /the API said: Latitude must be/);
  assert.throws(() => parseAir({ error: true, reason: 'x'.repeat(1000) }), (e) => e.message.length < 200);
});

test('hourly series must have increasing, well-formed times and matching lengths', () => {
  const shuffled = forecastRaw();
  shuffled[0].hourly.time = [...shuffled[0].hourly.time].reverse();
  assert.throws(() => parseForecast(shuffled), /not increasing/);
  const bad = forecastRaw();
  bad[0].hourly.time[5] = '<script>';
  assert.throws(() => parseForecast(bad), /bad entry/);
  const short = airRaw();
  short[2].hourly.pm2_5 = short[2].hourly.pm2_5.slice(1);
  assert.throws(() => parseAir(short), /pm2_5: missing or wrong length/);
});

test('implausible or wrongly typed values become null and are counted, not trusted', () => {
  const raw = airRaw();
  raw[0].current.us_aqi = 99999;
  raw[0].current.pm2_5 = '38.8';
  raw[0].hourly.ozone[0] = -5;
  raw[0].hourly.pm10[1] = Infinity;
  const a = parseAir(raw);
  assert.equal(a.locations[0].current.us_aqi, null);
  assert.equal(a.locations[0].current.pm2_5, null);
  assert.equal(a.locations[0].hourly[0].ozone, null);
  assert.equal(a.locations[0].hourly[1].pm10, null);
  assert.equal(a.rejected, 4);
});

test('cleanValue keeps nulls, numbers in range, and refuses unknown fields', () => {
  assert.equal(cleanValue('temperature_2m', null), null);
  assert.equal(cleanValue('temperature_2m', 31.2), 31.2);
  assert.equal(cleanValue('relative_humidity_2m', 101), null);
  assert.equal(cleanValue('not_a_field', 3), null);
  assert.equal(cleanValue('us_aqi', true), null);
});
