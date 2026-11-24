// Safe writes and repository hygiene.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { writeFileAtomic, assertNoSymlinks, removeTreeInside } from '../scripts/lib/safe-fs.mjs';
import { ResponseCache } from '../scripts/lib/cache.mjs';
import { USER_AGENT, LOCATIONS, AQI_BANDS, RUNS_PER_DAY, OPEN_METEO_DAILY_LIMIT } from '../scripts/lib/config.mjs';
import { tmpDir, ROOT } from './helpers.mjs';

test('writeFileAtomic replaces through a temp file and leaves nothing behind', () => {
  const root = tmpDir();
  const f = path.join(root, 'a', 'b.json');
  writeFileAtomic(f, 'one', root);
  writeFileAtomic(f, 'two', root);
  assert.equal(fs.readFileSync(f, 'utf8'), 'two');
  assert.deepEqual(fs.readdirSync(path.dirname(f)), ['b.json']);
});

test('writes refuse a symlink at the target, on the way, or a path outside the root', () => {
  const root = tmpDir();
  const outside = path.join(tmpDir(), 'victim.txt');
  fs.writeFileSync(outside, 'keep');
  fs.symlinkSync(outside, path.join(root, 'link.txt'));
  assert.throws(() => writeFileAtomic(path.join(root, 'link.txt'), 'pwned', root), /symlink/);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'keep');
  const elsewhere = tmpDir();
  fs.symlinkSync(elsewhere, path.join(root, 'dir'));
  assert.throws(() => writeFileAtomic(path.join(root, 'dir', 'x.txt'), 'x', root), /symlink/);
  assert.throws(() => assertNoSymlinks(path.join(root, '..', 'escape.txt'), root), /outside/);
});

test('removeTreeInside refuses the root itself and anything outside it', () => {
  const root = tmpDir();
  assert.throws(() => removeTreeInside(root, root), /not inside/);
  assert.throws(() => removeTreeInside(path.dirname(root), root), /not inside/);
});

test('a damaged or symlinked cache entry is ignored, never trusted', () => {
  const root = tmpDir();
  const cache = new ResponseCache({ dir: path.join(root, 'c'), root, ttlMs: 60_000 });
  const url = 'https://api.open-meteo.com/v1/forecast?x=1';
  cache.set(url, 'application/json', { status: 200, body: '{}' });
  const file = cache.file(ResponseCache.key(url, 'application/json'));
  fs.writeFileSync(file, '{not json');
  assert.equal(cache.get(url, 'application/json'), null);
  fs.rmSync(file);
  const planted = path.join(tmpDir(), 'p.json');
  fs.writeFileSync(planted, JSON.stringify({ url, body: '{"evil":1}', status: 200, fetchedAt: Date.now() }));
  fs.symlinkSync(planted, file);
  assert.equal(cache.get(url, 'application/json'), null);
});

test('the configuration is coherent: 16 unique places in Malaysia, ordered bands, a polite User-Agent', () => {
  assert.equal(LOCATIONS.length, 16);
  assert.equal(new Set(LOCATIONS.map((l) => l.id)).size, 16);
  assert.equal(new Set(LOCATIONS.map((l) => l.tile.join(','))).size, 16, 'no two tiles on one spot');
  for (const l of LOCATIONS) {
    assert.ok(l.lat > 0.8 && l.lat < 7.5 && l.lon > 99.5 && l.lon < 119.5, l.id);
    assert.match(l.id, /^[a-z-]+$/);
  }
  assert.deepEqual(AQI_BANDS.map((b) => b.max), [50, 100, 150, 200, 300, 500]);
  assert.match(USER_AGENT, /^kl-air-watch\/\d/);
  assert.ok(!USER_AGENT.includes('@'));
  assert.equal(24 % RUNS_PER_DAY, 0);
  // The recorded update cost 28.8 calls for the forecast; even at 100 per run we stay far under.
  assert.ok(100 * RUNS_PER_DAY < OPEN_METEO_DAILY_LIMIT / 5);
});

test('committed files hold no email address other than the noreply one, and no home paths', () => {
  let files;
  try {
    files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return; // not a git checkout (e.g. a downloaded archive): nothing to check
  }
  for (const f of files) {
    if (/\.(woff2|png|svg|txt)$/.test(f) || f.startsWith('tests/fixtures/') || f === 'package-lock.json') continue;
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of src.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
      if (src.slice(m.index - 4, m.index) === '//u:') continue; // test URLs with fake credentials
      assert.match(m[0], /^(190336345)?\+VinVirtual@users\.noreply\.github\.com$/, `${f}: ${m[0]}`);
    }
    assert.doesNotMatch(src, /\/home\/[a-z]+\//, f);
  }
});
