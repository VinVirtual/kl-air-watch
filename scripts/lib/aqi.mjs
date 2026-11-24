// Air quality categories, plain-language advice (English and Malay) and WHO comparisons.
import { AQI_BANDS, NOTICE_AQI, ALERT_AQI, WHO_PM25_24H } from './config.mjs';

const ADVICE = Object.freeze({
  good: {
    en: 'The air is clean. A good day to be outside.',
    ms: 'Udara bersih. Hari yang baik untuk aktiviti luar.',
  },
  moderate: {
    en: 'Fine for most people. If you are unusually sensitive to air pollution, take long or heavy outdoor exercise a little easier.',
    ms: 'Baik untuk kebanyakan orang. Jika anda sangat sensitif terhadap pencemaran udara, kurangkan sedikit senaman luar yang lama atau berat.',
  },
  sensitive: {
    en: 'Children, older people and anyone with asthma, heart or lung conditions should cut down long or heavy outdoor exertion. Everyone else can carry on.',
    ms: 'Kanak-kanak, warga emas dan sesiapa yang menghidap asma, penyakit jantung atau paru-paru patut mengurangkan aktiviti luar yang lama atau berat. Orang lain boleh meneruskan aktiviti.',
  },
  unhealthy: {
    en: 'Everyone should cut down heavy outdoor exertion. Sensitive groups should avoid it. Keep windows closed when the haze is thick.',
    ms: 'Semua orang patut mengurangkan aktiviti luar yang berat. Kumpulan sensitif patut mengelakkannya. Tutup tingkap apabila jerebu tebal.',
  },
  'very-unhealthy': {
    en: 'Avoid outdoor exertion. Stay indoors with windows closed; outside, a well-fitted N95 mask helps.',
    ms: 'Elakkan aktiviti luar. Duduk di dalam rumah dengan tingkap ditutup; di luar, pelitup N95 yang dipakai dengan betul membantu.',
  },
  hazardous: {
    en: 'Stay indoors and keep activity low. Follow official advice from the Ministry of Health and the Department of Environment.',
    ms: 'Kekal di dalam rumah dan kurangkan aktiviti. Ikut nasihat rasmi Kementerian Kesihatan dan Jabatan Alam Sekitar.',
  },
});

const UNKNOWN = Object.freeze({ id: 'unknown', max: null, label: 'No reading', labelMs: 'Tiada bacaan', index: -1 });

// The US AQI category for a value (0-500+). Missing or bad values give "unknown".
export function band(aqi) {
  if (typeof aqi !== 'number' || !Number.isFinite(aqi) || aqi < 0) return UNKNOWN;
  const v = Math.round(aqi);
  const i = AQI_BANDS.findIndex((b) => v <= b.max);
  const idx = i === -1 ? AQI_BANDS.length - 1 : i;
  return { ...AQI_BANDS[idx], index: idx };
}

export function advice(aqi) {
  const b = band(aqi);
  if (b.id === 'unknown') return { en: 'No air quality reading in this update.', ms: 'Tiada bacaan kualiti udara dalam kemas kini ini.' };
  return ADVICE[b.id];
}

// "notice" (101-150), "alert" (151+) or null.
export function hazeLevel(aqi) {
  if (typeof aqi !== 'number' || !Number.isFinite(aqi)) return null;
  if (aqi >= ALERT_AQI) return 'alert';
  if (aqi >= NOTICE_AQI) return 'notice';
  return null;
}

export function mean(values) {
  const v = values.filter((x) => typeof x === 'number' && Number.isFinite(x));
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

export function max(values) {
  const v = values.filter((x) => typeof x === 'number' && Number.isFinite(x));
  return v.length ? Math.max(...v) : null;
}

export function min(values) {
  const v = values.filter((x) => typeof x === 'number' && Number.isFinite(x));
  return v.length ? Math.min(...v) : null;
}

export function round(v, digits = 0) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

// How a 24-hour PM2.5 mean compares with the WHO 2021 guideline and its interim targets.
export function whoPm25(mean24) {
  if (typeof mean24 !== 'number' || !Number.isFinite(mean24)) return null;
  const g = WHO_PM25_24H;
  const ratio = mean24 / g.guideline;
  let step;
  if (mean24 <= g.guideline) step = 'within the WHO guideline';
  else if (mean24 <= g.it4) step = 'above the guideline, within interim target 4';
  else if (mean24 <= g.it3) step = 'within interim target 3';
  else if (mean24 <= g.it2) step = 'within interim target 2';
  else if (mean24 <= g.it1) step = 'within interim target 1';
  else step = 'above every WHO interim target';
  return { mean: round(mean24, 1), ratio: round(ratio, 1), within: mean24 <= g.guideline, step };
}
