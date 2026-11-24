// Validation of the snapshot (data/latest.json) before anything is rendered from it.
import { LOCATIONS, SCHEMA_VERSION } from './config.mjs';

const LOCAL_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class SchemaError extends Error {}

function fail(path, msg) {
  throw new SchemaError(`${path}: ${msg}`);
}

function num(v, path, lo, hi) {
  if (v === null) return;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) fail(path, `must be null or a number from ${lo} to ${hi}`);
}

const NOW = { temp: [-20, 60], feels: [-30, 75], humidity: [0, 100], rain: [0, 500], code: [0, 99], wind: [0, 400], isDay: [0, 1], aqi: [0, 1000], euAqi: [0, 1000], pm25: [0, 3000], pm10: [0, 5000], o3: [0, 2000], no2: [0, 2000] };
const HOUR = { temp: [-20, 60], feels: [-30, 75], pop: [0, 100], rain: [0, 500], code: [0, 99], aqi: [0, 1000], pm25: [0, 3000] };
const DAY = { code: [0, 99], tMax: [-20, 60], tMin: [-20, 60], pop: [0, 100], rain: [0, 1500], uv: [0, 25], aqiMax: [0, 1000] };

function fields(obj, spec, path) {
  if (!obj || typeof obj !== 'object') fail(path, 'missing');
  for (const [k, [lo, hi]] of Object.entries(spec)) {
    if (!(k in obj)) fail(`${path}.${k}`, 'missing');
    num(obj[k], `${path}.${k}`, lo, hi);
  }
}

export function validateSnapshot(s) {
  if (!s || typeof s !== 'object') fail('snapshot', 'not an object');
  if (s.schema !== SCHEMA_VERSION) fail('schema', `must be ${SCHEMA_VERSION}`);
  if (typeof s.generatedAt !== 'string' || !Number.isFinite(Date.parse(s.generatedAt))) fail('generatedAt', 'not a date');
  if (typeof s.today !== 'string' || !DATE.test(s.today)) fail('today', 'not a date');
  if (!Array.isArray(s.locations) || s.locations.length !== LOCATIONS.length) fail('locations', `must list all ${LOCATIONS.length} locations`);
  s.locations.forEach((l, i) => {
    const p = `locations[${i}]`;
    const want = LOCATIONS[i];
    if (l?.id !== want.id) fail(`${p}.id`, `expected ${want.id}`);
    if (l.name !== want.name || l.state !== want.state) fail(p, 'name or state differs from the configuration');
    if (typeof l.now?.t !== 'string' || !LOCAL_TIME.test(l.now.t)) fail(`${p}.now.t`, 'bad time');
    if (typeof l.now.airT !== 'string' || !LOCAL_TIME.test(l.now.airT)) fail(`${p}.now.airT`, 'bad time');
    fields(l.now, NOW, `${p}.now`);
    num(l.pm25Mean24, `${p}.pm25Mean24`, 0, 3000);
    num(l.aqiPeak24, `${p}.aqiPeak24`, 0, 1000);
    if (!Array.isArray(l.next48) || l.next48.length > 48) fail(`${p}.next48`, 'bad');
    l.next48.forEach((h, j) => {
      if (typeof h?.t !== 'string' || !LOCAL_TIME.test(h.t)) fail(`${p}.next48[${j}].t`, 'bad time');
      fields(h, HOUR, `${p}.next48[${j}]`);
    });
    if (!Array.isArray(l.days) || l.days.length > 7) fail(`${p}.days`, 'bad');
    l.days.forEach((d, j) => {
      if (typeof d?.date !== 'string' || !DATE.test(d.date)) fail(`${p}.days[${j}].date`, 'bad date');
      fields(d, DAY, `${p}.days[${j}]`);
    });
  });
  return s;
}
