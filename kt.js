/* =========================================================
   МАРШРУТ — Симуляция КТ (комплексное тестирование в магистратуру)
   Только интерфейс прохождения и разбора. Вариант собирает СЕРВЕР
   (POST /api/attempts) и отдаёт вопросы без ключей ответов; при сдаче
   сервер сам проверяет ответы, считает баллы по блокам и вердикт и
   возвращает разбор. Банков вопросов и логики проверки здесь больше нет.
   Зависит от script.js (API, findDirection, startAttempt) — грузится после него.
   ========================================================= */

/* Типы тестирования.
   Блоки: lang (иностранный), logic (ТГО), subj1, subj2 (профильные).
   nauchped: 50+30+30+20 = 130, общий порог 81, минимумы по блокам.
   profile:  4×10 = 40, общий порог 30, минимумов по блокам нет. */
const KT_TYPES = {
  nauchped: {
    id: 'nauchped',
    label: 'Научно-педагогическое',
    blockSize: { lang: 50, logic: 30, subj1: 30, subj2: 20 }, // англ./ТГО/Педагогика/Психология
    langFixed: true,              // англ.: фиксированно 16 Listening + 18 Grammar + 16 Reading
    total: 130,                   // 50 + 30 + 30 + 20
    thresholdTotal: 75,           // задано пользователем
    timeMin: 210,                 // ~3.5 часа как на реальном КТ (условно)
    // минимумы по блокам (заданы пользователем): англ. 25, ТГО 14, каждый профильный предмет 7.
    blockMin: { lang: 25, logic: 14, subj1: 7, subj2: 7 },
  },
  profile: {
    id: 'profile',
    label: 'Английский язык + ТГО',
    blockSize: { lang: 10, logic: 10, subj1: 10, subj2: 10 },
    langFixed: false,
    total: 40,
    thresholdTotal: 30,
    timeMin: 210,                 // 3.5 часа как на реальном КТ
    blockMin: null,               // минимумов по блокам нет — только общий порог
  },
  // Только для направлений без английского и ТГО (PROFILE_ONLY_CODES): 30 + 20 вопросов,
  // максимум 30 + 20×2 = 70 баллов, условный порог 35, минимумов по блокам нет.
  profile2: {
    id: 'profile2',
    label: 'Два профильных предмета',
    blockSize: { subj1: 30, subj2: 20 },
    langFixed: false,
    total: 70,                    // максимум баллов: 30 + 20×2
    questions: 50,                // вопросов: 30 + 20
    thresholdTotal: 35,
    timeMin: 90,                  // по спецификациям НЦТ: теория 60 мин + кейс 30 мин
    blockMin: null,
  },
};

// Сколько вариантов максимум можно отметить в вопросе с несколькими правильными
// ответами — фиксированно 3 для всех таких вопросов (см. kt.multiHint), не
// зависит от того, сколько реально правильных у конкретного вопроса: иначе
// сам лимит выдавал бы студенту число верных ответов.
const KT_MULTI_ANSWER_LIMIT = 3;

const KT_LANGUAGES = {
  en: 'Английский',
};

const KT_BLOCK_LABELS = {
  lang: 'Иностранный язык',
  logic: 'Тест готовности к обучению (ТГО)',
  subj1: 'Профильный предмет №1',
  subj2: 'Профильный предмет №2',
};

// Подписи типа теста/языка на экране настройки КТ — берутся из словаря i18n.js
// по id, а не напрямую из KT_TYPES/KT_LANGUAGES (те хранят русский текст как fallback/ключ).
const KT_TYPE_I18N_KEYS = { nauchped: 'kt.type.nauchped', profile: 'kt.type.profile', profile2: 'kt.type.profile2' };
const KT_LANG_I18N_KEYS = { en: 'kt.lang.en' };
const KT_BLOCK_I18N_KEYS = { lang: 'kt.block.lang', logic: 'kt.block.logic', subj1: 'kt.block.subj1', subj2: 'kt.block.subj2' };
function ktTypeLabel(id) { return (KT_TYPE_I18N_KEYS[id] && I18N.t(KT_TYPE_I18N_KEYS[id])) || KT_TYPES[id].label; }
function ktLangLabel(k) { return (KT_LANG_I18N_KEYS[k] && I18N.t(KT_LANG_I18N_KEYS[k])) || KT_LANGUAGES[k] || ''; }
// « · Английский» для подзаголовков КТ; у КТ из двух профильных предметов языка нет.
function ktLangSuffix(k) { return k ? ' · ' + ktLangLabel(k) : ''; }

