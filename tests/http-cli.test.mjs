// The network layer, the update pipeline end to end on recorded responses, the CLI and the workflows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkUrl, HttpError, rateCost } from '../scripts/lib/http.mjs';
import { BudgetExceeded } from '../scripts/lib/budget.mjs';
import { ResponseCache } from '../scripts/lib/cache.mjs';
import { runUpdate } from '../scripts/lib/update.mjs';
import { loadHistory } from '../scripts/lib/history.mjs';
import { parseArgs } from '../scripts/airwatch.mjs';
import { fakeFetch, testHttp, testBudget, tmpDir, recordedRoutes, ROOT, GENERATED_AT } from './helpers.mjs';

const ok = (body = '{}') => () => ({ body });

test('checkUrl allows only https to the two Open-Meteo hosts', () => {
  assert.ok(checkUrl('https://api.open-meteo.com/v1/forecast'));
  assert.ok(checkUrl('https://air-quality-api.open-meteo.com/v1/air-quality'));
  assert.throws(() => checkUrl('http://api.open-meteo.com/v1/forecast'), /non-https/);
  assert.throws(() => checkUrl('https://customer-api.open-meteo.com/'), /host not allowed/);
  assert.throws(() => checkUrl('https://evil.example/'), /host not allowed/);
  assert.throws(() => checkUrl('https://u:p@api.open-meteo.com/'), /credentials/);
  assert.throws(() => checkUrl('https://api.open-meteo.com:8443/'), /port/);
  assert.throws(() => checkUrl('file:///etc/passwd'), /non-https/);
  assert.throws(() => checkUrl('no'), HttpError);
});

test('requests carry a generic User-Agent without an address and never follow redirects', async () => {
  const f = fakeFetch([['open-meteo', ok()]]);
  await testHttp(f).getText('https://api.open-meteo.com/v1/forecast');
  assert.equal(f.calls[0].init.redirect, 'manual');
  assert.match(f.calls[0].init.headers['user-agent'], /^kl-air-watch/);
  assert.ok(!/@/.test(f.calls[0].init.headers['user-agent']));
  const r = fakeFetch([['open-meteo', () => ({ status: 302, headers: { location: 'https://evil.example/' } })]]);
  await assert.rejects(testHttp(r).getText('https://api.open-meteo.com/v1/forecast'), /redirect refused/);
});

test('oversized responses fail instead of being cut', async () => {
  const f = fakeFetch([['open-meteo', ok('x'.repeat(5000))]]);
  await assert.rejects(testHttp(f, { maxResponseBytes: 1000 }).getText('https://api.open-meteo.com/v1/forecast'), /too large/);
});

test('a 429 is retried once after Retry-After; a second failure is an error', async () => {
  let n = 0;
  const f = fakeFetch([['open-meteo', () => (++n === 1 ? { status: 429, headers: { 'retry-after': '3' } } : { body: '{"a":1}' })]]);
  const budget = testBudget();
  const r = await testHttp(f, { budget }).getJson('https://api.open-meteo.com/v1/forecast');
  assert.deepEqual(r.data, { a: 1 });
  assert.deepEqual(budget.sleeps, [3000]);
  const always = fakeFetch([['open-meteo', () => ({ status: 503 })]]);
  await assert.rejects(testHttp(always).getText('https://api.open-meteo.com/v1/forecast'), /HTTP 503/);
});

test('the request budget stops a runaway loop', async () => {
  const f = fakeFetch([['open-meteo', ok()]]);
  const http = testHttp(f, { budget: testBudget({ maxRequests: 2 }) });
  await http.getText('https://api.open-meteo.com/a');
  await http.getText('https://api.open-meteo.com/b');
  await assert.rejects(http.getText('https://api.open-meteo.com/c'), BudgetExceeded);
});

test('the Open-Meteo rate cost header is read when present and sane', () => {
  const h = (v) => new Headers(v === undefined ? {} : { 'x-ratelimit-cost': v });
  assert.equal(rateCost(h('28.8')), 28.8);
  assert.equal(rateCost(h()), null);
  assert.equal(rateCost(h('')), null);
  assert.equal(rateCost(h('lots')), null);
  assert.equal(rateCost(h('-1')), null);
});

test('the cache answers a repeat request and --offline never touches the network', async () => {
  const root = tmpDir();
  const cache = new ResponseCache({ dir: path.join(root, 'c'), root, ttlMs: 60_000 });
  const f = fakeFetch([['open-meteo', () => ({ body: '{"x":2}', headers: { 'x-ratelimit-cost': '3' } })]]);
  const first = await testHttp(f, { cache }).getJson('https://api.open-meteo.com/v1/forecast');
  const second = await testHttp(f, { cache }).getJson('https://api.open-meteo.com/v1/forecast');
  assert.equal(f.calls.length, 1);
  assert.equal(second.fromCache, true);
  assert.equal(second.cost, first.cost);
  const none = fakeFetch([]);
  await assert.rejects(testHttp(none, { cache, offline: true }).getText('https://api.open-meteo.com/other'), /offline/);
  assert.equal(none.calls.length, 0);
});

