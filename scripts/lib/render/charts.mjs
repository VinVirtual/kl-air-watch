// Small accessible SVG charts, drawn at build time. No inline style (strict CSP): colours come
// from classes. Every chart has a title and description for screen readers and a data table.
import { html, raw, esc } from '../html.mjs';
import { band } from '../aqi.mjs';

export function niceTicks(lo, hi, count = 4) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (hi === lo) hi = lo + 1;
  const span = hi - lo;
  const raw0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? 10 * mag;
  const start = Math.floor(lo / step) * step;
  const out = [];
  for (let v = start; v <= hi + step * 0.001; v += step) out.push(Math.round(v * 1000) / 1000);
  if (out[out.length - 1] < hi) out.push(Math.round((out[out.length - 1] + step) * 1000) / 1000);
  return out;
}

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

function scale(domain, range) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  return (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
}

function linePath(values, x, y) {
  let d = '';
  let pen = false;
  values.forEach((v, i) => {
    if (!finite(v)) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
    pen = true;
  });
  return d;
}

// AQI category bands behind a chart: [from, to, class].
export function aqiBands(maxValue) {
  const edges = [[0, 50, 'good'], [50, 100, 'moderate'], [100, 150, 'sensitive'], [150, 200, 'unhealthy'], [200, 300, 'very-unhealthy'], [300, 500, 'hazardous']];
  return edges.filter(([lo]) => lo < maxValue);
}

/**
 * chart({ id, title, desc, labels, series, left: {min,max,unit}, right?, bands?, shade?, tickEvery, marker? })
 * series: [{ type: 'line'|'bar', label, values, cls, axis: 'left'|'right', barClass?: (v) => string }]
 */
