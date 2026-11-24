// The states table, the history page and the alert log.
import { html, fmt, localHref } from '../html.mjs';
import { band, mean } from '../aqi.mjs';
import { describeWeather, MONTHS, MONTHS_LONG, formatLocal } from '../weather.mjs';
import { HOME_ID, LOCATIONS } from '../config.mjs';
import { chart, dataTable, heatStrip, aqiBands } from './charts.mjs';
import { tileMap, ms, aqiChip } from './components.mjs';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const dm = (d) => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`;

export function renderStates(snapshot, { base }) {
  const sorted = [...snapshot.locations].sort((a, b) => (b.now.aqi ?? -1) - (a.now.aqi ?? -1));
  return html`<header class="page-head">
  <p class="eyebrow">All 16 places ${ms('Semua 16 lokasi')}</p>
  <h1>States and territories ${ms('Negeri dan wilayah')}</h1>
  <p class="lede">Kuala Lumpur, the 13 state capitals, Putrajaya and Labuan, worst air first. Each name opens that place's 48-hour and 7-day forecast.</p>
</header>
<section class="block" aria-labelledby="tiles-h">
  <h2 id="tiles-h" class="sr">Tile map</h2>
  ${tileMap(snapshot.locations, base, { headingId: 'tiles-h' })}
</section>
<section class="block" aria-labelledby="table-h">
  <h2 id="table-h">Now, by air quality ${ms('Kini, mengikut kualiti udara')}</h2>
  <div class="table-scroll"><table class="states-table">
    <caption>Current conditions, model hour ${formatLocal(snapshot.locations[0].now.airT)} Malaysia time</caption>
    <thead><tr><th scope="col">Place</th><th scope="col">State</th><th scope="col">US AQI</th><th scope="col">PM2.5 µg/m³</th><th scope="col">Temp °C</th><th scope="col">Feels °C</th><th scope="col">Rain today %</th><th scope="col">Weather</th></tr></thead>
    <tbody>${sorted.map((l) => html`<tr>
      <th scope="row"><a href="${localHref(`${base}states/${l.id}/index.html`)}">${l.name}</a></th>
      <td>${l.state}</td><td>${aqiChip(l.now.aqi, { small: true })}</td><td>${fmt(l.now.pm25, 1)}</td><td>${fmt(l.now.temp, 1)}</td><td>${fmt(l.now.feels, 1)}</td><td>${fmt(l.days[0]?.pop)}</td><td>${describeWeather(l.now.code).en}</td>
    </tr>`)}</tbody>
  </table></div>
