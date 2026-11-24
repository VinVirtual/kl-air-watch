// Every number that decides what KL Air & Weather Watch fetches, keeps and calls an alert
// lives here. The Method page is generated from these values, so the docs cannot drift.

export const VERSION = '0.1.0';
export const SCHEMA_VERSION = 1;

export const USER_AGENT = `kl-air-watch/${VERSION} (+https://github.com/VinVirtual/kl-air-watch)`;

// Cloudflare Pages. Override with AIRWATCH_SITE_URL or --site-url once a custom domain
// (suggested: https://air.lashvin.com/) is attached.
export const DEFAULT_SITE_URL = 'https://kl-air-watch.pages.dev/';
export const SITE_TITLE = 'KL Air & Weather Watch';
export const SITE_TITLE_MS = 'Pemantau Udara & Cuaca KL';
export const SITE_TAGLINE = 'Weather and air quality for Kuala Lumpur and every Malaysian state, updated every three hours.';

export const TIMEZONE = 'Asia/Kuala_Lumpur';
export const UTC_OFFSET_HOURS = 8; // Malaysia has no daylight saving time.

// Kuala Lumpur first, then the 13 state capitals and the two other federal territories.
// `tile` is the [column, row] of the tile map: a rough cartogram, not a real map.
export const LOCATIONS = Object.freeze([
  { id: 'kuala-lumpur', name: 'Kuala Lumpur', state: 'W.P. Kuala Lumpur', stateMs: 'W.P. Kuala Lumpur', lat: 3.139, lon: 101.6869, tile: [2, 4] },
  { id: 'putrajaya', name: 'Putrajaya', state: 'W.P. Putrajaya', stateMs: 'W.P. Putrajaya', lat: 2.9264, lon: 101.6964, tile: [2, 5] },
  { id: 'shah-alam', name: 'Shah Alam', state: 'Selangor', stateMs: 'Selangor', lat: 3.0733, lon: 101.5185, tile: [1, 4] },
  { id: 'seremban', name: 'Seremban', state: 'Negeri Sembilan', stateMs: 'Negeri Sembilan', lat: 2.7258, lon: 101.9424, tile: [3, 5] },
  { id: 'melaka', name: 'Melaka', state: 'Melaka', stateMs: 'Melaka', lat: 2.1896, lon: 102.2501, tile: [3, 6] },
  { id: 'johor-bahru', name: 'Johor Bahru', state: 'Johor', stateMs: 'Johor', lat: 1.4927, lon: 103.7414, tile: [4, 7] },
  { id: 'kuantan', name: 'Kuantan', state: 'Pahang', stateMs: 'Pahang', lat: 3.8077, lon: 103.326, tile: [3, 4] },
  { id: 'kuala-terengganu', name: 'Kuala Terengganu', state: 'Terengganu', stateMs: 'Terengganu', lat: 5.3302, lon: 103.1408, tile: [3, 2] },
  { id: 'kota-bharu', name: 'Kota Bharu', state: 'Kelantan', stateMs: 'Kelantan', lat: 6.1254, lon: 102.2381, tile: [2, 1] },
  { id: 'ipoh', name: 'Ipoh', state: 'Perak', stateMs: 'Perak', lat: 4.5975, lon: 101.0901, tile: [1, 3] },
  { id: 'george-town', name: 'George Town', state: 'Penang', stateMs: 'Pulau Pinang', lat: 5.4141, lon: 100.3288, tile: [0, 2] },
  { id: 'alor-setar', name: 'Alor Setar', state: 'Kedah', stateMs: 'Kedah', lat: 6.1248, lon: 100.3678, tile: [1, 1] },
  { id: 'kangar', name: 'Kangar', state: 'Perlis', stateMs: 'Perlis', lat: 6.4414, lon: 100.1986, tile: [1, 0] },
  { id: 'kuching', name: 'Kuching', state: 'Sarawak', stateMs: 'Sarawak', lat: 1.5533, lon: 110.3592, tile: [6, 6] },
  { id: 'labuan', name: 'Labuan', state: 'W.P. Labuan', stateMs: 'W.P. Labuan', lat: 5.2831, lon: 115.2308, tile: [7, 2] },
  { id: 'kota-kinabalu', name: 'Kota Kinabalu', state: 'Sabah', stateMs: 'Sabah', lat: 5.9804, lon: 116.0735, tile: [8, 1] },
]);

