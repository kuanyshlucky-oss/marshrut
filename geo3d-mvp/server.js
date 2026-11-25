// 3D Караганда — MVP. Без зависимостей: только Node.js.
// Запуск: node server.js   (PORT, ADMIN_PASSWORD — переменные окружения)
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');

// Настройки: переменные окружения или файл .env рядом с server.js (см. .env.example)
try { for (const l of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } } catch { /* .env необязателен */ }
if (process.argv.includes('--demo')) process.env.PAYMENT_MODE = 'demo';

const PORT = +process.env.PORT || 8095;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';   // ПОМЕНЯЙТЕ перед публикацией
// Оплата: off (по умолчанию, заказы не создаются) | demo (запуск с --demo, «оплата» без денег) | live (платёжный провайдер + вебхук)
// free — пробный период: отчёты выдаются сразу, без оплаты и email (по умолчанию, пока не подключена оплата); off — отчёты не выдаются; demo — «оплата» без денег; live — боевая
const PAYMENT_MODE = ['off', 'free', 'demo', 'live'].includes(process.env.PAYMENT_MODE) ? process.env.PAYMENT_MODE : 'free';
const PAYMENT_URL_TEMPLATE = process.env.PAYMENT_URL_TEMPLATE || '';   // например https://pay.provider.kz/checkout?order={orderId}&amount={amount}&return={returnUrl}
const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || '';
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 8095}`).replace(/\/$/, '');
const TRUST_PROXY = process.env.TRUST_PROXY === '1';           // 1 — если сервер стоит за nginx/Caddy (берём IP из X-Forwarded-For)
if (PAYMENT_MODE === 'live' && (ADMIN_PASSWORD === 'admin' || !WEBHOOK_SECRET || !PAYMENT_URL_TEMPLATE)) {
  console.error('Боевой режим оплаты требует: ADMIN_PASSWORD (не «admin»), PAYMENT_WEBHOOK_SECRET и PAYMENT_URL_TEMPLATE.'); process.exit(1);
}
const PRICE = 15000;                                            // ₸ за отчёт по участку
const MAX_SELL_DISTANCE = 600;                                  // м до ближайшей скважины, дальше отчёт не продаём
const PUBLIC = path.join(__dirname, 'public');

/* ---------- хранилище: всё через db.js (сейчас JSON-файлы; для роста заменить реализацию на PostgreSQL/PostGIS) ---------- */
const db = require('./db');
const { load, save } = db;
const BH_FILE = 'boreholes', ORD_FILE = 'orders';   // имена коллекций в db.js

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

/* =====================================================================
   СКВАЖИНЫ v2: паспорт, слои, справочник грунтов, автопроверки, очередь проверки.
   Пороги в CHECKS ориентировочные — согласовать с геологом.
   ===================================================================== */
const clean = (s, max) => String(s ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max);   // убираем < > и управляющие символы из всего, что пришло снаружи
const SOIL_CLASSES = ['Почвенно-растительный слой', 'Суглинок', 'Глина', 'Песок с гравием', 'Скальный грунт'];   // классы упрощённой модели (по порядку залегания)
const SOIL_FILE = 'soilDict';
const DEFAULT_SOIL_DICT = [   // сопоставление по ПЕРВОМУ слову названия (основной грунт по ГОСТ 25100); при совпадении побеждает самое длинное начало
  { p: 'почв', cls: 0 }, { p: 'растительн', cls: 0 }, { p: 'чернозем', cls: 0 }, { p: 'насыпн', cls: 0 }, { p: 'техноген', cls: 0 },
  { p: 'суглин', cls: 1 }, { p: 'супес', cls: 1 }, { p: 'лесс', cls: 1 },
  { p: 'глин', cls: 2 },
  { p: 'песок', cls: 3 }, { p: 'песч', cls: 3 }, { p: 'гравий', cls: 3 }, { p: 'гравел', cls: 3 }, { p: 'галеч', cls: 3 }, { p: 'щебен', cls: 3 }, { p: 'дресв', cls: 3 },
  { p: 'песчаник', cls: 4 }, { p: 'скальн', cls: 4 }, { p: 'известняк', cls: 4 }, { p: 'гранит', cls: 4 }, { p: 'сланец', cls: 4 }, { p: 'алевролит', cls: 4 }, { p: 'аргиллит', cls: 4 }, { p: 'выветрел', cls: 4 }
];
let soilDict = load(SOIL_FILE, null) || DEFAULT_SOIL_DICT;
const CHECKS = {
  zMin: 300, zMax: 900, zWarn: [480, 650],      // отметка устья, м: вне [zMin,zMax] — ошибка, вне zWarn — предупреждение
  gapTol: 0.05, depthTol: 0.1, maxDepth: 100,   // допуски по слоям и глубине, м
  dupDist: 2,                                   // м: две скважины ближе — возможный дубль
  maxAgeYears: 10,                              // старше — предупреждение
  minDepth: 12,                                 // глубина модели: мельче — нижние слои достраиваются
  nbRadius: 300, nbMin: 3, nbDev: { b: [0.8, 2.0, 2.5, 3.0], gw: 2.0 },   // сверка с соседями: радиус, мин. число соседей, допустимые отклонения границ слоёв и УГВ, м
  zNbRadius: 250, zNbMin: 2, zNbDev: 1.5        // сверка отметки устья с соседями: радиус, мин. число соседей, допуск, м
};
const ACC_W = { A: 1, B: 0.7, C: 0.3 };         // вес скважины в модели по классу точности координат (D в модель не допускается)
const ACC_RU = { A: 'RTK / тахеометр (до ~0,1 м)', B: 'GNSS (1–3 м)', C: 'по схеме или привязке (десятки метров)', D: 'координаты не подтверждены' };

const normSoil = s => String(s ?? '').toLowerCase().replace(/ё/g, 'е').trim();
function classify(soil) {
  const tok = (normSoil(soil).match(/^[а-яa-z\-]+/) || [''])[0]; let best = null;
  for (const e of soilDict) { const p = normSoil(e.p); if (p && tok.startsWith(p) && (!best || p.length > best.p.length)) best = { p, cls: e.cls }; }
  return best ? best.cls : null;
}
function parseDate(s) {   // ГГГГ-ММ-ДД или ДД.ММ.ГГГГ → ГГГГ-ММ-ДД; иначе null
  s = String(s ?? '').trim(); if (!s) return null; let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) { /* ok */ } else if ((m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/))) m = [0, m[3], m[2], m[1]]; else return undefined;
  const iso = `${m[1]}-${m[2]}-${m[3]}`; return Number.isNaN(new Date(iso).getTime()) ? undefined : iso;   // undefined — формат неверный
}
function deriveModel(bh) {   // упрощённая модель для интерполяции: 4 подошвы классов и УГВ
  const L = (bh.layers || []).slice().sort((a, b) => a.from - b.from);
  if (!L.length || L.some(l => l.cls == null || !Number.isFinite(l.to))) { bh.b = null; bh.gw = null; return; }
  const b = []; for (let k = 0; k < 4; k++) { let m = 0; for (const l of L) if (l.cls <= k) m = Math.max(m, l.to); b.push(Math.min(DEPTH, Math.max(m, b[k - 1] || 0))); }
  bh.b = b.map(v => +v.toFixed(2));
  const g = Number.isFinite(bh.gw_stable) ? bh.gw_stable : Number.isFinite(bh.gw_first) ? bh.gw_first : DEPTH;   // вода не указана → «глубже модели»
  bh.gw = +Math.min(DEPTH, g).toFixed(2);
}
function makeBH(f) {   // единая форма записи скважины
  const L = (f.layers || []).map(l => ({ from: +l.from, to: +l.to, soil: clean(l.soil, 80), cls: l.cls == null ? null : +l.cls, cls_src: l.cls_src || 'dict', ige: l.ige == null || l.ige === '' ? null : clean(l.ige, 20) }));
  const last = L.length ? Math.max(...L.map(l => l.to)) : null;
  const bh = { id: f.id, report_id: clean(f.report_id, 60), lng: +f.lng, lat: +f.lat, crs_src: clean(f.crs_src, 40), acc: ['A', 'B', 'C', 'D'].includes(f.acc) ? f.acc : 'D', z: f.z == null || f.z === '' ? null : +f.z, z_src: clean(f.z_src, 40),
    date: f.date ?? null, depth: f.depth == null || f.depth === '' ? last : +f.depth, method: clean(f.method, 40), org: clean(f.org, 80), doc: clean(f.doc, 120), layers: L,
    gw_first: f.gw_first == null || f.gw_first === '' ? null : +f.gw_first, gw_stable: f.gw_stable == null || f.gw_stable === '' ? null : +f.gw_stable, gw_date: f.gw_date ?? null,
    bearing_kpa: f.bearing_kpa == null || f.bearing_kpa === '' ? null : +f.bearing_kpa, aggressive: clean(f.aggressive, 60),
    status: f.status || 'review', verified: false, issues: [], review: null, source: f.source || 'admin', _incons: f._incons || [], loaded_at: f.loaded_at === undefined ? new Date().toISOString() : f.loaded_at };
  bh.verified = bh.status === 'verified'; return bh;
}
function migrateBH(b) {   // старые записи (id, lng, lat, gw, b[4], verified) → v2
  if (b.layers) return b;
  const bounds = [0, ...b.b, DEPTH], demo = b.source === 'demo';
  const nb = makeBH({ id: b.id, loaded_at: null, lng: b.lng, lat: b.lat, acc: demo ? 'A' : 'B', crs_src: 'WGS84', source: b.source, depth: DEPTH, gw_stable: b.gw,
    z: demo ? +(540 + (b.lng - C.lng) * kx(C.lat) * 0.012 + (b.lat - C.lat) * KY * 0.008).toFixed(2) : null, z_src: demo ? 'демо' : '', date: demo ? '2024-06-15' : null,
    org: demo ? 'Демо' : '', doc: demo ? 'DEMO' : '', method: demo ? 'шнековое' : '', status: b.verified === false ? 'review' : 'verified',
    layers: SOIL_CLASSES.map((name, i) => ({ from: bounds[i], to: bounds[i + 1], soil: name, cls: i, cls_src: 'file' })) });
  nb.b = b.b; nb.gw = b.gw; return nb;   // модель сохраняем как была
}
function predictFrom(lng, lat, excludeId, radius, minN = CHECKS.nbMin) {   // что «ожидают» проверенные соседи
  const k = kx(lat), nn = boreholes.filter(p => p.verified && p.id !== excludeId && p.b).map(p => ({ p, d: Math.hypot((p.lng - lng) * k, (p.lat - lat) * KY) })).filter(x => x.d <= radius);
  if (nn.length < minN) return null;
  let ws = 0, gw = 0, z = 0, zok = true; const b = [0, 0, 0, 0];
  for (const { p, d } of nn) { const w = 1 / (d * d + 25); ws += w; for (let i = 0; i < 4; i++) b[i] += p.b[i] * w; gw += p.gw * w; if (Number.isFinite(p.z)) z += p.z * w; else zok = false; }
  return { b: b.map(v => v / ws), gw: gw / ws, z: zok ? z / ws : null, n: nn.length };
}

/* --- автопроверки: error — блокирует «проверена»; warn — нужна заметка геолога --- */
function runChecks(bh) {
  const I = [], E = (code, text) => I.push({ sev: 'error', code, text }), W = (code, text) => I.push({ sev: 'warn', code, text }), f1 = v => (+v).toFixed(1).replace('.', ',');
  for (const t of bh._incons || []) E('E_INCONSISTENT', t);
  // координаты и точность
  if (![bh.lng, bh.lat].every(Number.isFinite) || bh.lat < BBOX.minLat || bh.lat > BBOX.maxLat || bh.lng < BBOX.minLng || bh.lng > BBOX.maxLng) E('E_COORD', 'Координаты некорректны или вне области Караганды (нужна система WGS84: долгота, широта).');
  if (bh.acc === 'D') E('E_ACC', 'Класс точности D (координаты не подтверждены) — такая скважина не может участвовать в модели. Укажите класс A, B или C.');
  else if (bh.acc === 'C') W('W_ACC_C', 'Класс C: координаты по схеме, погрешность десятки метров — вес скважины в модели снижен.');
  // отметка устья
  if (bh.z == null) W('W_NO_Z', 'Не указана отметка устья — нельзя сверить с рельефом и соседями.');
  else if (!Number.isFinite(bh.z) || bh.z < CHECKS.zMin || bh.z > CHECKS.zMax) E('E_Z', `Отметка устья ${bh.z} м вне допустимых пределов ${CHECKS.zMin}–${CHECKS.zMax} м (проверьте единицы и систему высот).`);
  else if (bh.z < CHECKS.zWarn[0] || bh.z > CHECKS.zWarn[1]) W('W_Z_RANGE', `Необычная отметка устья ${bh.z} м для района (ожидается ${CHECKS.zWarn[0]}–${CHECKS.zWarn[1]} м).`);
  // дата
  if (bh.date === undefined || (bh.date && !/^\d{4}-\d{2}-\d{2}$/.test(bh.date))) E('E_DATE', 'Дата бурения не распознана (формат ГГГГ-ММ-ДД или ДД.ММ.ГГГГ).');
  else if (!bh.date) W('W_NO_DATE', 'Не указана дата бурения — нельзя оценить актуальность данных.');
  else { const t = new Date(bh.date).getTime(), age = (Date.now() - t) / (365.25 * 864e5); if (t > Date.now()) E('E_DATE', 'Дата бурения в будущем.'); else if (age > CHECKS.maxAgeYears) W('W_OLD', `Скважине ${Math.floor(age)} лет (старше ${CHECKS.maxAgeYears}): возможна застройка или подсыпка после бурения.`); }
  // слои
  const L = (bh.layers || []).slice().sort((a, b) => a.from - b.from);
  if (!L.length) E('E_LAYERS', 'Нет описания слоёв.');
  else if (L.some(l => !Number.isFinite(l.from) || !Number.isFinite(l.to))) E('E_LAYERS', 'Глубины слоёв должны быть числами.');
  else {
    if (Math.abs(L[0].from) > CHECKS.gapTol) E('E_LAYERS', `Первый слой начинается с ${f1(L[0].from)} м, а не с поверхности (0 м).`);
    L.forEach((l, i) => {
      if (l.to <= l.from) E('E_LAYERS', `Слой ${i + 1} («${l.soil}»): подошва ${f1(l.to)} м не глубже кровли ${f1(l.from)} м.`);
      if (i) { const gap = l.from - L[i - 1].to; if (gap > CHECKS.gapTol) E('E_GAP', `Разрыв ${f1(gap)} м между слоями ${i} и ${i + 1} (${f1(L[i - 1].to)} → ${f1(l.from)} м).`); else if (gap < -CHECKS.gapTol) E('E_OVERLAP', `Слои ${i} и ${i + 1} перекрываются на ${f1(-gap)} м.`); }
      if (l.cls == null) E('E_SOIL', `Грунт «${l.soil}» не сопоставлен с классом модели — добавьте его в справочник грунтов или укажите cls.`);
    });
    const last = L[L.length - 1];
    if (!Number.isFinite(bh.depth) || bh.depth <= 0 || bh.depth > CHECKS.maxDepth) E('E_DEPTH', `Глубина скважины ${bh.depth} м некорректна.`);
    else if (Math.abs(last.to - bh.depth) > CHECKS.depthTol) E('E_DEPTH', `Последний слой заканчивается на ${f1(last.to)} м, а глубина скважины ${f1(bh.depth)} м.`);
    else if (bh.depth < CHECKS.minDepth) W('W_SHALLOW', `Скважина ${f1(bh.depth)} м мельче модели (${CHECKS.minDepth} м): нижние слои модели достраиваются по соседям и скальному грунту — данных на этих глубинах нет.`);
    let inv = false, prev = -1; for (const l of L) { if (l.cls != null) { if (l.cls < prev) inv = true; prev = Math.max(prev, l.cls); } }
    if (inv) W('W_SEQ', 'Порядок слоёв отличается от упрощённой модели (почва → суглинок → глина → песок → скальный): границы в модели будут обобщены, подробный разрез смотрите в первоисточнике.');
    if (L.some(l => normSoil(l.soil).startsWith('насып') || normSoil(l.soil).startsWith('техноген'))) W('W_FILL', 'Есть насыпной/техногенный грунт — в модели он учтён как верхний слой, свойства могут сильно отличаться.');
  }
  // грунтовые воды
  const gs = bh.gw_stable, gf = bh.gw_first;
  if (gs == null && gf == null) W('W_NO_GW', 'Уровень воды не указан: в модели принято «вода глубже 12 м». Подтвердите, что воды не было.');
  if ((gs != null && (!Number.isFinite(gs) || gs < 0 || gs > bh.depth)) || (gf != null && (!Number.isFinite(gf) || gf < 0 || gf > bh.depth))) E('E_GW', 'Уровень воды вне глубины скважины.');
  else if (gs != null && gf != null && gf < gs - 0.05) W('W_GW_ORDER', 'Появившийся уровень воды выше установившегося — обычно наоборот, проверьте значения.');
  if ((gs != null || gf != null) && !bh.gw_date && !bh.date) W('W_NO_GW_DATE', 'Нет даты замера воды — не известен сезон.');
  if (!bh.doc) W('W_NO_DOC', 'Не указан документ-источник (отчёт, журнал бурения): нельзя перепроверить по оригиналу.');
  // дубли
  if (Number.isFinite(bh.lng) && Number.isFinite(bh.lat)) {
    const k = kx(bh.lat), dups = boreholes.filter(p => p.id !== bh.id && Math.hypot((p.lng - bh.lng) * k, (p.lat - bh.lat) * KY) <= CHECKS.dupDist && p.status !== 'rejected').map(p => p.id);
    if (dups.length) W('W_DUP', `Ближе ${CHECKS.dupDist} м есть скважины ${dups.join(', ')} — возможный дубль из другого отчёта.`);
    // сверка с соседями
    const pr = predictFrom(bh.lng, bh.lat, bh.id, CHECKS.nbRadius);
    if (pr && bh.b) {
      const names = ['подошва почвенного слоя', 'подошва суглинка', 'подошва глины', 'подошва песка'];
      bh.b.forEach((v, i) => { const dv = Math.abs(v - pr.b[i]); if (dv > CHECKS.nbDev.b[i]) W('W_NEIGHBOR', `Расхождение с соседями (${pr.n} скв. в радиусе ${CHECKS.nbRadius} м): ${names[i]} на ${f1(v)} м, ожидается ≈ ${f1(pr.b[i])} м.`); });
      if (bh.gw != null && Math.abs(bh.gw - pr.gw) > CHECKS.nbDev.gw && (gs != null || gf != null)) W('W_NEIGHBOR_GW', `УГВ ${f1(bh.gw)} м, соседи дают ≈ ${f1(pr.gw)} м (разница больше ${CHECKS.nbDev.gw} м).`);
    }
    const pz = predictFrom(bh.lng, bh.lat, bh.id, CHECKS.zNbRadius, CHECKS.zNbMin);
    if (pz && pz.z != null && Number.isFinite(bh.z) && bh.z >= CHECKS.zMin && bh.z <= CHECKS.zMax && Math.abs(bh.z - pz.z) > CHECKS.zNbDev) W('W_Z_NEIGHBOR', `Отметка устья ${f1(bh.z)} м отличается от соседей (≈ ${f1(pz.z)} м) больше чем на ${CHECKS.zNbDev} м — возможна опечатка или другая система высот.`);
  }
  return I;
}
function applyChecks(bh) {
  deriveModel(bh); bh.issues = runChecks(bh);
  if (bh.status === 'verified' && bh.issues.some(i => i.sev === 'error')) { bh.status = 'review'; bh.review = { note: 'Снята проверка: перепроверка выявила ошибки', at: new Date().toISOString(), by: 'система' }; }
  bh.verified = bh.status === 'verified';
}
function recheckAll() {   // после импорта и изменения справочника или порогов
  for (const bh of boreholes) { for (const l of bh.layers) if (l.cls_src !== 'file') l.cls = classify(l.soil); }
  for (const bh of boreholes) applyChecks(bh);
}
const issueCounts = bh => ({ errors: bh.issues.filter(i => i.sev === 'error').length, warns: bh.issues.filter(i => i.sev === 'warn').length });

/* --- отчёт по пилоту: статистика замечаний + проверка «убрали скважину и предсказали её по соседям» (leave-one-out) --- */
const CODE_RU = { E_COORD: 'координаты вне города', E_ACC: 'класс точности D / не указан', E_Z: 'отметка устья вне пределов', E_DATE: 'дата не распознана / в будущем', E_LAYERS: 'ошибка в описании слоёв', E_GAP: 'разрыв между слоями',
  E_OVERLAP: 'слои перекрываются', E_DEPTH: 'глубина не сходится с подошвой', E_SOIL: 'грунт не сопоставлен с классом', E_GW: 'вода глубже скважины', E_INCONSISTENT: 'разные значения шапки в строках',
  W_ACC_C: 'класс точности C', W_NO_Z: 'нет отметки устья', W_Z_RANGE: 'необычная отметка устья', W_NO_DATE: 'нет даты бурения', W_OLD: 'данные старше порога', W_SHALLOW: 'мельче модели (12 м)', W_SEQ: 'порядок слоёв ≠ модели',
  W_FILL: 'насыпной грунт', W_NO_GW: 'нет данных о воде', W_GW_ORDER: 'порядок уровней воды', W_NO_GW_DATE: 'нет даты замера воды', W_NO_DOC: 'нет документа-источника', W_DUP: 'возможный дубль',
  W_NEIGHBOR: 'расхождение слоёв с соседями', W_NEIGHBOR_GW: 'расхождение УГВ с соседями', W_Z_NEIGHBOR: 'отметка устья ≠ соседи' };
const LOO_RADIUS = 500;   // м: соседи для проверки «предскажи по соседям»
const quantile = (a, q) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const r2 = v => v == null ? null : +v.toFixed(2);
const summ = a => a.length ? { n: a.length, mean: r2(a.reduce((s, v) => s + v, 0) / a.length), median: r2(quantile(a, .5)), p90: r2(quantile(a, .9)), max: r2(Math.max(...a)) } : { n: 0 };
function pilotReport(includeDemo) {
  const set = boreholes.filter(b => includeDemo || b.source !== 'demo'), cnt = (arr, f) => { const m = {}; arr.forEach(x => { const k = f(x) || '—'; m[k] = (m[k] || 0) + 1; }); return m; };
  const withErr = set.filter(b => b.issues.some(i => i.sev === 'error')).length, withWarn = set.filter(b => !b.issues.some(i => i.sev === 'error') && b.issues.some(i => i.sev === 'warn')).length;
  const byCode = {}; for (const b of set) for (const code of new Set(b.issues.map(i => i.code))) { const sev = b.issues.find(i => i.code === code).sev; (byCode[code] = byCode[code] || { code, sev, n: 0 }).n++; }
  const issues = Object.values(byCode).map(x => ({ ...x, share: set.length ? +(x.n / set.length).toFixed(2) : 0, label: CODE_RU[x.code] || x.code })).sort((a, b) => (a.sev === b.sev ? 0 : a.sev === 'error' ? -1 : 1) || b.n - a.n);
  const unmapped = [...new Set(set.flatMap(b => b.layers.filter(l => l.cls == null).map(l => l.soil)))];
  // leave-one-out: каждую проверенную скважину предсказываем по остальным в радиусе LOO_RADIUS
  const pool = set.filter(b => b.verified && b.b && ACC_W[b.acc] != null), errs = [[], [], [], [], []], rows = []; let untestable = 0;
  for (const t of pool) {
    const k = kx(t.lat), nn = pool.filter(p => p.id !== t.id).map(p => ({ p, d: Math.hypot((p.lng - t.lng) * k, (p.lat - t.lat) * KY) })).filter(x => x.d <= LOO_RADIUS).sort((a, b) => a.d - b.d).slice(0, 6);
    if (nn.length < CHECKS.nbMin) { untestable++; continue; }
    let ws = 0, gw = 0; const b = [0, 0, 0, 0];
    for (const { p, d } of nn) { const w = ACC_W[p.acc] / (d * d + 25); ws += w; for (let i = 0; i < 4; i++) b[i] += p.b[i] * w; gw += p.gw * w; }
    const e = [0, 1, 2, 3].map(i => Math.abs(t.b[i] - b[i] / ws)); e.push(Math.abs(t.gw - gw / ws)); e.forEach((v, i) => errs[i].push(v));
    rows.push({ id: t.id, neighbors: nn.length, errors: e.map(r2), score: r2(Math.max(...e.map((v, i) => v / (i < 4 ? CHECKS.nbDev.b[i] : CHECKS.nbDev.gw)))) });
  }
  const names = ['подошва почвы', 'подошва суглинка', 'подошва глины', 'подошва песка', 'уровень воды'], cur = [...CHECKS.nbDev.b, CHECKS.nbDev.gw];
  const loo = names.map((name, i) => ({ name, ...summ(errs[i]), threshold: cur[i], over: errs[i].filter(v => v > cur[i]).length }));
  const hrs = set.filter(b => b.loaded_at && b.review && b.review.by === 'админ').map(b => (new Date(b.review.at) - new Date(b.loaded_at)) / 36e5).filter(v => v >= 0);
  return { total: set.length, includeDemo: !!includeDemo, status: cnt(set, b => b.status), acc: cnt(set, b => b.acc), reports: cnt(set, b => b.report_id || b.doc), orgs: cnt(set, b => b.org),
    first_pass: { with_errors: withErr, with_warnings_only: withWarn, clean: set.length - withErr - withWarn, error_share: set.length ? +(withErr / set.length).toFixed(2) : 0 },
    issues, unmapped, loo: { radius: LOO_RADIUS, tested: rows.length, untestable, stats: loo, worst: rows.sort((a, b) => b.score - a.score).slice(0, 5) },
    review_hours: summ(hrs), generated: new Date().toISOString() };
}

let boreholes = load(BH_FILE, null);
if (!boreholes) { boreholes = seedDemo(); save(BH_FILE, boreholes); }
{ const mig = boreholes.map(migrateBH); if (mig.some((b, i) => b !== boreholes[i])) { boreholes = mig; save(BH_FILE, boreholes); } }   // старые записи → v2
let orders = load(ORD_FILE, []);
orders.forEach(o => { if (!o.token) o.token = o.id; });   // старые заказы: токен = id

/* ---------- события, заявки, аналитика ---------- */
const LEAD_FILE = 'leads';
let leads = load(LEAD_FILE, []);
let events = db.events.readAll();
{ const keep = events.filter(e => e.t > Date.now() - 180 * 864e5); if (keep.length < events.length) { events = keep; db.events.replaceAll(events); } }   // храним события 180 дней
function track(type, sid, extra) {
  const e = { t: Date.now(), type, sid: String(sid || 'anon').replace(/[^\w\-]/g, '').slice(0, 40), ...extra };
  events.push(e); db.events.append(e);
}
const CLIENT_EVENTS = new Set(['visit', 'buy_click', 'survey_click', 'block_view', 'section_view', 'print', 'view3d', 'view2d']);
const dayKey = t => new Date(t + 5 * 36e5).toISOString().slice(0, 10);   // сутки по времени Казахстана (UTC+5)

function analytics(days) {
  const since = Date.now() - days * 864e5, ev = events.filter(e => e.t >= since);
  const uniq = (type, list = ev) => new Set(list.filter(e => e.type === type).map(e => e.sid)).size;
  const freeMode = PAYMENT_MODE === 'free';   // без оплаты воронка короче: визит → клик → запросили отчёт → открыли отчёт
  const steps = [['Визиты', 'visit'], ['Кликнули по участку', 'point_click'], ['Запросили отчёт', 'buy_click'], ...(freeMode ? [] : [['Создали заказ', 'order_created'], ['Оплатили', 'paid']]), ['Открыли отчёт', 'report_view']]
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
  return { days, payment: PAYMENT_MODE, steps, revenue, paidCount: paid.length, avgCheck: paid.length ? Math.round(revenue / paid.length) : 0, clicks: clicks.length, noDataShare: clicks.length ? noData.length / clicks.length : 0,
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
            orders.push({ id, token: id, lng: got.lng, lat: got.lat, email: 'demo@example.com', price: PRICE, status: 'paid', created: new Date(t - 60000).toISOString(), paidAt: new Date(t).toISOString(), demo: true });
          } else orders.push({ id, token: id, lng: got.lng, lat: got.lat, email: 'demo@example.com', price: PRICE, status: 'pending', created: new Date(t).toISOString(), demo: true });
        }
      }
      if (miss && rnd() < .14) {
        t += 25000; ev('survey_click', sid, t, { lng: miss.lng, lat: miss.lat });
        if (rnd() < .65) { leads.push({ id: 'demo' + crypto.randomBytes(6).toString('hex'), created: new Date(t + 30000).toISOString(), name: 'Демо-клиент', phone: '+7 700 000 00 00', comment: 'Нужны изыскания под ИЖС', lng: miss.lng, lat: miss.lat, status: rnd() < .5 ? 'new' : 'work', demo: true }); }
      }
      n++;
    }
  }
  events.sort((a, b) => a.t - b.t); db.events.replaceAll(events); save(ORD_FILE, orders); save(LEAD_FILE, leads);
  return n;
}
function deleteDemoAnalytics() {
  events = events.filter(e => !e.demo); orders = orders.filter(o => !o.demo); leads = leads.filter(l => !l.demo);
  db.events.replaceAll(events); save(ORD_FILE, orders); save(LEAD_FILE, leads);
}

/* ---------- интерполяция (IDW по 6 ближайшим проверенным скважинам) ---------- */
function interp(lng, lat) {
  const pts = boreholes.filter(p => p.verified && p.b && ACC_W[p.acc] != null);   // только проверенные, с моделью, класс A–C
  if (!pts.length) return null;
  const k = kx(lat);
  const arr = pts.map(p => ({ p, d: Math.hypot((p.lng - lng) * k, (p.lat - lat) * KY) })).sort((a, b) => a.d - b.d);
  const nn = arr.slice(0, 6); let ws = 0, gw = 0; const b = [0, 0, 0, 0];
  for (const { p, d } of nn) { const w = ACC_W[p.acc] / (d * d + 25); ws += w; for (let i = 0; i < 4; i++) b[i] += p.b[i] * w; gw += p.gw * w; }   // вес зависит от класса точности координат
  return { b: b.map(v => +(v / ws).toFixed(2)), gw: +(gw / ws).toFixed(2), dmin: Math.round(arr[0].d), near: arr[0].p.id, nearDate: arr[0].p.date || null };
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
  // реальные проверенные скважины внутри блока (± половина блока + запас): на что опирается модель
  const reach = half * step + step / 2 + 25;
  const bhs = boreholes.filter(b => b.verified && b.b).map(b => ({ b, x: (b.lng - lng) * k, y: (b.lat - lat) * KY })).filter(o => Math.abs(o.x) <= reach && Math.abs(o.y) <= reach)
    .map(({ b, x, y }) => ({ id: b.id, x: +x.toFixed(1), y: +y.toFixed(1), acc: b.acc, date: b.date || null, depth: b.depth || DEPTH, gw: b.gw, bounds: b.b,
      layers: (b.layers || []).map(l => ({ from: l.from, to: l.to, cls: l.cls, soil: l.soil })) }));
  return { point: { lng, lat }, b: v.b, gw: v.gw, near: v.near, dmin: v.dmin, confidence: confidence(v.dmin),
    section: { length: L, samples: sec }, block: { step, n, cells, boreholes: bhs }, generated: new Date().toISOString() };
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

const legacyToV2 = (o, source) => {   // упрощённая скважина (id, lng, lat, gw, b1–b4) → v2 со статусом «на проверке»
  const bounds = [0, ...o.b.map(Number), DEPTH];
  return makeBH({ id: o.id.trim(), lng: o.lng, lat: o.lat, acc: 'B', crs_src: 'WGS84', depth: DEPTH, gw_stable: o.gw, status: 'review', source: source || 'admin',
    layers: SOIL_CLASSES.map((name, i) => ({ from: bounds[i], to: bounds[i + 1], soil: name, cls: i, cls_src: 'file' })) });
};

function csvLine(line, sep) {   // разбор строки CSV с кавычками
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) { const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === sep) { out.push(cur.trim()); cur = ''; } else cur += c; }
  out.push(cur.trim()); return out;
}
const NUM_FIELDS = new Set(['lng', 'lat', 'z', 'depth', 'gw_first', 'gw_stable', 'layer_from', 'layer_to', 'cls', 'bearing_kpa']);
const numOrNaN = s => { if (s === '' || s == null) return null; const v = +String(s).replace(',', '.').replace(/\s/g, ''); return Number.isFinite(v) ? v : NaN; };
// Формат «по слоям»: одна строка = один слой; строки с одним id объединяются в скважину
function parseBoreholesCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.replace(/[;,\s"﻿]/g, '') !== '');   // пропускаем пустые строки и строки из одних разделителей (Excel дописывает «;;;;» после формул)
  if (lines.length < 2) return { error: 'Пустой файл или нет строк с данными.' };
  const sep = lines[0].includes(';') ? ';' : ',';
  const head = csvLine(lines[0].replace(/^﻿/, ''), sep).map(s => s.toLowerCase());
  const miss = ['id', 'lng', 'lat', 'layer_from', 'layer_to', 'soil'].filter(c => !head.includes(c)); if (miss.length) return { error: 'Нет обязательных колонок: ' + miss.join(', ') };
  const groups = new Map(), errors = [];
  lines.slice(1).forEach((ln, idx) => {
    const cells = csvLine(ln, sep), row = {}; head.forEach((h, i) => { row[h] = NUM_FIELDS.has(h) ? numOrNaN(cells[i]) : (cells[i] ?? ''); });
    const id = String(row.id || '').trim(); if (!/^[\w\-.:/А-Яа-я ]{1,40}$/.test(id)) { errors.push(`Строка ${idx + 2}: некорректный id «${clean(id, 20)}» (до 40 символов, без < > и спецзнаков)`); return; }
    row.id = id; if (!groups.has(id)) groups.set(id, []); groups.get(id).push(row);
  });
  if (errors.length) return { error: errors.slice(0, 10).join('\n') + (errors.length > 10 ? `\n…и ещё ${errors.length - 10}` : '') };
  if (groups.size > 2000) return { error: 'Больше 2000 скважин за раз — разбейте файл.' };
  const out = [];
  for (const [id, rows] of groups) {
    const h = rows[0], incons = [];
    for (const key of ['lng', 'lat', 'z', 'acc', 'date', 'depth', 'gw_first', 'gw_stable']) {   // шапка скважины должна совпадать во всех строках
      const vals = rows.map(r => r[key]).filter(v => v !== '' && v != null && !(typeof v === 'number' && Number.isNaN(v))); if (vals.length && new Set(vals.map(String)).size > 1) incons.push(`В строках скважины ${id} разные значения поля «${key}»: ${[...new Set(vals.map(String))].join(' / ')}.`);
    }
    const date = parseDate(h.date), gwDate = parseDate(h.gw_date);
    out.push(makeBH({ id, report_id: h.report_id, lng: h.lng ?? NaN, lat: h.lat ?? NaN, crs_src: h.crs_src, acc: String(h.acc || '').trim().toUpperCase() || 'D', z: h.z, z_src: h.z_src, date: String(h.date || '').trim() ? date : null, depth: h.depth,
      method: h.method, org: h.org, doc: h.doc, gw_first: h.gw_first, gw_stable: h.gw_stable, gw_date: String(h.gw_date || '').trim() ? gwDate : null, bearing_kpa: h.bearing_kpa, aggressive: h.aggressive, status: 'review', source: 'import', _incons: incons,
      layers: rows.map(r => ({ from: r.layer_from ?? NaN, to: r.layer_to ?? NaN, soil: r.soil, cls: Number.isInteger(r.cls) && r.cls >= 0 && r.cls <= 4 ? r.cls : classify(r.soil), cls_src: Number.isInteger(r.cls) && r.cls >= 0 && r.cls <= 4 ? 'file' : 'dict', ige: r.ige }))
    }));
  }
  return { rows: out };
}
function parseCSV(text) {   // старый упрощённый формат (id; lng; lat; gw; b1–b4) — тоже принимается и попадает «на проверку»
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.replace(/[;,\s"﻿]/g, '') !== '');
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
    const err = validateBH(o); if (err) errors.push(`Строка ${idx + 2}: ${err}`); else rows.push(legacyToV2(o, 'import'));
  });
  return { rows, errors };
}
function upsertBoreholes(rows) {   // новая версия скважины всегда уходит «на проверку»
  let added = 0, updated = 0;
  for (const nb of rows) { const i = boreholes.findIndex(x => x.id === nb.id); if (i >= 0) { boreholes[i] = nb; updated++; } else { boreholes.push(nb); added++; } }
  recheckAll(); save(BH_FILE, boreholes);
  const mine = rows.map(r => boreholes.find(x => x.id === r.id)), c = mine.map(issueCounts);
  return { added, updated, with_errors: c.filter(x => x.errors).length, with_warnings: c.filter(x => !x.errors && x.warns).length, clean: c.filter(x => !x.errors && !x.warns).length };
}

/* =====================================================================
   Слои: участки, ограничения, сети + ПАСПОРТ УЧАСТКА (светофор по 8 блокам)
   Правила и пороги ориентировочные — согласовать с геотехником и проектировщиком.
   ===================================================================== */
const PARCELS_FILE = 'parcels', CONS_FILE = 'constraints', UTIL_FILE = 'utilities', COV_FILE = 'coverage', GRID_FILE = 'gridCells';
const COV_LAYERS = ['hazards', 'protection', 'utilities'];   // слои, для которых нужно подтвердить полноту данных
const CONS_KINDS = ['protection', 'sanitary', 'undermined', 'flood', 'slag', 'contamination'];
const UTIL_KINDS = ['water', 'sewer', 'power', 'gas', 'heat'];
const UNITS = { water: 'м³/сут', sewer: 'м³/сут', power: 'кВт', gas: 'м³/ч', heat: 'Гкал/ч' };
const UTIL_RU = { water: 'вода', sewer: 'канализация', power: 'электричество', gas: 'газ', heat: 'тепло' };
const STATUSES = ['free', 'torgi', 'reserve', 'occupied'], ZONES = ['residential', 'public', 'industrial', 'reserve'], PURPOSES = ['ИЖС', 'Многоэтажная', 'Коммерция'];
const STATUS_RU = { free: 'свободен', torgi: 'на торгах', reserve: 'земля запаса', occupied: 'занят' };
const OBJ_RU = { izhs: 'ИЖС (частный дом)', multi: 'многоэтажный дом' };

/* --- геометрия (метры в локальной проекции) --- */
const toXY = (ring, lng0, lat0) => ring.map(([lng, lat]) => [(lng - lng0) * kx(lat0), (lat - lat0) * KY]);
function inRing(ring, lng, lat) { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c; } return c; }
function areaHa(ring) { const p = toXY(ring, ring[0][0], ring[0][1]); let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1]; return Math.abs(a) / 2 / 10000; }
function centroid(ring) {
  const lng0 = ring[0][0], lat0 = ring[0][1], p = toXY(ring, lng0, lat0); let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const f = p[j][0] * p[i][1] - p[i][0] * p[j][1]; a += f; cx += (p[j][0] + p[i][0]) * f; cy += (p[j][1] + p[i][1]) * f; }
  if (Math.abs(a) < 1e-9) return [lng0, lat0]; cx /= 3 * a; cy /= 3 * a; return [lng0 + cx / kx(lat0), lat0 + cy / KY];
}
function segDist(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy; let t = l2 ? (-ax * dx - ay * dy) / l2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(ax + t * dx, ay + t * dy); }
function distToPath(pts, lng, lat) { const p = toXY(pts, lng, lat); let d = Infinity; for (let i = 1; i < p.length; i++) d = Math.min(d, segDist(p[i - 1][0], p[i - 1][1], p[i][0], p[i][1])); return d; }
function fractionInside(parcelRing, zoneRing) {   // доля площади участка внутри зоны (выборка 14×14)
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9; for (const [x, y] of parcelRing) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  let tot = 0, hit = 0; const N = 14;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const x = minX + (i + .5) * (maxX - minX) / N, y = minY + (j + .5) * (maxY - minY) / N; if (!inRing(parcelRing, x, y)) continue; tot++; if (inRing(zoneRing, x, y)) hit++; }
  return tot ? hit / tot : 0;
}

/* --- покрытие данных: где слой считается полным. Нет покрытия = «нет данных» (серый), а не «всё хорошо» --- */
const coverFor = (layer, lng, lat) => coverage.find(c => c.layer === layer && inRing(c.ring, lng, lat)) || null;
const isStale = c => !!(c && c.as_of && Date.now() - new Date(c.as_of).getTime() > 365 * 864e5);
const asOf = c => c && c.as_of ? ` (данные на ${c.as_of.split('-').reverse().join('.')}${isStale(c) ? ', устарели — нужна актуализация' : ''})` : '';

/* --- паспорт --- */
const RANK = { green: 0, gray: 1, yellow: 1, red: 2 };
function passport(lng, lat, obj, parcelIn, areaRing) {   // areaRing — контур ячейки сетки: оцениваем территорию, а не участок
  obj = obj === 'multi' ? 'multi' : 'izhs';
  const parcel = areaRing ? null : (parcelIn || parcels.find(p => inRing(p.ring, lng, lat)) || null);
  const s = interp(lng, lat), cen = parcel ? centroid(parcel.ring) : [lng, lat];
  const blocks = [], B = (key, title, level, text) => blocks.push({ key, title, level, text });
  const myPurpose = obj === 'izhs' ? 'ИЖС' : 'Многоэтажная';

  // 1. Право и назначение
  if (!parcel) B('law', 'Право и назначение', 'gray', 'Участок не найден в базе — сверьте с публичной кадастровой картой.');
  else if (parcel.encumbrance) B('law', 'Право и назначение', 'red', `Обременение: ${parcel.encumbrance}.`);
  else if (parcel.status === 'occupied') B('law', 'Право и назначение', 'red', 'Участок уже занят (оформлен за другим лицом).');
  else if (!parcel.purposes.includes(myPurpose)) B('law', 'Право и назначение', 'yellow', `Назначение (${parcel.purposes.join(', ') || 'не указано'}) не подходит под «${OBJ_RU[obj]}» — потребуется смена назначения.`);
  else if (parcel.status === 'free') B('law', 'Право и назначение', 'green', 'Свободен, назначение подходит.');
  else B('law', 'Право и назначение', 'yellow', parcel.status === 'torgi' ? 'Выставлен на торги — участок можно получить только через аукцион.' : 'Земля запаса — оформление через акимат.');

  // 2. Градостроительство
  if (!parcel) B('urban', 'Градостроительство', 'gray', 'Нет данных по участку.');
  else if (parcel.zone === 'industrial') B('urban', 'Градостроительство', 'red', 'Промышленная зона по генплану — жильё не допускается.');
  else if (parcel.zone === 'public') B('urban', 'Градостроительство', 'yellow', 'Общественная зона — жильё возможно только в составе общественной застройки.');
  else if (parcel.zone === 'reserve') B('urban', 'Градостроительство', 'yellow', 'Резервная территория — застройка после утверждения проекта детальной планировки.');
  else if (obj === 'multi' && parcel.max_floors != null && parcel.max_floors < 5) B('urban', 'Градостроительство', 'yellow', `Допустимая этажность ${parcel.max_floors} — ниже многоэтажной застройки.`);
  else B('urban', 'Градостроительство', 'green', `Жилая зона${parcel.max_floors != null ? `, до ${parcel.max_floors} этажей` : ''}.`);

  // 3. Инженерные сети (расстояние от центра участка, мощность)
  const cvU = coverFor('utilities', cen[0], cen[1]);
  if (!cvU) B('utilities', 'Инженерные сети', 'gray', 'Данные по сетям для этого района не загружены — оценить подключение нельзя.');
  else {
    let worst = 'green'; const parts = [];
    for (const k of ['water', 'sewer', 'power']) {
      // ближайшая сеть, где есть свободная мощность; если таких нет — просто ближайшая
      const cands = utilities.filter(u => u.kind === k).map(u => ({ u, d: distToPath(u.line, cen[0], cen[1]) })).sort((a, b) => a.d - b.d);
      const pick = cands.find(c => c.u.capacity_free !== 0) || cands[0], best = pick ? pick.u : null, bd = pick ? pick.d : Infinity;
      let lv = 'green', t;
      if (!best) { lv = 'red'; t = `${UTIL_RU[k]}: сетей нет в базе`; }
      else {
        const cap = best.capacity_free;
        if (bd > 500) lv = 'red'; else if (bd > 150) lv = 'yellow';
        if (cap === 0) lv = 'red'; else if (cap == null && lv === 'green') lv = 'yellow';
        t = `${UTIL_RU[k]}: ${Math.round(bd)} м, ${cap == null ? 'мощность не подтверждена' : cap === 0 ? 'свободной мощности нет' : `свободно ${cap} ${UNITS[k]}`}`;
      }
      if (k === 'sewer' && obj === 'izhs' && lv === 'red') lv = 'yellow', t += ' (для ИЖС возможен септик)';
      if (RANK[lv] > RANK[worst]) worst = lv; parts.push(t);
    }
    B('utilities', 'Инженерные сети', worst === 'green' && isStale(cvU) ? 'yellow' : worst, parts.join('; ') + '.' + asOf(cvU));
  }

  // 4. Рельеф
  if (!parcel || parcel.slope_pct == null) B('relief', 'Рельеф', 'gray', 'Уклон не измерен — нужна топосъёмка.');
  else B('relief', 'Рельеф', parcel.slope_pct <= 5 ? 'green' : parcel.slope_pct <= 10 ? 'yellow' : 'red', `Средний уклон ${String(parcel.slope_pct).replace('.', ',')}%${parcel.slope_pct > 5 ? ' — возможны значительные земляные работы' : ''}.`);

  // 5. Грунты
  if (!s || s.dmin > MAX_SELL_DISTANCE) B('soil', 'Грунты', 'gray', 'Рядом нет скважин — модель грунта недоступна, нужны изыскания.');
  else {
    let lv = s.gw < 2 ? 'red' : s.gw < 3 ? 'yellow' : 'green'; if (s.dmin > 300 && lv === 'green') lv = 'yellow';
    B('soil', 'Грунты', lv, `Уровень грунтовых вод ${s.gw.toFixed(1).replace('.', ',')} м${s.gw < 3 ? ' — высокий, риск подтопления подвала' : ''}; ближайшая скважина ${s.near} в ${s.dmin} м.`);
  }

  // 6–7. Зоны: опасные процессы и охранные/санитарные
  const zoneBlock = (key, title, kinds) => {
    const cv = coverFor(key, cen[0], cen[1]);
    if (!cv) return B(key, title, 'gray', key === 'hazards' ? 'Данные об опасных процессах (подработка, подтопление, отвалы) для этого района не загружены — нельзя утверждать, что их нет.' : 'Данные об охранных и санитарных зонах для этого района не загружены — нельзя утверждать, что ограничений нет.');
    let lv = 'green'; const parts = [];
    for (const z of constraints) {
      if (!kinds.includes(z.kind)) continue;
      const frac = parcel ? fractionInside(parcel.ring, z.ring) : areaRing ? fractionInside(areaRing, z.ring) : (inRing(z.ring, lng, lat) ? 1 : 0);
      const d = distToPath(z.ring, cen[0], cen[1]);
      let l = 'green'; if (frac > (key === 'hazards' ? 0.3 : 0.5)) l = 'red'; else if (frac > 0 || d < (key === 'hazards' ? 150 : 50)) l = 'yellow';
      if (l !== 'green') { parts.push(`${z.name}${frac > 0 ? ` — ${Math.round(frac * 100)}% участка` : ` — рядом (${Math.round(d)} м)`}`); if (RANK[l] > RANK[lv]) lv = l; }
    }
    B(key, title, lv === 'green' && isStale(cv) ? 'yellow' : lv, (parts.length ? parts.join('; ') + '.' : 'Участок не попадает в известные зоны.') + asOf(cv));
  };
  zoneBlock('hazards', 'Опасные процессы', ['undermined', 'flood', 'slag', 'contamination']);
  zoneBlock('protection', 'Охранные и санитарные зоны', ['protection', 'sanitary']);

  // 8. Достоверность данных
  if (!s) B('data', 'Достоверность данных', 'gray', 'Нет данных.');
  else {
    const age = s.nearDate ? (Date.now() - new Date(s.nearDate).getTime()) / (365.25 * 864e5) : null, old = age != null && age > CHECKS.maxAgeYears;
    let lv = s.dmin < 120 ? 'green' : s.dmin < 300 ? 'yellow' : 'gray'; if (lv === 'green' && (old || age == null)) lv = 'yellow';   // скважин рядом нет — это «нет данных» (серый), а не «препятствие»
    B('data', 'Достоверность данных', lv, `Ближайшая скважина в ${s.dmin} м${s.nearDate ? `, пробурена в ${s.nearDate.slice(0, 4)} году` : ', дата бурения неизвестна'}${old ? ` — данным больше ${CHECKS.maxAgeYears} лет, участок мог измениться` : ''}${s.dmin >= 120 ? ' — для проектирования нужны собственные изыскания' : ''}.`);
  }

  const lv = blocks.map(b => b.level), overall = lv.includes('red') ? 'red' : blocks.find(b => b.key === 'data').level === 'gray' ? 'gray' : lv.some(l => l === 'yellow' || l === 'gray') ? 'yellow' : 'green';   // красный — реальное препятствие; нет данных рядом — серый
  const get = k => blocks.find(b => b.key === k).level, missing = [];
  if (parcel && !parcel.apz) missing.push('Архитектурно-планировочное задание (АПЗ)');
  if (parcel && !parcel.tu) missing.push('Технические условия на подключение к сетям');
  if (!s || s.dmin > 120 || get('soil') !== 'green') missing.push('Инженерно-геологические изыскания на участке');
  if (get('hazards') !== 'green' || get('protection') !== 'green') missing.push('Заключение/согласование по зоне ограничений (подработка, охранные зоны)');
  if (get('relief') === 'gray' || get('relief') === 'red') missing.push('Топографическая съёмка участка');
  missing.push(obj === 'multi' ? 'Проектно-сметная документация и экспертиза' : 'Уведомление о начале строительства (уточнить порядок в управлении архитектуры)');
  return { obj, overall, blocks, missing, parcel: parcel ? { id: parcel.id, cad: parcel.cad, area_ha: +parcel.area_ha.toFixed(2), status: parcel.status, status_ru: STATUS_RU[parcel.status], purposes: parcel.purposes, zone: parcel.zone } : null };
}

/* --- кэш светофоров участков для карты --- */
const lightCache = {};
function parcelLights(obj) {
  const c = lightCache[obj]; if (c && c.ver === db.version()) return c.val;
  const val = parcels.map(p => { const cen = centroid(p.ring), pp = passport(cen[0], cen[1], obj, p); return { p, cen, pp }; });
  lightCache[obj] = { ver: db.version(), val }; return val;
}
function layersPublic(obj) {
  const lights = parcelLights(obj), free = lights.filter(x => x.p.status !== 'occupied');
  return {
    obj,
    parcels: { type: 'FeatureCollection', features: lights.map(({ p, cen, pp }) => ({ type: 'Feature', properties: { id: p.id, cad: p.cad, area_ha: +p.area_ha.toFixed(2), status: p.status, status_ru: STATUS_RU[p.status], purposes: p.purposes.join(', '), light: pp.overall, lng: +cen[0].toFixed(5), lat: +cen[1].toFixed(5) }, geometry: { type: 'Polygon', coordinates: [p.ring] } })) },
    constraints: { type: 'FeatureCollection', features: constraints.map(z => ({ type: 'Feature', properties: { id: z.id, kind: z.kind, name: z.name, regime: z.regime || '' }, geometry: { type: 'Polygon', coordinates: [z.ring] } })) },
    hectares: { free_ha: +free.reduce((s, x) => s + x.p.area_ha, 0).toFixed(1), green_ha: +free.filter(x => x.pp.overall === 'green').reduce((s, x) => s + x.p.area_ha, 0).toFixed(1), parcels_free: free.length }
  };
}

/* --- сетка территории (grid_cells): светофор по районам там, где участков в базе нет --- */
const GRID_SIZES = [250, 500, 1000, 2000], GRID_MAX_CELLS = 12000;
const GRID_BLOCKS = ['utilities', 'soil', 'hazards', 'protection'];   // что оцениваем для территории (право, этажность и уклон без участка не определить)
const GRID_REF_LAT = 49.8;   // параллель, на которой считается шаг по долготе; фиксирована, чтобы id ячеек не менялись между построениями
function gridStep(size) { return { dLng: size / kx(GRID_REF_LAT), dLat: size / KY }; }
/* Построить сетку по прямоугольнику (WGS84). Якорь сетки — юго-западный угол BBOX, поэтому id (G500-12-7) стабильны. */
function buildGrid(size, box) {
  const { dLng, dLat } = gridStep(size);
  const x0 = Math.max(0, Math.floor((box.minLng - BBOX.minLng) / dLng)), x1 = Math.ceil((Math.min(box.maxLng, BBOX.maxLng) - BBOX.minLng) / dLng);
  const y0 = Math.max(0, Math.floor((box.minLat - BBOX.minLat) / dLat)), y1 = Math.ceil((Math.min(box.maxLat, BBOX.maxLat) - BBOX.minLat) / dLat);
  const n = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  if (n > GRID_MAX_CELLS) return { error: `Получается ${n} ячеек, максимум ${GRID_MAX_CELLS}. Увеличьте размер ячейки или уменьшите область.` };
  const r6 = v => +v.toFixed(6), out = [];
  for (let iy = y0; iy < y1; iy++) for (let ix = x0; ix < x1; ix++) {
    const w = BBOX.minLng + ix * dLng, s = BBOX.minLat + iy * dLat, e = w + dLng, nn = s + dLat;
    out.push({ id: `G${size}-${ix}-${iy}`, size_m: size, ix, iy, ring: [[r6(w), r6(s)], [r6(e), r6(s)], [r6(e), r6(nn)], [r6(w), r6(nn)], [r6(w), r6(s)]], source: 'auto' });
  }
  return { cells: out };
}
/* Область по умолчанию: покрытие данных, а если его нет — участки; с запасом 300 м */
function defaultGridBox() {
  const rings = coverage.length ? coverage.map(c => c.ring) : parcels.map(p => p.ring);
  if (!rings.length) return null;
  let a = 1e9, b = 1e9, c2 = -1e9, d = -1e9; for (const r of rings) for (const [x, y] of r) { a = Math.min(a, x); b = Math.min(b, y); c2 = Math.max(c2, x); d = Math.max(d, y); }
  const mx = 300 / kx(GRID_REF_LAT), my = 300 / KY; return { minLng: a - mx, minLat: b - my, maxLng: c2 + mx, maxLat: d + my };
}
function cellLights(obj) {
  const key = 'grid-' + obj, c = lightCache[key]; if (c && c.ver === db.version()) return c.val;
  const freeP = parcels.filter(p => p.status !== 'occupied').map(p => centroid(p.ring));
  const val = gridCells.map(cell => {
    const w = cell.ring[0][0], s = cell.ring[0][1], e = cell.ring[2][0], n = cell.ring[2][1];
    const pp = passport((w + e) / 2, (s + n) / 2, obj, null, cell.ring);
    const used = pp.blocks.filter(b => GRID_BLOCKS.includes(b.key)), lv = used.map(b => b.level);
    const light = lv.includes('red') ? 'red' : lv.includes('gray') ? 'gray' : lv.includes('yellow') ? 'yellow' : 'green';
    return { cell, light, issues: used.filter(b => b.level !== 'green'), free_parcels: freeP.filter(([x, y]) => x >= w && x < e && y >= s && y < n).length };
  });
  lightCache[key] = { ver: db.version(), val }; return val;
}
function gridPublic(obj) {   // публично: цвет и названия проблемных блоков, без цифр по сетям и скважинам
  const lights = cellLights(obj), count = { green: 0, yellow: 0, red: 0, gray: 0 }; lights.forEach(x => count[x.light]++);
  return { obj, size_m: gridCells.length ? gridCells[0].size_m : null, count,
    cells: { type: 'FeatureCollection', features: lights.map(({ cell, light, issues, free_parcels }) => ({ type: 'Feature',
      properties: { id: cell.id, light, free_parcels, issues: issues.map(b => `${b.title}: ${b.level === 'red' ? 'препятствие' : b.level === 'gray' ? 'нет данных' : 'с условиями'}`).join('; ') }, geometry: { type: 'Polygon', coordinates: [cell.ring] } })) } };
}

/* --- демо-слои (синтетика вокруг центра, не реальные данные) --- */
function seedLayers() {
  let s = 4242; const rnd = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const ll = (x, y) => [+(C.lng + x / kx(C.lat)).toFixed(6), +(C.lat + y / KY).toFixed(6)];
  const rect = (x, y, w, h, j = 0) => { const q = () => (rnd() - .5) * j; const r = [ll(x + q(), y + q()), ll(x + w + q(), y + q()), ll(x + w + q(), y + h + q()), ll(x + q(), y + h + q())]; r.push(r[0]); return r; };
  const ps = []; let n = 0;
  for (const y of [-520, -250, 20, 290]) for (const x of [-520, -250, 20, 290]) {
    n++; const r = rnd(), status = r < .25 ? 'occupied' : r < .65 ? 'free' : r < .8 ? 'torgi' : 'reserve';
    const zr = rnd(), zone = zr < .75 ? 'residential' : zr < .85 ? 'public' : zr < .93 ? 'reserve' : 'industrial';
    const purposes = rnd() < .5 ? ['ИЖС'] : rnd() < .6 ? ['Многоэтажная'] : ['ИЖС', 'Многоэтажная'];
    const ring = rect(x, y, 230, 220, 12);
    const p = { id: `DEMO-P${String(n).padStart(2, '0')}`, cad: `09:000:${String(100 + n).padStart(3, '0')}:${n * 7}`, ring, area_ha: areaHa(ring), status, purposes, zone, max_floors: [2, 5, 9, 12][Math.floor(rnd() * 4)],
      slope_pct: +(1 + rnd() * 11).toFixed(1), encumbrance: rnd() < .1 ? 'арест (демо)' : '', apz: rnd() < .4, tu: rnd() < .35, source: 'demo' };
    if (n === 6 || n === 7) Object.assign(p, { status: 'free', purposes: ['ИЖС', 'Многоэтажная'], zone: 'residential', max_floors: 9, slope_pct: 2.5, encumbrance: '', apz: true, tu: true });   // «идеальные» участки для демонстрации
    ps.push(p);
  }
  const strip = (y, half) => { const r = [ll(-600, y - half), ll(600, y - half), ll(600, y + half), ll(-600, y + half)]; r.push(r[0]); return r; };
  const poly = pts => { const r = pts.map(([x, y]) => ll(x, y)); r.push(r[0]); return r; };
  const cs = [
    { id: 'DEMO-C1', kind: 'protection', name: 'Охранная зона ЛЭП 110 кВ (демо)', regime: 'Строительство запрещено в полосе ±20 м', ring: strip(130, 20) },
    { id: 'DEMO-C2', kind: 'undermined', name: 'Подработанная территория, шахта (демо)', regime: 'Требуется заключение по устойчивости основания', ring: poly([[250, 250], [620, 230], [640, 620], [230, 600]]) },
    { id: 'DEMO-C3', kind: 'flood', name: 'Зона подтопления (демо)', regime: 'Высокий уровень грунтовых вод', ring: poly([[-620, -620], [-350, -640], [-330, -400], [-600, -380]]) },
    { id: 'DEMO-C4', kind: 'sanitary', name: 'СЗЗ промпредприятия (демо)', regime: 'Жильё не допускается', ring: poly([[-100, -620], [160, -620], [160, -540], [-100, -540]]) }
  ].map(c => ({ ...c, source: 'demo' }));
  const us = [
    { id: 'DEMO-U1', kind: 'water', line: [ll(-600, -385), ll(600, -385)], capacity_free: 120, owner: 'Водоканал (демо)' },
    { id: 'DEMO-U2', kind: 'water', line: [ll(-385, -600), ll(-385, 600)], capacity_free: 120, owner: 'Водоканал (демо)' },
    { id: 'DEMO-U3', kind: 'sewer', line: [ll(-385, -600), ll(-385, 600)], capacity_free: 80, owner: 'Водоканал (демо)' },
    { id: 'DEMO-U3c', kind: 'sewer', line: [ll(155, -600), ll(155, 100)], capacity_free: 40, owner: 'Водоканал (демо)' },
    { id: 'DEMO-U3b', kind: 'sewer', line: [ll(-115, -600), ll(-115, 600)], capacity_free: 60, owner: 'Водоканал (демо)' },
    { id: 'DEMO-U1b', kind: 'water', line: [ll(-115, -600), ll(-115, 600)], capacity_free: 90, owner: 'Водоканал (демо)' },
    { id: 'DEMO-U1c', kind: 'water', line: [ll(155, -600), ll(155, 600)], capacity_free: 70, owner: 'Водоканал (демо)' },
    { id: 'DEMO-U1d', kind: 'water', line: [ll(385, -600), ll(385, 600)], capacity_free: 50, owner: 'Водоканал (демо)' },
    { id: 'DEMO-U4b', kind: 'power', line: [ll(-600, -130), ll(600, -130)], capacity_free: 600, owner: 'Электросети (демо)' },
    { id: 'DEMO-U4c', kind: 'power', line: [ll(-600, 410), ll(600, 410)], capacity_free: 400, owner: 'Электросети (демо)' },
    { id: 'DEMO-U4', kind: 'power', line: [ll(-600, 140), ll(600, 140)], capacity_free: 800, owner: 'Электросети (демо)' },
    { id: 'DEMO-U5', kind: 'power', line: [ll(300, -600), ll(300, 140)], capacity_free: 0, owner: 'Электросети (демо)' }
  ].map(u => ({ ...u, source: 'demo' }));
  const cv = COV_LAYERS.map(layer => ({ id: `DEMO-COV-${layer}`, layer, as_of: '2026-09-01', source: 'demo', ring: poly([[-700, -700], [700, -700], [700, 700], [-700, 700]]) }));
  return { ps, cs, us, cv };
}
let parcels = load(PARCELS_FILE, null), constraints = load(CONS_FILE, null), utilities = load(UTIL_FILE, null), coverage = load(COV_FILE, null);
if (!parcels || !constraints || !utilities) { const d = seedLayers(); parcels = d.ps; constraints = d.cs; utilities = d.us; coverage = d.cv; save(PARCELS_FILE, parcels); save(CONS_FILE, constraints); save(UTIL_FILE, utilities); save(COV_FILE, coverage); }
let gridCells = load(GRID_FILE, []);
if (!coverage) { coverage = []; save(COV_FILE, coverage); }   // слои есть, а покрытие не задано → блоки серые, пока администратор его не загрузит

/* --- импорт GeoJSON (из QGIS, WGS84); всё или ничего --- */
const truthy = v => v === true || v === 1 || ['true', 'да', 'yes', '1', 'есть'].includes(String(v).trim().toLowerCase());
const num = v => (v === '' || v == null || !Number.isFinite(+v)) ? null : +v;
function okCoord(c) { return Array.isArray(c) && c.length >= 2 && Number.isFinite(+c[0]) && Number.isFinite(+c[1]) && +c[1] >= BBOX.minLat && +c[1] <= BBOX.maxLat && +c[0] >= BBOX.minLng && +c[0] <= BBOX.maxLng; }
function importLayer(name, gj) {
  if (!gj || gj.type !== 'FeatureCollection' || !Array.isArray(gj.features)) return { error: 'Нужен GeoJSON типа FeatureCollection в системе WGS84 (EPSG:4326).' };
  if (gj.features.length > 5000) return { error: 'Больше 5000 объектов за раз — разбейте файл.' };
  const out = [], errors = [], wantPoly = name !== 'utilities';
  gj.features.forEach((f, idx) => {
    const pr = (f && f.properties) || {}, g = (f && f.geometry) || {}, tag = `Объект ${idx + 1}`;
    let geoms = [];
    if (wantPoly) { if (g.type === 'Polygon') geoms = [g.coordinates[0]]; else if (g.type === 'MultiPolygon') geoms = g.coordinates.map(p => p[0]); else return errors.push(`${tag}: нужна геометрия Polygon/MultiPolygon`); }
    else { if (g.type === 'LineString') geoms = [g.coordinates]; else if (g.type === 'MultiLineString') geoms = g.coordinates; else return errors.push(`${tag}: нужна геометрия LineString/MultiLineString`); }
    for (const [gi, ring] of geoms.entries()) {
      if (!Array.isArray(ring) || ring.length < (wantPoly ? 4 : 2) || !ring.every(okCoord)) { errors.push(`${tag}: координаты некорректны или вне области Караганды (нужна система WGS84: долгота, широта)`); continue; }
      const pts = ring.map(c => [+c[0], +c[1]]);
      const baseId = clean(pr.id || pr.cad_number || `${name}-${idx + 1}`, 60) || `${name}-${idx + 1}`, id = geoms.length > 1 ? `${baseId}#${gi + 1}` : baseId;
      if (name === 'parcels') {
        const status = String(pr.status || '').toLowerCase(); if (!STATUSES.includes(status)) { errors.push(`${tag}: status должен быть один из ${STATUSES.join('|')}`); continue; }
        const zone = String(pr.zone || '').toLowerCase(); if (zone && !ZONES.includes(zone)) { errors.push(`${tag}: zone должен быть один из ${ZONES.join('|')}`); continue; }
        const purposes = (Array.isArray(pr.purposes) ? pr.purposes : String(pr.purposes || '').split(/[,;]/)).map(x => x.trim()).filter(Boolean);
        const bad = purposes.find(x => !PURPOSES.includes(x)); if (bad) { errors.push(`${tag}: purposes содержит «${bad}», допустимо: ${PURPOSES.join(', ')}`); continue; }
        out.push({ id, cad: clean(pr.cad_number, 40), ring: pts, area_ha: areaHa(pts), status, purposes, zone: zone || 'residential', max_floors: num(pr.max_floors), slope_pct: num(pr.slope_pct), encumbrance: clean(pr.encumbrance, 120), apz: truthy(pr.apz), tu: truthy(pr.tu), source: 'import' });
      } else if (name === 'constraints') {
        const kind = String(pr.kind || '').toLowerCase(); if (!CONS_KINDS.includes(kind)) { errors.push(`${tag}: kind должен быть один из ${CONS_KINDS.join('|')}`); continue; }
        out.push({ id, kind, name: clean(pr.name || kind, 120), regime: clean(pr.regime, 300), ring: pts, source: 'import' });
      } else if (name === 'coverage') {
        const layer = String(pr.layer || '').toLowerCase(); if (!COV_LAYERS.includes(layer)) { errors.push(`${tag}: layer должен быть один из ${COV_LAYERS.join('|')}`); continue; }
        const asof = String(pr.as_of || '').trim(); if (asof && (!/^\d{4}-\d{2}-\d{2}$/.test(asof) || Number.isNaN(new Date(asof).getTime()))) { errors.push(`${tag}: as_of должен быть датой ГГГГ-ММ-ДД`); continue; }
        out.push({ id, layer, as_of: asof || null, source: clean(pr.source, 120) || 'import', ring: pts });
      } else {
        const kind = String(pr.kind || '').toLowerCase(); if (!UTIL_KINDS.includes(kind)) { errors.push(`${tag}: kind должен быть один из ${UTIL_KINDS.join('|')}`); continue; }
        out.push({ id, kind, line: pts, capacity_free: num(pr.capacity_free), owner: clean(pr.owner, 80), source: 'import' });
      }
    }
  });
  return errors.length ? { error: errors.slice(0, 10).join('\n') + (errors.length > 10 ? `\n…и ещё ${errors.length - 10}` : ''), errors: errors.length } : { rows: out };
}