test('an update makes exactly two requests and writes the snapshot, history and alerts', async () => {
  const root = tmpDir();
  const dataDir = path.join(root, 'data');
  const f = fakeFetch(recordedRoutes());
  const http = testHttp(f);
  const res = await runUpdate({ http, root, dataDir, now: () => new Date(GENERATED_AT) });
  assert.equal(f.calls.length, 2);
  assert.ok(f.calls.some((c) => c.url.startsWith('https://api.open-meteo.com/v1/forecast?')));
  assert.ok(f.calls.some((c) => c.url.startsWith('https://air-quality-api.open-meteo.com/v1/air-quality?')));
  assert.deepEqual(res.historyAdded, ['2026-11-21', '2026-11-22', '2026-11-23']);
  assert.equal(res.snapshot.requests.forecastCost, 28.8);
  assert.equal(res.snapshot.requests.airCost, null);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'latest.json'), 'utf8')).generatedAt, GENERATED_AT);
  assert.equal(loadHistory(dataDir).length, 3);
  const again = await runUpdate({ http: testHttp(fakeFetch(recordedRoutes())), root, dataDir, now: () => new Date(GENERATED_AT) });
  assert.deepEqual(again.historyAdded, []);
});

test('if one API fails, nothing is written', async () => {
  const root = tmpDir();
  const dataDir = path.join(root, 'data');
  const f = fakeFetch([['air-quality-api', () => ({ status: 500 })], ...recordedRoutes()]);
  await assert.rejects(runUpdate({ http: testHttp(f), root, dataDir }), /HTTP 500/);
  assert.equal(fs.existsSync(dataDir), false);
});

test('if a response is malformed, nothing is written', async () => {
  const root = tmpDir();
  const dataDir = path.join(root, 'data');
  const f = fakeFetch([['air-quality-api', () => ({ body: '[{"latitude": 3}]' })], ...recordedRoutes()]);
  await assert.rejects(runUpdate({ http: testHttp(f), root, dataDir }), /expected 16 locations/);
  assert.equal(fs.existsSync(path.join(dataDir, 'latest.json')), false);
});

test('the CLI parses commands, flags and backfill bounds', () => {
  assert.deepEqual(parseArgs(['update', '--backfill', '30']), { cmd: 'update', opts: { backfill: 30 } });
  assert.deepEqual(parseArgs([]), { cmd: 'help', opts: {} });
  assert.deepEqual(parseArgs(['site', '--out', 'x']).opts, { out: 'x' });
  for (const bad of [['update', '--backfill', '0'], ['update', '--backfill', '93'], ['update', '--backfill', '1e1'], ['update', '--backfill', '-3']]) assert.throws(() => parseArgs(bad), /backfill|needs a value/);
  assert.throws(() => parseArgs(['update', '--offline', '--no-cache']), /needs the cache/);
  assert.throws(() => parseArgs(['deploy']), /unknown command/);
  assert.throws(() => parseArgs(['__proto__']), /unknown command/);
  assert.throws(() => parseArgs(['site', '--backfill', '3']), /unknown option/);
  assert.throws(() => parseArgs(['site', '--out']), /needs a value/);
  assert.throws(() => parseArgs(['site', 'x']), /unexpected argument/);
});

const workflow = (name) => fs.readFileSync(path.join(ROOT, '.github', 'workflows', name), 'utf8');

test('every action in the workflows is pinned to a full commit SHA', () => {
  for (const name of ['update.yml', 'test.yml']) {
    const uses = [...workflow(name).matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
    assert.ok(uses.length >= 2, name);
    for (const u of uses) assert.match(u, /@[0-9a-f]{40}$/, `${name}: ${u}`);
  }
});

test('the update workflow runs every 3 hours in one job, with write rights only to contents', () => {
  const w = workflow('update.yml');
  assert.match(w, /cron: '23 \*\/3 \* \* \*'/);
  assert.match(w, /^permissions: \{\}$/m);
  assert.equal((w.match(/^ {2}[a-z-]+:\n {4}runs-on:/gm) ?? []).length, 1, 'one job, so one billed minute block per run');
  assert.match(w, /contents: write/);
  assert.doesNotMatch(w, /pull-requests|id-token|actions: write/);
  assert.match(w, /persist-credentials: false/);
  assert.match(w, /timeout-minutes: 8/);
});

test('the deploy is skipped with a warning, not failed, when the Cloudflare secrets are missing', () => {
  const w = workflow('update.yml');
  assert.match(w, /HAS_TOKEN: \$\{\{ secrets.CLOUDFLARE_API_TOKEN != '' \}\}/);
  assert.match(w, /::warning title=Cloudflare deploy skipped::/);
  assert.match(w, /if: \$\{\{ !cancelled\(\) && steps.cf.outputs.ready == 'true' \}\}/);
  assert.match(w, /--project-name=\$\{\{ env.PAGES_PROJECT \}\}/);
  assert.match(w, /PAGES_PROJECT: kl-air-watch/);
});

test('the workflow commits as the noreply identity and only the data files', () => {
  const w = workflow('update.yml');
  assert.match(w, /190336345\+VinVirtual@users.noreply.github.com/);
  assert.match(w, /git add data\/history\n/);
  assert.doesNotMatch(w, /git add (-A|\.)/);
  assert.doesNotMatch(w, /Co-Authored-By/i);
});

test('a dropped connection is retried once, then reported with the host and the reason', async () => {
  let n = 0;
  const flaky = fakeFetch([['open-meteo', () => {
    n += 1;
    if (n === 1) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
    return { body: '{"ok":true}' };
  }]]);
  const budget = testBudget();
  assert.deepEqual((await testHttp(flaky, { budget }).getJson('https://api.open-meteo.com/v1/forecast')).data, { ok: true });
  assert.deepEqual(budget.sleeps, [3000]);
  const dead = fakeFetch([['open-meteo', () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }); }]]);
  await assert.rejects(testHttp(dead).getText('https://api.open-meteo.com/v1/forecast'), /network error from api.open-meteo.com: ENOTFOUND/);
});
