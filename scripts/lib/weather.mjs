// WMO weather codes (as used by Open-Meteo) to words in English and Malay, and an icon name.

const GROUPS = [
  { codes: [0], en: 'Clear', ms: 'Cerah', icon: 'sun' },
  { codes: [1], en: 'Mainly clear', ms: 'Kebanyakannya cerah', icon: 'sun' },
  { codes: [2], en: 'Partly cloudy', ms: 'Berawan sebahagian', icon: 'part' },
  { codes: [3], en: 'Overcast', ms: 'Mendung', icon: 'cloud' },
  { codes: [45, 48], en: 'Fog', ms: 'Berkabus', icon: 'fog' },
  { codes: [51, 53, 55, 56, 57], en: 'Drizzle', ms: 'Gerimis', icon: 'drizzle' },
  { codes: [61], en: 'Light rain', ms: 'Hujan renyai', icon: 'rain' },
  { codes: [63, 66], en: 'Rain', ms: 'Hujan', icon: 'rain' },
  { codes: [65, 67], en: 'Heavy rain', ms: 'Hujan lebat', icon: 'rain' },
  { codes: [80, 81], en: 'Rain showers', ms: 'Hujan sekali-sekala', icon: 'rain' },
  { codes: [82], en: 'Violent showers', ms: 'Hujan sangat lebat', icon: 'rain' },
  { codes: [71, 73, 75, 77, 85, 86], en: 'Snow', ms: 'Salji', icon: 'cloud' },
  { codes: [95], en: 'Thunderstorms', ms: 'Ribut petir', icon: 'storm' },
  { codes: [96, 99], en: 'Thunderstorms with hail', ms: 'Ribut petir dengan hujan batu', icon: 'storm' },
];

const BY_CODE = new Map(GROUPS.flatMap((g) => g.codes.map((c) => [c, g])));

export function describeWeather(code) {
  const g = Number.isInteger(code) ? BY_CODE.get(code) : undefined;
  return g ? { en: g.en, ms: g.ms, icon: g.icon } : { en: 'Unknown', ms: 'Tidak diketahui', icon: 'cloud' };
}

// "Feels like" in words, for the hero card. Thresholds follow the common heat-index bands
// (°C): 27 caution, 32 extreme caution, 41 danger.
export function heatNote(feels) {
  if (typeof feels !== 'number' || !Number.isFinite(feels)) return null;
  if (feels >= 41) return { en: 'Dangerous heat. Avoid the midday sun and drink water often.', ms: 'Panas berbahaya. Elakkan matahari tengah hari dan kerap minum air.' };
  if (feels >= 32) return { en: 'Very hot and humid. Take breaks in the shade and drink water.', ms: 'Sangat panas dan lembap. Berehat di tempat teduh dan minum air.' };
  if (feels >= 27) return { en: 'Warm and humid.', ms: 'Panas dan lembap.' };
  return { en: 'Comfortable.', ms: 'Selesa.' };
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAYS_MS = ['Ahd', 'Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Local dates and times are kept as the API gives them ("2026-11-24", "2026-11-24T18:00"),
// already in Malaysia time. These helpers never involve the machine's own time zone.
export function weekdayOf(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function formatDate(date) {
  const [, m, d] = date.split('-').map(Number);
  return `${WEEKDAYS[weekdayOf(date)]} ${d} ${MONTHS[m - 1]}`;
}

export function formatLocal(t) {
  const [date, hm] = t.split('T');
  return `${formatDate(date)}, ${hm}`;
}

export function hourLabel(t) {
  const h = Number(t.slice(11, 13));
  if (h === 0) return '12am';
  if (h === 12) return '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

export function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// The Malaysia-time local date/time for a UTC instant.
export function localFromUtc(iso, offsetHours = 8) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) throw new Error('localFromUtc: bad date');
  return new Date(t + offsetHours * 3_600_000).toISOString().slice(0, 16);
}