/* ---------- HTTP ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.csv': 'text/csv; charset=utf-8', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.md': 'text/markdown; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const SEC_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin' };
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEC_HEADERS }); res.end(JSON.stringify(obj)); };
function body(req, limit = 2e6) { return new Promise((ok, no) => { let d = ''; req.on('data', c => { d += c; if (d.length > limit) { no(new Error('too large')); req.destroy(); } }); req.on('end', () => ok(d)); req.on('error', no); }); }
const isAdmin = req => { const a = Buffer.from(String(req.headers['x-admin-password'] || '')), b = Buffer.from(ADMIN_PASSWORD); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const parseJSON = s => { try { return JSON.parse(s || '{}'); } catch { return null; } };

/* --- ограничение частоты запросов (в памяти одного процесса; за прокси включить TRUST_PROXY=1) --- */
const hits = new Map();
function limited(key, max, ms) { const now = Date.now(); let a = hits.get(key); if (!a) hits.set(key, a = []); while (a.length && a[0] <= now - ms) a.shift(); if (a.length >= max) return true; a.push(now); return false; }
setInterval(() => { const now = Date.now(); for (const [k, a] of hits) if (!a.length || a[a.length - 1] < now - 36e5) hits.delete(k); }, 6e4).unref();
const clientIp = req => (TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '') || req.socket.remoteAddress || 'unknown';
const LIMITS = { point: [40, 6e4], layers: [20, 6e4], order: [8, 6e4], track: [60, 6e4], lead: [5, 36e5], report: [60, 6e4], status: [60, 6e4], pay: [10, 6e4] };
const authFails = new Map();   // блокировка подбора пароля админки: 10 неверных попыток за 15 минут
const adminLocked = ip => { const a = (authFails.get(ip) || []).filter(t => t > Date.now() - 9e5); authFails.set(ip, a); return a.length >= 10; };
const adminFail = ip => { if (!authFails.has(ip)) authFails.set(ip, []); authFails.get(ip).push(Date.now()); };