export function chart({ id, title, desc, labels, series, left, right = null, bands = null, shade = null, tickEvery = 6, marker = null, width = 760, height = 260 }) {
  if (!labels.length) return html`<p class="empty">No data for this chart in this update.</p>`;
  const pad = { l: 46, r: right ? 46 : 14, t: 26, b: 34 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const n = labels.length;
  const cw = plotW / n;
  const x = (i) => pad.l + cw * (i + 0.5);
  const leftTicks = niceTicks(left.min, left.max);
  const yl = scale([leftTicks[0], leftTicks.at(-1)], [pad.t + plotH, pad.t]);
  const rightTicks = right ? niceTicks(right.min, right.max) : null;
  const yr = right ? scale([rightTicks[0], rightTicks.at(-1)], [pad.t + plotH, pad.t]) : null;
  const yOf = (s) => (s.axis === 'right' ? yr : yl);
  const parts = [];

  if (bands) {
    for (const [lo, hi, cls] of bands) {
      const top = yl(Math.min(hi, leftTicks.at(-1)));
      const bottom = yl(Math.max(lo, leftTicks[0]));
      if (bottom - top > 0.5) parts.push(`<rect class="band band-${esc(cls)}" x="${pad.l}" y="${top.toFixed(1)}" width="${plotW.toFixed(1)}" height="${(bottom - top).toFixed(1)}"/>`);
    }
  }
  if (shade) {
    shade.forEach((on, i) => {
      if (on) parts.push(`<rect class="shade" x="${(pad.l + cw * i).toFixed(1)}" y="${pad.t}" width="${cw.toFixed(2)}" height="${plotH}"/>`);
    });
  }
  for (const t of leftTicks) parts.push(`<line class="grid" x1="${pad.l}" x2="${pad.l + plotW}" y1="${yl(t).toFixed(1)}" y2="${yl(t).toFixed(1)}"/><text class="tick" x="${pad.l - 8}" y="${(yl(t) + 4).toFixed(1)}" text-anchor="end">${esc(t)}</text>`);
  if (right) for (const t of rightTicks) parts.push(`<text class="tick tick-right" x="${pad.l + plotW + 8}" y="${(yr(t) + 4).toFixed(1)}">${esc(t)}</text>`);
  parts.push(`<text class="unit" x="${pad.l - 8}" y="11" text-anchor="end">${esc(left.unit)}</text>`);
  if (right) parts.push(`<text class="unit" x="${pad.l + plotW + 8}" y="11">${esc(right.unit)}</text>`);
  labels.forEach((lab, i) => {
    if (i % tickEvery === 0) parts.push(`<line class="xtick" x1="${x(i).toFixed(1)}" x2="${x(i).toFixed(1)}" y1="${pad.t + plotH}" y2="${pad.t + plotH + 4}"/><text class="tick" x="${x(i).toFixed(1)}" y="${height - 12}" text-anchor="middle">${esc(lab)}</text>`);
  });
  for (const s of series.filter((q) => q.type === 'bar')) {
    const y = yOf(s);
    const base = y(Math.max(0, (s.axis === 'right' ? rightTicks : leftTicks)[0]));
    s.values.forEach((v, i) => {
      if (!finite(v)) return;
      const top = y(v);
      const w = cw * 0.64;
      const cls = s.barClass ? s.barClass(v) : '';
      parts.push(`<rect class="bar ${esc(s.cls)} ${esc(cls)}" x="${(x(i) - w / 2).toFixed(1)}" y="${Math.min(top, base).toFixed(1)}" width="${w.toFixed(2)}" height="${Math.max(0.5, Math.abs(base - top)).toFixed(1)}"/>`);
    });
  }
  for (const s of series.filter((q) => q.type === 'line')) {
    parts.push(`<path class="line ${esc(s.cls)}" d="${linePath(s.values, x, yOf(s))}"/>`);
  }
  if (marker !== null) parts.push(`<line class="marker" x1="${x(marker).toFixed(1)}" x2="${x(marker).toFixed(1)}" y1="${pad.t}" y2="${pad.t + plotH}"/>`);
  // Invisible columns: the readout (assets/app.js) shows each column's values on hover.
  labels.forEach((lab, i) => {
    const read = [lab, ...series.map((s) => `${s.label} ${finite(s.values[i]) ? s.values[i] : '–'}${s.unit ?? ''}`)].join(' · ');
    parts.push(`<rect class="hit" x="${(pad.l + cw * i).toFixed(1)}" y="${pad.t}" width="${cw.toFixed(2)}" height="${plotH}" data-read="${esc(read)}" data-x="${(x(i) / width).toFixed(4)}"/>`);
  });
  parts.push(`<line class="cursor" x1="0" x2="0" y1="${pad.t}" y2="${pad.t + plotH}"/>`);

  const legend = series.map((s) => html`<li class="key ${s.cls}"><span class="swatch" aria-hidden="true"></span>${s.label}</li>`);
  return html`<figure class="chart" id="${id}" data-chart>
  <figcaption><span class="chart-title" id="${id}-t">${title}</span><ul class="legend">${legend}${shade ? html`<li class="key key-night"><span class="swatch" aria-hidden="true"></span>Night</li>` : ''}</ul></figcaption>
  <div class="chart-scroll">
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${id}-t ${id}-d" focusable="false"><desc id="${id}-d">${desc}</desc>${raw(parts.join(''))}</svg>
  </div>
  <p class="readout" aria-hidden="true" data-readout>Point at the chart to read values.</p>
</figure>`;
}

// A data table behind a chart, folded away.
export function dataTable({ caption, headers, rows }) {
  return html`<details class="chart-data">
  <summary>Show the numbers <span lang="ms">· Lihat angka</span></summary>
  <div class="table-scroll"><table>
    <caption>${caption}</caption>
    <thead><tr>${headers.map((h, i) => html`<th scope="col"${i ? '' : html` class="row-head"`}>${h}</th>`)}</tr></thead>
    <tbody>${rows.map((r) => html`<tr>${r.map((c, i) => (i === 0 ? html`<th scope="row">${c}</th>` : html`<td>${c}</td>`))}</tr>`)}</tbody>
  </table></div>
</details>`;
}

// One coloured cell per day and place, for the history page.
export function heatStrip({ id, title, desc, dates, rows, dateLabel }) {
  const cellW = 22;
  const cellH = 20;
  const labelW = 128;
  const top = 24;
  const width = labelW + dates.length * cellW + 4;
  const height = top + rows.length * cellH + 4;
  const parts = [];
  dates.forEach((d, j) => {
    if (j % 5 === 0 || j === dates.length - 1) parts.push(`<text class="tick" x="${labelW + j * cellW + cellW / 2}" y="16" text-anchor="middle">${esc(dateLabel(d))}</text>`);
  });
  rows.forEach((r, i) => {
    const y = top + i * cellH;
    parts.push(`<text class="row-label" x="${labelW - 8}" y="${y + cellH * 0.68}" text-anchor="end">${esc(r.label)}</text>`);
    r.values.forEach((v, j) => {
      const b = band(v);
      parts.push(`<rect class="cell aqi-${b.id}" x="${labelW + j * cellW + 1}" y="${y + 1}" width="${cellW - 2}" height="${cellH - 2}" rx="2" data-read="${esc(`${r.label} · ${dates[j]} · US AQI max ${finite(v) ? v : '–'} (${b.label})`)}"/>`);
    });
  });
  return html`<figure class="chart heat" id="${id}" data-chart>
  <figcaption><span class="chart-title" id="${id}-t">${title}</span></figcaption>
  <div class="chart-scroll"><svg class="heat-svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${id}-t ${id}-d" focusable="false"><desc id="${id}-d">${desc}</desc>${raw(parts.join(''))}</svg></div>
  <p class="readout" aria-hidden="true" data-readout>Point at a cell to read it.</p>
</figure>`;
}
