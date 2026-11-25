# Data licence

The MIT licence in [`LICENSE`](LICENSE) covers the code only. The data is not relicensed: it stays under its source licence.

| Where | Source | Licence |
|---|---|---|
| `data/`, `examples/`, `tests/fixtures/`, and the `latest.json`, `history.json`, feeds and pages a build writes | [Open-Meteo](https://open-meteo.com/) Forecast and Air Quality APIs | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Air quality values within the above | Copernicus Atmosphere Monitoring Service (CAMS) global forecasts, via Open-Meteo | Copernicus licence; must state "contains modified Copernicus Atmosphere Monitoring Service information" |

If you publish a copy, keep the attribution the site already shows in every page footer:

> Weather data by Open-Meteo.com, licensed CC BY 4.0. Air quality: Copernicus Atmosphere Monitoring Service (CAMS) global forecasts, via Open-Meteo; contains modified Copernicus Atmosphere Monitoring Service information. Values are rounded and summarised here.

The build fails if that attribution is missing. Open-Meteo's free API is for non-commercial use; see [its terms](https://open-meteo.com/en/terms).

The fonts in `assets/fonts/` are under the SIL Open Font License 1.1 ([`LICENSE-THIRD-PARTY`](LICENSE-THIRD-PARTY)).
