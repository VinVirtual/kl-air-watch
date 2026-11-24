// Haze alert feeds: RSS 2.0 (alerts.xml) and JSON Feed 1.1 (alerts.json), newest first.
import { esc } from './html.mjs';
import { FEED_ENTRIES, SITE_TITLE } from './config.mjs';
import { band, advice } from './aqi.mjs';
import { formatLocal } from './weather.mjs';

export const FEED_TITLE = `${SITE_TITLE}: haze alerts`;
const FEED_DESC = 'One entry each time a place in Malaysia reaches US AQI 151 (unhealthy) or more, or Kuala Lumpur is forecast to. Model estimates from CAMS via Open-Meteo.';

function latest(alerts) {
  return [...alerts].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt) || b.id.localeCompare(a.id)).slice(0, FEED_ENTRIES);
}

export function alertTitle(a) {
  const b = band(a.aqi);
  return a.kind === 'forecast'
    ? `${a.name}: forecast to reach US AQI ${a.aqi} (${b.label.toLowerCase()}) within 24 hours`
    : `${a.name}: US AQI ${a.aqi} (${b.label.toLowerCase()})`;
}

export function alertText(a) {
  const adv = advice(a.aqi);
  const pm = a.pm25 !== null ? ` PM2.5 ${a.pm25} µg/m³.` : '';
  return `${alertTitle(a)}, ${a.state}, model hour ${formatLocal(a.observedAt)} Malaysia time.${pm} ${adv.en} ${adv.ms}`;
}

const entryUrl = (siteUrl, a) => `${siteUrl}alerts/index.html#${encodeURIComponent(a.id)}`;

export function rss(alerts, siteUrl) {
  const list = latest(alerts);
  const items = list
    .map((a) => `    <item>
      <title>${esc(alertTitle(a))}</title>
      <link>${esc(`${siteUrl}states/${a.location}/index.html`)}</link>
      <guid isPermaLink="false">${esc(`kl-air-watch:${a.id}`)}</guid>
      <pubDate>${new Date(a.recordedAt).toUTCString()}</pubDate>
      <description>${esc(alertText(a))}</description>
    </item>`)
    .join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(FEED_TITLE)}</title>
    <link>${esc(siteUrl)}</link>
    <description>${esc(FEED_DESC)}</description>
    <language>en</language>
    <copyright>Weather data by Open-Meteo.com (CC BY 4.0). Contains modified Copernicus Atmosphere Monitoring Service information.</copyright>
    <ttl>180</ttl>
    <atom:link href="${esc(`${siteUrl}alerts.xml`)}" rel="self" type="application/rss+xml"/>
${list.length ? `    <lastBuildDate>${new Date(list[0].recordedAt).toUTCString()}</lastBuildDate>\n` : ''}${items}
  </channel>
</rss>
`;
}

export function jsonFeed(alerts, siteUrl) {
  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: FEED_TITLE,
    description: FEED_DESC,
    home_page_url: siteUrl,
    feed_url: `${siteUrl}alerts.json`,
    language: 'en',
    items: latest(alerts).map((a) => ({
      id: `kl-air-watch:${a.id}`,
      url: entryUrl(siteUrl, a),
      external_url: `${siteUrl}states/${a.location}/index.html`,
      title: alertTitle(a),
      content_text: alertText(a),
      date_published: new Date(a.recordedAt).toISOString(),
      tags: ['haze', a.band, a.location, a.kind],
      _air: { location: a.location, us_aqi: a.aqi, pm2_5: a.pm25, observed_local: a.observedAt, kind: a.kind },
    })),
  };
  return `${JSON.stringify(feed, null, 2)}\n`;
}
