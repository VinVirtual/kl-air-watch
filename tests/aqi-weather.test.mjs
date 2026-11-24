// Categories, advice, haze levels, the WHO comparison and weather words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { band, advice, hazeLevel, whoPm25, mean, max, min, round } from '../scripts/lib/aqi.mjs';
import { describeWeather, heatNote, formatDate, hourLabel, addDays, weekdayOf, localFromUtc } from '../scripts/lib/weather.mjs';
import { AQI_BANDS } from '../scripts/lib/config.mjs';

test('US AQI category boundaries follow the EPA table', () => {
  const cases = [[0, 'good'], [50, 'good'], [50.4, 'good'], [51, 'moderate'], [100, 'moderate'], [101, 'sensitive'], [150, 'sensitive'], [151, 'unhealthy'], [200, 'unhealthy'], [201, 'very-unhealthy'], [300, 'very-unhealthy'], [301, 'hazardous'], [500, 'hazardous'], [812, 'hazardous']];
  for (const [v, id] of cases) assert.equal(band(v).id, id, String(v));
});

test('missing, negative or non-numeric AQI is "unknown", never a colour', () => {
  for (const v of [null, undefined, NaN, -1, '120', Infinity]) assert.equal(band(v).id, 'unknown', String(v));
});

test('every category has English and Malay labels and advice', () => {
  for (const b of AQI_BANDS) {
    const a = advice(b.max);
    assert.ok(b.label && b.labelMs, b.id);
    assert.ok(a.en.length > 20 && a.ms.length > 20, b.id);
    assert.notEqual(a.en, a.ms);
  }
  assert.match(advice(null).en, /No air quality reading/);
});

test('advice gets stricter as the air gets worse', () => {
  assert.match(advice(30).en, /good day/);
  assert.match(advice(120).en, /asthma/);
  assert.match(advice(170).en, /Everyone/);
  assert.match(advice(250).en, /N95/);
  assert.match(advice(400).en, /Ministry of Health/);
});

test('haze level: notice from 101, alert from 151', () => {
  assert.equal(hazeLevel(100), null);
  assert.equal(hazeLevel(101), 'notice');
  assert.equal(hazeLevel(150), 'notice');
  assert.equal(hazeLevel(151), 'alert');
  assert.equal(hazeLevel(null), null);
});

test('WHO PM2.5 comparison names the guideline step', () => {
  assert.deepEqual(whoPm25(12), { mean: 12, ratio: 0.8, within: true, step: 'within the WHO guideline' });
  assert.equal(whoPm25(20).step, 'above the guideline, within interim target 4');
  assert.equal(whoPm25(40.4).step, 'within interim target 2');
  assert.equal(whoPm25(40.4).ratio, 2.7);
  assert.equal(whoPm25(90).step, 'above every WHO interim target');
  assert.equal(whoPm25(null), null);
});

test('mean, max, min and round ignore missing values', () => {
  assert.equal(mean([1, null, 3]), 2);
  assert.equal(mean([null]), null);
  assert.equal(max([1, null, 7, NaN]), 7);
  assert.equal(min([]), null);
  assert.equal(round(2.345, 1), 2.3);
  assert.equal(round(null), null);
});

test('WMO weather codes become words in both languages with an icon', () => {
  assert.deepEqual(describeWeather(95), { en: 'Thunderstorms', ms: 'Ribut petir', icon: 'storm' });
  assert.equal(describeWeather(0).icon, 'sun');
  assert.equal(describeWeather(81).en, 'Rain showers');
  assert.equal(describeWeather(1234).en, 'Unknown');
  assert.equal(describeWeather(null).en, 'Unknown');
});

test('heat notes follow the heat-index bands', () => {
  assert.match(heatNote(25).en, /Comfortable/);
  assert.match(heatNote(30).en, /Warm/);
  assert.match(heatNote(34).en, /Very hot/);
  assert.match(heatNote(42).en, /Dangerous/);
  assert.equal(heatNote(null), null);
});

test('date helpers work on Malaysia local strings without the machine time zone', () => {
  assert.equal(formatDate('2026-11-24'), 'Tue 24 Nov');
  assert.equal(weekdayOf('2026-11-29'), 0);
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(hourLabel('2026-11-24T00:00'), '12am');
  assert.equal(hourLabel('2026-11-24T13:00'), '1pm');
  assert.equal(localFromUtc('2026-11-24T20:00:00Z'), '2026-11-25T04:00');
  assert.throws(() => localFromUtc('nope'), /bad date/);
});