/* --- оплата --- */
function payUrl(ord) { return PAYMENT_URL_TEMPLATE.replace('{orderId}', encodeURIComponent(ord.id)).replace('{amount}', String(ord.price)).replace('{returnUrl}', encodeURIComponent(`${PUBLIC_URL}/?t=${ord.token}`)); }
function markPaid(ord, sid) {
  if (ord.status === 'paid') return;
  ord.status = 'paid'; ord.paidAt = new Date().toISOString(); save(ORD_FILE, orders); track('paid', sid, { orderId: ord.id, price: ord.price });
}

const safeDecode = x => { try { return decodeURIComponent(x); } catch { return null; } };   // битый %-код в адресе — ошибка клиента (400), а не сервера (500)
async function api(req, res, url) {
  const p = url.pathname, m = req.method, q = url.searchParams, ip = clientIp(req), sid = req.headers['x-sid'];
  const rl = name => limited(name + ':' + ip, ...LIMITS[name]);
  const tooMany = () => send(res, 429, { error: 'Слишком много запросов. Подождите минуту и повторите.' });
  // --- публичные ---
  if (m === 'GET' && p === '/api/config') return send(res, 200, { price: PRICE, depth: DEPTH, maxSellDistance: MAX_SELL_DISTANCE, payment: PAYMENT_MODE });
  if (m === 'GET' && p === '/api/boreholes') { if (rl('layers')) return tooMany(); return send(res, 200, boreholes.filter(b => b.verified).map(b => ({ id: b.id, lng: b.lng, lat: b.lat }))); }
  if (m === 'GET' && p === '/api/layers') { if (rl('layers')) return tooMany(); return send(res, 200, layersPublic(q.get('obj') === 'multi' ? 'multi' : 'izhs')); }   // сети публично не отдаём
  if (m === 'GET' && p === '/api/grid') { if (rl('layers')) return tooMany(); return send(res, 200, gridPublic(q.get('obj') === 'multi' ? 'multi' : 'izhs')); }
  if (m === 'GET' && p === '/api/point') {
    if (rl('point')) return tooMany();
    const lng = q.get('lng') ? +q.get('lng') : NaN, lat = q.get('lat') ? +q.get('lat') : NaN; if (!Number.isFinite(lng) || !Number.isFinite(lat)) return send(res, 400, { error: 'lng/lat' });   // пустое значение не должно превращаться в 0
    const v = interp(lng, lat); if (!v) return send(res, 200, { available: false });
    track('point_click', sid, { lng: +lng.toFixed(4), lat: +lat.toFixed(4), avail: v.dmin <= MAX_SELL_DISTANCE, dmin: v.dmin });
    const pp = passport(lng, lat, q.get('obj'));   // бесплатно: только цвета блоков, без причин; УГВ и расстояние огрублены, ID скважины скрыт
    return send(res, 200, { available: v.dmin <= MAX_SELL_DISTANCE, gw: Math.round(v.gw * 2) / 2, near: null, dmin: Math.round(v.dmin / 10) * 10, confidence: confidence(v.dmin), price: PRICE,
      parcel: pp.parcel, light: pp.overall, levels: pp.blocks.map(b => ({ key: b.key, title: b.title, level: b.level })) });
  }
  if (m === 'POST' && p === '/api/orders') {
    if (rl('order')) return tooMany();
    if (PAYMENT_MODE === 'off') return send(res, 503, { error: 'Оплата пока не подключена. Оставьте заявку на изыскания — мы свяжемся с вами.' });
    const o = parseJSON(await body(req)); if (!o) return send(res, 400, { error: 'json' }); const lng = +o.lng, lat = +o.lat;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return send(res, 400, { error: 'Нет координат' });
    const free = PAYMENT_MODE === 'free', mailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(o.email || ''));
    if (!mailOk && !(free && !o.email)) return send(res, 400, { error: 'Укажите корректный email' });   // в пробном периоде email необязателен
    const v = interp(lng, lat); if (!v || v.dmin > MAX_SELL_DISTANCE) return send(res, 422, { error: 'Рядом нет данных. Закажите инженерные изыскания на участке.' });
    // id — для платёжного провайдера, token — секрет покупателя (он же ключ отчёта; провайдеру не передаётся)
    const now = new Date().toISOString();
    const ord = { id: crypto.randomBytes(12).toString('hex'), token: crypto.randomBytes(16).toString('hex'), lng, lat, email: clean(o.email, 120), price: free ? 0 : PRICE, free, obj: o.obj === 'multi' ? 'multi' : 'izhs',
      status: free ? 'paid' : 'pending', created: now, ...(free ? { paidAt: now } : {}) };   // бесплатный отчёт сразу «выдан»
    orders.push(ord); save(ORD_FILE, orders); track('order_created', sid, { orderId: ord.id });
    return send(res, 201, { orderId: ord.id, token: ord.token, price: ord.price, free, mode: PAYMENT_MODE, payUrl: PAYMENT_MODE === 'live' ? payUrl(ord) : null });
  }
  if (m === 'GET' && p === '/api/orders/status') {
    if (rl('status')) return tooMany();
    const ord = orders.find(x => x.token === String(q.get('token') || '')); if (!ord) return send(res, 404, { error: 'Заказ не найден' });
    return send(res, 200, { status: ord.status });
  }
  if (m === 'POST' && p === '/api/track') {
    if (rl('track')) return tooMany();
    const o = parseJSON(await body(req)); if (!o || !CLIENT_EVENTS.has(o.type)) return send(res, 400, { error: 'type' });
    if (limited('sidcap:' + sid, 200, 36e5)) return send(res, 200, { ok: true });               // не больше 200 событий на визит в час
    if (o.type === 'visit' && limited('visit:' + sid, 1, 432e5)) return send(res, 200, { ok: true });   // один визит на сессию за 12 часов
    const x = {}; if (Number.isFinite(+o.lng) && Number.isFinite(+o.lat)) { x.lng = +(+o.lng).toFixed(4); x.lat = +(+o.lat).toFixed(4); }
    track(o.type, sid, x); return send(res, 200, { ok: true });
  }
  if (m === 'POST' && p === '/api/leads') {   // заявка на изыскания
    if (rl('lead')) return tooMany();
    const o = parseJSON(await body(req)); if (!o) return send(res, 400, { error: 'json' }); const name = clean(o.name, 80), phone = String(o.phone || '').trim();
    if (!name) return send(res, 400, { error: 'Укажите имя' });
    if (!/^[+\d][\d\s()\-]{6,20}$/.test(phone)) return send(res, 400, { error: 'Укажите телефон, например +7 701 123 45 67' });
    const lng = +o.lng, lat = +o.lat;
    const lead = { id: crypto.randomBytes(8).toString('hex'), created: new Date().toISOString(), name, phone, comment: clean(o.comment, 500),
      lng: Number.isFinite(lng) ? +lng.toFixed(5) : null, lat: Number.isFinite(lat) ? +lat.toFixed(5) : null, status: 'new' };
    leads.push(lead); save(LEAD_FILE, leads); track('lead', sid, { lng: lead.lng, lat: lead.lat });
    return send(res, 201, { ok: true });
  }
  let r;
  if (m === 'POST' && (r = p.match(/^\/api\/orders\/(\w+)\/pay$/))) {   // ТОЛЬКО демо-режим (запуск с --demo). В боевом режиме платит провайдер через вебхук
    if (PAYMENT_MODE !== 'demo') return send(res, 403, { error: 'Демо-оплата отключена' });
    if (rl('pay')) return tooMany();
    const o = parseJSON(await body(req)) || {}, ord = orders.find(x => x.id === r[1]); if (!ord || ord.token !== o.token) return send(res, 404, { error: 'Заказ не найден' });
    markPaid(ord, sid); return send(res, 200, { token: ord.token });
  }
  if (m === 'POST' && p === '/api/payments/webhook') {   // вебхук провайдера: подпись HMAC-SHA256 над «order_id.amount.status»; адаптировать под выбранный банк
    if (PAYMENT_MODE !== 'live') return send(res, 404, { error: 'Not found' });
    const o = parseJSON(await body(req)); if (!o) return send(res, 400, { error: 'json' });
    const expect = crypto.createHmac('sha256', WEBHOOK_SECRET).update(`${o.order_id}.${o.amount}.${o.status}`).digest('hex'), got = String(o.signature || '');
    if (got.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expect))) return send(res, 401, { error: 'bad signature' });
    const ord = orders.find(x => x.id === String(o.order_id)); if (!ord) return send(res, 404, { error: 'order' });
    if (+o.amount !== ord.price) return send(res, 422, { error: 'amount mismatch' });
    if (o.status === 'paid') markPaid(ord, 'webhook');
    return send(res, 200, { ok: true });
  }
  if (m === 'GET' && (r = p.match(/^\/api\/report\/(\w+)$/))) {
    if (rl('report')) return tooMany();
    const ord = orders.find(x => x.token === r[1]); if (!ord || ord.status !== 'paid') return send(res, 402, { error: 'Отчёт не оплачен' });
    const rep = buildReport(ord.lng, ord.lat); if (!rep) return send(res, 404, { error: 'Нет данных' });
    track('report_view', sid, { orderId: ord.id });
    return send(res, 200, { ...rep, passport: passport(ord.lng, ord.lat, ord.obj), orderId: ord.id, paidAt: ord.paidAt });
  }
  // --- админка ---
  if (p.startsWith('/api/admin/')) {
    if (adminLocked(ip)) return send(res, 429, { error: 'Слишком много неверных паролей. Подождите 15 минут.' });
    if (!isAdmin(req)) { adminFail(ip); return send(res, 401, { error: 'Неверный пароль' }); }
    if (m === 'GET' && p === '/api/admin/boreholes') return send(res, 200, boreholes);
    if (m === 'GET' && p === '/api/admin/orders') return send(res, 200, orders.slice().reverse());
    if (m === 'POST' && p === '/api/admin/boreholes') {
      const o = parseJSON(await body(req)); const err = validateBH(o); if (err) return send(res, 400, { error: err });
      const nb = legacyToV2(o, 'admin'), updated = boreholes.some(x => x.id === nb.id);   // быстрая запись: уходит «на проверку», а не сразу в модель
      const s = upsertBoreholes([nb]); return send(res, 200, { ok: true, updated, ...s });
    }
    if (m === 'POST' && p === '/api/admin/import') {
      const csv = String((parseJSON(await body(req, 25e6)) || {}).csv || '');
      const first = csv.split('\n')[0].toLowerCase(), v2 = first.includes('layer_from');
      let rows;
      if (v2) { const r2 = parseBoreholesCSV(csv); if (r2.error) return send(res, 400, { error: r2.error }); rows = r2.rows; }   // формат по слоям; ошибки данных не блокируют загрузку — они попадают в проверку
      else { const r3 = parseCSV(csv); if (r3.errors.length) return send(res, 400, { error: r3.errors.slice(0, 10).join('\n'), errors: r3.errors.length }); rows = r3.rows; }   // старый формат: всё или ничего
      return send(res, 200, { ...upsertBoreholes(rows), format: v2 ? 'по слоям' : 'упрощённый' });
    }
    if (m === 'POST' && p === '/api/admin/review') {   // решение геолога: accept | reject | reopen
      const o = parseJSON(await body(req)) || {}; const b = boreholes.find(x => x.id === o.id); if (!b) return send(res, 404, { error: 'Скважина не найдена' });
      const note = clean(o.note, 300);
      if (o.action === 'accept') {
        applyChecks(b); const errs = b.issues.filter(i => i.sev === 'error'), warns = b.issues.filter(i => i.sev === 'warn');
        if (errs.length) return send(res, 409, { error: `Есть ошибки (${errs.length}) — исправьте данные и загрузите заново.`, issues: b.issues });
        if (warns.length && note.length < 3) return send(res, 400, { error: `Есть предупреждения (${warns.length}): напишите заметку — почему данные можно принять.` });
        b.status = 'verified'; b.verified = true; b.review = { note, at: new Date().toISOString(), by: 'админ', warns: warns.length };
      } else if (o.action === 'reject') { b.status = 'rejected'; b.verified = false; b.review = { note, at: new Date().toISOString(), by: 'админ' }; }
      else if (o.action === 'reopen') { b.status = 'review'; b.verified = false; b.review = null; }
      else return send(res, 400, { error: 'action' });
      recheckAll(); save(BH_FILE, boreholes); return send(res, 200, { ok: true, status: b.status });
    }
    if (m === 'POST' && p === '/api/admin/recheck') { recheckAll(); save(BH_FILE, boreholes); return send(res, 200, { ok: true, total: boreholes.length, demoted: boreholes.filter(b => b.status === 'review' && b.review && b.review.by === 'система').length }); }
    if (m === 'GET' && p === '/api/admin/pilot-report') return send(res, 200, pilotReport(q.get('demo') === '1'));
    if (m === 'GET' && p === '/api/admin/check-config') return send(res, 200, { checks: CHECKS, acc: ACC_RU, acc_weights: ACC_W, classes: SOIL_CLASSES });
    if (m === 'GET' && p === '/api/admin/soil-dict') {
      const unmapped = [...new Set(boreholes.flatMap(b => b.layers.filter(l => l.cls == null).map(l => l.soil)))];
      return send(res, 200, { dict: soilDict, classes: SOIL_CLASSES, unmapped });
    }
    if (m === 'POST' && p === '/api/admin/soil-dict') {
      const o = parseJSON(await body(req)) || {}, pat = normSoil(clean(o.p, 40)), cls = +o.cls;
      if (!/^[а-яa-z\-]{3,40}$/.test(pat)) return send(res, 400, { error: 'Начало названия: только буквы, не короче 3 знаков (например «суглин»)' });
      if (!Number.isInteger(cls) || cls < 0 || cls > 4) return send(res, 400, { error: 'Класс от 0 до 4' });
      soilDict = soilDict.filter(e => normSoil(e.p) !== pat).concat([{ p: pat, cls }]); save(SOIL_FILE, soilDict); recheckAll(); save(BH_FILE, boreholes); return send(res, 200, { ok: true });
    }
    if (m === 'DELETE' && (r = p.match(/^\/api\/admin\/soil-dict\/(.+)$/))) { const raw = safeDecode(r[1]); if (raw === null) return send(res, 400, { error: 'Некорректный адрес' }); const pat = normSoil(raw); soilDict = soilDict.filter(e => normSoil(e.p) !== pat); save(SOIL_FILE, soilDict); recheckAll(); save(BH_FILE, boreholes); return send(res, 200, { ok: true }); }
    if (m === 'DELETE' && (r = p.match(/^\/api\/admin\/boreholes\/(.+)$/))) {
      const id = safeDecode(r[1]); if (id === null) return send(res, 400, { error: 'Некорректный адрес' }); const n = boreholes.length; boreholes = boreholes.filter(x => x.id !== id); save(BH_FILE, boreholes); return send(res, 200, { deleted: n - boreholes.length });
    }
    if (m === 'GET' && p === '/api/admin/layers') {
      const cnt = a => ({ total: a.length, demo: a.filter(x => x.source === 'demo').length });
      const lights = parcelLights('izhs');
      return send(res, 200, { parcels: cnt(parcels), constraints: cnt(constraints), utilities: cnt(utilities), coverage: cnt(coverage), grid: { total: gridCells.length, size_m: gridCells.length ? gridCells[0].size_m : null }, parcels_ha: +parcels.reduce((s, x) => s + x.area_ha, 0).toFixed(1),
        coverage_list: coverage.map(c => ({ id: c.id, layer: c.layer, as_of: c.as_of, source: c.source })),
        geo: { parcels: { type: 'FeatureCollection', features: lights.map(({ p, pp }) => ({ type: 'Feature', properties: { id: p.id, light: pp.overall, status: p.status }, geometry: { type: 'Polygon', coordinates: [p.ring] } })) },
          constraints: { type: 'FeatureCollection', features: constraints.map(z => ({ type: 'Feature', properties: { id: z.id, kind: z.kind, name: z.name }, geometry: { type: 'Polygon', coordinates: [z.ring] } })) },
          coverage: { type: 'FeatureCollection', features: coverage.map(c => ({ type: 'Feature', properties: { id: c.id, layer: c.layer }, geometry: { type: 'Polygon', coordinates: [c.ring] } })) },
          utilities: { type: 'FeatureCollection', features: utilities.map(u => ({ type: 'Feature', properties: { id: u.id, kind: u.kind, capacity_free: u.capacity_free }, geometry: { type: 'LineString', coordinates: u.line } })) } } });
    }
    let lm;
    if (m === 'POST' && (lm = p.match(/^\/api\/admin\/layer\/(parcels|constraints|utilities|coverage)$/))) {
      const name = lm[1], o = parseJSON(await body(req, 25e6)); if (!o) return send(res, 400, { error: 'Файл не является корректным JSON' });
      const r2 = importLayer(name, o.geojson);
      if (r2.error) return send(res, 400, r2);
      const arr = name === 'parcels' ? parcels : name === 'constraints' ? constraints : name === 'utilities' ? utilities : coverage; let added = 0, updated = 0;
      if (o.replace) { arr.length = 0; }
      for (const row of r2.rows) { const i = arr.findIndex(x => x.id === row.id); if (i >= 0) { arr[i] = row; updated++; } else { arr.push(row); added++; } }
      save({ parcels: PARCELS_FILE, constraints: CONS_FILE, utilities: UTIL_FILE, coverage: COV_FILE }[name], arr); return send(res, 200, { added, updated });
    }
    if (m === 'POST' && p === '/api/admin/grid') {   // построить (заменить) сетку территории; size_m и необязательный прямоугольник box
      const o = parseJSON(await body(req)) || {}, size = +o.size_m;
      if (o.clear) { gridCells = []; save(GRID_FILE, gridCells); return send(res, 200, { total: 0 }); }
      if (!GRID_SIZES.includes(size)) return send(res, 400, { error: `Размер ячейки: ${GRID_SIZES.join(', ')} м` });
      let box = o.box; if (box) { box = { minLng: +box.minLng, minLat: +box.minLat, maxLng: +box.maxLng, maxLat: +box.maxLat }; if (!Object.values(box).every(Number.isFinite) || box.minLng >= box.maxLng || box.minLat >= box.maxLat) return send(res, 400, { error: 'Некорректная область' }); }
      else box = defaultGridBox();
      if (!box) return send(res, 400, { error: 'Нет области: загрузите участки или покрытие данных, либо укажите прямоугольник' });
      const g = buildGrid(size, box); if (g.error) return send(res, 400, g);
      gridCells = g.cells; save(GRID_FILE, gridCells);
      const lights = cellLights('izhs'), count = { green: 0, yellow: 0, red: 0, gray: 0 }; lights.forEach(x => count[x.light]++);
      return send(res, 200, { total: gridCells.length, size_m: size, count });
    }
    if (m === 'POST' && p === '/api/admin/delete-demo-layers') {
      parcels = parcels.filter(x => x.source !== 'demo'); constraints = constraints.filter(x => x.source !== 'demo'); utilities = utilities.filter(x => x.source !== 'demo'); coverage = coverage.filter(x => x.source !== 'demo');
      save(PARCELS_FILE, parcels); save(CONS_FILE, constraints); save(UTIL_FILE, utilities); save(COV_FILE, coverage); return send(res, 200, { ok: true });
    }
    if (m === 'GET' && p === '/api/admin/analytics') return send(res, 200, analytics(Math.min(180, Math.max(1, +q.get('days') || 30))));
    if (m === 'GET' && p === '/api/admin/leads') return send(res, 200, leads.slice().reverse());
    if (m === 'POST' && p === '/api/admin/lead-status') {
      const o = parseJSON(await body(req)) || {}; const l = leads.find(x => x.id === o.id); if (!l || !['new', 'work', 'done'].includes(o.status)) return send(res, 400, { error: 'Некорректно' });
      l.status = o.status; save(LEAD_FILE, leads); return send(res, 200, { ok: true });
    }
    if (m === 'POST' && p === '/api/admin/seed-analytics') { if (events.some(e => e.demo)) return send(res, 400, { error: 'Демо-аналитика уже загружена' }); return send(res, 200, { visitors: seedAnalytics() }); }
    if (m === 'POST' && p === '/api/admin/delete-demo-analytics') { deleteDemoAnalytics(); return send(res, 200, { ok: true }); }
    if (m === 'POST' && p === '/api/admin/delete-demo') { const n = boreholes.length; boreholes = boreholes.filter(x => x.source !== 'demo'); save(BH_FILE, boreholes); return send(res, 200, { deleted: n - boreholes.length }); }
  }
  return send(res, 404, { error: 'Not found' });
}

