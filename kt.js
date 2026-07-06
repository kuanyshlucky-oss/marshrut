/* =========================================================
   МАРШРУТ — Симуляция КТ (комплексное тестирование в магистратуру)
   Логика проверки по блокам + сборка теста из пулов вопросов.
   Зависит от script.js (DIRECTIONS, DIRECTION_TESTS) — грузится после него.
   ========================================================= */

/* Типы тестирования.
   Блоки: lang (иностранный), logic (ТГО), subj1, subj2 (профильные).
   nauchped: 4×30 = 120, общий порог 75, минимумы по блокам.
   profile:  4×10 = 40, общий порог 30, минимумов по блокам нет. */
const KT_TYPES = {
  nauchped: {
    id: 'nauchped',
    label: 'Научно-педагогическое',
    perBlock: 30,
    total: 120,
    thresholdTotal: 75,
    timeMin: 210,                 // ~3.5 часа как на реальном КТ (условно)
    blockMin: { lang: 25, logic: 7, subj1: 7, subj2: 7 },
  },
  profile: {
    id: 'profile',
    label: 'Профильное',
    perBlock: 10,
    total: 40,
    thresholdTotal: 30,
    timeMin: 90,
    blockMin: null,               // минимумов по блокам нет — только общий порог
  },
};

const KT_LANGUAGES = {
  en: 'Английский',
  de: 'Немецкий',
  fr: 'Французский',
};

const KT_BLOCK_LABELS = {
  lang: 'Иностранный язык',
  logic: 'Тест готовности к обучению (ТГО)',
  subj1: 'Профильный предмет №1',
  subj2: 'Профильный предмет №2',
};

/* ---------- Пулы вопросов (демо; дополняются) ---------- */

const KT_LANG_POOL = {
  en: [
    { q: 'Choose the correct form: "She ___ to university every day."', options: ['go', 'goes', 'going', 'gone'], correct: 1 },
    { q: 'Pick the synonym of "significant".', options: ['tiny', 'important', 'random', 'boring'], correct: 1 },
    { q: 'Complete: "If I ___ time, I would help you."', options: ['have', 'had', 'has', 'having'], correct: 1 },
    { q: 'Which word is a preposition?', options: ['quickly', 'between', 'happy', 'run'], correct: 1 },
    { q: '"Research" as a verb means to…', options: ['ignore', 'study carefully', 'destroy', 'sell'], correct: 1 },
    { q: 'Choose correct: "The results ___ published last year."', options: ['was', 'were', 'is', 'be'], correct: 1 },
    { q: 'Antonym of "increase".', options: ['grow', 'reduce', 'expand', 'raise'], correct: 1 },
    { q: '"In conclusion" is used to…', options: ['start a topic', 'summarize', 'ask a question', 'give example'], correct: 1 },
  ],
  de: [
    { q: 'Wähle die richtige Form: "Ich ___ Student."', options: ['bin', 'bist', 'ist', 'sind'], correct: 0 },
    { q: 'Artikel: "___ Buch ist neu."', options: ['Der', 'Die', 'Das', 'Den'], correct: 2 },
    { q: 'Synonym für "wichtig".', options: ['klein', 'bedeutend', 'langsam', 'kalt'], correct: 1 },
    { q: '"Universität" ist…', options: ['ein Verb', 'ein Nomen', 'ein Adjektiv', 'eine Präposition'], correct: 1 },
    { q: 'Plural von "das Kind".', options: ['Kinds', 'Kinder', 'Kinden', 'Kindes'], correct: 1 },
    { q: '"studieren" bedeutet…', options: ['schlafen', 'lernen an der Uni', 'essen', 'kaufen'], correct: 1 },
    { q: 'Wähle: "Er ___ Deutsch."', options: ['sprechen', 'spricht', 'sprecht', 'sprach'], correct: 1 },
    { q: 'Gegenteil von "groß".', options: ['klein', 'hoch', 'breit', 'lang'], correct: 0 },
  ],
  fr: [
    { q: 'Choisis: "Je ___ étudiant."', options: ['suis', 'es', 'est', 'sont'], correct: 0 },
    { q: 'Article: "___ livre est nouveau."', options: ['La', 'Le', 'Les', 'Des'], correct: 1 },
    { q: 'Synonyme de "important".', options: ['petit', 'significatif', 'lent', 'froid'], correct: 1 },
    { q: '"Université" est…', options: ['un verbe', 'un nom', 'un adjectif', 'une préposition'], correct: 1 },
    { q: 'Pluriel de "le livre".', options: ['les livre', 'les livres', 'la livres', 'des livre'], correct: 1 },
    { q: '"étudier" veut dire…', options: ['dormir', 'apprendre', 'manger', 'vendre'], correct: 1 },
    { q: 'Choisis: "Elle ___ français."', options: ['parle', 'parles', 'parlent', 'parler'], correct: 0 },
    { q: 'Contraire de "grand".', options: ['petit', 'haut', 'large', 'long'], correct: 0 },
  ],
};