// Реальные названия профильных предметов по коду направления.
const KT_SUBJECT_NAMES = {
  '7M01': { subj1: 'Педагогика', subj2: 'Психология' },
  'M123': { subj1: 'Геодезия', subj2: 'Картография' },
  'M066': { subj1: 'Общая психология', subj2: 'Психология развития' },
  'M107': { subj1: 'Физика', subj2: 'Математика' },
  'M005': { subj1: 'Педагогика', subj2: 'Теория и методика физической культуры' },
  'M103': { subj1: 'Основы взаимозаменяемости', subj2: 'Детали машин' },
  'M115': { subj1: 'Бурение нефтяных и газовых скважин', subj2: 'Технология и техника добычи нефти' },
  'M149': { subj1: 'Основы предпринимательства', subj2: 'Менеджмент гостиниц и ресторанов' },
  'M063': { subj1: 'Теория политики', subj2: 'Прикладная политология' },
  'M078': { subj1: 'Теория государства и права', subj2: 'Ситуативный кейс' },
};

/* Банки вопросов (английский, ТГО, профильные предметы) хранятся на сервере и
   отдаются клиенту порциями — вариантом попытки — без ключей ответов. */

const KT_LANG_STAGE_LABELS = { listening: 'Listening', grammar: 'Grammar', reading: 'Reading' };

// Верен ли ответ — ТОЛЬКО для подсветки в разборе, когда сервер уже вернул ключи после сдачи.
// correct — число (один вариант) или массив (несколько верных, Психология).
// ua тоже приводим к массиву на обе стороны сравнения: в предметах с
// предметах с частичным баллом интерфейс всегда рисует чекбоксы (item.multi, см. renderKTQuestion), поэтому
// даже для вопроса с одним правильным ответом ua может прийти как [i], а не i.
function ktIsCorrect(item, ua) {
  const correctArr = Array.isArray(item.correct) ? item.correct : [item.correct];
  const userArr = Array.isArray(ua) ? ua : (ua == null ? [] : [ua]);
  if (userArr.length === 0) return false;
  return correctArr.slice().sort().join(',') === userArr.slice().sort().join(',');
}

/* ---------- Итоги КТ ---------- */
// Баллы по блокам, минимумы и вердикт «сдал/не сдал» считает сервер — в браузере их
// не подделать. Здесь только формулировка причины «не сдал» по ответу сервера.
function ktReason(res) {
  const failed = res.blocks.find(b => !b.ok);
  if (failed) return `Блок «${KT_BLOCK_LABELS[failed.id]}»: ${failed.score} из ${failed.max} — ниже минимума ${failed.min}.`;
  if (res.score < res.thresholdTotal) return `Сумма ${res.score} из ${res.total} — ниже общего порога ${res.thresholdTotal}.`;
  return '';
}

/* =========================================================
   UI: движок прохождения КТ (полноэкранная страница #ktPage)
   ========================================================= */
let activeKT = null; // { code, typeId, lang, flat:[{...q, block}], answers:[], idx, secondsLeft, timer }

function ktEl() { return document.getElementById('ktPageBody'); }

function showKTPage() {
  document.getElementById('ktPage').classList.remove('hidden');
  document.body.classList.add('test-open');
  window.scrollTo(0, 0);
}

// Экран 1 — настройка: две секции (профильное / научно-педагогическое) + язык
// Типы КТ для направления: у направлений без английского и ТГО (PROFILE_ONLY_CODES) — только
// profile2, у остальных — обычные.
function ktTypesFor(code) {
  const only = PROFILE_ONLY_CODES.has(code);
  return Object.values(KT_TYPES).filter(t => (t.id === 'profile2') === only);
}

// КТ из двух профильных предметов: два блока теста рядом — предмет, число вопросов, максимум баллов
// (1-й предмет: 1 балл за вопрос; 2-й: до 2 баллов, несколько верных ответов).
function ktProfileBlocksHtml(code) {
  const t = KT_TYPES.profile2;
  const names = KT_SUBJECT_NAMES[code] || {};
  const card = (id, pts, hintKey) => `
      <div class="kt-block-card">
        <span class="kt-type-name">${esc(names[id] || ktBlockLabel(code, id))}</span>
        <span class="kt-type-total">${t.blockSize[id]} ${I18N.t('kt.questionsWord')} · ${I18N.t('kt.maxScore')} ${pts}</span>
        <span class="kt-type-meta">${I18N.t(hintKey)}</span>
      </div>`;
  return `<div class="kt-block-cards">${card('subj1', t.blockSize.subj1, 'kt.profile2.single')}${card('subj2', t.blockSize.subj2 * 2, 'kt.profile2.multi')}</div>`;
}

