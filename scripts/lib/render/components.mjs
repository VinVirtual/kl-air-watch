// Shared pieces: weather icons, the AQI gauge, the haze banner, the 7-day strip, the tile map.
import { html, raw, fmt, localHref } from '../html.mjs';
import { band, advice, whoPm25 } from '../aqi.mjs';
import { describeWeather, heatNote, formatDate, weekdayOf, WEEKDAYS, WEEKDAYS_MS } from '../weather.mjs';
import { LOCATIONS } from '../config.mjs';

const CLOUD = 'M7.5 19h9.6a4.2 4.2 0 0 0 .3-8.4 5.6 5.6 0 0 0-10.8 1.7A3.4 3.4 0 0 0 7.5 19z';
const ICONS = {
  sun: '<circle cx="12" cy="12" r="4.2" class="i-sun"/><path class="i-ray" d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  part: `<circle cx="8.5" cy="8.5" r="3.4" class="i-sun"/><path class="i-ray" d="M8.5 2v1.8M2 8.5h1.8M3.9 3.9l1.3 1.3M13.1 3.9l-1.3 1.3"/><path class="i-cloud" d="${CLOUD}"/>`,
  cloud: `<path class="i-cloud" d="${CLOUD}"/>`,
  fog: '<path class="i-line" d="M3.5 9h17M5.5 13h13M3.5 17h17"/>',
  drizzle: `<path class="i-cloud" d="${CLOUD}" transform="translate(0 -3)"/><path class="i-drop" d="M8 19.5v.1M12 20.5v.1M16 19.5v.1"/>`,
  rain: `<path class="i-cloud" d="${CLOUD}" transform="translate(0 -3)"/><path class="i-drop" d="M8.5 18.5l-1 3M12.5 18.5l-1 3M16.5 18.5l-1 3"/>`,
  storm: `<path class="i-cloud" d="${CLOUD}" transform="translate(0 -3)"/><path class="i-bolt" d="M12.8 15.5l-2.6 3.6h3l-2.2 3.4"/>`,
};

export function icon(code, cls = '') {
  const w = describeWeather(code);
  return html`<svg class="wx ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${raw(ICONS[w.icon] ?? ICONS.cloud)}</svg>`;
}

export function ms(text) {
  return html`<span class="ms" lang="ms">${text}</span>`;
}

export function aqiChip(aqi, { small = false } = {}) {
  const b = band(aqi);
  return html`<span class="chip aqi-${b.id}${small ? ' chip-s' : ''}"><b>${fmt(aqi)}</b> <span class="chip-label">${b.label}</span></span>`;
}

// Half-circle gauge from 0 to 300+. The needle angle is an SVG transform attribute (no styles).
export function gauge(aqi) {
  const b = band(aqi);
  const cap = 300;
  const v = typeof aqi === 'number' ? Math.max(0, Math.min(cap, aqi)) : 0;
  const cx = 120;
  const cy = 118;
  const r = 96;
  const pt = (val, rad = r) => {
    const a = Math.PI * (1 - val / cap);
    return [cx + rad * Math.cos(a), cy - rad * Math.sin(a)];
  };
  const seg = (lo, hi, cls) => {
    const [x0, y0] = pt(lo);
    const [x1, y1] = pt(hi);
    return `<path class="g-seg aqi-${cls}" d="M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}"/>`;
  };
  const segs = [[0, 50, 'good'], [50, 100, 'moderate'], [100, 150, 'sensitive'], [150, 200, 'unhealthy'], [200, 300, 'very-unhealthy']].map(([lo, hi, c]) => seg(lo + 1.2, hi - 1.2, c)).join('');
  const angle = (v / cap) * 180 - 90;
  const ticks = [0, 50, 100, 150, 200, 300].map((t) => {
    const [x, y] = pt(t, r + 16);
    return `<text class="g-tick" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle">${t}</text>`;
  }).join('');
  return html`<svg class="gauge" viewBox="0 0 240 138" role="img" aria-label="${`US AQI ${fmt(aqi)}: ${b.label}`}" focusable="false">${raw(segs)}${raw(ticks)}${
    typeof aqi === 'number' ? raw(`<g class="g-needle aqi-${b.id}" transform="rotate(${angle.toFixed(1)} ${cx} ${cy})"><path d="M${cx - 4} ${cy} L${cx} ${cy - r + 14} L${cx + 4} ${cy} Z"/><circle cx="${cx}" cy="${cy}" r="7"/></g>`) : ''
  }</svg>`;
}

