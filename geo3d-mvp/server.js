// 3D Караганда — MVP. Без зависимостей: только Node.js.
// Запуск: node server.js   (PORT, ADMIN_PASSWORD — переменные окружения)
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const PORT = +process.env.PORT || 8095;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';   // ПОМЕНЯЙТЕ перед публикацией
const PRICE = 15000;                                            // ₸ за отчёт по участку
const MAX_SELL_DISTANCE = 600;                                  // м до ближайшей скважины, дальше отчёт не продаём
const DATA = path.join(__dirname, 'data');
const PUBLIC = path.join(__dirname, 'public');
const BH_FILE = path.join(DATA, 'boreholes.json');
const ORD_FILE = path.join(DATA, 'orders.json');

/* ---------- хранилище (JSON-файлы; для роста заменить на PostgreSQL/PostGIS) ---------- */
function load(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function save(file, obj) { fs.mkdirSync(DATA, { recursive: true }); const t = file + '.tmp'; fs.writeFileSync(t, JSON.stringify(obj, null, 1)); fs.renameSync(t, file); }

/* ---------- геометрия ---------- */
const C = { lat: 49.806, lng: 73.085 };
const BBOX = { minLat: 49.6, maxLat: 50.0, minLng: 72.9, maxLng: 73.3 };   // допустимая область (Караганда)
const kx = lat => 111320 * Math.cos(lat * Math.PI / 180), KY = 110574;
const DEPTH = 12;

/* ---------- демо-данные (случайные, не реальные) ---------- */
function seedDemo() {
  let s = 20261124;
  const rnd = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const model = (x, y) => {
    const n = () => (rnd() - .5) * .3;
    const t = [Math.max(.3, .5 + .25 * Math.sin(x / 250 + 1) * Math.cos(y / 300) + n()), Math.max(.5, 2.4 + 1.1 * Math.sin(y / 200) + .7 * Math.cos(x / 350) + n()),
      Math.max(.5, 3 + 1.4 * Math.cos(x / 280 + y / 320) + n()), Math.max(.5, 2 + .9 * Math.sin((x + y) / 260) + n())];
    const cap = [9, 9.8, 10.4, 11]; const b = []; let acc = 0;
    for (let i = 0; i < 4; i++) { acc += t[i]; let v = Math.min(acc, cap[i]); if (i) v = Math.max(v, b[i - 1] + .3); b.push(+v.toFixed(2)); }
    return { b, gw: +Math.min(b[2], Math.max(1.2, 4.2 + 1.6 * Math.sin(x / 420) + .5 * Math.cos(y / 300) + n())).toFixed(2) };
  };
  const out = [];
  while (out.length < 30) {
    const x = (rnd() - .5) * 920, y = (rnd() - .5) * 920;
    if (out.every(p => Math.hypot(p.x - x, p.y - y) > 110)) {
      const m = model(x, y);
      out.push({ id: 'DEMO-' + String(out.length + 1).padStart(2, '0'), x, y, lng: +(C.lng + x / kx(C.lat)).toFixed(6), lat: +(C.lat + y / KY).toFixed(6), gw: m.gw, b: m.b, verified: true, source: 'demo' });
    }
  }
  return out.map(({ x, y, ...r }) => r);
}

let boreholes = load(BH_FILE, null);
if (!boreholes) { boreholes = seedDemo(); save(BH_FILE, boreholes); }
let orders = load(ORD_FILE, []);

/* ---------- события, заявки, аналитика ---------- */
const EV_FILE = path.join(DATA, 'events.jsonl');
const LEAD_FILE = path.join(DATA, 'leads.json');
let leads = load(LEAD_FILE, []);
let events = [];
try { events = fs.readFileSync(EV_FILE, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch { /* файла ещё нет */ }
function track(type, sid, extra) {
  const e = { t: Date.now(), type, sid: String(sid || 'anon').replace(/[^\w\-]/g, '').slice(0, 40), ...extra };
  events.push(e); fs.mkdirSync(DATA, { recursive: true }); fs.appendFileSync(EV_FILE, JSON.stringify(e) + '\n');
}
const CLIENT_EVENTS = new Set(['visit', 'buy_click', 'survey_click', 'block_view', 'section_view', 'print']);
const dayKey = t => new Date(t + 5 * 36e5).toISOString().slice(0, 10);   // сутки по времени Казахстана (UTC+5)

function analytics(days) {
  const since = Date.now() - days * 864e5, ev = events.filter(e => e.t >= since);
  const uniq = (type, list = ev) => new Set(list.filter(e => e.type === type).map(e => e.sid)).size;
  const steps = [['Визиты', 'visit'], ['Кликнули по участку', 'point_click'], ['Нажали «Купить»', 'buy_click'], ['Создали заказ', 'order_created'], ['Оплатили', 'paid']]
    .map(([name, type]) => ({ name, type, n: uniq(type) }));
  const paid = orders.filter(o => o.status === 'paid' && new Date(o.paidAt).getTime() >= since);
  const revenue = paid.reduce((s, o) => s + o.price, 0);
  const clicks = ev.filter(e => e.type === 'point_click'), noData = clicks.filter(e => !e.avail);
  const leadsN = leads.filter(l => new Date(l.created).getTime() >= since).length;
  const daily = [];
  for (let d = days - 1; d >= 0; d--) {
    const k = dayKey(Date.now() - d * 864e5), dayEv = ev.filter(e => dayKey(e.t) === k);
    const po = paid.filter(o => dayKey(new Date(o.paidAt).getTime()) === k);
    daily.push({ day: k, visits: uniq('visit', dayEv), orders: po.length, revenue: po.reduce((s, o) => s + o.price, 0), leads: leads.filter(l => dayKey(new Date(l.created).getTime()) === k).length });
  }
  const cells = new Map();
  for (const e of clicks) {
    if (!Number.isFinite(e.lng)) continue;
    const key = Math.round(e.lng / 0.003) + ':' + Math.round(e.lat / 0.003); let c = cells.get(key);
    if (!c) cells.set(key, c = { n: 0, na: 0, lng: 0, lat: 0 });
    c.n++; if (!e.avail) c.na++; c.lng += e.lng; c.lat += e.lat;
  }
  const map = [...cells.values()].map(c => ({ lng: +(c.lng / c.n).toFixed(5), lat: +(c.lat / c.n).toFixed(5), n: c.n, noData: c.na / c.n }));
  const hot = map.filter(c => c.noData > 0.5).sort((a, b) => b.n - a.n).slice(0, 10);
  const verified = boreholes.filter(b => b.verified).length;
  return { days, steps, revenue, paidCount: paid.length, avgCheck: paid.length ? Math.round(revenue / paid.length) : 0, clicks: clicks.length, noDataShare: clicks.length ? noData.length / clicks.length : 0,
    avgDmin: clicks.length ? Math.round(clicks.reduce((s, e) => s + (e.dmin || 0), 0) / clicks.length) : 0, leads: leadsN, newLeads: leads.filter(l => l.status === 'new').length,
    conversion: steps[0].n ? paid.length / steps[0].n : 0, daily, map, hot, boreholes: verified,
    hasDemo: events.some(e => e.demo) || orders.some(o => o.demo) || leads.some(l => l.demo) };
}

function seedAnalytics() {
  let s = 777; const rnd = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const hotZones = [[73.125, 49.780], [73.062, 49.842], [73.150, 49.822]];
  const ev = (type, sid, t, x) => events.push({ t: Math.round(t), type, sid, demo: true, ...x });
  let n = 0;
  for (let d = 29; d >= 0; d--) {
    const dow = new Date(Date.now() - d * 864e5).getDay(), visits = Math.round((20 + rnd() * 22) * (dow === 0 || dow === 6 ? .7 : 1) * (1 + (29 - d) / 55));
    for (let v = 0; v < visits; v++) {
      const sid = `demo${d}-${v}`; let t = Date.now() - d * 864e5 - rnd() * 8e7; ev('visit', sid, t);
      if (rnd() > .72) continue;
      let got = null, miss = null;
      for (let c = 1 + Math.floor(rnd() * 3); c > 0; c--) {
        const hot = rnd() < .3, hz = hotZones[Math.floor(rnd() * 3)];
        const lng = hot ? hz[0] + (rnd() - .5) * .012 : C.lng + (rnd() - .5) * .018, lat = hot ? hz[1] + (rnd() - .5) * .008 : C.lat + (rnd() - .5) * .012;
        const q = interp(lng, lat); t += 20000; ev('point_click', sid, t, { lng: +lng.toFixed(4), lat: +lat.toFixed(4), avail: q.dmin <= MAX_SELL_DISTANCE, dmin: q.dmin });
        if (q.dmin <= MAX_SELL_DISTANCE) got = got || { lng, lat }; else miss = miss || { lng, lat };
      }
      if (got && rnd() < .38) {
        t += 30000; ev('buy_click', sid, t, { lng: got.lng, lat: got.lat });
        if (rnd() < .55) {
          t += 40000; const id = 'demo' + crypto.randomBytes(8).toString('hex'); ev('order_created', sid, t, { orderId: id });
          if (rnd() < .82) {
            t += 20000; ev('paid', sid, t, { orderId: id, price: PRICE }); ev('report_view', sid, t + 5000, { orderId: id });
            if (rnd() < .6) ev('block_view', sid, t + 15000);
            orders.push({ id, lng: got.lng, lat: got.lat, email: 'demo@example.com', price: PRICE, status: 'paid', created: new Date(t - 60000).toISOString(), paidAt: new Date(t).toISOString(), demo: true });
          } else orders.push({ id, lng: got.lng, lat: got.lat, email: 'demo@example.com', price: PRICE, status: 'pending', created: new Date(t).toISOString(), demo: true });
        }
      }
      if (miss && rnd() < .14) {
        t += 25000; ev('survey_click', sid, t, { lng: miss.lng, lat: miss.lat });
        if (rnd() < .65) { leads.push({ id: 'demo' + crypto.randomBytes(6).toString('hex'), created: new Date(t + 30000).toISOString(), name: 'Демо-клиент', phone: '+7 700 000 00 00', comment: 'Нужны изыскания под ИЖС', lng: miss.lng, lat: miss.lat, status: rnd() < .5 ? 'new' : 'work', demo: true }); }
      }
      n++;
    }
  }
  events.sort((a, b) => a.t - b.t); fs.writeFileSync(EV_FILE, events.map(e => JSON.stringify(e)).join('\n') + '\n'); save(ORD_FILE, orders); save(LEAD_FILE, leads);
  return n;
}
function deleteDemoAnalytics() {
  events = events.filter(e => !e.demo); orders = orders.filter(o => !o.demo); leads = leads.filter(l => !l.demo);
  fs.writeFileSync(EV_FILE, events.map(e => JSON.stringify(e)).join('\n') + (events.length ? '\n' : '')); save(ORD_FILE, orders); save(LEAD_FILE, leads);
}

/* ---------- интерполяция (IDW по 6 ближайшим проверенным скважинам) ---------- */
function interp(lng, lat) {
  const pts = boreholes.filter(p => p.verified);
  if (!pts.length) return null;
  const k = kx(lat);
  const arr = pts.map(p => ({ p, d: Math.hypot((p.lng - lng) * k, (p.lat - lat) * KY) })).sort((a, b) => a.d - b.d);
  const nn = arr.slice(0, 6); let ws = 0, gw = 0; const b = [0, 0, 0, 0];
  for (const { p, d } of nn) { const w = 1 / (d * d + 25); ws += w; for (let i = 0; i < 4; i++) b[i] += p.b[i] * w; gw += p.gw * w; }
  return { b: b.map(v => +(v / ws).toFixed(2)), gw: +(gw / ws).toFixed(2), dmin: Math.round(arr[0].d), near: arr[0].p.id };
}
const confidence = d => d < 120 ? 'high' : d < 300 ? 'medium' : 'low';

function buildReport(lng, lat) {
  const v = interp(lng, lat); if (!v) return null;
  const k = kx(lat), step = 25, n = 11, half = (n - 1) / 2;
  const cells = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const c = interp(lng + (i - half) * step / k, lat + (j - half) * step / KY); cells.push({ i, j, b: c.b });
  }
  const L = 400, ns = 40, sec = [];
  for (let s = 0; s <= ns; s++) { const dx = (-L / 2 + L * s / ns); const c = interp(lng + dx / k, lat); sec.push({ b: c.b, gw: c.gw }); }
  return { point: { lng, lat }, b: v.b, gw: v.gw, near: v.near, dmin: v.dmin, confidence: confidence(v.dmin),
    section: { length: L, samples: sec }, block: { step, n, cells }, generated: new Date().toISOString() };
}

/* ---------- проверка данных ---------- */
function validateBH(o) {
  if (!o || typeof o.id !== 'string' || !/^[\w\-.А-Яа-я ]{1,40}$/.test(o.id)) return 'Некорректный ID (до 40 символов)';
  const lng = +o.lng, lat = +o.lat, gw = +o.gw;
  if (![lng, lat, gw].every(Number.isFinite)) return 'Координаты и УГВ должны быть числами';
  if (lat < BBOX.minLat || lat > BBOX.maxLat || lng < BBOX.minLng || lng > BBOX.maxLng) return 'Координаты вне области Караганды';
  if (gw < 0 || gw > DEPTH) return `УГВ должен быть от 0 до ${DEPTH} м`;
  if (!Array.isArray(o.b) || o.b.length !== 4) return 'Нужно 4 значения подошвы слоёв (b1–b4)';
  const b = o.b.map(Number);
  if (!b.every(Number.isFinite)) return 'Подошвы слоёв должны быть числами';
  for (let i = 0; i < 4; i++) { if (b[i] <= 0 || b[i] > DEPTH) return `b${i + 1} должен быть в пределах 0–${DEPTH} м`; if (i && b[i] <= b[i - 1]) return 'Подошвы слоёв должны строго возрастать (b1<b2<b3<b4)'; }
  return null;
}
const normBH = (o, source) => ({ id: o.id.trim(), lng: +o.lng, lat: +o.lat, gw: +o.gw, b: o.b.map(Number), verified: o.verified !== false, source: source || 'admin' });

function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (lines.length < 2) return { rows: [], errors: ['Пустой файл'] };
  const sep = lines[0].includes(';') ? ';' : ',';
  const head = lines[0].split(sep).map(s => s.trim().toLowerCase());
  const need = ['id', 'lng', 'lat', 'gw', 'b1', 'b2', 'b3', 'b4'];
  const miss = need.filter(c => !head.includes(c)); if (miss.length) return { rows: [], errors: ['Нет колонок: ' + miss.join(', ')] };
  const rows = [], errors = [];
  lines.slice(1).forEach((ln, idx) => {
    const cells = ln.split(sep).map(s => s.trim().replace(',', sep === ';' ? '.' : ','));
    const g = c => cells[head.indexOf(c)];
    const o = { id: g('id'), lng: g('lng'), lat: g('lat'), gw: g('gw'), b: ['b1', 'b2', 'b3', 'b4'].map(g) };
    const err = validateBH(o); if (err) errors.push(`Строка ${idx + 2}: ${err}`); else rows.push(normBH(o, 'import'));
  });
  return { rows, errors };
}

/* ---------- HTTP ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.csv': 'text/csv; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
function body(req) { return new Promise((ok, no) => { let d = ''; req.on('data', c => { d += c; if (d.length > 2e6) { no(new Error('too large')); req.destroy(); } }); req.on('end', () => ok(d)); req.on('error', no); }); }
const isAdmin = req => { const a = Buffer.from(String(req.headers['x-admin-password'] || '')), b = Buffer.from(ADMIN_PASSWORD); return a.length === b.length && crypto.timingSafeEqual(a, b); };

async function api(req, res, url) {
  const p = url.pathname, m = req.method, q = url.searchParams;
  // --- публичные ---
  if (m === 'GET' && p === '/api/config') return send(res, 200, { price: PRICE, depth: DEPTH, maxSellDistance: MAX_SELL_DISTANCE });
  if (m === 'GET' && p === '/api/boreholes') return send(res, 200, boreholes.filter(b => b.verified).map(b => ({ id: b.id, lng: b.lng, lat: b.lat })));   // слои наружу не отдаём
  if (m === 'GET' && p === '/api/point') {
    const lng = +q.get('lng'), lat = +q.get('lat'); if (!Number.isFinite(lng) || !Number.isFinite(lat)) return send(res, 400, { error: 'lng/lat' });
    const v = interp(lng, lat); if (!v) return send(res, 200, { available: false });
    track('point_click', req.headers['x-sid'], { lng: +lng.toFixed(4), lat: +lat.toFixed(4), avail: v.dmin <= MAX_SELL_DISTANCE, dmin: v.dmin });
    return send(res, 200,{ available: v.dmin <= MAX_SELL_DISTANCE, gw: v.gw, near: v.near, dmin: v.dmin, confidence: confidence(v.dmin), price: PRICE });
  }
  if (m === 'POST' && p === '/api/orders') {
    const o = JSON.parse(await body(req) || '{}'); const lng = +o.lng, lat = +o.lat;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return send(res, 400, { error: 'Нет координат' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(o.email || ''))) return send(res, 400, { error: 'Укажите корректный email' });
    const v = interp(lng, lat); if (!v || v.dmin > MAX_SELL_DISTANCE) return send(res, 422, { error: 'Рядом нет данных. Закажите инженерные изыскания на участке.' });
    const ord = { id: crypto.randomBytes(12).toString('hex'), lng, lat, email: String(o.email).slice(0, 120), price: PRICE, status: 'pending', created: new Date().toISOString() };
    orders.push(ord); save(ORD_FILE, orders); track('order_created', req.headers['x-sid'], { orderId: ord.id });
    return send(res, 201, { orderId: ord.id, price: PRICE });
  }
  if (m === 'POST' && p === '/api/track') {
    const o = JSON.parse(await body(req) || '{}'); if (!CLIENT_EVENTS.has(o.type)) return send(res, 400, { error: 'type' });
    const x = {}; if (Number.isFinite(+o.lng) && Number.isFinite(+o.lat)) { x.lng = +(+o.lng).toFixed(4); x.lat = +(+o.lat).toFixed(4); }
    track(o.type, req.headers['x-sid'], x); return send(res, 200, { ok: true });
  }
  if (m === 'POST' && p === '/api/leads') {   // заявка на изыскания
    const o = JSON.parse(await body(req) || '{}'); const name = String(o.name || '').trim().slice(0, 80), phone = String(o.phone || '').trim();
    if (!name) return send(res, 400, { error: 'Укажите имя' });
    if (!/^[+\d][\d\s()\-]{6,20}$/.test(phone)) return send(res, 400, { error: 'Укажите телефон, например +7 701 123 45 67' });
    const lng = +o.lng, lat = +o.lat;
    const lead = { id: crypto.randomBytes(8).toString('hex'), created: new Date().toISOString(), name, phone, comment: String(o.comment || '').trim().slice(0, 500),
      lng: Number.isFinite(lng) ? +lng.toFixed(5) : null, lat: Number.isFinite(lat) ? +lat.toFixed(5) : null, status: 'new' };
    leads.push(lead); save(LEAD_FILE, leads); track('lead', req.headers['x-sid'], { lng: lead.lng, lat: lead.lat });
    return send(res, 201, { ok: true });
  }
  let r;
  if (m === 'POST' && (r = p.match(/^\/api\/orders\/(\w+)\/pay$/))) {   // ДЕМО-оплата. В боевой версии: webhook Kaspi/Halyk/Freedom Pay
    const ord = orders.find(x => x.id === r[1]); if (!ord) return send(res, 404, { error: 'Заказ не найден' });
    if (ord.status !== 'paid') { ord.status = 'paid'; ord.paidAt = new Date().toISOString(); save(ORD_FILE, orders); track('paid', req.headers['x-sid'], { orderId: ord.id, price: ord.price }); }
    return send(res, 200, { token: ord.id });
  }
  if (m === 'GET' && (r = p.match(/^\/api\/report\/(\w+)$/))) {
    const ord = orders.find(x => x.id === r[1]); if (!ord || ord.status !== 'paid') return send(res, 402, { error: 'Отчёт не оплачен' });
    const rep = buildReport(ord.lng, ord.lat); if (!rep) return send(res, 404, { error: 'Нет данных' });
    track('report_view', req.headers['x-sid'], { orderId: ord.id });
    return send(res, 200, { ...rep, orderId: ord.id, paidAt: ord.paidAt });
  }
  // --- админка ---
  if (p.startsWith('/api/admin/')) {
    if (!isAdmin(req)) return send(res, 401, { error: 'Неверный пароль' });
    if (m === 'GET' && p === '/api/admin/boreholes') return send(res, 200, boreholes);
    if (m === 'GET' && p === '/api/admin/orders') return send(res, 200, orders.slice().reverse());
    if (m === 'POST' && p === '/api/admin/boreholes') {
      const o = JSON.parse(await body(req) || '{}'); const err = validateBH(o); if (err) return send(res, 400, { error: err });
      const nb = normBH(o, 'admin'); const i = boreholes.findIndex(x => x.id === nb.id); if (i >= 0) boreholes[i] = nb; else boreholes.push(nb);
      save(BH_FILE, boreholes); return send(res, 200, { ok: true, updated: i >= 0 });
    }
    if (m === 'POST' && p === '/api/admin/import') {
      const { rows, errors } = parseCSV(String(JSON.parse(await body(req) || '{}').csv || ''));
      if (errors.length) return send(res, 400, { error: errors.slice(0, 10).join('\n'), errors: errors.length });   // всё или ничего
      let added = 0, updated = 0; for (const nb of rows) { const i = boreholes.findIndex(x => x.id === nb.id); if (i >= 0) { boreholes[i] = nb; updated++; } else { boreholes.push(nb); added++; } }
      save(BH_FILE, boreholes); return send(res, 200, { added, updated });
    }
    if (m === 'POST' && p === '/api/admin/verify') {
      const o = JSON.parse(await body(req) || '{}'); const b = boreholes.find(x => x.id === o.id); if (!b) return send(res, 404, { error: 'Не найдено' });
      b.verified = !!o.verified; save(BH_FILE, boreholes); return send(res, 200, { ok: true });
    }
    if (m === 'DELETE' && (r = p.match(/^\/api\/admin\/boreholes\/(.+)$/))) {
      const id = decodeURIComponent(r[1]); const n = boreholes.length; boreholes = boreholes.filter(x => x.id !== id); save(BH_FILE, boreholes); return send(res, 200, { deleted: n - boreholes.length });
    }
    if (m === 'GET' && p === '/api/admin/analytics') return send(res, 200, analytics(Math.min(180, Math.max(1, +q.get('days') || 30))));
    if (m === 'GET' && p === '/api/admin/leads') return send(res, 200, leads.slice().reverse());
    if (m === 'POST' && p === '/api/admin/lead-status') {
      const o = JSON.parse(await body(req) || '{}'); const l = leads.find(x => x.id === o.id); if (!l || !['new', 'work', 'done'].includes(o.status)) return send(res, 400, { error: 'Некорректно' });
      l.status = o.status; save(LEAD_FILE, leads); return send(res, 200, { ok: true });
    }
    if (m === 'POST' && p === '/api/admin/seed-analytics') { if (events.some(e => e.demo)) return send(res, 400, { error: 'Демо-аналитика уже загружена' }); return send(res, 200, { visitors: seedAnalytics() }); }
    if (m === 'POST' && p === '/api/admin/delete-demo-analytics') { deleteDemoAnalytics(); return send(res, 200, { ok: true }); }
    if (m === 'POST' && p === '/api/admin/delete-demo') { const n = boreholes.length; boreholes = boreholes.filter(x => x.source !== 'demo'); save(BH_FILE, boreholes); return send(res, 200, { deleted: n - boreholes.length }); }
  }
  return send(res, 404, { error: 'Not found' });
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname); if (rel === '/') rel = '/index.html'; if (rel === '/admin') rel = '/admin.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Не найдено'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }); res.end(data);
  });
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    serveStatic(req, res, url);
  } catch (e) { console.error(e); if (!res.headersSent) send(res, 500, { error: 'Ошибка сервера' }); }
}).listen(PORT, () => console.log(`3D Караганда MVP: http://localhost:${PORT}   админка: /admin (пароль: ${ADMIN_PASSWORD === 'admin' ? 'admin — смените!' : 'из ADMIN_PASSWORD'})`));