/* Английский — 3-этапный формат: Listening (аудио+видео-сцена) → Reading (текст) → Тесты (грамматика/лексика).
   8 + 8 + 14 = 30, ровно блок «Иностранный язык» науч-пед формата КТ. */
const KT_LANG_EN_STAGES = {
  listening: [
    { q: 'Where does the lecture take place?', options: ['Main hall', 'Room 204', 'Room 402', 'Library'], correct: 1,
      audio: 'assets/listening/1.wav', video: 'assets/listening/1.mp4' },
    { q: 'When does the library reopen?', options: ['Friday', 'Saturday', 'Sunday', 'Monday'], correct: 3,
      audio: 'assets/listening/2.wav', video: 'assets/listening/2.mp4' },
    { q: 'Where does the person turn left?', options: ['At the library', 'At the cafeteria', 'At the office', 'At the entrance'], correct: 1,
      audio: 'assets/listening/3.wav', video: 'assets/listening/3.mp4' },
    { q: 'Why is the train delayed?', options: ['Weather', 'Technical issues', 'A strike', 'It is not delayed'], correct: 1,
      audio: 'assets/listening/4.wav', video: 'assets/listening/4.mp4' },
    { q: 'What must be submitted by Friday?', options: ['Passport only', 'Transcript and recommendation letters', 'Just an essay', 'Nothing'], correct: 1,
      audio: 'assets/listening/5.wav', video: 'assets/listening/5.mp4' },
    { q: 'What day is the seminar now held?', options: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'], correct: 3,
      audio: 'assets/listening/6.wav', video: 'assets/listening/6.mp4' },
    { q: 'What should students collect first?', options: ['Textbooks', 'Student ID cards', 'Meal vouchers', 'Nothing'], correct: 1,
      audio: 'assets/listening/7.wav', video: 'assets/listening/7.mp4' },
    { q: 'Where will the ceremony be held?', options: ['Outdoors', 'Main auditorium', 'Sports field', 'Parking lot'], correct: 1,
      audio: 'assets/listening/8.wav', video: 'assets/listening/8.mp4' },
  ],
  reading: [
    { passage: 'Universities in Kazakhstan are increasingly offering joint degree programs with foreign partner institutions, allowing students to study one year abroad while completing their qualification in their home country.',
      q: 'What does a joint degree program allow?', options: ['Free tuition', 'Studying one year abroad', 'Skipping exams', 'An automatic scholarship'], correct: 1 },
    { passage: 'Critical thinking is the ability to analyze information objectively and make a reasoned judgment. It involves evaluating sources, identifying bias, and questioning assumptions.',
      q: 'Critical thinking mainly involves…', options: ['Memorizing facts', 'Evaluating and questioning information', 'Ignoring sources', 'Avoiding judgment'], correct: 1 },
    { passage: "Master's programs typically require a comprehensive entrance examination that tests both a foreign language and a subject-specific area of knowledge.",
      q: 'What does the entrance exam typically test?', options: ['Only sports', 'Foreign language and subject knowledge', 'Only handwriting', 'Nothing specific'], correct: 1 },
    { passage: 'Time management is essential for graduate students, who must balance coursework, research, and often part-time work.',
      q: 'Why is time management essential?', options: ['To balance coursework, research and work', 'To avoid studying', 'Because classes are short', 'It is not important'], correct: 0 },
    { passage: 'Peer review is a process in which academic work is evaluated by other experts in the same field before publication.',
      q: 'Who evaluates work in peer review?', options: ['Students', 'Other experts in the field', 'The author only', 'Random readers'], correct: 1 },
    { passage: 'A thesis statement presents the main argument of an academic paper in one or two clear sentences.',
      q: 'What does a thesis statement present?', options: ['The bibliography', 'The main argument', 'The page count', 'The title only'], correct: 1 },
    { passage: "Plagiarism, or presenting someone else's work as your own, is considered a serious violation of academic integrity.",
      q: 'Plagiarism is a violation of…', options: ['Academic integrity', 'Library rules only', 'The dress code', 'The attendance policy'], correct: 0 },
    { passage: 'Scholarships for graduate study are often awarded based on academic merit, financial need, or a combination of both.',
      q: 'Scholarships are often awarded based on…', options: ['Age only', 'Academic merit and/or financial need', 'Nationality only', 'A random draw'], correct: 1 },
  ],
  tests: [
    { q: 'Choose correct: "By the time she graduates, she ___ five years of research."', options: ['has done', 'will have done', 'did', 'is doing'], correct: 1 },
    { q: 'Synonym of "crucial".', options: ['minor', 'essential', 'optional', 'rare'], correct: 1 },
    { q: 'Choose correct: "Neither the professor nor the students ___ satisfied."', options: ['was', 'were', 'is', 'be'], correct: 1 },
    { q: 'Choose correct: "Despite ___ hard, he failed the exam."', options: ['study', 'studying', 'studied', 'to study'], correct: 1 },
    { q: 'Antonym of "abundant".', options: ['plentiful', 'scarce', 'large', 'common'], correct: 1 },
    { q: 'Choose correct passive: "The paper ___ by the committee next week."', options: ['will review', 'will be reviewed', 'reviews', 'reviewed'], correct: 1 },
    { q: '"___ you finished the report, please send it to me."', options: ['Once', 'Despite', 'Although', 'Unless'], correct: 0 },
    { q: 'Word meaning "to summarize briefly".', options: ['elaborate', 'condense', 'expand', 'prolong'], correct: 1 },
    { q: 'Choose correct: "I wish I ___ more time to prepare."', options: ['have', 'had', 'has', 'having'], correct: 1 },
    { q: 'Correct preposition: "The study is based ___ empirical data."', options: ['in', 'on', 'at', 'for'], correct: 1 },
    { q: 'Choose correct conditional: "If the results ___ significant, we will publish them."', options: ['are', 'were', 'be', 'being'], correct: 0 },
    { q: 'Synonym of "consequently".', options: ['therefore', 'however', 'meanwhile', 'instead'], correct: 0 },
    { q: 'Choose correct: "The research, ___ took two years, is now complete."', options: ['which', 'who', 'whom', 'whose'], correct: 0 },
    { q: 'Choose correct: "He is used to ___ long hours in the lab."', options: ['work', 'working', 'worked', 'works'], correct: 1 },
  ],
};

