// Parsed API data -> the snapshot the site is built from (data/latest.json).
// Times stay as Malaysia local time strings, as the API returns them with timezone=Asia/Kuala_Lumpur.
import { LOCATIONS, SCHEMA_VERSION, VERSION } from './config.mjs';
import { mean, max, round } from './aqi.mjs';

export function addHours(t, n) {
  const ms = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(t)) ? Date.parse(`${t}:00Z`) : NaN;
  if (!Number.isFinite(ms)) throw new Error(`bad local time: ${t}`);
  return new Date(ms + n * 3_600_000).toISOString().slice(0, 16);
}

export const hourOf = (t) => `${t.slice(0, 13)}:00`;

function byTime(rows) {
  return new Map(rows.map((r) => [r.t, r]));
}

function locationSnapshot(loc, f, a) {
  const nowT = f.current.t;
  const hour = hourOf(nowT);
  const today = nowT.slice(0, 10);
  const air = byTime(a.hourly);

  const next48 = f.hourly
    .filter((r) => r.t >= hour)
    .slice(0, 48)
    .map((r) => {
      const q = air.get(r.t);
      return {
        t: r.t,
        temp: round(r.temperature_2m, 1),
        feels: round(r.apparent_temperature, 1),
        pop: r.precipitation_probability,
        rain: round(r.precipitation, 1),
        code: r.weather_code,
        aqi: q ? round(q.us_aqi) : null,
        pm25: q ? round(q.pm2_5, 1) : null,
      };
    });

  const days = f.daily
    .filter((d) => d.t >= today)
    .slice(0, 7)
    .map((d) => {
      const rows = a.hourly.filter((r) => r.t.startsWith(d.t));
      const enough = rows.filter((r) => r.us_aqi !== null).length >= 12;
      return {
        date: d.t,
        code: d.weather_code,
        tMax: round(d.temperature_2m_max, 1),
        tMin: round(d.temperature_2m_min, 1),
        pop: d.precipitation_probability_max,
        rain: round(d.precipitation_sum, 1),
        uv: round(d.uv_index_max, 1),
        aqiMax: enough ? round(max(rows.map((r) => r.us_aqi))) : null,
      };
    });

  const past24 = a.hourly.filter((r) => r.t > addHours(hour, -24) && r.t <= hour);
  const ahead24 = a.hourly.filter((r) => r.t > hour && r.t <= addHours(hour, 24));
  const c = f.current;
  const q = a.current;
  return {
    id: loc.id,
    name: loc.name,
    state: loc.state,
    stateMs: loc.stateMs,
    lat: loc.lat,
    lon: loc.lon,
    tile: loc.tile,
    grid: { weather: f.grid, air: a.grid },
    today,
    now: {
      t: nowT,
      airT: q.t,
      temp: round(c.temperature_2m, 1),
      feels: round(c.apparent_temperature, 1),
      humidity: c.relative_humidity_2m,
      rain: round(c.precipitation, 1),
      code: c.weather_code,
      wind: round(c.wind_speed_10m, 1),
      isDay: c.is_day,
      aqi: round(q.us_aqi),
      euAqi: round(q.european_aqi),
      pm25: round(q.pm2_5, 1),
      pm10: round(q.pm10, 1),
      o3: round(q.ozone, 1),
      no2: round(q.nitrogen_dioxide, 1),
    },
    pm25Mean24: past24.filter((r) => r.pm2_5 !== null).length >= 18 ? round(mean(past24.map((r) => r.pm2_5)), 1) : null,
    aqiPeak24: round(max(ahead24.map((r) => r.us_aqi))),
    next48,
    days,
  };
}

export function buildSnapshot({ forecast, air, generatedAt, requests = {}, locations = LOCATIONS }) {
  if (forecast.locations.length !== locations.length || air.locations.length !== locations.length) {
    throw new Error('snapshot: forecast and air quality must cover the same locations');
  }
  const locs = locations.map((loc, i) => {
    if (forecast.locations[i].id !== loc.id || air.locations[i].id !== loc.id) throw new Error(`snapshot: location order differs at ${loc.id}`);
    return locationSnapshot(loc, forecast.locations[i], air.locations[i]);
  });
  return {
    schema: SCHEMA_VERSION,
    generator: `kl-air-watch ${VERSION}`,
    generatedAt,
    today: locs[0].today,
    requests,
    rejectedValues: forecast.rejected + air.rejected,
    locations: locs,
  };
}