function openKT(code) {
  const d = findDirection(code);
  const profileOnly = PROFILE_ONLY_CODES.has(code);
  activeKT = { code };
  const body = ktEl();
  body.innerHTML = `
    <h2 class="test-title">${I18N.t('kt.simTitle')}</h2>
    <p class="test-sub">${d.code} · ${d.name}</p>
    <p class="kt-setup-lead">${I18N.t(profileOnly ? 'kt.simLeadProfile2' : 'kt.simLead')}</p>

    ${profileOnly ? ktProfileBlocksHtml(code) : `<div class="kt-type-cards" id="ktType">
      ${ktTypesFor(code).map((t, i) => `
        <button class="kt-type-card ${i === 0 ? 'is-active' : ''}" data-type="${t.id}">
          <span class="kt-type-name">${ktTypeLabel(t.id)}</span>
          <span class="kt-type-total">${t.questions || t.total} ${I18N.t('kt.questionsWord')}${t.questions ? ` · ${I18N.t('kt.maxScore')} ${t.total}` : ''}</span>
          <span class="kt-type-meta">${I18N.t('kt.threshold')} ${t.thresholdTotal} · ${t.blockMin ? I18N.t('kt.hasBlockMin') : I18N.t('kt.noBlockMin')}</span>
        </button>`).join('')}
    </div>`}

    ${profileOnly ? '' : `<p class="kt-field-label">${I18N.t('kt.foreignLangLabel')}</p>
    <div class="kt-lang-row" id="ktLang">
      ${Object.keys(KT_LANGUAGES).map((k, i) => `<button class="kt-lang ${i === 0 ? 'is-active' : ''}" data-lang="${k}">${ktLangLabel(k)}</button>`).join('')}
    </div>`}

    <button class="btn test-next kt-start" id="ktStartBtn">${I18N.t('kt.start')}</button>
  `;

  body.querySelectorAll('#ktType .kt-type-card').forEach(b =>
    b.addEventListener('click', () => { body.querySelectorAll('#ktType .kt-type-card').forEach(x => x.classList.remove('is-active')); b.classList.add('is-active'); }));
  body.querySelectorAll('#ktLang .kt-lang').forEach(b =>
    b.addEventListener('click', () => { body.querySelectorAll('#ktLang .kt-lang').forEach(x => x.classList.remove('is-active')); b.classList.add('is-active'); }));
  document.getElementById('ktStartBtn').addEventListener('click', () => {
    const typeId = profileOnly ? 'profile2' : body.querySelector('#ktType .kt-type-card.is-active').dataset.type;
    const lang = profileOnly ? '' : body.querySelector('#ktLang .kt-lang.is-active').dataset.lang;
    beginKT(code, typeId, lang);
  });

  showKTPage();
}

// Дроби в данных записаны как «a/b», «(7x−12)/3», «1/(0,75−1)», «√μ/a^(3/2)» — показываем их
// с горизонтальной дробной чертой. Работает по уже экранированному тексту. Включено для ТГО
// (блок logic) и для профильных предметов направлений из KT_FRAC_CODES (формулы в вариантах).
// Операнд: число (с разрядными пробелами, запятой, степенью), √число, выражение в скобках или
// с латинской/греческой переменной, в т.ч. со степенью ^(...). Кириллица операндом не считается:
// «признаки/классификация» — слова через косую, «км/с» — единица, а не дробь.
const KT_FRAC_CODES = new Set(['M107']);
const KT_FRAC_SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹⁻ⁿ';
const KT_FRAC_NUM = '[0-9]{1,3}(?: [0-9]{3})+|[0-9]+(?:[,.][0-9]+)?';
const KT_FRAC_GROUP = '\\([^()]*\\)';
const KT_FRAC_LETTER = 'a-zπμεωφσθυρτβγδλ';
const KT_FRAC_BASE = `√?(?:${KT_FRAC_NUM})?(?:[${KT_FRAC_LETTER}](?:[${KT_FRAC_LETTER}${KT_FRAC_SUP}₀-₉]|[0-9](?![0-9]))*|${KT_FRAC_GROUP})|√?(?:${KT_FRAC_NUM})[${KT_FRAC_SUP}]*|√${KT_FRAC_GROUP}`;
const KT_FRAC_ATOM = `(?:${KT_FRAC_BASE})(?:\\^(?:${KT_FRAC_GROUP}|-?[0-9a-z]+))?`;
const KT_FRAC_RE = new RegExp(`((?:${KT_FRAC_ATOM})+)\\s*\\/\\s*(${KT_FRAC_ATOM})(?![a-zа-яё0-9(])`, 'gi');
const KT_FRAC_UNIT = /^(ч|час|мин|с|год|км|м|см|мм|кг|г|л|сут)$/i;
function ktFracHtml(html) {
  const strip = x => (/^\([^()]*\)$/.test(x) ? x.slice(1, -1) : x);
  return html.replace(KT_FRAC_RE, (m, a, b) => KT_FRAC_UNIT.test(b) ? m
    : `<span class="frac"><span class="frac-n">${strip(a)}</span><span class="frac-d">${strip(b)}</span></span>`)
    // «(11/12)h» → дробь без скобок; «(5⁶/5⁵)⁵» — скобки нужны для степени, оставляем.
    .replace(/\((<span class="frac"><span class="frac-n">[^<]*<\/span><span class="frac-d">[^<]*<\/span><\/span>)\)(?![⁰¹²³⁴⁵⁶⁷⁸⁹^])/g, '$1');
}
// Показывать ли дроби с чертой для вопроса блока blockId направления code.
function ktFracEnabled(code, blockId) {
  return blockId === 'logic' || (KT_FRAC_CODES.has(code) && (blockId === 'subj1' || blockId === 'subj2'));
}
// Текст вопроса/варианта/пояснения: экранирование + дроби, если включены для этого вопроса.
function ktText(item, text) {
  const html = esc(text);
  return item && item.fracs ? ktFracHtml(html) : html;
}

