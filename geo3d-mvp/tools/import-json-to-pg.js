'use strict';
/* Одноразовый (но повторяемый) перенос данных из data/*.json в PostgreSQL/PostGIS.
   Запуск:
     node tools/import-json-to-pg.js --dry              только прочитать и проверить, ничего не писать (pg не нужен)
     node tools/import-json-to-pg.js --migrate --apply  применить migrations/*.sql и записать данные
     node tools/import-json-to-pg.js --apply            только данные (схема уже есть)
   Подключение: DATABASE_URL в .env или в окружении. Источник: data/ (или DATA_DIR=путь к копии).
   Повторный запуск безопасен: записи обновляются по id; события заменяются целиком (это снимок журнала). */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
try { for (const l of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } } catch { /* .env необязателен */ }
const db = require(path.join(ROOT, 'db.js'));
const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry') || !args.has('--apply');

const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(+v)) ? null : +v;
const point = (lng, lat) => (Number.isFinite(+lng) && Number.isFinite(+lat)) ? JSON.stringify({ type: 'Point', coordinates: [+lng, +lat] }) : null;
const poly = ring => ring && ring.length >= 4 ? JSON.stringify({ type: 'Polygon', coordinates: [ring] }) : null;
const line = pts => pts && pts.length >= 2 ? JSON.stringify({ type: 'LineString', coordinates: pts }) : null;
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const ts = ms => new Date(ms).toISOString();

/* ---------- чтение и преобразование (без БД) ---------- */
const problems = [];
const warn = (what, id, why) => problems.push(`${what} ${id}: ${why}`);

function build() {
  const bhs = db.load('boreholes', []), out = {};
  out.boreholes = []; out.layers = [];
  for (const b of bhs) {
    const g = point(b.lng, b.lat); if (!g) { warn('скважина', b.id, 'нет координат — пропущена'); continue; }
    out.boreholes.push({ id: b.id, report_id: b.report_id || '', g, crs_src: b.crs_src || '', acc: ['A', 'B', 'C', 'D'].includes(b.acc) ? b.acc : 'D', z: num(b.z), z_src: b.z_src || '',
      drilled_on: b.date || null, depth: num(b.depth), method: b.method || '', org: b.org || '', doc: b.doc || '', gw_first: num(b.gw_first), gw_stable: num(b.gw_stable), gw_date: b.gw_date || null,
      bearing_kpa: num(b.bearing_kpa), aggressive: b.aggressive || '', status: ['review', 'verified', 'rejected'].includes(b.status) ? b.status : 'review', verified: !!b.verified,
      issues: JSON.stringify(b.issues || []), incons: JSON.stringify(b._incons || []), review: b.review ? JSON.stringify(b.review) : null, source: b.source || '', loaded_at: b.loaded_at || null });
    (b.layers || []).forEach((l, i) => {
      if (!(num(l.to) >= num(l.from))) return warn('слой', `${b.id}#${i + 1}`, `to < from (${l.from}…${l.to}) — пропущен`);
      out.layers.push({ borehole_id: b.id, layer_no: i + 1, from_m: num(l.from), to_m: num(l.to), soil: l.soil || '', cls: num(l.cls), cls_src: l.cls_src || '', ige: l.ige == null ? null : String(l.ige) });
    });
  }
  out.parcels = db.load('parcels', []).flatMap(p => { const g = poly(p.ring); if (!g) { warn('участок', p.id, 'нет контура'); return []; }
    const known = new Set(['id', 'cad', 'ring', 'area_ha', 'status', 'purposes', 'zone', 'max_floors', 'slope_pct', 'encumbrance', 'apz', 'tu', 'source']);
    return [{ id: p.id, cad: p.cad || '', g, area_ha: num(p.area_ha), status: p.status, purposes: p.purposes || [], zone: p.zone || '', max_floors: num(p.max_floors), slope_pct: num(p.slope_pct), encumbrance: p.encumbrance || '', apz: !!p.apz, tu: !!p.tu, source: p.source || '',
      props: JSON.stringify(Object.fromEntries(Object.entries(p).filter(([k]) => !known.has(k)))) }]; });
  out.constraints = db.load('constraints', []).flatMap(c => { const g = poly(c.ring); if (!g) { warn('ограничение', c.id, 'нет контура'); return []; }
    return [{ id: c.id, kind: c.kind, name: c.name || '', regime: c.regime || '', g, source: c.source || '', props: JSON.stringify(Object.fromEntries(Object.entries(c).filter(([k]) => !['id', 'kind', 'name', 'regime', 'ring', 'source'].includes(k)))) }]; });
  out.utilities = db.load('utilities', []).flatMap(u => { const g = line(u.line); if (!g) { warn('сеть', u.id, 'нет линии'); return []; }
    return [{ id: u.id, kind: u.kind, g, capacity_free: num(u.capacity_free), owner: u.owner || '', source: u.source || '', props: JSON.stringify(Object.fromEntries(Object.entries(u).filter(([k]) => !['id', 'kind', 'line', 'capacity_free', 'owner', 'source'].includes(k)))) }]; });
  out.coverage = db.load('coverage', []).flatMap(c => { const g = poly(c.ring); if (!g) { warn('покрытие', c.id, 'нет контура'); return []; } return [{ id: c.id, layer: c.layer, as_of: c.as_of || null, g, source: c.source || '' }]; });
  out.orders = db.load('orders', []).flatMap(o => { const g = point(o.lng, o.lat); if (!g) { warn('заказ', o.id, 'нет координат — пропущен'); return []; }
    return [{ id: o.id, token_hash: sha(o.token || o.id), g, email: o.email || '', price: num(o.price) || 0, free: !!o.free, obj: ['izhs', 'multi'].includes(o.obj) ? o.obj : null, status: o.status, created_at: o.created, paid_at: o.paidAt || null, demo: !!o.demo }]; });
  out.leads = db.load('leads', []).map(l => ({ id: l.id, created_at: l.created, name: l.name || '', phone: l.phone || '', comment: l.comment || '', g: point(l.lng, l.lat), status: ['new', 'work', 'done'].includes(l.status) ? l.status : 'new', demo: !!l.demo }));
  out.events = db.events.readAll().map(e => { const { t, type, sid, demo, ...rest } = e; return { ts: ts(t), type, sid: sid || 'anon', demo: !!demo, payload: JSON.stringify(rest) }; });
  out.soil = (db.load('soilDict', null) || []).map(e => ({ pattern: e.p, cls: e.cls }));
  return out;
}

