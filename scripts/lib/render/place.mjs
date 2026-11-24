// The page for one place: KL is the home page; every state capital gets the same page.
import { html, fmt } from '../html.mjs';
import { band } from '../aqi.mjs';
import { describeWeather, hourLabel, formatDate, formatLocal } from '../weather.mjs';
import { chart, dataTable, aqiBands } from './charts.mjs';
import { hero, dayStrip, tileMap, ms } from './components.mjs';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const isNight = (t) => {
  const h = Number(t.slice(11, 13));
  return h < 7 || h >= 19;
};

export function hourlyCharts(loc) {
  const rows = loc.next48;
  if (!rows.length) return html`<p class="empty">No hourly forecast in this update.</p>`;
  const labels = rows.map((r) => hourLabel(r.t));
  const shade = rows.map((r) => isNight(r.t));
  const temps = rows.flatMap((r) => [r.temp, r.feels]).filter(finite);
  const aqis = rows.map((r) => r.aqi).filter(finite);
  const first = formatLocal(rows[0].t);
  const last = formatLocal(rows.at(-1).t);
  const tMin = temps.length ? Math.min(...temps) : 20;
  const tMax = temps.length ? Math.max(...temps) : 35;
  const aMax = aqis.length ? Math.max(...aqis) : 0;
  const peak = rows.reduce((p, r) => (finite(r.aqi) && (!p || r.aqi > p.aqi) ? r : p), null);
  const id = `c-${loc.id}`;
  const weather = chart({
    id: `${id}-wx`,
    title: html`Temperature and rain ${ms('Suhu dan hujan')}`,
    desc: `Hourly forecast for ${loc.name} from ${first} to ${last}, Malaysia time. Temperature from ${fmt(Math.min(...rows.map((r) => r.temp).filter(finite)))} to ${fmt(Math.max(...rows.map((r) => r.temp).filter(finite)))} °C; highest chance of rain ${fmt(Math.max(0, ...rows.map((r) => r.pop).filter(finite)))}%. Night hours are shaded.`,
    labels,
    shade,
    marker: 0,
    left: { min: Math.floor(tMin - 1), max: Math.ceil(tMax + 1), unit: '°C' },
    right: { min: 0, max: 100, unit: '%' },
    series: [
      { type: 'bar', label: 'Chance of rain', values: rows.map((r) => r.pop), cls: 's-rain', axis: 'right', unit: '%' },
      { type: 'line', label: 'Temperature', values: rows.map((r) => r.temp), cls: 's-temp', unit: '°' },
      { type: 'line', label: 'Feels like', values: rows.map((r) => r.feels), cls: 's-feels', unit: '°' },
    ],
  });
  const air = chart({
    id: `${id}-air`,
    title: html`Air quality, US AQI ${ms('Kualiti udara')}`,
    desc: aqis.length
      ? `Hourly US AQI forecast for ${loc.name} from ${first} to ${last}. Highest ${fmt(peak.aqi)} (${band(peak.aqi).label}) at ${formatLocal(peak.t)}. Coloured bands mark the US EPA categories.`
      : `No air quality forecast for ${loc.name} in this update.`,
    labels,
    shade,
    marker: 0,
    bands: aqiBands(Math.max(160, aMax + 20)),
    left: { min: 0, max: Math.max(150, aMax + 15), unit: 'AQI' },
    series: [{ type: 'line', label: 'US AQI', values: rows.map((r) => r.aqi), cls: 's-aqi' }],
  });
  const table = dataTable({
    caption: `${loc.name}: hourly forecast, Malaysia time`,
    headers: ['Time', 'Weather', 'Temp °C', 'Feels °C', 'Rain chance %', 'Rain mm', 'US AQI', 'PM2.5 µg/m³'],
    rows: rows.map((r) => [formatLocal(r.t), describeWeather(r.code).en, fmt(r.temp, 1), fmt(r.feels, 1), fmt(r.pop), fmt(r.rain, 1), fmt(r.aqi), fmt(r.pm25, 1)]),
  });
  return html`<div class="charts">${weather}${air}</div>${table}`;
}

export function renderPlace(snapshot, loc, { base, isHome = false }) {
  const others = snapshot.locations;
  const eyebrow = html`${isHome ? 'Today' : 'Now'} · ${formatDate(loc.today)} · ${ms(isHome ? 'Hari ini' : 'Kini')}`;
  return html`${hero(loc, { headingLevel: 1, eyebrow })}
<section class="block block-hours" aria-labelledby="${loc.id}-hours">
  <header class="block-head"><h2 id="${loc.id}-hours">The next 48 hours ${ms('48 jam akan datang')}</h2></header>
  ${hourlyCharts(loc)}
</section>
<section class="block block-days" aria-labelledby="${loc.id}-days">
  <header class="block-head"><h2 id="${loc.id}-days">Next 7 days ${ms('7 hari akan datang')}</h2></header>
  ${dayStrip(loc.days, loc.id)}
  <p class="fine">Air quality forecasts reach ${loc.days.filter((d) => d.aqiMax !== null).length} days ahead; the weather forecast reaches seven.</p>
</section>
<section class="block block-map" aria-labelledby="map-head">
  <header class="block-head"><h2 id="map-head">${isHome ? 'Across Malaysia' : 'Elsewhere in Malaysia'} ${ms('Seluruh Malaysia')}</h2></header>
  <div class="map-wrap">
  <div class="map-key">
  <p class="lede">US AQI right now in Kuala Lumpur, every state capital, Putrajaya and Labuan. Each tile sits roughly where its place is: the peninsula on the left, Sarawak, Labuan and Sabah across the sea on the right.</p>
  <ul class="map-legend" aria-label="US AQI colours">${['good', 'moderate', 'sensitive', 'unhealthy', 'very-unhealthy', 'hazardous'].map((id) => html`<li class="aqi-${id}"><span class="swatch" aria-hidden="true"></span>${band({ good: 0, moderate: 51, sensitive: 101, unhealthy: 151, 'very-unhealthy': 201, hazardous: 301 }[id]).label}</li>`)}</ul>
  </div>
  ${tileMap(others, base, { headingId: 'map-head' })}
  </div>
</section>`;
}