async function beginKT(code, typeId, lang) {
  // Сервер собирает вариант (16+18+16 английского из целых аудиодорожек, ТГО и два
  // профильных блока) и отдаёт вопросы без ключей; нет доступа — 403, покажется гейт.
  const att = await startAttempt(code, { kind: 'kt:' + typeId, lang });
  if (!att) return;
  const flat = att.questions.map(q => ({ ...q, fracs: ktFracEnabled(code, q.block) }));
  activeKT = {
    attemptId: att.id, code, typeId, lang, flat, answers: new Array(flat.length).fill(null), idx: 0,
    secondsLeft: att.limitSeconds, timer: null, submitting: false, result: null,
  };
  renderKTQuestion();
  startKTTimer();
}

// Границы каждого блока (lang/logic/subj1/subj2) в плоском массиве s.flat —
// используется и панелью блоков сверху, и нумерацией вопросов под ней.
function ktBlockRanges(s) {
  const order = ['lang', 'logic', 'subj1', 'subj2'];
  const ranges = [];
  order.forEach(id => {
    let start = -1, end = -1;
    s.flat.forEach((item, i) => { if (item.block === id) { if (start === -1) start = i; end = i; } });
    if (start !== -1) {
      // Короткие подписи именно для верхней панели блоков — «Иностранный язык ·
      // Английский» и «Тест готовности к обучению (ТГО)» не помещаются в узкую
      // вкладку на телефоне и обрезаются на середине слова (в остальных местах,
      // где подпись блока встречается — под самим вопросом, в таблице итогов —
      // места достаточно, там оставлена полная формулировка через ktBlockLabel).
      const label = id === 'lang' ? ktLangLabel(s.lang) : id === 'logic' ? 'ТГО' : ktBlockLabel(s.code, id);
      ranges.push({ id, label, start, end });
    }
  });
  return ranges;
}

