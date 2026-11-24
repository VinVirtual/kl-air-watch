// Open-Meteo Forecast and Air Quality APIs: request URLs and strict parsing.
// Everything from the network is untrusted: each value is checked for type and a plausible
// range; anything else becomes null (and is counted), never a crash or a wild number.
import { LOCATIONS, FORECAST_VARS, AIR_VARS, FORECAST_DAYS, AIR_FORECAST_DAYS, PAST_DAYS, MAX_BACKFILL_DAYS, HOSTS, TIMEZONE } from './config.mjs';

const coords = (locs, key) => locs.map((l) => l[key].toFixed(4)).join(',');

function checkPast(pastDays) {
  if (!Number.isInteger(pastDays) || pastDays < 0 || pastDays > MAX_BACKFILL_DAYS) {
    throw new Error(`past days must be an integer from 0 to ${MAX_BACKFILL_DAYS}`);
  }
  return pastDays;
}

export function forecastUrl({ locations = LOCATIONS, pastDays = PAST_DAYS } = {}) {
  const q = new URLSearchParams({
    latitude: coords(locations, 'lat'),
    longitude: coords(locations, 'lon'),
    current: FORECAST_VARS.current.join(','),
    hourly: FORECAST_VARS.hourly.join(','),
    daily: FORECAST_VARS.daily.join(','),
    timezone: TIMEZONE,
    forecast_days: String(FORECAST_DAYS),
    past_days: String(checkPast(pastDays)),
  });
  return `https://${HOSTS.forecast}/v1/forecast?${q}`;
}

export function airUrl({ locations = LOCATIONS, pastDays = PAST_DAYS } = {}) {
  const q = new URLSearchParams({
    latitude: coords(locations, 'lat'),
    longitude: coords(locations, 'lon'),
    current: AIR_VARS.current.join(','),
    hourly: AIR_VARS.hourly.join(','),
    timezone: TIMEZONE,
    forecast_days: String(AIR_FORECAST_DAYS),
    past_days: String(checkPast(pastDays)),
  });
  return `https://${HOSTS.air}/v1/air-quality?${q}`;
}

// Plausible ranges. Outside them a value is treated as missing.
export const RANGES = Object.freeze({
  temperature_2m: [-20, 60],
  apparent_temperature: [-30, 75],
  relative_humidity_2m: [0, 100],
  precipitation: [0, 500],
  precipitation_probability: [0, 100],
  precipitation_sum: [0, 1500],
  precipitation_probability_max: [0, 100],
  weather_code: [0, 99],
  wind_speed_10m: [0, 400],
  is_day: [0, 1],
  temperature_2m_max: [-20, 60],
  temperature_2m_min: [-20, 60],
  uv_index_max: [0, 25],
  us_aqi: [0, 1000],
  european_aqi: [0, 1000],
  pm2_5: [0, 3000],
  pm10: [0, 5000],
  ozone: [0, 2000],
  nitrogen_dioxide: [0, 2000],
});

const LOCAL_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ParseError extends Error {}

export function cleanValue(name, v, stats) {
  if (v === null || v === undefined) return null;
  const range = RANGES[name];
  if (typeof v !== 'number' || !Number.isFinite(v) || !range || v < range[0] || v > range[1]) {
    if (stats) stats.rejected += 1;
    return null;
  }
  return v;
}

function series(block, vars, timeRe, name, stats) {
  if (!block || typeof block !== 'object') throw new ParseError(`${name}: missing`);
  const time = block.time;
  if (!Array.isArray(time) || time.length === 0 || time.length > 24 * 120) throw new ParseError(`${name}.time: missing or too long`);
  for (const t of time) if (typeof t !== 'string' || !timeRe.test(t)) throw new ParseError(`${name}.time: bad entry`);
  for (let i = 1; i < time.length; i += 1) if (time[i] <= time[i - 1]) throw new ParseError(`${name}.time: not increasing`);
  const out = time.map((t) => ({ t }));
  for (const v of vars) {
    const arr = block[v];
    if (!Array.isArray(arr) || arr.length !== time.length) throw new ParseError(`${name}.${v}: missing or wrong length`);
    arr.forEach((x, i) => {
      out[i][v] = cleanValue(v, x, stats);
    });
  }
  return out;
}

function current(block, vars, name, stats) {
  if (!block || typeof block !== 'object') throw new ParseError(`${name}: missing`);
  if (typeof block.time !== 'string' || !LOCAL_TIME.test(block.time)) throw new ParseError(`${name}.time: bad`);
  const out = { t: block.time };
  for (const v of vars) out[v] = cleanValue(v, block[v], stats);
  return out;
}

// One response per API; with several locations it is an array in the order asked.
function asList(data, locations, name) {
  const list = Array.isArray(data) ? data : [data];
  if (list.length !== locations.length) throw new ParseError(`${name}: expected ${locations.length} locations, got ${list.length}`);
  list.forEach((d, i) => {
    if (!d || typeof d !== 'object') throw new ParseError(`${name}[${i}]: not an object`);
    if (d.error) throw new ParseError(`${name}: the API said: ${String(d.reason ?? 'error').slice(0, 120)}`);
    const loc = locations[i];
    // Grid cells snap coordinates (the air model is ~0.4°); more than 1° off is the wrong place.
    if (!(Math.abs(d.latitude - loc.lat) <= 1 && Math.abs(d.longitude - loc.lon) <= 1)) {
      throw new ParseError(`${name}[${i}]: coordinates do not match ${loc.id}`);
    }
    if (d.utc_offset_seconds !== 28_800) throw new ParseError(`${name}[${i}]: not in Malaysia time (UTC+8)`);
  });
  return list;
}

export function parseForecast(data, locations = LOCATIONS) {
  if (data && !Array.isArray(data) && data.error) throw new ParseError(`forecast: the API said: ${String(data.reason ?? 'error').slice(0, 120)}`);
  const stats = { rejected: 0 };
  const list = asList(data, locations, 'forecast');
  const out = list.map((d, i) => ({
    id: locations[i].id,
    grid: { lat: d.latitude, lon: d.longitude, elevation: Number.isFinite(d.elevation) ? d.elevation : null },
    current: current(d.current, FORECAST_VARS.current, 'forecast.current', stats),
    hourly: series(d.hourly, FORECAST_VARS.hourly, LOCAL_TIME, 'forecast.hourly', stats),
    daily: series(d.daily, FORECAST_VARS.daily, LOCAL_DATE, 'forecast.daily', stats),
  }));
  return { locations: out, rejected: stats.rejected };
}

export function parseAir(data, locations = LOCATIONS) {
  if (data && !Array.isArray(data) && data.error) throw new ParseError(`air: the API said: ${String(data.reason ?? 'error').slice(0, 120)}`);
  const stats = { rejected: 0 };
  const list = asList(data, locations, 'air');
  const out = list.map((d, i) => ({
    id: locations[i].id,
    grid: { lat: d.latitude, lon: d.longitude },
    current: current(d.current, AIR_VARS.current, 'air.current', stats),
    hourly: series(d.hourly, AIR_VARS.hourly, LOCAL_TIME, 'air.hourly', stats),
  }));
  return { locations: out, rejected: stats.rejected };
}
