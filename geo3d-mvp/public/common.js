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