/* ---------- запись в БД ---------- */
const UPSERT = {
  boreholes: { cols: ['id', 'report_id', 'geom', 'crs_src', 'acc', 'z', 'z_src', 'drilled_on', 'depth', 'method', 'org', 'doc', 'gw_first', 'gw_stable', 'gw_date', 'bearing_kpa', 'aggressive', 'status', 'verified', 'issues', 'incons', 'review', 'source', 'loaded_at'],
    sql: 'INSERT INTO boreholes (id,report_id,geom,crs_src,acc,z,z_src,drilled_on,depth,method,org,doc,gw_first,gw_stable,gw_date,bearing_kpa,aggressive,status,verified,issues,incons,review,source,loaded_at) VALUES ($1,$2,ST_SetSRID(ST_GeomFromGeoJSON($3),4326),$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21::jsonb,$22::jsonb,$23,$24) ON CONFLICT (id) DO UPDATE SET report_id=EXCLUDED.report_id,geom=EXCLUDED.geom,crs_src=EXCLUDED.crs_src,acc=EXCLUDED.acc,z=EXCLUDED.z,z_src=EXCLUDED.z_src,drilled_on=EXCLUDED.drilled_on,depth=EXCLUDED.depth,method=EXCLUDED.method,org=EXCLUDED.org,doc=EXCLUDED.doc,gw_first=EXCLUDED.gw_first,gw_stable=EXCLUDED.gw_stable,gw_date=EXCLUDED.gw_date,bearing_kpa=EXCLUDED.bearing_kpa,aggressive=EXCLUDED.aggressive,status=EXCLUDED.status,verified=EXCLUDED.verified,issues=EXCLUDED.issues,incons=EXCLUDED.incons,review=EXCLUDED.review,source=EXCLUDED.source,loaded_at=EXCLUDED.loaded_at,updated_at=now()',
    vals: r => [r.id, r.report_id, r.g, r.crs_src, r.acc, r.z, r.z_src, r.drilled_on, r.depth, r.method, r.org, r.doc, r.gw_first, r.gw_stable, r.gw_date, r.bearing_kpa, r.aggressive, r.status, r.verified, r.issues, r.incons, r.review, r.source, r.loaded_at] },
  parcels: { sql: 'INSERT INTO parcels (id,cad,geom,area_ha,status,purposes,zone,max_floors,slope_pct,encumbrance,apz,tu,source,props) VALUES ($1,$2,ST_SetSRID(ST_GeomFromGeoJSON($3),4326),$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb) ON CONFLICT (id) DO UPDATE SET cad=EXCLUDED.cad,geom=EXCLUDED.geom,area_ha=EXCLUDED.area_ha,status=EXCLUDED.status,purposes=EXCLUDED.purposes,zone=EXCLUDED.zone,max_floors=EXCLUDED.max_floors,slope_pct=EXCLUDED.slope_pct,encumbrance=EXCLUDED.encumbrance,apz=EXCLUDED.apz,tu=EXCLUDED.tu,source=EXCLUDED.source,props=EXCLUDED.props',
    vals: r => [r.id, r.cad, r.g, r.area_ha, r.status, r.purposes, r.zone, r.max_floors, r.slope_pct, r.encumbrance, r.apz, r.tu, r.source, r.props] },
  constraints: { sql: 'INSERT INTO constraints (id,kind,name,regime,geom,source,props) VALUES ($1,$2,$3,$4,ST_SetSRID(ST_GeomFromGeoJSON($5),4326),$6,$7::jsonb) ON CONFLICT (id) DO UPDATE SET kind=EXCLUDED.kind,name=EXCLUDED.name,regime=EXCLUDED.regime,geom=EXCLUDED.geom,source=EXCLUDED.source,props=EXCLUDED.props',
    vals: r => [r.id, r.kind, r.name, r.regime, r.g, r.source, r.props] },
  utilities: { sql: 'INSERT INTO utilities (id,kind,geom,capacity_free,owner,source,props) VALUES ($1,$2,ST_SetSRID(ST_GeomFromGeoJSON($3),4326),$4,$5,$6,$7::jsonb) ON CONFLICT (id) DO UPDATE SET kind=EXCLUDED.kind,geom=EXCLUDED.geom,capacity_free=EXCLUDED.capacity_free,owner=EXCLUDED.owner,source=EXCLUDED.source,props=EXCLUDED.props',
    vals: r => [r.id, r.kind, r.g, r.capacity_free, r.owner, r.source, r.props] },
  coverage: { sql: 'INSERT INTO coverage (id,layer,as_of,geom,source) VALUES ($1,$2,$3,ST_SetSRID(ST_GeomFromGeoJSON($4),4326),$5) ON CONFLICT (id) DO UPDATE SET layer=EXCLUDED.layer,as_of=EXCLUDED.as_of,geom=EXCLUDED.geom,source=EXCLUDED.source',
    vals: r => [r.id, r.layer, r.as_of, r.g, r.source] },
  orders: { sql: 'INSERT INTO orders (id,token_hash,geom,email,price,free,obj,status,created_at,paid_at,demo) VALUES ($1,$2,ST_SetSRID(ST_GeomFromGeoJSON($3),4326),$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO UPDATE SET token_hash=EXCLUDED.token_hash,geom=EXCLUDED.geom,email=EXCLUDED.email,price=EXCLUDED.price,free=EXCLUDED.free,obj=EXCLUDED.obj,status=EXCLUDED.status,paid_at=EXCLUDED.paid_at,demo=EXCLUDED.demo',
    vals: r => [r.id, r.token_hash, r.g, r.email, r.price, r.free, r.obj, r.status, r.created_at, r.paid_at, r.demo] },
  leads: { sql: 'INSERT INTO leads (id,created_at,name,phone,comment,geom,status,demo) VALUES ($1,$2,$3,$4,$5,CASE WHEN $6::text IS NULL THEN NULL ELSE ST_SetSRID(ST_GeomFromGeoJSON($6),4326) END,$7,$8) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,phone=EXCLUDED.phone,comment=EXCLUDED.comment,geom=EXCLUDED.geom,status=EXCLUDED.status,demo=EXCLUDED.demo',
    vals: r => [r.id, r.created_at, r.name, r.phone, r.comment, r.g, r.status, r.demo] },
  soil: { sql: 'INSERT INTO soil_dictionary (pattern,cls) VALUES ($1,$2) ON CONFLICT (pattern) DO UPDATE SET cls=EXCLUDED.cls', vals: r => [r.pattern, r.cls] },
};

