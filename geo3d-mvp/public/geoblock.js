/* Геологический 3D-блок (блок-диаграмма) — так показывают разрезы геологи:
   цельное тело со СГЛАЖЕННЫМИ границами слоёв, штриховки грунтов, колонки реальных скважин, шкала глубины, вырезы.
   three.js подгружается только при открытии. openGeoBlock(report, {onSelect, onClose}) → { selectLayer(li), setLayer(li), close() }
   Допущения (показываются в интерфейсе): поверхность условно плоская (рельеф не учтён), границы слоёв — интерполяция между скважинами. */
(function () {
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js';
  const ORBIT_URL = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js';
  const loading = {};
  const loadScript = src => loading[src] || (loading[src] = new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => { delete loading[src]; no(new Error('Не удалось загрузить ' + src)); }; document.head.appendChild(s); }));
  const ensureThree = async () => { if (!window.THREE) await loadScript(THREE_URL); if (!THREE.OrbitControls) await loadScript(ORBIT_URL); };

  const css = `
  .gb{position:absolute;left:0;top:0;bottom:0;right:370px;z-index:6;background:#0f1318;display:flex;flex-direction:column;color:var(--text);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;animation:gb-in .35s ease}
  @keyframes gb-in{from{opacity:0;transform:scale(.985)}to{opacity:1;transform:none}}
  .gb-top{display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid var(--line);background:rgba(18,23,30,.95)}
  .gb-top b{font-size:15px}.gb-sub{color:var(--mute);font-size:12px;flex:1}
  .gb-x{border:1px solid var(--line);background:rgba(255,255,255,.06);color:var(--text);border-radius:9px;padding:7px 12px;cursor:pointer;font:inherit}
  .gb-x:hover{background:var(--accent);color:#1b1500}
  .gb-main{flex:1;display:flex;min-height:0}
  .gb-cv{flex:1;position:relative;min-width:0;cursor:grab}
  .gb-cv canvas{display:block;width:100%;height:100%}
  .gb-load{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--mute)}
  .gb-side{flex:0 0 285px;overflow:auto;padding:12px;border-left:1px solid var(--line);background:rgba(18,23,30,.95)}
  .gb-side h4{margin:12px 0 6px;font-size:11px;color:var(--mute);text-transform:uppercase;letter-spacing:.6px;font-weight:600}
  .gb-side h4:first-child{margin-top:0}
  .gb-row{display:flex;flex-direction:column;gap:2px;margin-bottom:9px;font-size:12.5px}
  .gb-row label{display:flex;justify-content:space-between}
  .gb-row input[type=range]{width:100%;accent-color:var(--accent)}
  .gb-chk{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12.5px}.gb-chk label{display:flex;gap:5px;align-items:center;cursor:pointer}
  .gb-btns{display:flex;gap:6px;margin-top:6px}.gb-btns button{flex:1;border:1px solid var(--line);background:rgba(255,255,255,.07);color:var(--text);border-radius:9px;padding:7px 6px;font:inherit;font-size:12.5px;cursor:pointer}
  .gb-btns button:hover{background:rgba(255,255,255,.14)}
  .gb-leg{display:flex;flex-direction:column;gap:5px}
  .gb-li{display:flex;align-items:center;gap:8px;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--text);border-radius:9px;padding:5px 8px;font:inherit;font-size:12.5px;cursor:pointer;text-align:left;transition:background .15s,border-color .15s}
  .gb-li:hover{background:rgba(255,255,255,.1)}.gb-li.on{border-color:var(--accent);background:rgba(242,184,75,.12)}
  .gb-li img{width:30px;height:30px;border-radius:5px;border:1px solid rgba(255,255,255,.25);flex:0 0 30px}
  .gb-li span{flex:1;line-height:1.25}.gb-li small{color:var(--mute);white-space:nowrap}
  .gb-card{border:1px solid var(--line);border-radius:12px;padding:11px;background:rgba(255,255,255,.04);font-size:12.5px;line-height:1.5}
  .gb-card .t{font-weight:700;font-size:14px;margin-bottom:6px}
  .gb-card .g{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin:6px 0}.gb-card .g div{background:rgba(255,255,255,.05);border-radius:7px;padding:5px 7px}
  .gb-card .g small{display:block;color:var(--mute);font-size:10.5px;text-transform:uppercase}
  .gb-card .w{padding:6px 8px;border-radius:7px;background:rgba(90,180,255,.1);border:1px solid rgba(90,180,255,.35);margin:6px 0}
  .gb-card .n{color:var(--mute);font-size:11px;margin-top:6px}
  .gb-card table{width:100%;border-collapse:collapse;font-size:12px}.gb-card td{padding:2px 3px;border-bottom:1px solid var(--line)}.gb-card td:last-child{text-align:right;color:var(--mute)}
  .gb-note{font-size:11px;color:var(--mute);margin-top:10px;line-height:1.5}
  @media (max-width:820px){.gb{right:0}.gb-main{flex-direction:column}.gb-side{flex:0 0 42%;border-left:0;border-top:1px solid var(--line)}}
  @media (prefers-reduced-motion:reduce){.gb{animation:none}}`;
  if (!document.getElementById('gb-css')) { const st = document.createElement('style'); st.id = 'gb-css'; st.textContent = css; document.head.appendChild(st); }

  const fmt = v => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const shade = (h, k) => '#' + hex(h).map(v => clamp(Math.round(v * k), 0, 255).toString(16).padStart(2, '0')).join('');

  /* ---- штриховки грунтов (по мотивам условных обозначений в геологической графике) ---- */
  function hatchCanvas(cls, color) {
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
    g.fillStyle = color; g.fillRect(0, 0, S, S);
    const dark = 'rgba(0,0,0,.42)', light = 'rgba(255,255,255,.30)';
    const wrap = fn => { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) { g.save(); g.translate(dx, dy); fn(); g.restore(); } };
    const line = (x1, y1, x2, y2, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
    const dot = (x, y, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
    if (cls === 0) {            // почвенно-растительный слой: травинки и корешки
      for (let y = 14; y < S; y += 28) for (let x = (y / 28 % 2) * 16 + 6; x < S; x += 32) wrap(() => { line(x, y, x - 4, y - 9, dark, 2); line(x, y, x + 4, y - 9, dark, 2); line(x, y, x, y - 11, dark, 2); });
      for (let i = 0; i < 26; i++) dot((i * 53) % S, (i * 37 + 11) % S, 1.5, dark);
    } else if (cls === 1) {     // суглинок: короткие горизонтальные штрихи с точками
      for (let y = 10; y < S; y += 21) for (let x = (y / 21 % 2) * 22; x < S + 22; x += 44) wrap(() => { line(x, y, x + 20, y, dark, 2.2); dot(x + 32, y + 5, 1.6, dark); });
    } else if (cls === 2) {     // глина: частые сплошные горизонтальные линии
      for (let y = 7; y < S; y += 14) line(0, y, S, y, dark, 2.2);
      for (let y = 14; y < S; y += 28) line(0, y, S, y, light, 1);
    } else if (cls === 3) {     // песок с гравием: точки и мелкие окатыши
      for (let i = 0; i < 70; i++) wrap(() => dot((i * 47 + (i % 7) * 11) % S, (i * 71 + (i % 5) * 17) % S, 1.7, i % 6 === 0 ? light : dark));
      for (let i = 0; i < 9; i++) wrap(() => { g.strokeStyle = dark; g.lineWidth = 1.6; g.beginPath(); g.ellipse((i * 29 + 10) % S, (i * 43 + 20) % S, 6, 4, i, 0, 7); g.stroke(); });
    } else {                    // скальный грунт: кладка из угловатых блоков
      for (let row = 0; row < 4; row++) { const y = row * 32, off = (row % 2) * 32; line(0, y, S, y, dark, 2.4); for (let x = off; x < S + 64; x += 64) wrap(() => { line(x, y, x - 6 + (row % 3) * 5, y + 32, dark, 2.4); }); }
      for (let i = 0; i < 12; i++) wrap(() => line((i * 37) % S, (i * 59) % S, (i * 37) % S + 14, (i * 59) % S - 6, light, 1.4));
    }
    return c;
  }
  const gridCanvas = color => {   // поверхность: цвет + сетка (шаг 25 м)
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
    g.fillStyle = color; g.fillRect(0, 0, S, S); g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 2; g.strokeRect(0, 0, S, S); return c;
  };
  const labelSprite = (text, opt = {}) => {
    const size = opt.size || 14, c = document.createElement('canvas'), g = c.getContext('2d'); g.font = `700 ${size * 3}px system-ui,sans-serif`;
    const w = Math.ceil(g.measureText(text).width) + 16; c.width = w; c.height = size * 3 + 12; g.font = `700 ${size * 3}px system-ui,sans-serif`; g.textBaseline = 'middle';
    if (opt.bg) { g.fillStyle = opt.bg; g.fillRect(0, 0, w, c.height); }
    g.lineWidth = 6; g.strokeStyle = 'rgba(15,19,24,.95)'; g.strokeText(text, 8, c.height / 2); g.fillStyle = opt.color || '#e8edf3'; g.fillText(text, 8, c.height / 2);
    const tex = new THREE.CanvasTexture(c), spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    spr.scale.set(c.width / 3 * (opt.k || 1), c.height / 3 * (opt.k || 1), 1); spr.renderOrder = 10; spr.userData.tex = tex; return spr;
  };

  window.openGeoBlock = function (rep, opts) {
    opts = opts || {};
    if (window.__gb) window.__gb.close();
    const { step, n, cells } = rep.block, bhs = rep.block.boreholes || [], EXT = step * n, HALF = EXT / 2, N = 48, G = N + 1, DEPTH = 12, TILE = 22;
    const gb = document.createElement('div'); gb.className = 'gb';
    gb.innerHTML = `<div class="gb-top"><b>Геологический блок</b><span class="gb-sub" id="gbSub"></span><button class="gb-x" id="gbX">✕ Закрыть</button></div>
      <div class="gb-main"><div class="gb-cv" id="gbCv"><div class="gb-load">Загружаем 3D…</div></div>
        <div class="gb-side" id="gbSide"></div></div>`;
    document.body.appendChild(gb);
    let disposed = false, ctl = null;
    const close = () => { if (disposed) return; disposed = true; try { ctl && ctl.dispose(); } catch (_) {} gb.remove(); window.removeEventListener('keydown', onKey); if (window.__gb === api) window.__gb = null; if (opts.onClose) opts.onClose(); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey); gb.querySelector('#gbX').onclick = close;
    const api = { close, selectLayer() {}, setLayer() {} }; window.__gb = api;

    ensureThree().then(() => { if (!disposed) ctl = start(); }).catch(e => { const l = gb.querySelector('.gb-load'); if (l) l.textContent = 'Не удалось загрузить 3D-библиотеку (' + e.message + '). Проверьте интернет и попробуйте ещё раз.'; });
    return api;

    function start() {
      const cv = gb.querySelector('#gbCv'), side = gb.querySelector('#gbSide'); cv.innerHTML = '';
      /* ---------- данные: контакты слоёв на сетке (Catmull-Rom по 11×11 ячейкам) ---------- */
      const C = [0, 1, 2, 3].map(k => { const a = []; for (let j = 0; j < n; j++) { a.push(new Array(n)); } for (const c of cells) a[c.j][c.i] = c.b[k]; return a; });
      const cr = (p0, p1, p2, p3, t) => 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
      const sample = (k, x, yN) => {
        const gx = clamp(x / step + (n - 1) / 2, 0, n - 1), gy = clamp(yN / step + (n - 1) / 2, 0, n - 1), ix = Math.floor(gx), iy = Math.floor(gy), tx = gx - ix, ty = gy - iy;
        const get = (i, j) => C[k][clamp(j, 0, n - 1)][clamp(i, 0, n - 1)], rows = [];
        for (let dj = -1; dj <= 2; dj++) rows.push(cr(get(ix - 1, iy + dj), get(ix, iy + dj), get(ix + 1, iy + dj), get(ix + 2, iy + dj), tx));
        return cr(rows[0], rows[1], rows[2], rows[3], ty);
      };
      // D[k][j*G+i] — глубина границы k (0 — поверхность, 5 — низ блока); i — на восток, j — на юг
      const D = [0, 1, 2, 3, 4, 5].map(() => new Float32Array(G * G));
      for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
        const x = -HALF + i * EXT / N, z = -HALF + j * EXT / N, idx = j * G + i; let prev = 0;
        D[0][idx] = 0; for (let k = 1; k <= 4; k++) { prev = clamp(Math.max(sample(k - 1, x, -z), prev + 0.03), 0, DEPTH - (5 - k) * 0.03); D[k][idx] = prev; } D[5][idx] = DEPTH;
      }
      const range = k => { let lo = 1e9, hi = -1e9; for (const v of D[k]) { if (v < lo) lo = v; if (v > hi) hi = v; } return [lo, hi]; };
      const bnd = [0, ...rep.b, DEPTH];
      const items = [0, 1, 2, 3, 4].map(i => ({ li: i, from: bnd[i], to: bnd[i + 1] }));

      /* ---------- сцена ---------- */
      const W = () => cv.clientWidth || 600, Hh = () => cv.clientHeight || 400;
      const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.setSize(W(), Hh()); cv.appendChild(renderer.domElement);
      const scene = new THREE.Scene(); scene.background = new THREE.Color(0x12171d);
      const camera = new THREE.PerspectiveCamera(38, W() / Hh(), 5, 4000);
      scene.add(new THREE.AmbientLight(0xffffff, .78)); const sun = new THREE.DirectionalLight(0xffffff, .62); sun.position.set(-300, 500, 380); scene.add(sun);
      const controls = new THREE.OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = .09; controls.maxPolarAngle = Math.PI * .495; controls.minDistance = 120; controls.maxDistance = 1400;
      const root = new THREE.Group(); scene.add(root);

      const tex = [], mats = LAYERS.map((L, i) => {
        const t = new THREE.CanvasTexture(hatchCanvas(i, L.color)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); tex.push(t);
        const ts = new THREE.CanvasTexture(gridCanvas(shade(L.color, 1.12))); ts.wrapS = ts.wrapT = THREE.RepeatWrapping; tex.push(ts);
        return { wall: new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide, transparent: true }), wallFlat: new THREE.MeshLambertMaterial({ color: L.color, side: THREE.DoubleSide, transparent: true }),
          cap: new THREE.MeshLambertMaterial({ color: shade(L.color, 1.08), side: THREE.DoubleSide, transparent: true }), surf: new THREE.MeshLambertMaterial({ map: ts, side: THREE.DoubleSide, transparent: true }) };
      });
      const swatch = i => { const c = document.createElement('canvas'); c.width = c.height = 30; c.getContext('2d').drawImage(hatchCanvas(i, LAYERS[i].color), 0, 0, 30, 30); return c.toDataURL(); };

      /* ---------- состояние ---------- */
      const S = { ex: 5, cutS: 0, cutE: 0, hatch: true, bh: true, water: true, lines: true, explode: false, sel: null, selBh: null };
      const off = [0, 0, 0, 0, 0];
      let built = [], extra = [], lastEx = null;
      const disposeObj = o => o.traverse(c => {
        if (c.geometry) c.geometry.dispose();
        if (c.userData && c.userData.tex) { c.userData.tex.dispose(); c.material.dispose(); }                      // подписи
        else if ((c.isLine || (c.isMesh && (c.userData.bh || c.material && c.material.isMeshBasicMaterial))) && c.material) c.material.dispose();   // линии, колонки, вода (общие материалы слоёв не трогаем)
      });

      function range2() { const cs = Math.round(S.cutS / 100 * N), ce = Math.round(S.cutE / 100 * N); return { i0: 0, i1: Math.max(4, N - ce), j0: 0, j1: Math.max(4, N - cs) }; }
      const px = i => -HALF + i * EXT / N, pz = j => -HALF + j * EXT / N;

      function layerGroup(li, r) {
        const g = new THREE.Group(), EX = S.ex, top = D[li], bot = D[li + 1], m = mats[li];
        const Y = (arr, idx) => -arr[idx] * EX;
        // шапки: контактные поверхности сверху и снизу слоя
        const capGeo = arr => {
          const pos = [], uv = [], ind = [], w = r.i1 - r.i0 + 1;
          for (let j = r.j0; j <= r.j1; j++) for (let i = r.i0; i <= r.i1; i++) { const idx = j * G + i; pos.push(px(i), Y(arr, idx), pz(j)); uv.push(px(i) / EXT * (EXT / 25), pz(j) / EXT * (EXT / 25)); }
          for (let j = 0; j < r.j1 - r.j0; j++) for (let i = 0; i < r.i1 - r.i0; i++) { const a = j * w + i, b = a + 1, c = a + w, d = c + 1; ind.push(a, c, b, b, c, d); }
          const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(ind); geo.computeVertexNormals(); return geo;
        };
        const topMesh = new THREE.Mesh(capGeo(top), li === 0 ? m.surf : m.cap), botMesh = new THREE.Mesh(capGeo(bot), m.cap); topMesh.userData.layer = botMesh.userData.layer = li; g.add(topMesh, botMesh);
        // стенки: четыре стороны блока, вдоль них границы слоя плавно изгибаются
        const edges = [
          { pts: range1(r.i0, r.i1).map(i => [i, r.j0]) },   // север
          { pts: range1(r.i0, r.i1).map(i => [i, r.j1]) },   // юг
          { pts: range1(r.j0, r.j1).map(j => [r.i0, j]) },   // запад
          { pts: range1(r.j0, r.j1).map(j => [r.i1, j]) }    // восток
        ];
        const pos = [], uv = [], ind = [];
        for (const e of edges) {
          const base = pos.length / 3; let len = 0;
          e.pts.forEach(([i, j], s) => {
            if (s) { const [pi, pj] = e.pts[s - 1]; len += Math.hypot(px(i) - px(pi), pz(j) - pz(pj)); }
            const idx = j * G + i, u = len / TILE;
            pos.push(px(i), Y(top, idx), pz(j)); uv.push(u, top[idx] * EX / TILE);
            pos.push(px(i), Y(bot, idx), pz(j)); uv.push(u, bot[idx] * EX / TILE);
          });
          for (let s = 0; s < e.pts.length - 1; s++) { const A = base + s * 2; ind.push(A, A + 1, A + 2, A + 2, A + 1, A + 3); }   // base — номер первой вершины этой стенки
        }
        const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); wg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); wg.setIndex(ind); wg.computeVertexNormals();
        const wall = new THREE.Mesh(wg, S.hatch ? m.wall : m.wallFlat); wall.userData.layer = li; g.add(wall);
        // линии контактов (чёткие границы, как на геологических разрезах)
        if (S.lines) {
          const lm = new THREE.LineBasicMaterial({ color: 0x0b0e12, transparent: true, opacity: .7 });
          for (const arr of [top, bot]) for (const e of edges) { const pts = e.pts.map(([i, j]) => new THREE.Vector3(px(i), Y(arr, j * G + i), pz(j))); const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lm); g.add(line); }
          for (const [i, j] of [[r.i0, r.j0], [r.i1, r.j0], [r.i0, r.j1], [r.i1, r.j1]]) { const idx = j * G + i; g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(px(i), Y(top, idx), pz(j)), new THREE.Vector3(px(i), Y(bot, idx), pz(j))]), lm)); }
        }
        g.userData.layer = li; return g;
      }
      const range1 = (a, b) => { const o = []; for (let v = a; v <= b; v++) o.push(v); return o; };

      function rebuild() {
        built.forEach(o => { root.remove(o); disposeObj(o); }); extra.forEach(o => { root.remove(o); disposeObj(o); }); built = []; extra = [];
        const r = range2(), EX = S.ex;
        for (let li = 0; li < 5; li++) { const g = layerGroup(li, r); g.position.y = off[li]; root.add(g); built.push(g); }
        const x0 = px(r.i0), x1 = px(r.i1), z0 = pz(r.j0), z1 = pz(r.j1);
        // грунтовые воды
        if (S.water && !S.explode) {
          const pl = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 + 14, z1 - z0 + 14), new THREE.MeshBasicMaterial({ color: 0x5ab4ff, transparent: true, opacity: .26, side: THREE.DoubleSide, depthWrite: false }));
          pl.rotation.x = -Math.PI / 2; pl.position.set((x0 + x1) / 2, -rep.gw * EX, (z0 + z1) / 2); pl.renderOrder = 5; root.add(pl); extra.push(pl);
          const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[x0 - 7, z0 - 7], [x1 + 7, z0 - 7], [x1 + 7, z1 + 7], [x0 - 7, z1 + 7]].map(([x, z]) => new THREE.Vector3(x, -rep.gw * EX, z))), new THREE.LineBasicMaterial({ color: 0x8fd0ff })); root.add(ring); extra.push(ring);
          const lb = labelSprite('УГВ ' + fmt(rep.gw) + ' м', { size: 12, color: '#9fd8ff' }); lb.position.set(x1 + 40, -rep.gw * EX + 4, z1 + 6); root.add(lb); extra.push(lb);
        }
        // колонки реальных скважин
        if (S.bh) for (const b of bhs) {
          const bx = b.x, bz = -b.y; if (bx < x0 - 1 || bx > x1 + 1 || bz < z0 - 1 || bz > z1 + 1) continue;
          const col = new THREE.Group(); col.userData.bh = b.id;
          const segs = b.layers && b.layers.length ? b.layers : [{ from: 0, to: b.bounds[0], cls: 0 }, { from: b.bounds[0], to: b.bounds[1], cls: 1 }, { from: b.bounds[1], to: b.bounds[2], cls: 2 }, { from: b.bounds[2], to: b.bounds[3], cls: 3 }, { from: b.bounds[3], to: b.depth, cls: 4 }];
          for (const sg of segs) { if (sg.cls == null || sg.to <= sg.from) continue; const h = (sg.to - sg.from) * EX; const cy = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, h, 14), new THREE.MeshLambertMaterial({ color: shade(LAYERS[sg.cls].color, 1.25) })); cy.position.set(bx, -(sg.from + sg.to) / 2 * EX, bz); cy.userData.bh = b.id; col.add(cy); }
          const cap = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 1.2, 14), new THREE.MeshBasicMaterial({ color: 0xffffff })); cap.position.set(bx, 1, bz); cap.userData.bh = b.id; col.add(cap);
          const lb = labelSprite(b.id, { size: 10, k: .9 }); lb.position.set(bx, 14 + EX * 1.2, bz); col.add(lb);
          col.position.y = 0; root.add(col); extra.push(col);
        }
        // шкала глубины на юго-западном ребре
        { const sx = x0 - 16, sz = z1 + 14, lm = new THREE.LineBasicMaterial({ color: 0xaab4c0 }); const gp = new THREE.Group();
          gp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(sx, 0, sz), new THREE.Vector3(sx, -DEPTH * EX, sz)]), lm));
          for (let d = 0; d <= DEPTH; d += 3) { gp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(sx - 5, -d * EX, sz), new THREE.Vector3(sx + 5, -d * EX, sz)]), lm)); const t = labelSprite(d + ' м', { size: 11, color: '#cfd6de' }); t.position.set(sx - 24, -d * EX, sz); gp.add(t); }
          root.add(gp); extra.push(gp);
          const nL = labelSprite('С ↑', { size: 16, color: '#f2b84b', k: 1.1 }); nL.position.set((x0 + x1) / 2, 14, z0 - 22); root.add(nL); extra.push(nL); }
        if (lastEx !== EX) { controls.target.y = -DEPTH * EX * .42; lastEx = EX; }   // цель камеры сдвигаем только при смене масштаба, чтобы не сбивать повороты и панорамирование
        applyVisual();
        gb.querySelector('#gbSub').textContent = `${EXT}×${EXT} м · глубина ${DEPTH} м · вертикальный масштаб ×${EX} · поверхность условно плоская (рельеф не учтён) · границы слоёв — интерполяция между скважинами`;
      }

      function applyVisual() {   // выбор слоя: остальные приглушаются
        mats.forEach((m, i) => { const o = S.sel == null || S.sel === i ? 1 : .18; for (const k in m) { const mt = m[k], tr = o < 1; mt.opacity = o; mt.depthWrite = !tr; if (mt.transparent !== tr) { mt.transparent = tr; mt.needsUpdate = true; } mt.emissive && mt.emissive.set(S.sel === i ? 0x2a2a1a : 0x000000); } });   // непрозрачные материалы — без сортировки по прозрачности, иначе слои «мерцают»
        side.querySelectorAll('.gb-li').forEach((el, i) => el.classList.toggle('on', i === S.sel));
      }

      /* ---------- интерфейс ---------- */
      side.innerHTML = `<h4>Вид</h4>
        <div class="gb-row"><label>Вертикальный масштаб <b id="vEx">×5</b></label><input type="range" id="sEx" min="1" max="12" step="1" value="5"></div>
        <div class="gb-row"><label>Вырез с юга <b id="vS">0%</b></label><input type="range" id="sS" min="0" max="85" step="1" value="0"></div>
        <div class="gb-row"><label>Вырез с востока <b id="vE">0%</b></label><input type="range" id="sE" min="0" max="85" step="1" value="0"></div>
        <div class="gb-chk"><label><input type="checkbox" id="cH" checked>Штриховка</label><label><input type="checkbox" id="cB" checked>Скважины</label><label><input type="checkbox" id="cW" checked>Грунтовые воды</label><label><input type="checkbox" id="cL" checked>Контакты</label></div>
        <div class="gb-btns"><button id="bEx">Развести слои</button><button id="bRst">Сбросить вид</button></div>
        <h4>Слои (клик — подробности)</h4><div class="gb-leg">${items.map(it => `<button class="gb-li" data-i="${it.li}"><img src="${swatch(it.li)}" alt=""><span>${E(LAYERS[it.li].name)}</span><small>${fmt(it.from)}–${fmt(it.to)} м</small></button>`).join('')}</div>
        <h4>Информация</h4><div class="gb-card" id="gbCard"></div>
        <div class="gb-note">Блок построен по ${bhs.length ? bhs.length + ' скважинам внутри блока и ближайшим соседям' : 'ближайшим скважинам'}. Штриховки — условные обозначения грунтов. Только ориентировочная модель: не заменяет инженерно-геологические изыскания.</div>`;
      const $ = id => side.querySelector('#' + id);
      let pending = false; const later = () => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; rebuild(); }); };
      $('sEx').oninput = e => { S.ex = +e.target.value; $('vEx').textContent = '×' + S.ex; later(); };
      $('sS').oninput = e => { S.cutS = +e.target.value; $('vS').textContent = S.cutS + '%'; later(); };
      $('sE').oninput = e => { S.cutE = +e.target.value; $('vE').textContent = S.cutE + '%'; later(); };
      $('cH').onchange = e => { S.hatch = e.target.checked; later(); }; $('cB').onchange = e => { S.bh = e.target.checked; later(); }; $('cW').onchange = e => { S.water = e.target.checked; later(); }; $('cL').onchange = e => { S.lines = e.target.checked; later(); };
      $('bEx').onclick = () => { S.explode = !S.explode; $('bEx').textContent = S.explode ? 'Собрать слои' : 'Развести слои'; later(); };
      const homeView = () => { const d = 560; camera.position.set(d * .62, d * .48, d * .75); controls.target.set(0, -DEPTH * S.ex * .42, 0); controls.update(); };
      $('bRst').onclick = homeView;
      side.querySelectorAll('.gb-li').forEach(el => el.onclick = () => selectLayer(+el.dataset.i));

      const NOTES = window.SOIL_NOTES || [];
      function card() {
        const el = $('gbCard');
        if (S.selBh) {
          const b = bhs.find(x => x.id === S.selBh); if (!b) return;
          el.innerHTML = `<div class="t">Скважина ${E(b.id)}</div><div class="g"><div><small>Глубина</small>${fmt(b.depth)} м</div><div><small>Вода</small>${b.gw != null ? fmt(b.gw) + ' м' : '—'}</div><div><small>Дата</small>${E(b.date || 'не указана')}</div><div><small>Класс точности</small>${E(b.acc || '—')}</div></div>
            <table>${(b.layers || []).map(l => `<tr><td>${E(l.soil || (l.cls != null ? LAYERS[l.cls].name : ''))}</td><td>${fmt(l.from)}–${fmt(l.to)} м</td></tr>`).join('')}</table>
            <div class="n">Это реальная проверенная скважина: на неё опирается модель рядом с ней.</div>`; return;
        }
        if (S.sel == null) { el.innerHTML = '<span style="color:var(--mute)">Нажмите на слой в блоке или в списке, либо на колонку скважины. Блок вращается мышью, колесо приближает. Вырезы показывают внутреннее строение.</span>'; return; }
        const it = items[S.sel], gw = rep.gw, [lo, hi] = range(it.li + 1);
        const water = gw <= it.from + 0.05 ? `Слой лежит ниже уровня грунтовых вод (${fmt(gw)} м): водонасыщен.` : gw >= it.to - 0.05 ? `Слой лежит выше уровня грунтовых вод (${fmt(gw)} м).` : `Уровень воды (${fmt(gw)} м) проходит внутри слоя: нижние ${fmt(it.to - gw)} м водонасыщены.`;
        const varr = it.li < 4 ? `Подошва слоя в пределах блока залегает на глубине ${fmt(lo)}–${fmt(hi)} м${hi - lo > 0.5 ? ' (заметно меняется)' : ' (почти постоянна)'}.` : 'Нижняя граница блока — условная (12 м).';
        el.innerHTML = `<div class="t"><img src="${swatch(it.li)}" style="width:18px;height:18px;vertical-align:-3px;border-radius:4px;margin-right:6px">${E(LAYERS[it.li].name)}</div>
          <div class="g"><div><small>Глубина в точке участка</small>${fmt(it.from)}–${fmt(it.to)} м</div><div><small>Мощность</small>${fmt(Math.round(it.to * 10) / 10 - Math.round(it.from * 10) / 10)} м</div></div>
          <div class="w">💧 ${water}</div><div>${varr}</div><p style="margin:8px 0 0">${E(NOTES[it.li] || '')}</p>`;
      }
      function selectLayer(li, silent) {
        S.selBh = null; S.sel = (S.sel === li) ? null : li; applyVisual(); card(); if (!silent && opts.onSelect) opts.onSelect(S.sel);
      }
      api.selectLayer = li => selectLayer(li, true); api.setLayer = li => { if (li == null ? S.sel != null : S.sel !== li) { S.sel = li; S.selBh = null; applyVisual(); card(); } };

      // выбор кликом по блоку (отличаем от вращения порогом движения)
      const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(); let down = null;
      renderer.domElement.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
      renderer.domElement.addEventListener('pointerup', e => {
        if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { down = null; return; } down = null;
        const rc = renderer.domElement.getBoundingClientRect(); mouse.set(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1); ray.setFromCamera(mouse, camera);
        const hit = ray.intersectObjects(root.children, true).find(h => h.object.userData && (h.object.userData.bh || h.object.userData.layer != null) && h.object.visible !== false && (!h.object.material || h.object.material.opacity > .5 || h.object.userData.bh));
        if (!hit) { if (S.sel != null || S.selBh) { S.sel = null; S.selBh = null; applyVisual(); card(); if (opts.onSelect) opts.onSelect(null); } return; }
        if (hit.object.userData.bh) { const had = S.sel != null; S.sel = null; S.selBh = hit.object.userData.bh; applyVisual(); card(); if (had && opts.onSelect) opts.onSelect(null); } else selectLayer(hit.object.userData.layer);
      });

      let raf = 0, last = performance.now(), run = true;
      const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      function loop(now) {
        if (!run) return; raf = requestAnimationFrame(loop);
        for (let i = 0; i < 5; i++) { const target = S.explode ? -(i * 16 * S.ex / 5 * 1.0) - (i ? 0 : 0) : 0; off[i] += (target - off[i]) * (reduce ? 1 : .14); if (built[i]) built[i].position.y = off[i]; }
        controls.update(); renderer.render(scene, camera);
      }
      const ro = new ResizeObserver(() => { renderer.setSize(W(), Hh()); camera.aspect = W() / Hh(); camera.updateProjectionMatrix(); }); ro.observe(cv);
      rebuild(); homeView(); card(); applyVisual(); raf = requestAnimationFrame(loop);
      return { dispose() { run = false; cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); built.forEach(disposeObj); extra.forEach(disposeObj); tex.forEach(t => t.dispose()); mats.forEach(m => { for (const k in m) m[k].dispose(); }); renderer.dispose(); } };
    }
  };
})();