export function hazeBanner(bn, base) {
  if (!bn?.level) return '';
  const top = bn.affected.slice(0, 4);
  const more = bn.affected.length - top.length;
  const places = top.map((a) => `${a.name} ${a.aqi}`).join(', ');
  const isAlert = bn.level === 'alert';
  return html`<aside class="haze-banner level-${bn.level}" aria-label="Haze ${isAlert ? 'alert' : 'notice'}">
  <p class="hb-kicker">${isAlert ? 'Haze alert' : 'Air quality notice'} <span class="ms" lang="ms">${isAlert ? 'Amaran jerebu' : 'Notis kualiti udara'}</span></p>
  <p class="hb-text">${
    bn.affected.length
      ? html`US AQI above ${isAlert && bn.affected.some((a) => a.level === 'alert') ? '150 (unhealthy)' : '100 (unhealthy for sensitive groups)'} in ${bn.affected.length} of ${LOCATIONS.length} places: ${places}${more > 0 ? ` and ${more} more` : ''}.`
      : ''
  }${bn.forecast ? html` Kuala Lumpur is forecast to reach US AQI ${bn.forecast.aqi} (${bn.forecast.band.label.toLowerCase()}) within 24 hours.` : ''} <a href="${localHref(`${base}method/index.html#thresholds`)}">What this means</a></p>
</aside>`;
}

// The big "now" block for one place.
export function hero(loc, { headingLevel = 1, eyebrow }) {
  const n = loc.now;
  const w = describeWeather(n.code);
  const b = band(n.aqi);
  const adv = advice(n.aqi);
  const heat = heatNote(n.feels);
  const who = whoPm25(loc.pm25Mean24);
  const today = loc.days[0];
  const H = headingLevel === 1 ? 'h1' : 'h2';
  const heading = raw(`<${H} class="hero-place" id="place-${loc.id}">${html`${loc.name}`}</${H}>`);
  return html`<section class="hero" aria-labelledby="place-${loc.id}">
  <div class="hero-weather">
    <p class="eyebrow">${eyebrow}</p>
    ${heading}
    <p class="hero-state">${loc.state}${loc.state !== loc.stateMs ? html` ${ms(`(${loc.stateMs})`)}` : ''}</p>
    <div class="temp-row">
      <p class="temp"><span class="sr">Temperature </span>${fmt(n.temp)}<span class="deg">°C</span></p>
      ${icon(n.code, 'wx-hero')}
    </div>
    <p class="condition">${w.en} ${ms(w.ms)}</p>
    <p class="air-peek"><a href="#air-${loc.id}">Air now ${aqiChip(n.aqi)}</a></p>
    <dl class="facts">
      <div><dt>Feels like <span class="ms" lang="ms">Terasa seperti</span></dt><dd>${fmt(n.feels)}°</dd></div>
      <div><dt>Rain chance today <span class="ms" lang="ms">Peluang hujan</span></dt><dd>${fmt(today?.pop)}%</dd></div>
      <div><dt>Humidity <span class="ms" lang="ms">Kelembapan</span></dt><dd>${fmt(n.humidity)}%</dd></div>
      <div><dt>Wind <span class="ms" lang="ms">Angin</span></dt><dd>${fmt(n.wind)} km/h</dd></div>
    </dl>
    ${heat ? html`<p class="note">${heat.en} ${ms(heat.ms)}</p>` : ''}
  </div>
  <div class="hero-air aqi-${b.id}" id="air-${loc.id}">
    <p class="eyebrow">Air quality · haze <span class="ms" lang="ms">Kualiti udara · jerebu</span></p>
    ${gauge(n.aqi)}
    <p class="aqi-number"><span class="aqi-value">${fmt(n.aqi)}</span><span class="aqi-unit">US AQI</span></p>
    <p class="aqi-band">${b.label} ${ms(b.labelMs)}</p>
    <p class="advice">${adv.en}</p>
    <p class="advice advice-ms" lang="ms">${adv.ms}</p>
    <dl class="pollutants">
      <div><dt>PM2.5</dt><dd>${fmt(n.pm25, 1)} <small>µg/m³</small></dd></div>
      <div><dt>PM10</dt><dd>${fmt(n.pm10, 1)} <small>µg/m³</small></dd></div>
      <div><dt>O₃</dt><dd>${fmt(n.o3)} <small>µg/m³</small></dd></div>
      <div><dt>NO₂</dt><dd>${fmt(n.no2, 1)} <small>µg/m³</small></dd></div>
    </dl>
    ${who ? html`<p class="who">PM2.5 over the past 24 hours averaged <b>${fmt(who.mean, 1)} µg/m³</b>: ${who.within ? 'within the WHO 24-hour guideline of 15' : html`<b>${fmt(who.ratio, 1)}×</b> the WHO 24-hour guideline of 15 (${who.step})`}.</p>` : ''}
    <p class="model-time">Air: model hour ${n.airT.slice(11)} · weather: ${n.t.slice(11)}, ${formatDate(n.t.slice(0, 10))} (Malaysia time)</p>
  </div>
</section>`;
}

export function dayStrip(days, idPrefix) {
  return html`<ol class="days" aria-labelledby="${idPrefix}-days">
  ${days.map((d, i) => {
    const w = describeWeather(d.code);
    const wd = weekdayOf(d.date);
    return html`<li class="day${i === 0 ? ' day-today' : ''}">
      <p class="day-name">${i === 0 ? 'Today' : WEEKDAYS[wd]} <span class="ms" lang="ms">${i === 0 ? 'Hari ini' : WEEKDAYS_MS[wd]}</span></p>
      <p class="day-date">${d.date.slice(8)}/${d.date.slice(5, 7)}</p>
      ${icon(d.code, 'wx-day')}
      <p class="day-cond">${w.en}</p>
      <p class="day-temps"><span class="hi"><span class="sr">High </span>${fmt(d.tMax)}°</span> <span class="lo"><span class="sr">low </span>${fmt(d.tMin)}°</span></p>
      <p class="day-rain">${fmt(d.pop)}% <span class="sr">chance of rain,</span> ${fmt(d.rain, 1)} mm</p>
      ${d.aqiMax !== null ? html`<p class="day-aqi">${aqiChip(d.aqiMax, { small: true })}<span class="sr"> peak US AQI</span></p>` : html`<p class="day-aqi day-aqi-none">AQI forecast not available</p>`}
    </li>`;
  })}
</ol>`;
}

// A rough cartogram of the 16 places: Peninsular Malaysia on the left, Borneo on the right.
export function tileMap(locations, base, { headingId }) {
  return html`<ol class="tiles" aria-labelledby="${headingId}">
  ${locations.map((l) => {
    const b = band(l.now.aqi);
    return html`<li class="tile c${l.tile[0]} r${l.tile[1]} aqi-${b.id}">
      <a href="${localHref(`${base}states/${l.id}/index.html`)}">
        <span class="tile-aqi">${fmt(l.now.aqi)}</span>
        <span class="tile-name">${l.name}</span>
        <span class="tile-meta">${l.state === l.name ? '' : `${l.state} · `}${fmt(l.now.temp)}°C · ${b.label}</span>
      </a>
    </li>`;
  })}
</ol>`;
}