</section>`;
}

export function monthly(history, id) {
  const months = {};
  for (const day of history) {
    const s = day.locations[id];
    if (!s) continue;
    (months[day.date.slice(0, 7)] ??= []).push(s);
  }
  return Object.keys(months).sort().map((m) => {
    const list = months[m];
    return {
      month: m,
      days: list.length,
      aqiMean: mean(list.map((s) => s.aqiMean)),
      pm25: mean(list.map((s) => s.pm25)),
      tMax: mean(list.map((s) => s.tMax)),
      rain: list.reduce((t, s) => t + (s.rain ?? 0), 0),
      unhealthyDays: list.filter((s) => s.aqiMax > 150).length,
    };
  });
}

function historyCharts(days) {
  const kl = days.map((d) => d.locations[HOME_ID] ?? {});
  const labels = days.map((d) => dm(d.date));
  const aqi = kl.map((s) => s.aqiMax ?? null);
  const pm = kl.map((s) => s.pm25 ?? null);
  const aMax = Math.max(160, ...aqi.filter(finite).map((v) => v + 15));
  const range = `${dm(days[0].date)} to ${dm(days.at(-1).date)}`;
  const worst = days.reduce((w, d, i) => (finite(aqi[i]) && (!w || aqi[i] > w.v) ? { v: aqi[i], d: d.date } : w), null);
  const air = chart({
    id: 'h-air',
    title: html`Kuala Lumpur: daily peak US AQI and mean PM2.5 ${ms('AQI harian')}`,
    desc: `Daily peak US AQI (bars, coloured by category) and daily mean PM2.5 (line) for Kuala Lumpur, ${range}.${worst ? ` Worst day ${worst.d} at ${worst.v}.` : ''}`,
    labels,
    tickEvery: 5,
    bands: aqiBands(aMax),
    left: { min: 0, max: aMax, unit: 'AQI' },
    right: { min: 0, max: Math.max(40, ...pm.filter(finite)), unit: 'µg/m³' },
    series: [
      { type: 'bar', label: 'Peak US AQI', values: aqi, cls: 's-aqibar', barClass: (v) => `aqi-${band(v).id}` },
      { type: 'line', label: 'Mean PM2.5', values: pm, cls: 's-pm', axis: 'right', unit: ' µg/m³' },
    ],
  });
  const tx = kl.map((s) => s.tMax ?? null);
  const tn = kl.map((s) => s.tMin ?? null);
  const rain = kl.map((s) => s.rain ?? null);
  const temps = [...tx, ...tn].filter(finite);
  const weather = chart({
    id: 'h-wx',
    title: html`Kuala Lumpur: temperature range and rain ${ms('Suhu dan hujan harian')}`,
    desc: `Daily highest and lowest temperature (lines) and rainfall (bars) for Kuala Lumpur, ${range}. Total rain ${fmt(rain.filter(finite).reduce((a, b) => a + b, 0), 0)} mm.`,
    labels,
    tickEvery: 5,
    left: { min: Math.floor((temps.length ? Math.min(...temps) : 22) - 1), max: Math.ceil((temps.length ? Math.max(...temps) : 34) + 1), unit: '°C' },
    right: { min: 0, max: Math.max(20, ...rain.filter(finite)), unit: 'mm' },
    series: [
      { type: 'bar', label: 'Rain', values: rain, cls: 's-rain', axis: 'right', unit: ' mm' },
      { type: 'line', label: 'High', values: tx, cls: 's-temp', unit: '°' },
      { type: 'line', label: 'Low', values: tn, cls: 's-low', unit: '°' },
    ],
  });
  const table = dataTable({
    caption: `Kuala Lumpur, daily summaries, ${range}`,
    headers: ['Date', 'Peak US AQI', 'Mean US AQI', 'Mean PM2.5', 'Mean PM10', 'High °C', 'Low °C', 'Rain mm'],
    rows: days.map((d, i) => [d.date, fmt(aqi[i]), fmt(kl[i].aqiMean), fmt(pm[i], 1), fmt(kl[i].pm10, 1), fmt(tx[i], 1), fmt(tn[i], 1), fmt(rain[i], 1)]),
  });
  return html`<div class="charts">${air}${weather}</div>${table}`;
}

export function renderHistory(history, { base }) {
  if (!history.length) {
    return html`<header class="page-head"><h1>History ${ms('Sejarah')}</h1><p class="lede">No complete days recorded yet. The first one appears after the next update.</p></header>`;
  }
  const last30 = history.slice(-30);
  const strip = heatStrip({
    id: 'h-heat',
    title: html`Every place, daily peak US AQI ${ms('Setiap lokasi')}`,
    desc: `A grid of ${LOCATIONS.length} places by ${last30.length} days, ${last30[0].date} to ${last30.at(-1).date}, each cell coloured by that day's peak US AQI category.`,
    dates: last30.map((d) => d.date),
    rows: LOCATIONS.map((l) => ({ label: l.name, values: last30.map((d) => d.locations[l.id]?.aqiMax ?? null) })),
    dateLabel: dm,
  });
  const stripTable = dataTable({
    caption: 'Days with a peak US AQI above 100 and above 150, per place, in this period',
    headers: ['Place', 'Days recorded', 'Peak > 100', 'Peak > 150', 'Highest peak'],
    rows: LOCATIONS.map((l) => {
      const v = last30.map((d) => d.locations[l.id]?.aqiMax).filter(finite);
      return [l.name, String(v.length), String(v.filter((x) => x > 100).length), String(v.filter((x) => x > 150).length), fmt(v.length ? Math.max(...v) : null)];
    }),
  });
  const months = monthly(history, HOME_ID);
  const seasonal = months.length >= 2
    ? chart({
        id: 'h-season',
        title: html`Kuala Lumpur by month: mean PM2.5 ${ms('Purata bulanan')}`,
        desc: `Monthly mean of the daily mean PM2.5 in Kuala Lumpur for ${months.length} months, ${months[0].month} to ${months.at(-1).month}.`,
        labels: months.map((m) => `${MONTHS[Number(m.month.slice(5)) - 1]} ${m.month.slice(2, 4)}`),
        tickEvery: 1,
        left: { min: 0, max: Math.max(20, ...months.map((m) => m.pm25).filter(finite)), unit: 'µg/m³' },
        series: [{ type: 'bar', label: 'Mean PM2.5', values: months.map((m) => (finite(m.pm25) ? Math.round(m.pm25 * 10) / 10 : null)), cls: 's-pmbar', unit: ' µg/m³' }],
      })
    : html`<p class="lede">The seasonal view fills in as months pass: it needs at least two months of daily summaries, and has ${months.length}.</p>`;
  const monthTable = dataTable({
    caption: 'Kuala Lumpur, monthly summaries',
    headers: ['Month', 'Days', 'Mean US AQI', 'Mean PM2.5', 'Mean high °C', 'Rain mm', 'Days peak > 150'],
    rows: months.map((m) => [`${MONTHS_LONG[Number(m.month.slice(5)) - 1]} ${m.month.slice(0, 4)}`, String(m.days), fmt(m.aqiMean), fmt(m.pm25, 1), fmt(m.tMax, 1), fmt(m.rain, 0), String(m.unhealthyDays)]),
  });
  return html`<header class="page-head">
  <p class="eyebrow">${history.length} days recorded · ${history[0].date} to ${history.at(-1).date}</p>
  <h1>History ${ms('Sejarah')}</h1>
  <p class="lede">One compact summary per place per day, committed to the repository after each day ends. The last 30 days are drawn here; the record grows by a day at a time, so the seasonal view gets better every month.</p>
</header>
<section class="block" aria-labelledby="h30">
  <header class="block-head"><h2 id="h30">Kuala Lumpur, last ${last30.length} days ${ms(`${last30.length} hari lepas`)}</h2></header>
  ${historyCharts(last30)}
</section>
<section class="block" aria-labelledby="hgrid">
  <header class="block-head"><h2 id="hgrid">Across Malaysia ${ms('Seluruh Malaysia')}</h2></header>
  ${strip}${stripTable}
</section>
<section class="block" aria-labelledby="hseason">
  <header class="block-head"><h2 id="hseason">By month ${ms('Mengikut bulan')}</h2></header>
  <div class="season">
  ${seasonal}
  <p class="lede">Haze in Malaysia is usually worst in the dry southwest monsoon, roughly June to September, when smoke from land and forest fires in the region drifts in. Months recorded here show whether this year follows that pattern.</p>
  </div>
  ${monthTable}
  <p class="fine">Data files: <a href="${localHref(`${base}history.json`)}">history.json</a> (all days).</p>
</section>`;
}