export const HOME_ID = 'kuala-lumpur';

// What is asked of Open-Meteo. Two requests per update: one forecast, one air quality,
// each carrying all 16 locations (the APIs accept comma-separated coordinates).
export const FORECAST_VARS = Object.freeze({
  current: ['temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'precipitation', 'weather_code', 'wind_speed_10m', 'is_day'],
  hourly: ['temperature_2m', 'apparent_temperature', 'precipitation_probability', 'precipitation', 'weather_code'],
  daily: ['weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_probability_max', 'precipitation_sum', 'uv_index_max'],
});
export const AIR_VARS = Object.freeze({
  current: ['us_aqi', 'european_aqi', 'pm2_5', 'pm10', 'ozone', 'nitrogen_dioxide'],
  hourly: ['us_aqi', 'european_aqi', 'pm2_5', 'pm10', 'ozone', 'nitrogen_dioxide'],
});
export const FORECAST_DAYS = 7;
export const AIR_FORECAST_DAYS = 3;
// Past days asked for on every update, so a missed run (or two) still completes the history.
export const PAST_DAYS = 3;
// The one-off backfill ("airwatch update --backfill 30") asks for this many past days at most.
export const MAX_BACKFILL_DAYS = 92;

export const HOSTS = Object.freeze({
  forecast: 'api.open-meteo.com',
  air: 'air-quality-api.open-meteo.com',
});

export const BUDGET = Object.freeze({
  maxRequests: 6,
  maxBytes: 12 * 1024 * 1024,
  maxResponseBytes: 4 * 1024 * 1024,
  requestTimeoutMs: 30_000,
  wallClockMs: 3 * 60_000,
  maxRetries: 1,
  maxRetryAfterMs: 20_000,
});

// Open-Meteo publishes 600 calls a minute for the free API; one second apart is plenty polite.
export const HOST_INTERVAL_MS = Object.freeze({ [HOSTS.forecast]: 1_000, [HOSTS.air]: 1_000 });
export const CACHE_TTL_MS = 50 * 60 * 1000;

// Open-Meteo's free, non-commercial tier: fewer than 10,000 calls a day, 5,000 an hour,
// 600 a minute (https://open-meteo.com/en/terms). The update refuses to start a run whose
// worst-case cost, at the configured schedule, could pass this share of the daily limit.
export const OPEN_METEO_DAILY_LIMIT = 10_000;
export const RUNS_PER_DAY = 8; // every 3 hours, see .github/workflows/update.yml

// US EPA AQI categories (the index Open-Meteo computes; PM uses 24-hour rolling means).
export const AQI_BANDS = Object.freeze([
  { id: 'good', max: 50, label: 'Good', labelMs: 'Baik' },
  { id: 'moderate', max: 100, label: 'Moderate', labelMs: 'Sederhana' },
  { id: 'sensitive', max: 150, label: 'Unhealthy for sensitive groups', labelMs: 'Tidak sihat bagi kumpulan sensitif' },
  { id: 'unhealthy', max: 200, label: 'Unhealthy', labelMs: 'Tidak sihat' },
  { id: 'very-unhealthy', max: 300, label: 'Very unhealthy', labelMs: 'Sangat tidak sihat' },
  { id: 'hazardous', max: 500, label: 'Hazardous', labelMs: 'Berbahaya' },
]);

// The haze banner: a "notice" at US AQI 101+, an "alert" at 151+ (also written to the feeds).
export const NOTICE_AQI = 101;
export const ALERT_AQI = 151;
export const MAX_ALERTS_KEPT = 300;
export const FEED_ENTRIES = 40;

// WHO 2021 Air Quality Guidelines, 24-hour means (µg/m³). Interim targets IT-1..IT-4.
export const WHO_PM25_24H = Object.freeze({ guideline: 15, it4: 25, it3: 37.5, it2: 50, it1: 75 });
export const WHO_PM10_24H = Object.freeze({ guideline: 45, it4: 50, it3: 75, it2: 100, it1: 150 });

// After this long without a successful update the page says the numbers are stale.
export const STALE_AFTER_HOURS = 7;