async function migrate(c) {
  await c.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const done = new Set((await c.query('SELECT name FROM schema_migrations')).rows.map(r => r.name));
  for (const f of fs.readdirSync(path.join(ROOT, 'migrations')).filter(f => f.endsWith('.sql')).sort()) {
    if (done.has(f)) { console.log('  миграция', f, '— уже применена'); continue; }
    await c.query('BEGIN');
    try { await c.query(fs.readFileSync(path.join(ROOT, 'migrations', f), 'utf8')); await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]); await c.query('COMMIT'); console.log('  миграция', f, '— применена'); }
    catch (e) { await c.query('ROLLBACK'); throw new Error(`миграция ${f}: ${e.message}`); }
  }
}

async function apply(d) {
  if (!process.env.DATABASE_URL) throw new Error('Не задан DATABASE_URL (см. .env.example)');
  let Client; try { ({ Client } = require('pg')); } catch { throw new Error('Не установлен пакет pg: выполните «npm install» в папке geo3d-mvp'); }
  const local = /@(localhost|127\.0\.0\.1)[:\/]/.test(process.env.DATABASE_URL);
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: local ? false : { rejectUnauthorized: false } });   // Supabase требует SSL
  await c.connect();
  try {
    if (args.has('--migrate')) await migrate(c);
    await c.query('BEGIN');
    for (const [name, spec] of Object.entries(UPSERT)) { const rows = d[name === 'soil' ? 'soil' : name]; for (const r of rows) await c.query(spec.sql, spec.vals(r)); console.log('  записано', name, rows.length); }
    for (const l of d.layers.length ? [d.layers] : []) {   // слои скважин: полная замена по каждой скважине
      await c.query('DELETE FROM borehole_layers WHERE borehole_id = ANY($1)', [d.boreholes.map(b => b.id)]);
      for (const r of l) await c.query('INSERT INTO borehole_layers (borehole_id,layer_no,from_m,to_m,soil,cls,cls_src,ige) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [r.borehole_id, r.layer_no, r.from_m, r.to_m, r.soil, r.cls, r.cls_src, r.ige]);
      console.log('  записано borehole_layers', l.length);
    }
    await c.query('DELETE FROM events');
    for (let i = 0; i < d.events.length; i += 500) {
      const part = d.events.slice(i, i + 500);
      await c.query('INSERT INTO events (ts,type,sid,demo,payload) SELECT * FROM unnest($1::timestamptz[],$2::text[],$3::text[],$4::boolean[],$5::jsonb[])', [part.map(e => e.ts), part.map(e => e.type), part.map(e => e.sid), part.map(e => e.demo), part.map(e => e.payload)]);
    }
    console.log('  записано events', d.events.length);
    /* сверка: сколько записей в базе против источника, и суммарная мощность слоёв */
    const cnt = async t => +(await c.query(`SELECT count(*) FROM ${t}`)).rows[0].count;
    const sum = +(await c.query('SELECT coalesce(sum(to_m-from_m),0) s FROM borehole_layers')).rows[0].s;
    const want = { boreholes: d.boreholes.length, borehole_layers: d.layers.length, parcels: d.parcels.length, constraints: d.constraints.length, utilities: d.utilities.length, coverage: d.coverage.length, orders: d.orders.length, leads: d.leads.length, events: d.events.length, soil_dictionary: d.soil.length };
    let bad = 0; console.log('\nСверка (источник → база):');
    for (const [t, n] of Object.entries(want)) { const got = await cnt(t); const ok = got >= n && (t === 'events' ? got === n : true); if (!ok) bad++; console.log(' ', ok ? 'OK ' : 'ERR', t.padEnd(16), n, '→', got); }
    const srcSum = d.layers.reduce((s, l) => s + (l.to_m - l.from_m), 0);
    const sumOk = Math.abs(sum - srcSum) < 0.01; if (!sumOk) bad++; console.log(' ', sumOk ? 'OK ' : 'ERR', 'суммарная мощность слоёв'.padEnd(16), srcSum.toFixed(2), '→', sum.toFixed(2));
    if (bad) throw new Error('Сверка не сошлась, изменения отменены');
    await c.query('COMMIT'); console.log('\nГотово, изменения зафиксированы.');
  } catch (e) { try { await c.query('ROLLBACK'); } catch { /* нет открытой транзакции */ } throw e; }
  finally { await c.end(); }
}

(async () => {
  const d = build();
  console.log(DRY ? 'РЕЖИМ ПРОВЕРКИ (в базу ничего не пишется)' : 'ЗАПИСЬ В БАЗУ', '— источник:', db.DATA);
  for (const [k, v] of Object.entries(d)) console.log(' ', k.padEnd(12), v.length);
  const srcSum = d.layers.reduce((s, l) => s + (l.to_m - l.from_m), 0); console.log('  суммарная мощность слоёв, м:', srcSum.toFixed(2));
  if (problems.length) { console.log(`\nПропущено/замечаний: ${problems.length}`); problems.slice(0, 30).forEach(p => console.log('  -', p)); }
  if (DRY) { console.log('\nДля записи: node tools/import-json-to-pg.js --migrate --apply'); return; }
  await apply(d);
})().catch(e => { console.error('\nОШИБКА:', e.message); process.exit(1); });