export function renderAlerts(alerts, { base }) {
  const list = [...alerts].reverse();
  return html`<header class="page-head">
  <p class="eyebrow">Haze alert log ${ms('Log amaran jerebu')}</p>
  <h1>Alerts ${ms('Amaran')}</h1>
  <p class="lede">An entry is written when a place's US AQI reaches 151 (unhealthy) or more, at most once per place, day and category, and when Kuala Lumpur is forecast to reach it within 24 hours. Subscribe with <a href="${localHref(`${base}alerts.xml`)}">RSS</a> or <a href="${localHref(`${base}alerts.json`)}">JSON Feed</a>.</p>
</header>
<section class="block" aria-labelledby="alog">
  <h2 id="alog">${list.length ? `${list.length} recorded` : 'Nothing recorded yet'}</h2>
  ${list.length ? html`<ol class="alert-log">${list.map((a) => html`<li class="alert-item aqi-${a.band}" id="${a.id}">
      <p class="al-when">${formatLocal(a.observedAt)} <span class="ms">MYT</span></p>
      <p class="al-what"><b>${a.name}</b>, ${a.state}: ${a.kind === 'forecast' ? 'forecast to reach' : 'US AQI'} ${aqiChip(a.aqi, { small: true })}${a.pm25 !== null ? html` · PM2.5 ${fmt(a.pm25, 1)} µg/m³` : ''}</p>
    </li>`)}</ol>` : html`<p class="lede">No place has reached US AQI 151 since the log started. That is good news.</p>`}
</section>`;
}
