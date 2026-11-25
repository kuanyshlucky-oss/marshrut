// Общее для карты и отчёта
const LAYERS = [
  { name: 'Почвенно-растительный слой', color: '#6b4f2a' },
  { name: 'Суглинок', color: '#b98a4e' },
  { name: 'Глина', color: '#c9674a' },
  { name: 'Песок с гравием', color: '#e3c878' },
  { name: 'Скальный грунт (выветрелый)', color: '#7f8a96' }
];
const DEPTH = 12;
const f1 = v => v.toFixed(1).replace('.', ',');
// Экранирование всего, что пришло с сервера и вставляется в HTML (названия зон, номера участков и т. п.)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CONF = { high: ['Высокая', 'p-ok'], medium: ['Средняя', 'p-warn'], low: ['Низкая', 'p-bad'] };

function columnSVG(b, gw, w = 70, h = 190, ink = '#93a0ae') {
  const bounds = [0, ...b, DEPTH], sy = d => 6 + (h - 12) * d / DEPTH;
  let s = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
  for (let l = 0; l < 5; l++) s += `<rect x="22" y="${sy(bounds[l])}" width="${w - 26}" height="${sy(bounds[l + 1]) - sy(bounds[l])}" fill="${LAYERS[l].color}"/>`;
  for (const d of [0, 3, 6, 9, 12]) s += `<text x="18" y="${sy(d) + 3}" fill="${ink}" font-size="9" text-anchor="end">${d}</text>`;
  if (gw != null) s += `<line x1="22" x2="${w - 4}" y1="${sy(gw)}" y2="${sy(gw)}" stroke="#5ab4ff" stroke-width="2" stroke-dasharray="4 2"/>`;
  return s + '</svg>';
}

function sectionSVG(sec, ink = '#93a0ae') {
  const S = sec.samples, n = S.length - 1, W = 700, H = 230, pl = 34, pr = 10, pt = 8, pb = 22;
  const sx = k => pl + (W - pl - pr) * k / n, sy = d => pt + (H - pt - pb) * d / DEPTH;
  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  for (let l = 0; l < 5; l++) {
    const top = S.map((s, k) => `${sx(k)},${sy(l === 0 ? 0 : s.b[l - 1])}`);
    const bot = S.map((s, k) => `${sx(k)},${sy(l === 4 ? DEPTH : s.b[l])}`).reverse();
    svg += `<polygon points="${top.concat(bot).join(' ')}" fill="${LAYERS[l].color}"/>`;
  }
  svg += `<polyline points="${S.map((s, k) => `${sx(k)},${sy(s.gw)}`).join(' ')}" fill="none" stroke="#5ab4ff" stroke-width="2" stroke-dasharray="6 3"/>`;
  for (const d of [0, 3, 6, 9, 12]) svg += `<text x="${pl - 5}" y="${sy(d) + 3}" fill="${ink}" font-size="10" text-anchor="end">${d} м</text>`;
  svg += `<text x="${pl}" y="${H - 5}" fill="${ink}" font-size="10">запад</text><text x="${W - pr}" y="${H - 5}" fill="${ink}" font-size="10" text-anchor="end">восток · ${sec.length} м</text></svg>`;
  return svg;
}

function layersTable(b) {
  const bounds = [0, ...b, DEPTH];
  return LAYERS.map((l, i) => `<tr><td><span class="sw" style="background:${l.color}"></span>${l.name}</td><td>${f1(bounds[i])}–${f1(bounds[i + 1])} м</td></tr>`).join('');
}

