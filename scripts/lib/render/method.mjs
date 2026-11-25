// The Method page, generated from config.mjs so the numbers on it are the numbers in use.
import { html, fmt } from '../html.mjs';
import { AQI_BANDS, NOTICE_AQI, ALERT_AQI, WHO_PM25_24H, WHO_PM10_24H, LOCATIONS, RUNS_PER_DAY, OPEN_METEO_DAILY_LIMIT, PAST_DAYS, FORECAST_DAYS, AIR_FORECAST_DAYS, STALE_AFTER_HOURS } from '../config.mjs';
import { ms } from './components.mjs';

export const FREE_MINUTES = 2000;
export const DAYS_PER_MONTH = 30.4;

// GitHub bills each job in whole minutes, rounded up. One job per run.
export function minutesMath(runsPerDay = RUNS_PER_DAY, minutesPerRun = [2, 3]) {
  const runs = Math.round(runsPerDay * DAYS_PER_MONTH);
  return { runsPerDay, runs, low: runs * minutesPerRun[0], high: runs * minutesPerRun[1], free: FREE_MINUTES };
}

export function renderMethod(snapshot) {
  const m = minutesMath();
  const hourly = minutesMath(24);
  const cost = snapshot?.requests ?? {};
  const perRun = (cost.forecastCost ?? 0) + (cost.airCost ?? 0);
  const band = (b, i) => `${i === 0 ? 0 : AQI_BANDS[i - 1].max + 1}–${b.max}`;
  return html`<header class="page-head">
  <p class="eyebrow">How this works ${ms('Bagaimana ia berfungsi')}</p>
  <h1>Method ${ms('Kaedah')}</h1>
  <p class="lede">Where every number comes from, what the colours mean, when an alert fires, and what this site cannot tell you.</p>
</header>
<div class="method-grid">
<nav class="toc" aria-label="On this page">
  <p class="toc-head">On this page</p>
  <ol>
    <li><a href="#m-sources">Data sources</a></li>
    <li><a href="#thresholds">Colours, advice and alerts</a></li>
    <li><a href="#m-history">History</a></li>
    <li><a href="#m-schedule">Schedule and costs</a></li>
    <li><a href="#m-limits">Limits</a></li>
  </ol>
  <p class="toc-note">Official readings: <a href="https://apims.doe.gov.my/">APIMS</a>, Department of Environment.</p>
</nav>
<div class="method-body">
<section class="block prose" aria-labelledby="m-sources">
  <h2 id="m-sources">Data sources</h2>
  <p><b>Weather</b>: the <a href="https://open-meteo.com/en/docs">Open-Meteo Forecast API</a>, which blends national weather models and picks the best ones for each place. Current conditions, ${FORECAST_DAYS} days of daily forecast and hourly values, in Malaysia time.</p>
  <p><b>Air quality</b>: the <a href="https://open-meteo.com/en/docs/air-quality-api">Open-Meteo Air Quality API</a>, which serves the Copernicus Atmosphere Monitoring Service (CAMS) global forecast: a model on a grid of about 45 km, updated twice a day. We show ${AIR_FORECAST_DAYS} days of it. The US AQI and European AQI are computed by Open-Meteo; for PM2.5 and PM10 the US AQI uses a 24-hour rolling mean.</p>
  <p><b>Attribution.</b> <a href="https://open-meteo.com/">Weather data by Open-Meteo.com</a>, under <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. Contains modified Copernicus Atmosphere Monitoring Service information. We round values, compute daily summaries, and pick the category and advice text; those are our changes.</p>
  <p><b>Places</b>: ${LOCATIONS.length} points, one per city: ${LOCATIONS.map((l) => l.name).join(', ')}. One request to each API carries all of them.</p>
  <h3>Why not Malaysia's official API (Indeks Pencemar Udara)?</h3>
  <p>Malaysia's official Air Pollutant Index is published by the Department of Environment (Jabatan Alam Sekitar) on <a href="https://apims.doe.gov.my/">APIMS</a>, from real monitoring stations. We looked for a documented public API with terms that allow reuse and did not find one: the government's open data catalogue lists APIMS with its licence "not specified", and the openly licensed DOE-derived dataset on data.gov.my is monthly. So this site does not copy APIMS readings. Check APIMS for official numbers; they use Malaysia's own breakpoints, so an API of 100 and a US AQI of 100 are not the same thing.</p>
</section>
<section class="block prose" aria-labelledby="thresholds">
  <h2 id="thresholds">Colours, advice and alerts</h2>
  <p>Colours follow the US EPA Air Quality Index categories. The advice is a plain-language summary of the EPA's guidance for each category, in English and Malay. It is general information, not medical advice.</p>
  <div class="table-scroll"><table>
    <caption>US AQI categories used on this site</caption>
    <thead><tr><th scope="col">US AQI</th><th scope="col">Category</th><th scope="col" lang="ms">Kategori</th><th scope="col">On this site</th></tr></thead>
    <tbody>${AQI_BANDS.map((b, i) => html`<tr class="aqi-row aqi-${b.id}"><th scope="row"><span class="swatch" aria-hidden="true"></span>${band(b, i)}</th><td>${b.label}</td><td lang="ms">${b.labelMs}</td><td>${b.max < NOTICE_AQI ? 'Colour only' : b.max < ALERT_AQI ? 'Notice banner' : 'Alert banner and a feed entry'}</td></tr>`)}</tbody>
  </table></div>
  <p><b>Notice</b>: any of the ${LOCATIONS.length} places at US AQI ${NOTICE_AQI} or more right now. <b>Alert</b>: any place at ${ALERT_AQI} or more, or Kuala Lumpur forecast to reach ${ALERT_AQI} within 24 hours. An alert is written to the <a href="../alerts/index.html">alert log</a> and the feeds once per place, local day and category.</p>
  <h3>The WHO comparison</h3>
  <p>The hero card compares the past 24 hours' mean PM2.5 with the World Health Organization's 2021 Air Quality Guidelines. The WHO sets a guideline and four interim targets for countries working towards it.</p>
  <div class="table-scroll"><table>
    <caption>WHO 2021 24-hour guideline values, µg/m³</caption>
    <thead><tr><th scope="col">Pollutant</th><th scope="col">Interim 1</th><th scope="col">Interim 2</th><th scope="col">Interim 3</th><th scope="col">Interim 4</th><th scope="col">Guideline</th></tr></thead>
    <tbody>
      <tr><th scope="row">PM2.5</th><td>${WHO_PM25_24H.it1}</td><td>${WHO_PM25_24H.it2}</td><td>${WHO_PM25_24H.it3}</td><td>${WHO_PM25_24H.it4}</td><td>${WHO_PM25_24H.guideline}</td></tr>
      <tr><th scope="row">PM10</th><td>${WHO_PM10_24H.it1}</td><td>${WHO_PM10_24H.it2}</td><td>${WHO_PM10_24H.it3}</td><td>${WHO_PM10_24H.it4}</td><td>${WHO_PM10_24H.guideline}</td></tr>
    </tbody>
  </table></div>
</section>
<section class="block prose" aria-labelledby="m-history">
  <h2 id="m-history">History</h2>
  <p>Each update asks for the past ${PAST_DAYS} days as well, so a missed run does not leave a gap. For every complete day (Malaysia time) with at least 20 hours of data, it stores one small summary per place: peak and mean US AQI, mean PM2.5 and PM10, peak ozone and NO₂, high and low temperature and rainfall. A day already stored is never rewritten. These are the model's values for those hours, not station measurements.</p>
</section>
<section class="block prose" aria-labelledby="m-schedule">
  <h2 id="m-schedule">Schedule and costs</h2>
  <p>A GitHub Actions workflow runs every ${24 / RUNS_PER_DAY} hours: it fetches, records new history days and alerts, builds this site and publishes it as static files. GitHub can start scheduled runs late, or skip them when it is busy, so every page shows the data's own model hour and when it was built, and says so when the numbers are more than ${STALE_AFTER_HOURS} hours old.</p>
  <ul>
    <li><b>GitHub minutes</b> (free on public repositories; a private one gets ${m.free.toLocaleString('en')} free minutes a month, and each job is billed in whole minutes, rounded up): ${m.runsPerDay} runs a day × ${DAYS_PER_MONTH} days ≈ ${m.runs} runs, at 2–3 billed minutes each (a build job and a deploy job) = ${m.low}–${m.high} minutes a month. Hourly would be ${hourly.runs} runs = ${hourly.low}–${hourly.high} minutes, too close to the limit once anything else runs on the account.</li>
    <li><b>Open-Meteo calls</b> (free tier: fewer than ${OPEN_METEO_DAILY_LIMIT.toLocaleString('en')} a day, non-commercial): ${perRun ? html`the last update counted ${fmt(perRun, 1)} calls (forecast ${fmt(cost.forecastCost, 1)}${cost.airCost ? html`, air quality ${fmt(cost.airCost, 1)}` : ', air quality not reported'}), so about ${fmt(perRun * RUNS_PER_DAY, 0)} a day` : 'the cost is read from the API\'s rate-limit header on each update'}. Several places in one request count as several calls.</li>
  </ul>
</section>
<section class="block prose" aria-labelledby="m-limits">
  <h2 id="m-limits">Limits</h2>
  <ul>
    <li><b>Models, not monitors.</b> Every air quality number is a forecast model's estimate for a grid cell tens of kilometres wide. A busy road, a local fire or a valley can be much worse than the cell average; the model can also be off on a whole haze episode.</li>
    <li><b>Neighbours can share a cell.</b> Kuala Lumpur and Shah Alam are about 20 km apart and can fall in the same air quality grid cell, so their air numbers may be identical.</li>
    <li><b>Haze or ozone?</b> The US AQI is the worst of several pollutants. In the model, a day's peak can be set by afternoon ozone rather than haze particles; the PM2.5 figure is the one that tracks haze.</li>
    <li><b>One point per state.</b> Each state is represented by its capital. Kuching says little about Miri; Kuantan says little about Cameron Highlands.</li>
    <li><b>US AQI is not Malaysia's API.</b> The scales and averaging differ. Use APIMS for official decisions such as school closures.</li>
    <li><b>Delays.</b> Scheduled runs can start late. The age of the data is on every page.</li>
  </ul>
</section>
</div>
</div>`;
}