function renderKTQuestion() {
  const s = activeKT;
  const item = s.flat[s.idx];
  // В предметах с частичным начислением баллов банк вопросов вперемешку содержит
  // вопросы с одним и с несколькими правильными ответами. Сервер помечает multi у ВСЕХ
  // вопросов такого предмета (чекбоксы), даже если верный ответ один — иначе тип
  // виджета (radio vs checkbox) сам выдавал бы студенту, сколько правильных у вопроса.
  const isMulti = !!item.multi; // сервер: чекбоксы у всех вопросов предмета с частичным баллом
  const blockTag = item.stage ? `${ktBlockLabel(s.code, item.block)} · ${KT_LANG_STAGE_LABELS[item.stage]}` : ktBlockLabel(s.code, item.block);

  const ranges = ktBlockRanges(s);
  const curRange = ranges.find(r => s.idx >= r.start && s.idx <= r.end) || ranges[0];
  const blockNav = ranges.map(r => `<button class="kt-block-nav-btn ${r.id === curRange.id ? 'is-active' : ''}" data-block="${r.id}">${esc(r.label)}</button>`).join('');

  const media = item.stage === 'listening' && item.audio
    ? `
      <div class="kt-audio-player" id="ktAudioPlayer">
        <button class="kt-audio-play" id="ktAudioPlay" aria-label="Воспроизвести">
          <svg class="ico-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
          <svg class="ico-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
        </button>
        <div class="kt-audio-track" id="ktAudioTrack">
          <div class="kt-audio-fill" id="ktAudioFill"></div>
          <div class="kt-audio-knob" id="ktAudioKnob"></div>
        </div>
        <span class="kt-audio-time" id="ktAudioTime">0:00 / 0:00</span>
        <audio id="ktAudioEl" src="${item.audio}" preload="auto"></audio>
      </div>`
    // passage показываем всегда, когда есть в данных — не только для англ. reading-стадии
    // (пассажи по чтению/логике КТ используют то же поле без stage==='reading').
    : item.passage
      ? `<div class="kt-reading-passage">${esc(item.passage)}</div>`
      : '';

  const qnav = s.flat.map((q, i) => {
    if (i < curRange.start || i > curRange.end) return '';
    const cls = i === s.idx ? 'is-current' : (s.answers[i] != null && (!Array.isArray(s.answers[i]) || s.answers[i].length) ? 'is-answered' : '');
    return `<button class="kt-qnav-btn ${cls}" data-idx="${i}">${i - curRange.start + 1}</button>`;
  }).join('');

  ktEl().innerHTML = `
    <div class="kt-block-nav" id="ktBlockNav">${blockNav}</div>
    <div class="kt-qnav" id="ktQnav">${qnav}</div>
    <div class="kt-run-head">
      <span class="kt-block-tag">${blockTag}</span>
      <span class="kt-timer-group"><span class="kt-timer-label">${I18N.t('kt.timeLeft')}</span><span class="kt-run-timer" id="ktTimer">${fmtTime(s.secondsLeft)}</span></span>
    </div>
    <div class="kt-progress"><div class="kt-progress-bar" style="width:${((s.idx + 1) / s.flat.length) * 100}%"></div></div>
    <p class="test-qnum-line">${I18N.t('kt.questionOf').replace('{n}', s.idx + 1).replace('{total}', s.flat.length)}</p>
    ${media}
    <p class="test-question">${item.imageReplacesText ? '' : ktText(item, item.q)}</p>
    ${item.image ? `<div class="kt-question-image${item.imageReplacesText ? ' math-question-image' : ''}"><img src="${item.image}" alt="${I18N.t('kt.questionImage.alt')}"></div>` : ''}
    ${isMulti ? `<p class="kt-multi-hint">${I18N.t('kt.multiHint')}</p>` : ''}
    <div class="test-options" id="ktOptions">
      ${item.options.map((o, i) => {
        const isSel = isMulti ? (Array.isArray(s.answers[s.idx]) && s.answers[s.idx].includes(i)) : s.answers[s.idx] === i;
        return `
        <button class="test-opt ${isSel ? 'is-selected' : ''}" data-opt="${i}">
          <span class="test-radio ${isMulti ? 'is-checkbox' : ''}" aria-hidden="true"></span>${item.optionImages && item.optionImages[i] ? `<span class="test-opt-image"><img src="${item.optionImages[i]}" alt="${I18N.t('kt.optionImage.alt')}"></span>` : `<span class="test-opt-label">${ktText(item, o)}</span>`}
        </button>`;
      }).join('')}
    </div>
    <div class="kt-nav">
      <button class="kt-nav-btn kt-nav-prev" id="ktPrev" ${s.idx === 0 ? 'disabled' : ''} aria-label="${I18N.t('kt.prev.aria')}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
      <span class="kt-nav-hint">${I18N.t('test.enterHint')}</span>
      <button class="kt-nav-btn kt-nav-next is-primary" id="ktNext">
        <span>${s.idx === s.flat.length - 1 ? I18N.t('test.finish') : I18N.t('test.next')}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
      </button>
    </div>
  `;
  // Выбор варианта обновляет только сами кнопки (не весь renderKTQuestion) —
  // иначе на Listening пересоздавался бы <audio>, и трек обрывался при каждом ответе.
  ktEl().querySelectorAll('[data-opt]').forEach(b => b.addEventListener('click', () => {
    const i = Number(b.dataset.opt);
    if (isMulti) {
      const cur = Array.isArray(s.answers[s.idx]) ? s.answers[s.idx].slice() : [];
      const pos = cur.indexOf(i);
      if (pos === -1) {
        // Лимит фиксированный — 3, как в kt.multiHint, а НЕ item.correct.length:
        // если ограничивать точным числом правильных ответов конкретного вопроса,
        // это выдаёт студенту ответ (раз дают отметить только 2 — значит верных
        // ровно 2). Не даём отметить больше 3 вариантов ни на одном вопросе.
        if (cur.length >= KT_MULTI_ANSWER_LIMIT) {
          if (typeof showToast === 'function') {
            showToast(I18N.t('kt.multiLimit').replace('{n}', String(KT_MULTI_ANSWER_LIMIT)));
          }
          return;
        }
        cur.push(i);
      } else {
        cur.splice(pos, 1);
      }
      s.answers[s.idx] = cur;
      b.classList.toggle('is-selected', cur.includes(i));
    } else {
      s.answers[s.idx] = i;
      ktEl().querySelectorAll('[data-opt]').forEach(ob => ob.classList.remove('is-selected'));
      b.classList.add('is-selected');
    }
    const qnavBtn = ktEl().querySelector(`.kt-qnav-btn[data-idx="${s.idx}"]`);
    if (qnavBtn) {
      const answered = isMulti ? (Array.isArray(s.answers[s.idx]) && s.answers[s.idx].length > 0) : s.answers[s.idx] != null;
      qnavBtn.classList.toggle('is-answered', !!answered);
    }
  }));
  document.getElementById('ktPrev').addEventListener('click', ktPrev);
  document.getElementById('ktNext').addEventListener('click', ktNext);
  ktEl().querySelectorAll('.kt-qnav-btn').forEach(b => b.addEventListener('click', () => ktGoTo(Number(b.dataset.idx))));
  ktEl().querySelectorAll('.kt-block-nav-btn').forEach(b => b.addEventListener('click', () => {
    const r = ranges.find(x => x.id === b.dataset.block);
    if (r) ktGoTo(r.start);
  }));
  const curBtn = ktEl().querySelector('.kt-qnav-btn.is-current');
  if (curBtn) curBtn.scrollIntoView({ block: 'nearest', inline: 'center' });
  const curBlockBtn = ktEl().querySelector('.kt-block-nav-btn.is-active');
  if (curBlockBtn) curBlockBtn.scrollIntoView({ block: 'nearest', inline: 'center' });
  wireKTAudioPlayer();
}