// Анонимный ID визита (без персональных данных), живёт пока открыта вкладка
const SID = (() => { try { let s = sessionStorage.getItem('sid'); if (!s) { s = Math.random().toString(36).slice(2, 12) + Date.now().toString(36); sessionStorage.setItem('sid', s); } return s; } catch { return 'anon'; } })();
function track(type, extra) { try { fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-sid': SID }, body: JSON.stringify({ type, ...extra }), keepalive: true }).catch(() => {}); } catch { /* аналитика не должна ломать сайт */ } }

async function jget(url) { const r = await fetch(url, { headers: { 'x-sid': SID } }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Ошибка ' + r.status); return d; }
async function jpost(url, obj, headers = {}) { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-sid': SID, ...headers }, body: JSON.stringify(obj || {}) }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Ошибка ' + r.status); return d; }

/* ---------- Тёмная подложка из открытых векторных тайлов OpenFreeMap (ключ не нужен) ----------
   Плитки tile.openstreetmap.org не используем: их политика не допускает такое применение, и они блокируют («403 Access blocked»). */
const OFM_GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
const OFM_SOURCE = { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '© OpenStreetMap contributors, OpenFreeMap © OpenMapTiles' };
const NAME_RU = ['coalesce', ['get', 'name:ru'], ['get', 'name']];
function ofmGroundLayers() {   // земля, вода, дороги
  const L = o => ({ source: 'ofm', ...o }), road = ['==', ['geometry-type'], 'LineString'];
  return [
    L({ id: 'vb-landcover', type: 'fill', 'source-layer': 'landcover', paint: { 'fill-color': ['match', ['get', 'class'], 'wood', '#1b2822', 'grass', '#1e2b24', 'farmland', '#222b25', 'sand', '#2a2a22', 'ice', '#2a3038', '#1d2722'], 'fill-opacity': .7 } }),
    L({ id: 'vb-landuse', type: 'fill', 'source-layer': 'landuse', paint: { 'fill-color': ['match', ['get', 'class'], 'residential', '#20262d', 'commercial', '#242a32', 'industrial', '#242a32', 'cemetery', '#1e2a26', 'hospital', '#26292f', 'school', '#26292f', '#20262d'], 'fill-opacity': .8 } }),
    L({ id: 'vb-park', type: 'fill', 'source-layer': 'park', paint: { 'fill-color': '#1c2b23', 'fill-opacity': .8 } }),
    L({ id: 'vb-water', type: 'fill', 'source-layer': 'water', paint: { 'fill-color': '#142231' } }),
    L({ id: 'vb-waterway', type: 'line', 'source-layer': 'waterway', paint: { 'line-color': '#1b2f42', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, .5, 16, 2] } }),
    L({ id: 'vb-rail', type: 'line', 'source-layer': 'transportation', minzoom: 10, filter: ['all', road, ['==', ['get', 'class'], 'rail']], paint: { 'line-color': '#3a434f', 'line-width': .8, 'line-dasharray': [3, 2] } }),
    L({ id: 'vb-road-minor', type: 'line', 'source-layer': 'transportation', minzoom: 12, filter: ['all', road, ['in', ['get', 'class'], ['literal', ['minor', 'service', 'track', 'path', 'busway']]]],
      layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#363f4b', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, .3, 15, 1.4, 18, 6] } }),
    L({ id: 'vb-road-major', type: 'line', 'source-layer': 'transportation', filter: ['all', road, ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]]],
      layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['match', ['get', 'class'], 'motorway', '#6a7585', 'trunk', '#65707f', 'primary', '#5a6574', '#4d5866'], 'line-width': ['interpolate', ['linear'], ['zoom'], 8, .5, 12, 1.6, 15, 3.5, 18, 12] } })
  ];
}
function ofmLabelLayers() {   // подписи улиц и населённых пунктов (русские названия, если есть)
  const halo = { 'text-halo-color': '#0f1318', 'text-halo-width': 1.6 };
  return [
    { id: 'vb-road-label', type: 'symbol', source: 'ofm', 'source-layer': 'transportation_name', minzoom: 14, layout: { 'symbol-placement': 'line', 'text-field': NAME_RU, 'text-font': ['Noto Sans Regular'], 'text-size': 11 }, paint: { 'text-color': '#aab4c0', ...halo } },
    { id: 'vb-place-small', type: 'symbol', source: 'ofm', 'source-layer': 'place', minzoom: 11, filter: ['in', ['get', 'class'], ['literal', ['suburb', 'village', 'neighbourhood', 'quarter', 'hamlet', 'isolated_dwelling']]],
      layout: { 'text-field': NAME_RU, 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-max-width': 8 }, paint: { 'text-color': '#8e99a8', ...halo } },
    { id: 'vb-place-big', type: 'symbol', source: 'ofm', 'source-layer': 'place', minzoom: 4, filter: ['in', ['get', 'class'], ['literal', ['city', 'town']]],
      layout: { 'text-field': NAME_RU, 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 6, 12, 14, 18] }, paint: { 'text-color': '#d4dbe4', ...halo } }
  ];
}
// Готовый тёмный стиль для небольших карт (админка)
function ofmDarkStyle() { return { version: 8, glyphs: OFM_GLYPHS, sources: { ofm: OFM_SOURCE }, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#161b22' } }, ...ofmGroundLayers(), ...ofmLabelLayers()] }; }