// Плоский упорядоченный массив 30: Listening(8) → Reading(8) → Тесты(14), с меткой stage.
const KT_LANG_EN_FLAT = [
  ...KT_LANG_EN_STAGES.listening.map(x => ({ ...x, stage: 'listening' })),
  ...KT_LANG_EN_STAGES.reading.map(x => ({ ...x, stage: 'reading' })),
  ...KT_LANG_EN_STAGES.tests.map(x => ({ ...x, stage: 'tests' })),
];

const KT_LANG_STAGE_LABELS = { listening: 'Listening', reading: 'Reading', tests: 'Тесты' };

const KT_LOGIC_POOL = [
  { q: 'Продолжите ряд: 2, 4, 8, 16, ?', options: ['24', '32', '20', '18'], correct: 1 },
  { q: 'Все розы — цветы. Некоторые цветы быстро вянут. Верно ли, что все розы быстро вянут?', options: ['Да', 'Нет', 'Иногда', 'Неизвестно'], correct: 3 },
  { q: 'Найдите лишнее: яблоко, груша, морковь, банан.', options: ['яблоко', 'груша', 'морковь', 'банан'], correct: 2 },
  { q: 'Если A > B и B > C, то…', options: ['A < C', 'A > C', 'A = C', 'нельзя сказать'], correct: 1 },
  { q: 'Ряд: 1, 4, 9, 16, ? (квадраты)', options: ['20', '25', '24', '21'], correct: 1 },
  { q: 'Часы показывают 15:00. Какой угол между стрелками?', options: ['90°', '180°', '45°', '120°'], correct: 0 },
  { q: 'Продолжите: A, C, E, G, ?', options: ['H', 'I', 'J', 'K'], correct: 1 },
  { q: 'В корзине 3 красных и 2 синих шара. Вероятность вытащить синий?', options: ['2/5', '3/5', '1/2', '2/3'], correct: 0 },
  { q: 'Отец старше сына на 25 лет. Сейчас сыну 10. Сколько отцу?', options: ['25', '35', '30', '40'], correct: 1 },
  { q: 'Найдите закономерность: 3, 6, 12, 24, ?', options: ['36', '48', '30', '40'], correct: 1 },
];