// Кастомный плеер для Listening (вместо нативных элементов управления браузера).
function wireKTAudioPlayer() {
  const wrap = document.getElementById('ktAudioPlayer');
  if (!wrap) return;
  const audio = document.getElementById('ktAudioEl');
  const playBtn = document.getElementById('ktAudioPlay');
  const track = document.getElementById('ktAudioTrack');
  const fill = document.getElementById('ktAudioFill');
  const knob = document.getElementById('ktAudioKnob');
  const time = document.getElementById('ktAudioTime');

  const fmt = (t) => {
    if (!isFinite(t) || t < 0) t = 0;
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };
  const updateProgress = () => {
    const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    fill.style.width = pct + '%';
    knob.style.left = pct + '%';
    time.textContent = `${fmt(audio.currentTime)} / ${fmt(audio.duration)}`;
  };
  const seekFromEvent = (e) => {
    const rect = track.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    if (audio.duration) audio.currentTime = pct * audio.duration;
    updateProgress();
  };

  playBtn.addEventListener('click', () => {
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  });
  audio.addEventListener('play', () => wrap.classList.add('is-playing'));
  audio.addEventListener('pause', () => wrap.classList.remove('is-playing'));
  audio.addEventListener('ended', () => wrap.classList.remove('is-playing'));
  audio.addEventListener('timeupdate', updateProgress);
  audio.addEventListener('loadedmetadata', updateProgress);
  track.addEventListener('click', seekFromEvent);
  updateProgress();
}

function ktPrev() {
  const s = activeKT;
  if (s.idx > 0) { s.idx--; renderKTQuestion(); }
}

function ktNext() {
  const s = activeKT;
  if (s.idx < s.flat.length - 1) { s.idx++; renderKTQuestion(); }
  else finishKT();
}

function ktGoTo(idx) {
  const s = activeKT;
  if (idx >= 0 && idx < s.flat.length) { s.idx = idx; renderKTQuestion(); }
}

