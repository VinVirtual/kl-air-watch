<p align="center"><img src="docs/home-light.jpg" width="760" alt="KL Air & Weather Watch home page: Kuala Lumpur at 27°C with drizzle, next to an air quality card showing US AQI 112, unhealthy for sensitive groups, with advice in English and Malay"></p>

# KL Air & Weather Watch

[![test](https://github.com/VinVirtual/kl-air-watch/actions/workflows/test.yml/badge.svg)](https://github.com/VinVirtual/kl-air-watch/actions/workflows/test.yml) [![update](https://github.com/VinVirtual/kl-air-watch/actions/workflows/update.yml/badge.svg)](https://github.com/VinVirtual/kl-air-watch/actions/workflows/update.yml) [![License: MIT](https://img.shields.io/badge/code-MIT-blue.svg)](LICENSE)

Weather and haze for Kuala Lumpur and every Malaysian state, on a free static site that updates itself every three hours.

Live: **https://kl-air-watch.pages.dev/** (haze alerts: [RSS](https://kl-air-watch.pages.dev/alerts.xml), [JSON Feed](https://kl-air-watch.pages.dev/alerts.json); data: [`latest.json`](https://kl-air-watch.pages.dev/latest.json), [`history.json`](https://kl-air-watch.pages.dev/history.json)). Suggested custom domain: `air.lashvin.com` (see [Hosting](#hosting)).

- **Today in KL**: temperature, feels-like, rain chance, humidity and wind; US AQI on a gauge with the category and plain-language advice in English and Malay; PM2.5, PM10, ozone and NO₂; the past 24 hours' PM2.5 against the WHO guideline.
- **48 hours**: hourly temperature, feels-like and rain chance, and the hourly US AQI over its category bands, as SVG charts drawn at build time, each with a description and a data table.
- **7 days**: highs, lows, rain and (for the three days the air model reaches) the peak AQI.
- **16 places**: KL, the 13 state capitals, Putrajaya and Labuan on a tile map coloured by AQI, a table sorted worst first, and a page each.
- **Haze banner** on every page when any place passes US AQI 100 (notice) or 150 (alert), and an **alert log** with RSS and JSON feeds.
- **History**: one compact summary per place per day, committed to this repository, so the 30-day charts, the all-states grid and the monthly (seasonal) view build up over time.
- Light and dark, phone-friendly, no third-party requests, strict Content-Security-Policy, English first with Malay labels.

Screenshots: [`docs/home-light.jpg`](docs/home-light.jpg), [`docs/home-dark.jpg`](docs/home-dark.jpg), [`docs/home-charts.jpg`](docs/home-charts.jpg), [`docs/home-map.jpg`](docs/home-map.jpg), [`docs/home-phone.jpg`](docs/home-phone.jpg), [`docs/states.jpg`](docs/states.jpg), [`docs/history.jpg`](docs/history.jpg) (dark), [`docs/method.jpg`](docs/method.jpg) (dark).

## Data sources and attribution

| Source | What | Terms |
|---|---|---|
| [Open-Meteo Forecast API](https://open-meteo.com/en/docs) | current weather, hourly and 7-day forecast, Malaysia time | free for non-commercial use, under 10,000 calls a day; data CC BY 4.0 |
| [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api) | PM2.5, PM10, ozone, NO₂, US and European AQI, from the CAMS global forecast (~45 km grid, updated twice a day) | as above; Copernicus data |

Every page says **"Weather data by Open-Meteo.com"** with a link, names the CC BY 4.0 licence, and states "contains modified Copernicus Atmosphere Monitoring Service information". `latest.json`, `history.json` and the RSS feed carry the same attribution.

**Malaysia's official Air Pollutant Index (APIMS, Department of Environment) is not used.** We found no documented public API with reuse terms: the government open-data catalogue lists APIMS with its licence "not specified", and the openly licensed DOE-derived dataset on data.gov.my is monthly. The site links to [APIMS](https://apims.doe.gov.my/) for official readings and explains that a US AQI of 100 and an API of 100 are different scales.

Both APIs take all 16 places in **one request each**, so an update is two requests. The forecast request reported `X-RateLimit-Cost: 28.8` calls on 24 November 2026 (the air quality API sends no such header); at 8 updates a day that is about 230 forecast calls a day, far under the 10,000 limit. The one-off 30-day backfill cost 76 calls.

## Schedule and minutes

`.github/workflows/update.yml` runs at 23 minutes past every third hour (UTC), in **one job**: unit tests, fetch, record new history days and alerts, build, commit the data files, deploy.

- Private repositories get **2,000 free Actions minutes a month**, and each job is billed in whole minutes, rounded up.
- 8 runs a day × 30.4 days ≈ **243 runs**. At 1–2 billed minutes each: **243–486 minutes a month**.
- Hourly would be 730 runs = 730–1,460 minutes: too close to the 2,000 once the test workflow and other private repositories on the account use their share. Change the cron and `RUNS_PER_DAY` in `scripts/lib/config.mjs` together if you want it.
- Data commits are made with the workflow token, which does not start other workflows, and `test.yml` ignores `data/**`.
- GitHub can start scheduled runs late or drop them when busy. Every page shows the model hour of its data and when it was built, and a small script says how many hours old it is; after 7 hours it shows a "these numbers are stale" bar.

## Hosting

Cloudflare Pages (free plan), project `kl-air-watch`, live at https://kl-air-watch.pages.dev/. The build writes a `_headers` file that Pages turns into real headers: the same CSP plus `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, and the RSS and JSON Feed media types.

Repository secrets used by the update workflow:

- `CLOUDFLARE_ACCOUNT_ID`: set.
- `CLOUDFLARE_API_TOKEN`: **the owner adds this** (the same token as physical-ai-radar works: Account › Cloudflare Pages › Edit). Until then, every run still fetches, builds and commits, and the deploy step is skipped with a warning.

Deploying by hand:

```bash
./airwatch update && ./airwatch site
npx wrangler pages deploy dist --project-name kl-air-watch --branch main
```

### Custom domain `air.lashvin.com` (owner steps; DNS is not touched by this repository)

1. Cloudflare dashboard → Workers & Pages → `kl-air-watch` → **Custom domains** → **Set up a custom domain** → enter `air.lashvin.com`.
2. Because lashvin.com's DNS is at Squarespace, choose **My DNS provider**. Cloudflare shows a CNAME target.
3. Squarespace → Domains → `lashvin.com` → DNS → add a record: type **CNAME**, host **`air`**, data **`kl-air-watch.pages.dev`**. Save.
4. Back in Cloudflare, wait for the domain to show **Active** (minutes to a few hours; it issues the TLS certificate itself).
5. GitHub → repository Settings → Secrets and variables → Actions → **Variables** → add `AIRWATCH_SITE_URL` = `https://air.lashvin.com/`, so canonical links and feeds use the new address. Optionally change `DEFAULT_SITE_URL` in `scripts/lib/config.mjs` too.

## Quick start

```bash
git clone https://github.com/VinVirtual/kl-air-watch && cd kl-air-watch
./check_env.sh
./airwatch update            # 2 requests; writes data/latest.json, adds finished days to data/history/
./airwatch site              # builds dist/ and checks links, CSP, attribution, size
python3 -m http.server -d dist 8000   # or any static server
```

`./airwatch update --backfill 30` asks for 30 past days once to start the history (this repository was started that way on 24 November 2026). `--offline` replays the local response cache; `--no-cache` skips it.

## How it works

| Stage | File | What happens |
|---|---|---|
| 1. Fetch | `scripts/lib/http.mjs`, `openmeteo.mjs` | two HTTPS GETs to the two allow-listed Open-Meteo hosts; no redirects, size cap, timeout, one retry, a request budget, a generic User-Agent |
| 2. Parse | `openmeteo.mjs` | every response is checked: 16 places in order, coordinates within 1° of the place asked for, Malaysia time, increasing times, matching lengths; values outside plausible ranges become missing and are counted |
| 3. Snapshot | `snapshot.mjs`, `schema.mjs` | now, the next 48 hours (weather joined with air by hour), 7 days, past-24-hour PM2.5 mean, next-24-hour AQI peak; validated before use |
| 4. History | `history.mjs` | every complete past day with at least 20 hours of data becomes one line per month file in `data/history/`; a recorded day is never rewritten |
| 5. Alerts | `alerts.mjs` | banner levels; a log entry per place, day and category at US AQI 151+, or when KL is forecast to reach it within 24 hours |
| 6. Site | `site.mjs`, `render/*.mjs` | 21 static pages, SVG charts with tables, feeds, `latest.json`, `history.json`, `_headers`; the build fails on inline code, a missing CSP or attribution, broken links, or over 6 MB |

Thresholds: US EPA AQI categories; WHO 2021 24-hour guideline (PM2.5 15 µg/m³) and interim targets. Both tables, the schedule and the limits are on the site's Method page, generated from `scripts/lib/config.mjs`.

## The example

[`examples/2026-11-24/`](examples/2026-11-24/) holds the snapshot from a live update at 18:45 Malaysia time on 24 November 2026 (`latest.json`) and the site built from it with the 30 backfilled days (`site/`). That afternoon four places were over US AQI 100: Putrajaya 115, Kuala Lumpur and Shah Alam 112, Melaka 101, so the site shows the amber notice. No place reached 151, so the alert log is empty. In the 30 days before (25 October–23 November), the model put Kuala Lumpur's daily peak above 150 on 3 days.

## Tests

83 unit tests (`npm test`, no network) and 10 browser tests (`npm run test:e2e`, needs Chrome). The unit tests run on the two API responses recorded on 24 November 2026 ([`tests/fixtures/`](tests/fixtures/)) and cover URL building, strict parsing and rejection of malformed or out-of-range data, AQI categories and boundaries, Malay and English advice, the WHO comparison, the snapshot and its validation against tampering, history summaries and merging (never rewriting, month splits, symlinks), alert levels and de-duplication, chart and page rendering with escaping, the site checks, RSS well-formedness (parsed by Python) and JSON Feed fields, the HTTP layer (hosts, redirects, size, retries, budget, cache, offline), the CLI, the workflows (pinned actions, one job, permissions, deploy skipped without a token, noreply identity) and a privacy scan of committed files. The browser tests load every page under the CSP with no off-site requests, check fonts, the chart readout, data tables, the theme toggle, 360 px width, landmarks and Malay `lang` attributes, WCAG AA text contrast in both themes (including on AQI colours) and reduced motion.

## Limits

- **Models, not monitors.** Every air number is a CAMS forecast for a grid cell tens of kilometres wide. Local smoke, traffic or valleys can be far worse; the model can miss a whole episode. History is the model's values for past hours, not station measurements.
- **US AQI is not Malaysia's API.** Use APIMS for official decisions.
- **One point per state**, at its capital. KL and Shah Alam can share a grid cell and show the same air.
- **A day's peak AQI can be ozone**, not haze: in this model, afternoon ozone often sets KL's daily peak. PM2.5 is the haze figure.
- **The air forecast reaches 3 days**; days 4–7 show weather only.
- **Malay text** was written for this project and has not been reviewed by a native speaker.
- **Scheduled runs can be late.** On 24 November 2026 a manual run of the update workflow took 9 seconds in its job (fetch, tests, build; nothing new to commit; deploy skipped for want of the API token). The commit-and-push step and the Cloudflare deploy step had not yet run on GitHub at the time of writing; the deploy was done by hand with wrangler.

## Licence

Code: MIT ([`LICENSE`](LICENSE)). Weather and air quality data: Open-Meteo, CC BY 4.0, with Copernicus Atmosphere Monitoring Service information. Fonts: Fraunces and IBM Plex Mono, SIL Open Font License 1.1 ([`LICENSE-THIRD-PARTY`](LICENSE-THIRD-PARTY)).
