// One update: two requests (forecast + air quality for all places), then the snapshot,
// new history days and new alerts are written. Nothing is written unless both answers parse.
import path from 'node:path';
import { forecastUrl, airUrl, parseForecast, parseAir } from './openmeteo.mjs';
import { buildSnapshot } from './snapshot.mjs';
import { validateSnapshot } from './schema.mjs';
import { pastDays, mergeHistory } from './history.mjs';
import { recordAlerts } from './alerts.mjs';
import { writeJsonAtomic } from './safe-fs.mjs';
import { PAST_DAYS } from './config.mjs';

export async function runUpdate({ http, root, dataDir, now = () => new Date(), pastDays: past = PAST_DAYS, log = () => {} }) {
  const f = await http.getJson(forecastUrl({ pastDays: past }));
  const a = await http.getJson(airUrl({ pastDays: past }));
  const forecast = parseForecast(f.data);
  const air = parseAir(a.data);
  const requests = {
    forecastCost: f.cost,
    airCost: a.cost,
    fromCache: Boolean(f.fromCache && a.fromCache),
    pastDays: past,
    ...http.budget.summary(),
  };
  const snapshot = validateSnapshot(buildSnapshot({ forecast, air, generatedAt: now().toISOString(), requests }));
  const added = mergeHistory({ dataDir, root, days: pastDays({ forecast, air, today: snapshot.today }) });
  const alerts = recordAlerts({ file: path.join(dataDir, 'alerts.json'), root, snapshot });
  writeJsonAtomic(path.join(dataDir, 'latest.json'), snapshot, root);
  if (forecast.rejected + air.rejected) log(`warning: ${forecast.rejected + air.rejected} implausible values were dropped`);
  return { snapshot, historyAdded: added, alertsAdded: alerts };
}