/* ---------- Сборка теста ---------- */

// Циклически добираем массив до нужной длины n (пул может быть меньше блока).
function ktCycle(pool, n) {
  const out = [];
  if (!pool || pool.length === 0) return out;
  for (let i = 0; i < n; i++) out.push(pool[i % pool.length]);
  return out;
}

// Пул профильных вопросов направления (пока переиспользуем DIRECTION_TESTS).
function ktSubjectPool(code) {
  const t = DIRECTION_TESTS[code];
  return t ? t.questions : [];
}

// Собирает КТ: массив блоков [{id,label,questions:[{q,options,correct}]}].
function assembleKT(typeId, code, lang) {
  const type = KT_TYPES[typeId];
  const n = type.perBlock;
  const subjPool = ktSubjectPool(code);
  // Английский — 3-этапный формат (Listening → Reading → Тесты), остальные языки — простой пул.
  const langPool = lang === 'en' ? KT_LANG_EN_FLAT : KT_LANG_POOL[lang];
  return {
    typeId, code, lang,
    blocks: [
      { id: 'lang',  label: KT_BLOCK_LABELS.lang + ' · ' + KT_LANGUAGES[lang], questions: ktCycle(langPool, n) },
      { id: 'logic', label: KT_BLOCK_LABELS.logic, questions: ktCycle(KT_LOGIC_POOL, n) },
      { id: 'subj1', label: KT_BLOCK_LABELS.subj1, questions: ktCycle(subjPool, n) },
      { id: 'subj2', label: KT_BLOCK_LABELS.subj2, questions: ktCycle(subjPool, n) },
    ],
  };
}