function startKTTimer() {
  stopKTTimer();
  activeKT.timer = setInterval(() => {
    activeKT.secondsLeft--;
    const t = document.getElementById('ktTimer');
    if (t) t.textContent = fmtTime(activeKT.secondsLeft);
    if (activeKT.secondsLeft <= 0) { stopKTTimer(); finishKT(); }
  }, 1000);
}
function stopKTTimer() { if (activeKT && activeKT.timer) clearInterval(activeKT.timer); }
function fmtTime(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Сдача симуляции: ответы уходят на сервер, он проверяет их, считает баллы и вердикт,
// сохраняет результат и возвращает разбор. Сдача идемпотентна: при сбое сети ответы
// остаются в памяти, и повторная отправка безопасна.
async function finishKT() {
  const s = activeKT;
  if (!s || s.submitting || s.result) return;
  stopKTTimer();
  s.submitting = true;
  ktEl().innerHTML = `<div class="kt-result-wrap"><h2 class="test-title">${I18N.t('test.checking')}</h2></div>`;
  let r;
  try {
    r = await API.submitAttempt(s.attemptId, s.answers);
  } catch (e) {
    s.submitting = false;
    if (activeKT === s) renderKTSubmitError(e);
    return;
  }
  s.submitting = false;
  if (activeKT !== s) return; // симуляцию закрыли, пока шла проверка
  s.result = r.result;
  // ключи и объяснения приходят только теперь — подмешиваем их для «Работы над ошибками»
  s.flat.forEach((item, i) => Object.assign(item, r.review[i]));
  if (typeof renderDashboard === 'function') renderDashboard();

  // те же поля, что раньше считал клиентский gradeKT: total — сумма, maxTotal — максимум
  const res = {
    ...r.result, total: r.result.score, maxTotal: r.result.total,
    blocks: r.result.blocks.map(b => ({ ...b, label: KT_BLOCK_LABELS[b.id] })),
    reason: ktReason(r.result),
  };
  const praise = typeof quizPraiseMessage === 'function' ? quizPraiseMessage(res.total, res.maxTotal, res.passed) : '';

  const d = findDirection(s.code);
  ktEl().innerHTML = `
   <div class="kt-result-wrap">
    <h2 class="test-title">${res.passed ? I18N.t('kt.passed') : I18N.t('kt.notPassed')}</h2>
    <p class="test-sub">${d.code} · ${ktTypeLabel(s.typeId)}${ktLangSuffix(s.lang)}</p>
    ${praise ? `<p class="kt-praise">${esc(praise)}</p>` : ''}

    <table class="kt-result-table">
      <thead><tr><th>Блок</th><th>Балл</th><th>Мин.</th><th></th></tr></thead>
      <tbody>
        ${res.blocks.map(b => `
          <tr>
            <td>${b.label}</td>
            <td>${b.score}/${b.max}</td>
            <td>${b.min == null ? '—' : b.min}</td>
            <td><span class="test-status-badge ${b.ok ? 'passed' : 'failed'}">${b.ok ? '✓' : '✗'}</span></td>
          </tr>`).join('')}
        <tr class="kt-total-row">
          <td>Итого</td><td>${res.total}/${res.maxTotal}</td><td>${res.thresholdTotal}</td>
          <td><span class="test-status-badge ${res.total >= res.thresholdTotal ? 'passed' : 'failed'}">${res.total >= res.thresholdTotal ? '✓' : '✗'}</span></td>
        </tr>
      </tbody>
    </table>
    ${res.reason ? `<p class="kt-reason">${res.reason}</p>` : ''}
    <div class="test-result-nav">
      <button class="btn btn-ghost" id="ktReviewBtn">Работа над ошибками</button>
      <button class="btn btn-ghost" id="ktRetry">Пройти ещё раз</button>
      <button class="btn btn-primary" id="ktClose2">Закрыть</button>
    </div>
   </div>
  `;
  document.getElementById('ktReviewBtn').addEventListener('click', openKTReview);
  document.getElementById('ktRetry').addEventListener('click', () => openKT(s.code));
  document.getElementById('ktClose2').addEventListener('click', closeKT);

  const resultWrap = ktEl().querySelector('.kt-result-wrap');
  if (res.passed && typeof burstConfetti === 'function') burstConfetti(resultWrap);
}

// Ошибка сдачи: сеть — можно повторить (ответы сохранены), истёкшая/устаревшая попытка — только закрыть.
function renderKTSubmitError(e) {
  const fatal = e.status === 410 || e.status === 409 || e.status === 404;
  const msg = fatal ? I18N.t(e.status === 410 ? 'test.expired' : 'test.stale')
                    : (e.status ? e.message : I18N.t('test.submitRetry'));
  ktEl().innerHTML = `
    <div class="kt-result-wrap">
      <h2 class="test-title">${esc(msg)}</h2>
      <div class="test-result-nav">
        ${fatal ? '' : `<button class="btn btn-primary" id="ktRetrySubmit">${I18N.t('test.retrySubmit')}</button>`}
        <button class="btn btn-ghost" id="ktClose3">Закрыть</button>
      </div>
    </div>`;
  document.getElementById('ktRetrySubmit')?.addEventListener('click', finishKT);
  document.getElementById('ktClose3').addEventListener('click', closeKT);
}

function closeKT() {
  stopKTTimer();
  document.getElementById('ktPage').classList.add('hidden');
  document.body.classList.remove('test-open');
  activeKT = null;
}

// Работа над ошибками для КТ — полноэкранная страница разбора (#reviewPage).
function ktBlockLabel(code, block) {
  return (KT_SUBJECT_NAMES[code] && KT_SUBJECT_NAMES[code][block]) || (KT_BLOCK_I18N_KEYS[block] && I18N.t(KT_BLOCK_I18N_KEYS[block])) || KT_BLOCK_LABELS[block];
}

function openKTReview() {
  const s = activeKT;
  const d = findDirection(s.code);
  document.getElementById('reviewSub').textContent = `${d.code} · КТ · ${ktTypeLabel(s.typeId)}${ktLangSuffix(s.lang)}`;

  // Навигация по разделам сверху (requirement: клик переходит к вопросам раздела).
  const blockOrder = ['lang', 'logic', 'subj1', 'subj2'];
  const firstIdxByBlock = {};
  s.flat.forEach((item, i) => { if (!(item.block in firstIdxByBlock)) firstIdxByBlock[item.block] = i; });
  document.getElementById('reviewNav').innerHTML = blockOrder.filter(b => b in firstIdxByBlock).map(b => {
    const label = b === 'lang' ? `${ktBlockLabel(s.code, b)} · ${ktLangLabel(s.lang)}` : ktBlockLabel(s.code, b);
    return `<button class="review-nav-btn" data-jump="${firstIdxByBlock[b]}">${esc(label)}</button>`;
  }).join('');
  document.getElementById('reviewNav').querySelectorAll('[data-jump]').forEach(btn => {
    btn.addEventListener('click', () => {
      const items = document.querySelectorAll('#reviewList .rev-item');
      const target = items[Number(btn.dataset.jump)];
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  document.getElementById('reviewList').innerHTML = s.flat.map((item, i) => {
    const ua = s.answers[i];
    const correctSet = Array.isArray(item.correct) ? item.correct : [item.correct];
    // ua может быть массивом даже для вопроса с одним правильным ответом
    // (у предметов с частичным баллом чекбоксы у всех вопросов подряд) —
    // нормализуем независимо от формы item.correct.
    const userSet = Array.isArray(ua) ? ua : (ua == null ? [] : [ua]);
    const wrong = !ktIsCorrect(item, ua);
    const opts = item.options.map((o, oi) => {
      const isCorrectOpt = correctSet.includes(oi);
      const isUserOpt = userSet.includes(oi);
      let cls = 'rev-opt', tag = '';
      if (isCorrectOpt) { cls += ' correct'; tag = isUserOpt ? `<span class="rev-tag ok">${I18N.t('rev.yourAnswerOk')}</span>` : `<span class="rev-tag ok">${I18N.t('rev.correctAnswer')}</span>`; }
      else if (isUserOpt) { cls += ' wrong'; tag = `<span class="rev-tag bad">${I18N.t('rev.yourAnswerBad')}</span>`; }
      // Объяснение для студентов по каждому варианту (requirement #4) — если есть в данных.
      const expl = item.explanations && item.explanations[oi]
        ? `<div class="rev-opt-expl">${ktText(item, item.explanations[oi])}</div>` : '';
      const optContent = item.optionImages && item.optionImages[oi]
        ? `<span class="rev-opt-image"><img src="${item.optionImages[oi]}" alt="${I18N.t('kt.optionImage.alt')}"></span>` : `<span>${ktText(item, o)}</span>`;
      return `<div class="${cls}"><div class="rev-opt-row">${optContent}${tag}</div>${expl}</div>`;
    }).join('');
    const why = item.explanations ? '' : (item.why
      ? `<div class="rev-why"><b>${I18N.t('rev.why')}</b> ${esc(item.why)}</div>`
      : `<div class="rev-why"><b>${I18N.t('rev.correctAnswerColon')}</b> ${esc(item.options[correctSet[0]])}</div>`);
    const blockTag = item.stage ? `${ktBlockLabel(s.code, item.block)} · ${KT_LANG_STAGE_LABELS[item.stage]}` : ktBlockLabel(s.code, item.block);
    // Кнопка «Конспекты» — отдельный подробный разбор вопроса (не привязан к тому,
    // ответил ли пользователь верно), раскрывается по клику, изолирован своей карточкой.
    const conspectBody = item.conspectImage
      ? `<div class="rev-conspect-body"><img class="rev-conspect-image" src="${item.conspectImage}" alt="${I18N.t('rev.conspect')}"></div>`
      : (item.conspect ? `<div class="rev-conspect-body rev-conspect-text">${formatConspectText(item.conspect)}</div>` : '');
    const conspectBlock = conspectBody
      ? `<details class="rev-conspect-block"><summary class="rev-conspect-btn"><span class="rev-conspect-btn-label">${REV_CONSPECT_ICON}<span>${I18N.t('rev.conspects')}</span></span></summary>${conspectBody}</details>`
      : '';
    return `
      <div class="rev-item ${wrong ? 'is-wrong' : 'is-ok'}">
        <span class="rev-block">${blockTag}</span>
        <p class="rev-q"><span class="test-qnum">${i + 1}.</span> ${item.imageReplacesText ? '' : ktText(item, item.q)}</p>
        ${item.image ? `<div class="kt-question-image${item.imageReplacesText ? ' math-question-image' : ''}"><img src="${item.image}" alt="${I18N.t('kt.questionImage.alt')}"></div>` : ''}
        ${item.passage ? `<div class="kt-reading-passage">${esc(item.passage)}</div>` : ''}
        <div class="rev-opts">${opts}</div>
        ${why}
        ${conspectBlock}
      </div>`;
  }).join('');

  document.getElementById('ktPage').classList.add('hidden');
  document.getElementById('reviewPage').classList.remove('hidden');
  document.body.classList.add('test-open');
  window.scrollTo(0, 0);
}

function wireKT() {
  const page = document.getElementById('ktPage');
  if (!page) return;
  document.getElementById('ktClose').addEventListener('click', closeKT);
  document.addEventListener('keydown', (e) => {
    if (page.classList.contains('hidden')) return;
    if (e.key === 'Escape') { closeKT(); return; }
    if (!document.getElementById('ktNext')) return; // не на экране прохождения
    if (e.key === 'Enter') { e.preventDefault(); ktNext(); return; }
    if (/^[1-9]$/.test(e.key)) {
      const btns = document.querySelectorAll('#ktOptions [data-opt]');
      const b = btns[Number(e.key) - 1];
      if (b) b.click();
    }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireKT);
else wireKT(); // kt.js грузится лениво, когда DOMContentLoaded уже прошло

/* экспорт в глобал */
if (typeof window !== 'undefined') {
  window.KT = { KT_TYPES, KT_LANGUAGES, KT_BLOCK_LABELS };
  window.openKT = openKT;
}
