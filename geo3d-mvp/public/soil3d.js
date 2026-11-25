/* Интерактивный 3D-разрез слоёв грунта (чистый CSS 3D, без библиотек).
   buildSoilViewer(host, report, {onSelect}) → { selectLayer(i), destroy() }
   Что умеет: слои «опускаются» друг на друга, блок вращается мышью/пальцем, кнопка «Развести слои»,
   плоскость грунтовых вод, клик по слою выделяет его и раскрывает карточку; связь с 3D-блоком на карте через onSelect. */
(function () {
  const W = 90, H = 210, PX_M = H / 12;   // ширина блока и масштаб: 12 м разреза = 210 px
  const NOTES = [
    'Как правило срезается и не используется как основание фундамента. Подходит для обратной засыпки и озеленения.',
    'Распространённое основание для малоэтажных зданий. Свойства сильно зависят от влажности и консистенции; при высоком уровне воды возможно морозное пучение.',
    'Малопроницаемый грунт: при увлажнении теряет прочность, некоторые разновидности склонны к пучению и набуханию. Несущую способность определяют изысканиями.',
    'Как правило хорошая несущая способность и водопроницаемость. Хорошо пропускает воду, а ниже уровня грунтовых вод насыщается ею.',
    'Обычно самое прочное основание. Глубокое залегание удорожает земляные работы; выветрелые разности прочнее не всегда, их оценивают по керну.'
  ];
  const css = `
  .lv{margin-top:2px}
  .lv-row{display:flex;gap:10px;align-items:stretch}
  .lv-stage{flex:0 0 150px;position:relative;perspective:900px;cursor:grab;user-select:none;touch-action:none;border-radius:12px;background:radial-gradient(ellipse at 50% 85%,rgba(242,184,75,.10),transparent 65%)}
  .lv-stage.drag{cursor:grabbing}
  .lv-sway{position:absolute;inset:0;transform-style:preserve-3d;animation:lv-sway 10s ease-in-out infinite alternate}
  .lv-stage:hover .lv-sway,.lv-stage.drag .lv-sway{animation-play-state:paused}
  .lv-block{position:absolute;left:30px;width:${W}px;transform-style:preserve-3d;transition:transform .5s cubic-bezier(.2,.8,.2,1)}
  .lv-block.nt{transition:none}
  .lv-slab{position:absolute;left:0;width:${W}px;transform-style:preserve-3d;animation:lv-drop .75s cubic-bezier(.2,.9,.25,1.12) both;transition:opacity .35s}
  .lv-in{position:absolute;left:0;top:0;width:${W}px;transform-style:preserve-3d;transform:translate3d(0,var(--ey,0px),var(--ez,0px));transition:transform .55s cubic-bezier(.2,.8,.2,1)}
  .lv-block.ex .lv-in{--ey:calc(var(--i) * 20px)}
  .lv-slab:hover .lv-in,.lv-slab.hov .lv-in{--ez:12px}
  .lv-slab.sel .lv-in{--ez:38px}
  .lv-block.has-sel .lv-slab:not(.sel){opacity:.28}
  .lv-f{position:absolute;left:0;top:0;width:${W}px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.28)}
  .lv-front{transform:translateZ(${W / 2}px)}
  .lv-back{transform:rotateY(180deg) translateZ(${W / 2}px)}
  .lv-right{transform:rotateY(90deg) translateZ(${W / 2}px)}
  .lv-left{transform:rotateY(-90deg) translateZ(${W / 2}px)}
  .lv-top{height:${W}px;top:calc((var(--h) - ${W}px) / 2);transform:rotateX(90deg) translateZ(calc(var(--h) / 2))}
  .lv-slab.sel .lv-f{box-shadow:inset 0 0 0 2px rgba(255,255,255,.85)}
  .lv-water{position:absolute;left:-12px;width:${W + 24}px;height:${W + 24}px;transform:rotateX(90deg);background:rgba(90,180,255,.26);border:1.5px solid rgba(120,200,255,.9);box-shadow:0 0 22px rgba(90,180,255,.45);animation:lv-water 3.2s ease-in-out infinite;pointer-events:none;transition:opacity .4s}
  .lv-block.ex .lv-water{opacity:0}
  .lv-list{flex:1;display:flex;flex-direction:column;gap:5px;min-width:0}
  .lv-item{display:flex;align-items:center;gap:8px;text-align:left;border:1px solid var(--line);background:var(--fill0);color:var(--text);border-radius:9px;padding:7px 9px;font:inherit;font-size:12.5px;cursor:pointer;transition:background .15s,border-color .15s,transform .15s}
  .lv-item:hover{background:var(--fill2);transform:translateX(2px)}
  .lv-item.on{border-color:var(--accent-text);background:rgba(242,184,75,.12)}
  .lv-item i{flex:0 0 11px;height:11px;border-radius:3px;border:1px solid rgba(128,128,128,.5)}
  .lv-item span{flex:1;min-width:0;line-height:1.25}
  .lv-item small{color:var(--mute);white-space:nowrap}
  .lv-tools{display:flex;gap:6px;margin:8px 0}
  .lv-tools button{flex:1;border:1px solid var(--line);background:var(--fill);color:var(--text);border-radius:9px;padding:7px 6px;font:inherit;font-size:12.5px;cursor:pointer}
  .lv-tools button:hover{background:var(--fill3)}
  .lv-card{border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--fill0);min-height:60px}
  .lv-card.in{animation:lv-card .35s cubic-bezier(.2,.8,.2,1)}
  .lv-hint{color:var(--mute);font-size:12.5px;line-height:1.5}
  .lv-ct{font-weight:700;font-size:14px;display:flex;align-items:center;gap:8px;margin-bottom:8px}
  .lv-ct i{width:13px;height:13px;border-radius:4px;display:inline-block;border:1px solid rgba(128,128,128,.5)}
  .lv-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px}
  .lv-grid div{background:var(--fill);border-radius:8px;padding:6px 8px}
  .lv-grid small{display:block;color:var(--mute);font-size:10.5px;text-transform:uppercase;letter-spacing:.4px}
  .lv-grid b{font-size:13.5px}
  .lv-w{font-size:12.5px;padding:7px 9px;border-radius:8px;background:rgba(90,180,255,.10);border:1px solid rgba(90,180,255,.35);margin-bottom:8px}
  .lv-p{margin:0 0 8px;font-size:12.5px;line-height:1.5}
  .lv-n{font-size:11px;color:var(--mute);line-height:1.45}
  @keyframes lv-drop{from{transform:translateY(-170px);opacity:0}to{transform:translateY(0);opacity:1}}
  @keyframes lv-sway{from{transform:rotateY(-12deg)}to{transform:rotateY(12deg)}}
  @keyframes lv-water{0%,100%{opacity:.8}50%{opacity:1}}
  @keyframes lv-card{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  @media (prefers-reduced-motion:reduce){.lv-slab,.lv-sway,.lv-water,.lv-card.in{animation:none}.lv-in,.lv-block{transition:none}}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const shade = (h, k) => '#' + hex(h).map(v => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0')).join('');
  const fmt = v => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');

  window.buildSoilViewer = function (host, rep, opts) {
    opts = opts || {};
    const bounds = [0, ...rep.b, 12], items = [];
    for (let i = 0; i < 5; i++) { const th = bounds[i + 1] - bounds[i]; if (th > 0.05) items.push({ li: i, from: bounds[i], to: bounds[i + 1], th, thr: Math.round(bounds[i + 1] * 10) / 10 - Math.round(bounds[i] * 10) / 10, h: Math.max(8, th * PX_M) }); }   // thr — мощность по округлённым границам, чтобы цифры в карточке сходились
    let y = 0; items.forEach(it => { it.y = y; y += it.h; }); const total = y;
    const yAt = d => { let acc = 0; for (const it of items) { acc += it.h * Math.max(0, Math.min(1, (d - it.from) / it.th)); } return acc; };   // глубина → пиксели
    const stageH = Math.round(total + 150), blockTop = 38;

    const slabs = items.map((it, n) => {
      const c = LAYERS[it.li].color, f = (cls, col, extra) => `<div class="lv-f ${cls}" style="background:${col};height:${it.h}px;${extra || ''}"></div>`;
      return `<div class="lv-slab" data-i="${n}" style="--i:${n};--h:${it.h}px;top:${it.y}px;height:${it.h}px;animation-delay:${n * 150}ms"><div class="lv-in" style="height:${it.h}px">`
        + f('lv-front', c) + f('lv-back', shade(c, .6)) + f('lv-right', shade(c, .8)) + f('lv-left', shade(c, .68)) + f('lv-top', shade(c, 1.2)) + `</div></div>`;
    }).join('');
    const waterY = yAt(rep.gw);
    host.innerHTML = `<div class="lv">
      <div class="lv-row">
        <div class="lv-stage" style="height:${stageH}px"><div class="lv-sway"><div class="lv-block" style="top:${blockTop}px;height:${total}px">${slabs}<div class="lv-water" style="top:${waterY - (W + 24) / 2}px"></div></div></div></div>
        <div class="lv-list">${items.map((it, n) => `<button class="lv-item" data-i="${n}"><i style="background:${LAYERS[it.li].color}"></i><span>${LAYERS[it.li].name}</span><small>${fmt(it.from)}–${fmt(it.to)} м</small></button>`).join('')}</div>
      </div>
      <div class="lv-tools"><button data-a="ex">Развести слои</button><button data-a="rst">Сбросить поворот</button></div>
      <div class="lv-card"></div></div>`;

    const stage = host.querySelector('.lv-stage'), block = host.querySelector('.lv-block'), card = host.querySelector('.lv-card'), exBtn = host.querySelector('[data-a=ex]');
    const slabEls = [...host.querySelectorAll('.lv-slab')], itemEls = [...host.querySelectorAll('.lv-item')];
    const rot0 = { x: -22, y: -38 }; let rot = { ...rot0 }, sel = null;
    const apply = () => { block.style.transform = `rotateX(${rot.x}deg) rotateY(${rot.y}deg)`; };
    apply();

    function renderCard() {
      card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
      if (sel == null) { card.innerHTML = '<div class="lv-hint">Нажмите на слой, чтобы узнать подробнее. Блок можно вращать мышью или пальцем, а кнопка «Развести слои» раздвинет разрез.</div>'; return; }
      const it = items[sel], L = LAYERS[it.li], gw = rep.gw;
      const water = gw <= it.from + 0.05 ? `Слой лежит ниже уровня грунтовых вод (${fmt(gw)} м): водонасыщен.`
        : gw >= it.to - 0.05 ? `Слой лежит выше уровня грунтовых вод (${fmt(gw)} м).`
        : `Уровень грунтовых вод (${fmt(gw)} м) проходит внутри слоя: нижние ${fmt(it.to - gw)} м водонасыщены.`;
      const conf = (typeof CONF !== 'undefined' && CONF[rep.confidence]) ? CONF[rep.confidence][0] : '—';
      card.innerHTML = `<div class="lv-ct"><i style="background:${L.color}"></i>${L.name}</div>
        <div class="lv-grid"><div><small>Глубина</small><b>${fmt(it.from)}–${fmt(it.to)} м</b></div><div><small>Мощность</small><b><span class="lv-cnt">0,0</span> м</b></div><div><small>Доля разреза</small><b>${Math.round(it.thr / 12 * 100)}%</b></div></div>
        <div class="lv-w">💧 ${water}</div><p class="lv-p">${NOTES[it.li]}</p>
        <div class="lv-n">Глубины слоёв получены интерполяцией по ближайшим скважинам (достоверность: ${conf}). Это общие сведения о грунте, они не заменяют инженерно-геологические изыскания.</div>`;
      const el = card.querySelector('.lv-cnt'), t0 = performance.now(), reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) el.textContent = fmt(it.thr);
      else (function tick(now) { const k = Math.min(1, (now - t0) / 500); el.textContent = fmt(it.thr * (1 - Math.pow(1 - k, 3))); if (k < 1 && el.isConnected) requestAnimationFrame(tick); })(t0);
    }
    function select(n, silent) {
      sel = (n === sel) ? null : n;
      block.classList.toggle('has-sel', sel != null);
      slabEls.forEach((s, i) => s.classList.toggle('sel', i === sel)); itemEls.forEach((s, i) => s.classList.toggle('on', i === sel));
      renderCard();
      if (!silent && opts.onSelect) opts.onSelect(sel == null ? null : items[sel].li);
    }
    itemEls.forEach((b, i) => { b.onclick = () => select(i); b.onmouseenter = () => slabEls[i].classList.add('hov'); b.onmouseleave = () => slabEls[i].classList.remove('hov'); });

    // вращение перетаскиванием; короткий клик без движения выбирает слой под курсором
    let drag = null;
    stage.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, moved: false, rx: rot.x, ry: rot.y }; block.classList.add('nt'); try { stage.setPointerCapture(e.pointerId); } catch (_) {} });
    stage.addEventListener('pointermove', e => {
      if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) { drag.moved = true; stage.classList.add('drag'); }
      if (drag.moved) { rot.y = drag.ry + dx * 0.6; rot.x = Math.max(-55, Math.min(-4, drag.rx - dy * 0.35)); apply(); }
    });
    const end = e => {
      if (!drag) return; const moved = drag.moved; drag = null; stage.classList.remove('drag'); block.classList.remove('nt');
      if (!moved) { const t = document.elementFromPoint(e.clientX, e.clientY), s = t && t.closest && t.closest('.lv-slab'); if (s && host.contains(s)) select(+s.dataset.i); else if (sel != null) select(sel); }
    };
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', () => { drag = null; stage.classList.remove('drag'); block.classList.remove('nt'); });

    exBtn.onclick = () => { const on = block.classList.toggle('ex'); exBtn.textContent = on ? 'Собрать слои' : 'Развести слои'; };
    host.querySelector('[data-a=rst]').onclick = () => { rot = { ...rot0 }; apply(); };
    renderCard();

    return {
      // выбор слоя извне (клик по 3D-блоку на карте): li — номер слоя 0..4
      // повторный клик по тому же слою снимает выделение; возвращает номер выбранного слоя или null (карта подсвечивает его у себя)
      selectLayer(li) { const n = items.findIndex(it => it.li === li); if (n >= 0) select(n, true); return sel == null ? null : items[sel].li; },
      // явная установка выбора (null — снять), без обратного вызова: для синхронизации с геологическим блоком
      setLayer(li) { const n = li == null ? null : items.findIndex(it => it.li === li); if (li != null && n < 0) return; if (n === sel) return; if (n == null) select(sel, true); else select(n, true); },
      destroy() { host.innerHTML = ''; }
    };
  };
})();

// Общие тексты для других модулей (геологический блок использует те же пояснения к грунтам)
window.SOIL_NOTES = [
  'Как правило срезается и не используется как основание фундамента. Подходит для обратной засыпки и озеленения.',
  'Распространённое основание для малоэтажных зданий. Свойства сильно зависят от влажности и консистенции; при высоком уровне воды возможно морозное пучение.',
  'Малопроницаемый грунт: при увлажнении теряет прочность, некоторые разновидности склонны к пучению и набуханию. Несущую способность определяют изысканиями.',
  'Как правило хорошая несущая способность и водопроницаемость. Хорошо пропускает воду, а ниже уровня грунтовых вод насыщается ею.',
  'Обычно самое прочное основание. Глубокое залегание удорожает земляные работы; выветрелые разности прочнее не всегда, их оценивают по керну.'
];