/* ---------- Логика проверки (grade) ---------- */
// blockScores: { lang, logic, subj1, subj2 } — число правильных в блоке.
// Возвращает разбивку + passed + причину.
function gradeKT(typeId, blockScores) {
  const type = KT_TYPES[typeId];
  const ids = ['lang', 'logic', 'subj1', 'subj2'];
  let total = 0;
  const blocks = ids.map(id => {
    const score = blockScores[id] || 0;
    total += score;
    const min = type.blockMin ? type.blockMin[id] : null;
    const ok = min == null ? true : score >= min;
    return { id, label: KT_BLOCK_LABELS[id], score, max: type.perBlock, min, ok };
  });

  const failedBlock = blocks.find(b => !b.ok);
  const totalOk = total >= type.thresholdTotal;
  let passed = totalOk && !failedBlock;

  let reason = '';
  if (failedBlock) {
    reason = `Блок «${failedBlock.label}»: ${failedBlock.score} из ${failedBlock.max} — ниже минимума ${failedBlock.min}.`;
  } else if (!totalOk) {
    reason = `Сумма ${total} из ${type.total} — ниже общего порога ${type.thresholdTotal}.`;
  }

  return {
    typeId, passed, total,
    thresholdTotal: type.thresholdTotal,
    maxTotal: type.total,
    blocks, reason,
  };
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
function openKT(code) {
  const d = findDirection(code);
  activeKT = { code };
  const body = ktEl();
  body.innerHTML = `
    <h2 class="test-title">Симуляция КТ</h2>
    <p class="test-sub">${d.code} · ${d.name}</p>
    <p class="kt-setup-lead">Полный прогон с таймером и проверкой по правилам реального комплексного тестирования.</p>

    <div class="kt-type-cards" id="ktType">
      ${Object.values(KT_TYPES).map((t, i) => `
        <button class="kt-type-card ${i === 0 ? 'is-active' : ''}" data-type="${t.id}">
          <span class="kt-type-name">${t.label}</span>
          <span class="kt-type-total">${t.total} вопросов</span>
          <span class="kt-type-meta">Порог ${t.thresholdTotal} · ${t.blockMin ? 'есть минимумы по блокам' : 'без минимумов по блокам'}</span>
        </button>`).join('')}
    </div>

    <p class="kt-field-label">Иностранный язык</p>
    <div class="kt-lang-row" id="ktLang">
      ${Object.entries(KT_LANGUAGES).map(([k, v], i) => `<button class="kt-lang ${i === 0 ? 'is-active' : ''}" data-lang="${k}">${v}</button>`).join('')}
    </div>

    <button class="btn test-next kt-start" id="ktStartBtn">Начать КТ</button>
  `;

  body.querySelectorAll('#ktType .kt-type-card').forEach(b =>
    b.addEventListener('click', () => { body.querySelectorAll('#ktType .kt-type-card').forEach(x => x.classList.remove('is-active')); b.classList.add('is-active'); }));
  body.querySelectorAll('#ktLang .kt-lang').forEach(b =>
    b.addEventListener('click', () => { body.querySelectorAll('#ktLang .kt-lang').forEach(x => x.classList.remove('is-active')); b.classList.add('is-active'); }));
  document.getElementById('ktStartBtn').addEventListener('click', () => {
    const typeId = body.querySelector('#ktType .kt-type-card.is-active').dataset.type;
    const lang = body.querySelector('#ktLang .kt-lang.is-active').dataset.lang;
    beginKT(code, typeId, lang);
  });

  showKTPage();
}

function beginKT(code, typeId, lang) {
  const a = assembleKT(typeId, code, lang);
  const flat = [];
  a.blocks.forEach(b => b.questions.forEach(q => flat.push({
    q: q.q, options: q.options, correct: q.correct, why: q.why, block: b.id,
    stage: q.stage, audio: q.audio, video: q.video, passage: q.passage, // только для lang-блока (en)
  })));
  activeKT = { code, typeId, lang, flat, answers: new Array(flat.length).fill(null), idx: 0, secondsLeft: KT_TYPES[typeId].timeMin * 60, timer: null };
  renderKTQuestion();
  startKTTimer();
}

function renderKTQuestion() {
  const s = activeKT;
  const item = s.flat[s.idx];
  const blockTag = item.stage ? `${KT_BLOCK_LABELS[item.block]} · ${KT_LANG_STAGE_LABELS[item.stage]}` : KT_BLOCK_LABELS[item.block];

  const media = item.stage === 'listening'
    ? `<div class="kt-listen-media">
        ${item.video ? `<video class="kt-listen-video" src="${item.video}" autoplay muted loop playsinline></video>` : ''}
        ${item.audio ? `<audio class="kt-listen-audio" controls src="${item.audio}"></audio>` : ''}
       </div>`
    : item.stage === 'reading' && item.passage
      ? `<div class="kt-reading-passage">${esc(item.passage)}</div>`
      : '';

  ktEl().innerHTML = `
    <div class="kt-run-head">
      <span class="kt-block-tag">${blockTag}</span>
      <span class="kt-run-timer" id="ktTimer">${fmtTime(s.secondsLeft)}</span>
    </div>
    <div class="kt-progress"><div class="kt-progress-bar" style="width:${((s.idx + 1) / s.flat.length) * 100}%"></div></div>
    <p class="test-qnum-line">Вопрос ${s.idx + 1} из ${s.flat.length}</p>
    ${media}
    <p class="test-question">${esc(item.q)}</p>
    <div class="test-options" id="ktOptions">
      ${item.options.map((o, i) => `
        <button class="test-opt ${s.answers[s.idx] === i ? 'is-selected' : ''}" data-opt="${i}">
          <span class="test-radio" aria-hidden="true"></span><span class="test-opt-label">${esc(o)}</span>
        </button>`).join('')}
    </div>
    <div class="test-foot">
      <button class="btn test-prev" id="ktPrev" ${s.idx === 0 ? 'disabled' : ''}>← Назад</button>
      <span class="test-hint">Нажмите <b>ENTER</b></span>
      <button class="btn test-next" id="ktNext">${s.idx === s.flat.length - 1 ? 'Завершить' : 'Далее'}</button>
    </div>
  `;
  ktEl().querySelectorAll('[data-opt]').forEach(b => b.addEventListener('click', () => { s.answers[s.idx] = Number(b.dataset.opt); renderKTQuestion(); }));
  document.getElementById('ktPrev').addEventListener('click', ktPrev);
  document.getElementById('ktNext').addEventListener('click', ktNext);
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

function finishKT() {
  stopKTTimer();
  const s = activeKT;
  const scores = { lang: 0, logic: 0, subj1: 0, subj2: 0 };
  s.flat.forEach((item, i) => { if (s.answers[i] === item.correct) scores[item.block]++; });
  const res = gradeKT(s.typeId, scores);

  // сохранить результат в кабинет (если вошёл): code + сумма/макс
  if (typeof API !== 'undefined' && API.getCurrentUser()) {
    API.saveResult(s.code, res.total, res.maxTotal).then(() => { if (typeof renderDashboard === 'function') renderDashboard(); }).catch(() => {});
  }

  const d = findDirection(s.code);
  ktEl().innerHTML = `
   <div class="kt-result-wrap">
    <div class="kt-stamp ${res.passed ? '' : 'is-fail'}">
      <span class="kt-stamp-status">${res.passed ? 'Пройдено' : 'Не пройдено'}</span>
      <span class="kt-stamp-score">${res.total}/${res.maxTotal}</span>
    </div>
    <h2 class="test-title">${res.passed ? 'КТ сдано' : 'КТ не сдано'}</h2>
    <p class="test-sub">${d.code} · ${KT_TYPES[s.typeId].label} · ${KT_LANGUAGES[s.lang]}</p>

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
}

function closeKT() {
  stopKTTimer();
  document.getElementById('ktPage').classList.add('hidden');
  document.body.classList.remove('test-open');
  activeKT = null;
}

// Работа над ошибками для КТ — полноэкранная страница разбора (#reviewPage).
function openKTReview() {
  const s = activeKT;
  const d = findDirection(s.code);
  document.getElementById('reviewSub').textContent = `${d.code} · КТ · ${KT_TYPES[s.typeId].label} · ${KT_LANGUAGES[s.lang]}`;
  document.getElementById('reviewList').innerHTML = s.flat.map((item, i) => {
    const ua = item ? s.answers[i] : null;
    const wrong = ua !== item.correct;
    const opts = item.options.map((o, oi) => {
      let cls = 'rev-opt', tag = '';
      if (oi === item.correct) { cls += ' correct'; tag = oi === ua ? '<span class="rev-tag ok">Ваш ответ ✓</span>' : '<span class="rev-tag ok">Правильный ответ</span>'; }
      else if (oi === ua) { cls += ' wrong'; tag = '<span class="rev-tag bad">Ваш ответ ✗</span>'; }
      return `<div class="${cls}"><span>${esc(o)}</span>${tag}</div>`;
    }).join('');
    const why = item.why
      ? `<div class="rev-why"><b>Почему:</b> ${esc(item.why)}</div>`
      : `<div class="rev-why"><b>Правильный ответ:</b> ${esc(item.options[item.correct])}</div>`;
    return `
      <div class="rev-item ${wrong ? 'is-wrong' : 'is-ok'}">
        <span class="rev-block">${KT_BLOCK_LABELS[item.block]}</span>
        <p class="rev-q"><span class="test-qnum">${i + 1}.</span> ${esc(item.q)}</p>
        <div class="rev-opts">${opts}</div>
        ${why}
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

document.addEventListener('DOMContentLoaded', wireKT);

/* экспорт в глобал */
if (typeof window !== 'undefined') {
  window.KT = { KT_TYPES, KT_LANGUAGES, KT_BLOCK_LABELS, assembleKT, gradeKT };
  window.openKT = openKT;
}