function serveStatic(req, res, url) {
  let rel; try { rel = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
  if (rel === '/') rel = '/index.html'; if (rel === '/admin') rel = '/admin.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SEC_HEADERS }); return res.end('Не найдено'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', ...SEC_HEADERS }); res.end(data);
  });
}

const srv = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    serveStatic(req, res, url);
  } catch (e) { console.error(e); if (!res.headersSent) send(res, 500, { error: 'Ошибка сервера' }); }
});
srv.on('error', e => { if (e.code === 'EADDRINUSE') { console.error(`Порт ${PORT} уже занят: карта, скорее всего, уже запущена. Откройте http://localhost:${PORT}`); process.exit(1); } throw e; });
srv.listen(PORT, () => console.log(`3D Караганда MVP: http://localhost:${PORT}   админка: /admin   оплата: ${PAYMENT_MODE}${PAYMENT_MODE === 'demo' ? ' (ДЕМО — настоящие деньги не принимаются)' : PAYMENT_MODE === 'free' ? ' (БЕСПЛАТНЫЙ ПРОБНЫЙ ПЕРИОД: отчёты выдаются без оплаты)' : ''}${ADMIN_PASSWORD === 'admin' ? '   ВНИМАНИЕ: пароль админки по умолчанию «admin» — смените!' : ''}`));
