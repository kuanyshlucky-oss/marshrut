/* =========================================================
   МАРШРУТ — подготовка к вступительным экзаменам в магистратуру
   script.js
   1) Данные: направления (7M01–7M12), предметы, темы, тесты
   2) "BACKEND" — имитация серверного API (аккаунты, профиль, избранное, результаты)
   3) Рендер каталога направлений
   4) Модалка: направление → предметы → темы + тест
   5) Квиз-движок
   6) Авторизация / личный кабинет (личные данные, результаты, избранное)
   ========================================================= */

/* ---------------------------------------------------------
   1) ДАННЫЕ
   --------------------------------------------------------- */

/* Два общих предмета — одинаковы для всех направлений */
const COMMON_SUBJECTS = [
  {
    id: 'lang', title: 'Иностранный язык', sub: 'английский, немецкий или французский', kind: 'common',
    topics: [
      'Грамматика: времена, артикли, предлоги, согласование',
      'Чтение и понимание академических текстов',
      'Академическая лексика и терминология',
      'Письмо: эссе, аннотация, деловое письмо',
      'Аудирование и устная речь',
    ],
  },
  {
    id: 'tgo', title: 'Тест готовности к обучению (ТГО)', sub: 'критическое и аналитическое мышление', kind: 'common',
    topics: [
      'Логические задачи и построение выводов',
      'Анализ и интерпретация текста',
      'Числовые последовательности и закономерности',
      'Работа с таблицами, графиками и диаграммами',
      'Пространственное и абстрактное мышление',
    ],
  },
];

/* Направления — коды групп образовательных программ магистратуры.
   ВНИМАНИЕ: профильные предметы и вопросы тестов для не-IT направлений
   подобраны как правдоподобные и требуют сверки с актуальным перечнем. */
const DIRECTIONS = [
  {
    code: '7M01', name: 'Педагогические науки', desc: 'педагогика, психология, предметная педагогика',
    profile: [
      { id: 'p1', title: 'Педагогика', sub: 'теория и практика обучения и воспитания', topics: [
        'Дидактика: теория обучения', 'Теория и методика воспитания',
        'Современные педагогические технологии', 'История педагогики и образования' ]},
      { id: 'p2', title: 'Психология', sub: 'общая и возрастная психология', topics: [
        'Общая психология: процессы и свойства', 'Возрастная и педагогическая психология',
        'Психология личности', 'Социальная психология' ]},
    ],
  },
  {
    code: '7M02', name: 'Искусство и гуманитарные науки', desc: 'искусство, философия, языки, литература',
    profile: [
      { id: 'p1', title: 'Теория и история искусства', sub: 'мировое и современное искусство', topics: [
        'История мирового искусства', 'Виды и жанры искусства',
        'Анализ художественного произведения', 'Современное искусство и направления' ]},
      { id: 'p2', title: 'Философия', sub: 'история и теория философии', topics: [
        'История философии', 'Онтология и теория познания', 'Этика и эстетика', 'Социальная философия' ]},
    ],
  },
  {
    code: '7M03', name: 'Социальные науки, журналистика и информация', desc: 'социология, политология, журналистика, PR',
    profile: [
      { id: 'p1', title: 'Социология', sub: 'теория и методы', topics: [
        'История социологии', 'Методы социологических исследований',
        'Социальная структура общества', 'Общественное мнение и его изучение' ]},
      { id: 'p2', title: 'Теория журналистики и коммуникаций', sub: 'медиа и PR', topics: [
        'Теория массовой коммуникации', 'Жанры и виды журналистики',
        'Основы связей с общественностью (PR)', 'Медиаэтика и право' ]},
    ],
  },
  {
    code: '7M04', name: 'Бизнес, управление и право', desc: 'экономика, менеджмент, финансы, юриспруденция',
    profile: [
      { id: 'p1', title: 'Экономическая теория', sub: 'микро- и макроэкономика', topics: [
        'Микроэкономика: спрос, предложение, цена', 'Макроэкономика: ВВП, инфляция, занятость',
        'Рынок и конкуренция', 'Деньги, кредит, банки' ]},
      { id: 'p2', title: 'Менеджмент', sub: 'управление организацией', topics: [
        'Основы и функции менеджмента', 'Организационные структуры',
        'Управление персоналом', 'Стратегический менеджмент' ]},
    ],
  },
  {
    code: '7M05', name: 'Естественные науки, математика и статистика', desc: 'биология, физика, химия, математика, экология',
    profile: [
      { id: 'p1', title: 'Высшая математика', sub: 'анализ, алгебра, статистика', topics: [
        'Математический анализ', 'Линейная алгебра',
        'Дифференциальные уравнения', 'Теория вероятностей и статистика' ]},
      { id: 'p2', title: 'Общая физика', sub: 'фундаментальные разделы', topics: [
        'Механика', 'Молекулярная физика и термодинамика',
        'Электричество и магнетизм', 'Оптика и атомная физика' ]},
    ],
  },
  {
    code: '7M06', name: 'Информационно-коммуникационные технологии', desc: 'IT, ИС, ПО, кибербезопасность, телекоммуникации',
    profile: [
      { id: 'p1', title: 'Основы алгоритмизации и программирования', sub: 'или информатика', topics: [
        'Алгоритмы и структуры данных', 'Языки программирования: синтаксис, типы данных',
        'Объектно-ориентированное программирование', 'Базы данных и SQL' ]},
      { id: 'p2', title: 'Вычислительная техника и программное обеспечение', sub: 'или информационные системы / сети', topics: [
        'Архитектура ЭВМ', 'Операционные системы',
        'Компьютерные сети', 'Информационная безопасность' ]},
    ],
  },
  {
    code: '7M07', name: 'Инженерные, обрабатывающие и строительные отрасли', desc: 'инженерия, архитектура, энергетика',
    profile: [
      { id: 'p1', title: 'Техническая механика', sub: 'механика и прочность', topics: [
        'Теоретическая механика: статика, кинематика, динамика', 'Сопротивление материалов',
        'Детали машин', 'Механика жидкости и газа' ]},
      { id: 'p2', title: 'Инженерная графика и материаловедение', sub: 'черчение и материалы', topics: [
        'Начертательная геометрия', 'Машиностроительное и строительное черчение',
        'Материаловедение', 'Стандартизация и метрология' ]},
    ],
  },
  {
    code: '7M08', name: 'Сельское хозяйство и биоресурсы', desc: 'агрономия, ветеринария, рыбоводство, лесное хозяйство',
    profile: [
      { id: 'p1', title: 'Агрономия', sub: 'растениеводство и земледелие', topics: [
        'Почвоведение', 'Растениеводство', 'Земледелие и севообороты', 'Защита растений' ]},
      { id: 'p2', title: 'Зоотехния и ветеринария', sub: 'животноводство', topics: [
        'Основы животноводства', 'Кормление и разведение животных',
        'Ветеринарная санитария', 'Биология и физиология животных' ]},
    ],
  },
  {
    code: '7M11', name: 'Услуги', desc: 'туризм, логистика, гигиена, социальная работа',
    profile: [
      { id: 'p1', title: 'Туризм и сервис', sub: 'индустрия гостеприимства', topics: [
        'Основы туризма', 'Организация туристской деятельности',
        'Гостиничный и ресторанный сервис', 'География туризма' ]},
      { id: 'p2', title: 'Логистика', sub: 'цепи поставок', topics: [
        'Основы логистики', 'Транспортная логистика',
        'Складская логистика и управление запасами', 'Управление цепями поставок' ]},
    ],
  },
  {
    code: '7M12', name: 'Национальная безопасность и военное дело', desc: 'военное дело, нацбезопасность',
    profile: [
      { id: 'p1', title: 'Основы национальной безопасности', sub: 'теория и право', topics: [
        'Теория национальной безопасности', 'Виды и угрозы безопасности',
        'Государственная и военная политика', 'Правовые основы безопасности' ]},
      { id: 'p2', title: 'Военное дело', sub: 'тактика и подготовка', topics: [
        'Общая тактика', 'Военная топография', 'Огневая подготовка', 'Военное право и уставы' ]},
    ],
  },
];

/* Тест по направлению — 4 профильных вопроса. Ключ — код направления. */
const DIRECTION_TESTS = {
  '7M01': { title: 'Профильный тест: педагогика и психология', questions: [
    { q: 'Раздел педагогики, изучающий теорию обучения, называется:', options: ['Андрагогика','Дидактика','Логопедия','Этнопедагогика'], correct: 1 },
    { q: 'Автор культурно-исторической теории развития психики:', options: ['Павлов','Маслоу','Выготский','Пиаже'], correct: 2 },
    { q: 'Ведущая деятельность дошкольного возраста:', options: ['Труд','Игра','Учение','Общение'], correct: 1 },
    { q: 'Принцип «от простого к сложному» относится к:', options: ['Методам контроля','Видам памяти','Формам воспитания','Принципам обучения'], correct: 3 },
  ]},
  '7M02': { title: 'Профильный тест: искусство и философия', questions: [
    { q: 'Эпоха Возрождения зародилась в:', options: ['Германии','Италии','Франции','Англии'], correct: 1 },
    { q: 'Раздел философии, изучающий бытие:', options: ['Гносеология','Этика','Онтология','Эстетика'], correct: 2 },
    { q: 'Автор труда «Критика чистого разума»:', options: ['Кант','Гегель','Ницше','Декарт'], correct: 0 },
    { q: 'Жанр живописи, изображающий неодушевлённые предметы:', options: ['Пейзаж','Портрет','Натюрморт','Марина'], correct: 2 },
  ]},
  '7M03': { title: 'Профильный тест: социология и журналистика', questions: [
    { q: 'Метод сбора данных через систему вопросов:', options: ['Опрос','Наблюдение','Эксперимент','Контент-анализ'], correct: 0 },
    { q: 'Кто ввёл термин «социология»:', options: ['Маркс','Конт','Вебер','Дюркгейм'], correct: 1 },
    { q: 'Жанр журналистики с глубоким разбором проблемы:', options: ['Заметка','Репортаж','Аналитическая статья','Интервью'], correct: 2 },
    { q: 'Аббревиатура PR расшифровывается как:', options: ['Personal Record','Public Relations','Press Release','Public Report'], correct: 1 },
  ]},
  '7M04': { title: 'Профильный тест: экономика и менеджмент', questions: [
    { q: 'Согласно закону спроса, при росте цены спрос обычно:', options: ['Растёт','Падает','Не меняется','Удваивается'], correct: 1 },
    { q: 'Функция менеджмента, связанная с распределением задач и ресурсов:', options: ['Мотивация','Контроль','Планирование','Организация'], correct: 3 },
    { q: 'ВВП — это:', options: ['Сумма всех зарплат','Стоимость всех конечных товаров и услуг за год','Объём экспорта','Размер госбюджета'], correct: 1 },
    { q: 'Инфляция — это:', options: ['Снижение цен','Рост общего уровня цен','Рост ВВП','Падение курса акций'], correct: 1 },
  ]},
  '7M05': { title: 'Профильный тест: математика и физика', questions: [
    { q: 'Производная функции f(x) = x²:', options: ['x','2x','2','x²/2'], correct: 1 },
    { q: 'Единица измерения силы в системе СИ:', options: ['Джоуль','Ватт','Ньютон','Паскаль'], correct: 2 },
    { q: 'Определитель матрицы [[a,b],[c,d]] равен:', options: ['ab − cd','ad − bc','ac − bd','ad + bc'], correct: 1 },
    { q: 'Закон сохранения энергии гласит, что энергия:', options: ['Всегда возрастает','Не возникает из ничего и не исчезает','Исчезает при трении','Равна массе тела'], correct: 1 },
  ]},
  '7M06': { title: 'Профильный тест: программирование и ВТ', questions: [
    { q: 'Какой тег создаёт гиперссылку в HTML?', options: ['<link>','<a>','<href>','<nav>'], correct: 1 },
    { q: 'Структура данных, работающая по принципу FIFO (первым пришёл — первым ушёл):', options: ['Стек','Очередь','Дерево','Граф'], correct: 1 },
    { q: 'Команда SQL для выборки данных:', options: ['SELECT','UPDATE','DELETE','INSERT'], correct: 0 },
    { q: 'Протокол защищённой передачи веб-страниц:', options: ['HTTP','FTP','HTTPS','SMTP'], correct: 2 },
  ]},
  '7M07': { title: 'Профильный тест: техническая механика и графика', questions: [
    { q: 'Наука о прочности и деформации материалов:', options: ['Гидравлика','Сопротивление материалов','Термодинамика','Электротехника'], correct: 1 },
    { q: 'Чертёж детали в трёх видах строится методом:', options: ['Центрального проецирования','Косого проецирования','Прямоугольного проецирования','Сферического проецирования'], correct: 2 },
    { q: 'Единица измерения механического напряжения:', options: ['Ньютон','Паскаль','Джоуль','Ом'], correct: 1 },
    { q: 'Свойство материала сопротивляться вдавливанию и царапанью:', options: ['Пластичность','Упругость','Твёрдость','Хрупкость'], correct: 2 },
  ]},
  '7M08': { title: 'Профильный тест: агрономия и зоотехния', questions: [
    { q: 'Наука о почвах называется:', options: ['Агрохимия','Почвоведение','Селекция','Мелиорация'], correct: 1 },
    { q: 'Чередование сельхозкультур на полях по годам — это:', options: ['Монокультура','Пар','Севооборот','Вспашка'], correct: 2 },
    { q: 'Раздел животноводства о кормлении и разведении животных:', options: ['Ветеринария','Зоотехния','Агрономия','Ботаника'], correct: 1 },
    { q: 'Улучшение земель (орошение, осушение) называется:', options: ['Селекция','Севооборот','Вспашка','Мелиорация'], correct: 3 },
  ]},
  '7M11': { title: 'Профильный тест: туризм и логистика', questions: [
    { q: 'Туроператор — это компания, которая:', options: ['Только продаёт готовые туры','Формирует (создаёт) туры','Перевозит грузы','Страхует туристов'], correct: 1 },
    { q: 'Логистика занимается прежде всего:', options: ['Управлением потоками товаров','Бухгалтерией','Рекламой','Кадрами'], correct: 0 },
    { q: 'Вид логистики, связанный с хранением товаров:', options: ['Транспортная','Складская','Финансовая','Кадровая'], correct: 1 },
    { q: '«Звёздность» отеля обозначает:', options: ['Цену за ночь','Уровень комфорта и сервиса','Количество номеров','Год постройки'], correct: 1 },
  ]},
  '7M12': { title: 'Профильный тест: нацбезопасность и военное дело', questions: [
    { q: 'Документ, определяющий основы национальной безопасности РК:', options: ['Трудовой кодекс','Стратегия национальной безопасности','Правила дорожного движения','Устав ООН'], correct: 1 },
    { q: 'Раздел военного дела об организации и ведении боя:', options: ['Стратегия','Тактика','Логистика','Топография'], correct: 1 },
    { q: 'Военная топография изучает:', options: ['Местность и ориентирование на ней','Историю войн','Воинские уставы','Виды вооружения'], correct: 0 },
    { q: 'Основной закон, гарантирующий права и безопасность граждан:', options: ['Приказ','Конституция','Инструкция','Меморандум'], correct: 1 },
  ]},
};

function subjectsFor(direction) { return [...COMMON_SUBJECTS, ...direction.profile]; }
function findDirection(code) { return DIRECTIONS.find(d => d.code === code); }
function findSubject(direction, subjectId) { return subjectsFor(direction).find(s => s.id === subjectId); }

/* ---------------------------------------------------------
   2) "BACKEND" — имитация серверного API (localStorage)
   --------------------------------------------------------- */
const DB_KEY = 'marshrut_db_v3';
const SESSION_KEY = 'marshrut_session_v3';
const NETWORK_DELAY = 350;

function loadDB() {
  const raw = localStorage.getItem(DB_KEY);
  if (raw) return JSON.parse(raw);
  const seeded = {
    users: {
      'demo@marshrut.ru': {
        name: 'Демо Пользователь',
        email: 'demo@marshrut.ru',
        passwordHash: btoa('demo1234'),
        profile: { fullName: 'Демо Пользователь', phone: '+7 700 000 00 00', education: 'КазНУ, бакалавр информатики', city: 'Алматы' },
        favorites: ['7M06'],
        results: [ { code: '7M06', score: 3, total: 4, date: '2026-06-18' } ],
      },
    },
  };
  localStorage.setItem(DB_KEY, JSON.stringify(seeded));
  return seeded;
}
function saveDB(db) { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
function getSession() { return localStorage.getItem(SESSION_KEY); }
function setSession(email) { localStorage.setItem(SESSION_KEY, email); }
function clearSession() { localStorage.removeItem(SESSION_KEY); }

/* Гарантирует наличие новых полей у пользователя (на случай старых записей) */
function normalizeUser(user) {
  if (!user.profile) user.profile = { fullName: user.name || '', phone: '', education: '', city: '' };
  if (!user.favorites) user.favorites = [];
  if (!user.results) user.results = [];
  return user;
}

const API = {
  register(name, email, password) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const db = loadDB();
        if (db.users[email]) { reject(new Error('Этот email уже зарегистрирован.')); return; }
        db.users[email] = {
          name, email, passwordHash: btoa(password),
          profile: { fullName: name, phone: '', education: '', city: '' },
          favorites: [], results: [],
        };
        saveDB(db);
        setSession(email);
        resolve(db.users[email]);
      }, NETWORK_DELAY);
    });
  },

  login(email, password) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const db = loadDB();
        const user = db.users[email];
        if (!user || user.passwordHash !== btoa(password)) {
          reject(new Error('Неверный email или пароль.'));
          return;
        }
        setSession(email);
        resolve(user);
      }, NETWORK_DELAY);
    });
  },

  logout() { clearSession(); },

  getCurrentUser() {
    const email = getSession();
    if (!email) return null;
    const db = loadDB();
    return db.users[email] ? normalizeUser(db.users[email]) : null;
  },

  updateProfile(profile) {
    const email = getSession();
    if (!email) return false;
    const db = loadDB();
    const user = normalizeUser(db.users[email]);
    user.profile = { ...user.profile, ...profile };
    if (profile.fullName) user.name = profile.fullName; // имя в шапке = ФИО
    saveDB(db);
    return true;
  },

  toggleFavorite(code) {
    const email = getSession();
    if (!email) return false;
    const db = loadDB();
    const user = normalizeUser(db.users[email]);
    const i = user.favorites.indexOf(code);
    if (i === -1) user.favorites.push(code); else user.favorites.splice(i, 1);
    saveDB(db);
    return user.favorites.includes(code);
  },

  saveResult(code, score, total) {
    const email = getSession();
    if (!email) return false;
    const db = loadDB();
    const user = normalizeUser(db.users[email]);
    user.results.push({ code, score, total, date: new Date().toISOString().slice(0, 10) });
    saveDB(db);
    return true;
  },
};

/* ---------------------------------------------------------
   STATE
   --------------------------------------------------------- */
let currentSearch = '';
let activeQuiz = null; // { code, qIndex, answers, timerHandle, secondsLeft }

/* ---------------------------------------------------------
   3) РЕНДЕР: КАТАЛОГ НАПРАВЛЕНИЙ
   --------------------------------------------------------- */
function directionMatchesSearch(d) {
  if (!currentSearch) return true;
  const q = currentSearch.toLowerCase();
  return d.code.toLowerCase().includes(q) || d.name.toLowerCase().includes(q) || d.desc.toLowerCase().includes(q);
}

function renderDirectionCard(d) {
  const user = API.getCurrentUser();
  const isFav = user && user.favorites.includes(d.code);
  return `
    <article class="dir-card">
      <div class="dir-card-top">
        <span class="dir-code">${d.code}</span>
        <button class="fav-btn ${isFav ? 'is-fav' : ''}" data-fav="${d.code}"
                aria-label="${isFav ? 'Убрать из избранного' : 'В избранное'}"
                title="${isFav ? 'В избранном' : 'В избранное'}">${isFav ? '★' : '☆'}</button>
      </div>
      <div class="dir-card-body">
        <h3>${d.name}</h3>
        <p>${d.desc}</p>
      </div>
      <div class="dir-card-footer">
        <span class="subj-count">4 предмета</span>
        <button class="btn btn-primary" data-open-dir="${d.code}">Открыть предметы</button>
      </div>
    </article>
  `;
}

function renderCatalog() {
  const grid = document.getElementById('dirGrid');
  const empty = document.getElementById('catalogEmpty');
  const count = document.getElementById('resultCount');
  const matched = DIRECTIONS.filter(directionMatchesSearch);

  grid.innerHTML = matched.map(renderDirectionCard).join('');
  empty.classList.toggle('hidden', matched.length > 0);
  count.textContent = `${matched.length} ${pluralizeDirections(matched.length)}`;

  grid.querySelectorAll('[data-open-dir]').forEach(btn => btn.addEventListener('click', () => openDirection(btn.dataset.openDir)));
  grid.querySelectorAll('[data-fav]').forEach(btn => btn.addEventListener('click', () => handleFavorite(btn.dataset.fav)));
}

function pluralizeDirections(n) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'направление';
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'направления';
  return 'направлений';
}

function handleFavorite(code) {
  const user = API.getCurrentUser();
  if (!user) { showToast('Войдите в аккаунт, чтобы сохранять направления'); openAuth('login'); return; }
  const nowFav = API.toggleFavorite(code);
  showToast(nowFav ? 'Направление добавлено в избранное' : 'Направление убрано из избранного');
  renderCatalog();
  renderDashboard();
}

/* ---------------------------------------------------------
   4) МОДАЛКА: НАПРАВЛЕНИЕ → ПРЕДМЕТЫ → ТЕМЫ
   --------------------------------------------------------- */
function openDirection(code) {
  renderDirectionView(code);
  document.getElementById('dirModal').classList.remove('hidden');
}

function renderDirectionView(code) {
  const d = findDirection(code);
  const subjects = subjectsFor(d);
  const body = document.getElementById('dirModalBody');
  body.innerHTML = `
    <p class="eyebrow">${d.code} · Магистратура</p>
    <h3 class="modal-title">${d.name}</h3>
    <p class="modal-lead">Вступительный экзамен включает 4 предмета: 2 общих и 2 профильных. Выберите предмет, чтобы увидеть темы для подготовки.</p>
    <ul class="subject-list">
      ${subjects.map(s => `
        <li>
          <button class="subject-row" data-open-subject="${s.id}">
            <span class="subject-kind ${s.kind === 'common' ? 'is-common' : 'is-profile'}">${s.kind === 'common' ? 'Общий' : 'Профильный'}</span>
            <span class="subject-text">
              <span class="subject-title">${s.title}</span>
              <span class="subject-sub">${s.sub}</span>
            </span>
            <span class="subject-arrow" aria-hidden="true">→</span>
          </button>
        </li>
      `).join('')}
    </ul>
    <button class="btn btn-primary btn-block" id="dirTestBtn">Пройти тест по направлению</button>
  `;

  body.querySelectorAll('[data-open-subject]').forEach(btn => btn.addEventListener('click', () => renderSubjectView(code, btn.dataset.openSubject)));
  document.getElementById('dirTestBtn').addEventListener('click', () => startQuiz(code));
}

function renderSubjectView(code, subjectId) {
  const d = findDirection(code);
  const s = findSubject(d, subjectId);
  const body = document.getElementById('dirModalBody');
  body.innerHTML = `
    <button class="back-link" id="subjectBack">← ${d.code} · ${d.name}</button>
    <p class="eyebrow">${s.kind === 'common' ? 'Общий предмет' : 'Профильный предмет'}</p>
    <h3 class="modal-title">${s.title}</h3>
    <p class="modal-lead">${s.sub}</p>
    <p class="topics-head">Темы для подготовки</p>
    <ol class="topic-list">
      ${s.topics.map(t => `<li><span class="topic-dot" aria-hidden="true"></span>${t}</li>`).join('')}
    </ol>
  `;
  document.getElementById('subjectBack').addEventListener('click', () => renderDirectionView(code));
}

function closeDirModal() {
  document.getElementById('dirModal').classList.add('hidden');
}

function wireDirModal() {
  document.getElementById('dirClose').addEventListener('click', closeDirModal);
  document.getElementById('dirModal').addEventListener('click', (e) => { if (e.target.id === 'dirModal') closeDirModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('dirModal').classList.contains('hidden')) closeDirModal();
  });
}

/* ---------------------------------------------------------
   5) КВИЗ-ДВИЖОК (тест по направлению)
   --------------------------------------------------------- */
function startQuiz(code) {
  const test = DIRECTION_TESTS[code];
  const d = findDirection(code);
  activeQuiz = { code, qIndex: 0, answers: new Array(test.questions.length).fill(null) };

  document.getElementById('quizCourseLabel').textContent = `${d.code} · ${d.name}`;
  document.getElementById('quizTitle').textContent = test.title;
  document.getElementById('quizDesc').textContent = `Проверьте свои знания по профильным предметам направления «${d.name}». Тест займёт около 5 минут.`;
  document.getElementById('quizQCount').textContent = test.questions.length;

  // открываем тест поверх модалки направления
  document.getElementById('dirModal').classList.add('hidden');
  showQuizStep('intro');
  document.getElementById('quizModal').classList.remove('hidden');
}

function showQuizStep(step) {
  document.getElementById('quizIntro').classList.toggle('hidden', step !== 'intro');
  document.getElementById('quizRun').classList.toggle('hidden', step !== 'run');
  document.getElementById('quizResult').classList.toggle('hidden', step !== 'result');
}

function closeQuiz() {
  document.getElementById('quizModal').classList.add('hidden');
  stopQuizTimer();
  activeQuiz = null;
}

function beginQuizRun() {
  const test = DIRECTION_TESTS[activeQuiz.code];
  activeQuiz.qIndex = 0;
  activeQuiz.answers = new Array(test.questions.length).fill(null);
  activeQuiz.secondsLeft = 360;
  renderQuizDots();
  renderQuizQuestion();
  showQuizStep('run');
  startQuizTimer();
}

function renderQuizDots() {
  const test = DIRECTION_TESTS[activeQuiz.code];
  const dots = document.getElementById('quizDots');
  dots.innerHTML = test.questions.map((_, i) => {
    let cls = '';
    if (i === activeQuiz.qIndex) cls = 'is-active';
    else if (activeQuiz.answers[i] !== null) cls = 'is-done';
    return `<span class="${cls}"></span>`;
  }).join('');
}

function renderQuizQuestion() {
  const test = DIRECTION_TESTS[activeQuiz.code];
  const q = test.questions[activeQuiz.qIndex];
  document.getElementById('quizQNum').textContent = `Вопрос ${activeQuiz.qIndex + 1} из ${test.questions.length}`;
  document.getElementById('quizQuestion').textContent = q.q;

  const optionsEl = document.getElementById('quizOptions');
  optionsEl.innerHTML = q.options.map((opt, i) => `
    <button class="quiz-option ${activeQuiz.answers[activeQuiz.qIndex] === i ? 'is-selected' : ''}" data-option="${i}">${opt}</button>
  `).join('');
  optionsEl.querySelectorAll('[data-option]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeQuiz.answers[activeQuiz.qIndex] = Number(btn.dataset.option);
      renderQuizQuestion();
      renderQuizDots();
    });
  });

  document.getElementById('quizPrevBtn').disabled = activeQuiz.qIndex === 0;
  document.getElementById('quizNextBtn').textContent =
    activeQuiz.qIndex === test.questions.length - 1 ? 'Завершить тест' : 'Далее';
}

function startQuizTimer() {
  updateTimerLabel();
  activeQuiz.timerHandle = setInterval(() => {
    activeQuiz.secondsLeft--;
    updateTimerLabel();
    if (activeQuiz.secondsLeft <= 0) { stopQuizTimer(); finishQuiz(); }
  }, 1000);
}
function stopQuizTimer() { if (activeQuiz && activeQuiz.timerHandle) clearInterval(activeQuiz.timerHandle); }
function updateTimerLabel() {
  const m = Math.floor(activeQuiz.secondsLeft / 60).toString().padStart(2, '0');
  const s = (activeQuiz.secondsLeft % 60).toString().padStart(2, '0');
  document.getElementById('quizTimer').textContent = `${m}:${s}`;
}

function finishQuiz() {
  const test = DIRECTION_TESTS[activeQuiz.code];
  let score = 0;
  test.questions.forEach((q, i) => { if (activeQuiz.answers[i] === q.correct) score++; });
  const total = test.questions.length;
  const pct = Math.round((score / total) * 100);
  const passed = pct >= 60;

  const user = API.getCurrentUser();
  if (user) {
    API.saveResult(activeQuiz.code, score, total);
    renderDashboard();
  }

  document.getElementById('quizStamp').classList.toggle('is-fail', !passed);
  document.getElementById('stampStatus').textContent = passed ? 'Сдано' : 'Не сдано';
  document.getElementById('stampScore').textContent = `${score}/${total}`;
  document.getElementById('resultHeadline').textContent = passed ? 'Тест пройден' : 'Пока не получилось';
  document.getElementById('resultText').textContent = user
    ? `Вы ответили правильно на ${score} из ${total} вопросов. Результат сохранён в личном кабинете.`
    : `Вы ответили правильно на ${score} из ${total} вопросов. Войдите в аккаунт, чтобы сохранять результаты тестов.`;

  showQuizStep('result');
}

function wireQuiz() {
  document.getElementById('quizClose').addEventListener('click', closeQuiz);
  document.getElementById('quizModal').addEventListener('click', (e) => { if (e.target.id === 'quizModal') closeQuiz(); });
  document.getElementById('quizStartBtn').addEventListener('click', beginQuizRun);

  document.getElementById('quizPrevBtn').addEventListener('click', () => {
    if (activeQuiz.qIndex > 0) { activeQuiz.qIndex--; renderQuizQuestion(); renderQuizDots(); }
  });
  document.getElementById('quizNextBtn').addEventListener('click', () => {
    const test = DIRECTION_TESTS[activeQuiz.code];
    if (activeQuiz.qIndex < test.questions.length - 1) { activeQuiz.qIndex++; renderQuizQuestion(); renderQuizDots(); }
    else { stopQuizTimer(); finishQuiz(); }
  });

  document.getElementById('quizRetryBtn').addEventListener('click', beginQuizRun);
  document.getElementById('quizDashBtn').addEventListener('click', () => {
    closeQuiz();
    document.getElementById('account').scrollIntoView({ behavior: 'smooth' });
  });
}

/* ---------------------------------------------------------
   6) АВТОРИЗАЦИЯ / ЛИЧНЫЙ КАБИНЕТ
   --------------------------------------------------------- */
function refreshAuthUI() {
  const user = API.getCurrentUser();
  const chip = document.getElementById('userChip');
  const guestLogin = document.getElementById('btnGuestLogin');
  const guestRegister = document.getElementById('btnGuestRegister');
  const authZone = document.getElementById('authZone');
  const dashboard = document.getElementById('dashboard');

  if (user) {
    chip.classList.remove('hidden');
    guestLogin.classList.add('hidden');
    guestRegister.classList.add('hidden');
    document.getElementById('userAvatar').textContent = (user.name || '?').trim()[0].toUpperCase();
    document.getElementById('userNameLabel').textContent = user.name;
    authZone.classList.add('hidden');
    dashboard.classList.remove('hidden');
  } else {
    chip.classList.add('hidden');
    guestLogin.classList.remove('hidden');
    guestRegister.classList.remove('hidden');
    authZone.classList.remove('hidden');
    dashboard.classList.add('hidden');
  }
}

function renderDashboard() {
  const user = API.getCurrentUser();
  if (!user) return;

  document.getElementById('dashName').textContent = user.name;

  // --- Личные данные ---
  const p = user.profile;
  document.getElementById('pfFullName').value = p.fullName || '';
  document.getElementById('pfEmail').value = user.email || '';
  document.getElementById('pfPhone').value = p.phone || '';
  document.getElementById('pfEducation').value = p.education || '';
  document.getElementById('pfCity').value = p.city || '';

  // --- Результаты тестов ---
  const summary = document.getElementById('resultSummary');
  const table = document.getElementById('resultsTable');
  const body = document.getElementById('resultsBody');
  const empty = document.getElementById('dashResultsEmpty');
  const rows = [...user.results].reverse();

  if (rows.length > 0) {
    const last = rows[0];
    const pct = Math.round((last.score / last.total) * 100);
    const passed = pct >= 60;
    const d = findDirection(last.code);
    summary.innerHTML = `
      <span class="rs-label">Текущий результат</span>
      <span class="rs-value">${last.score} / ${last.total} · ${pct}%</span>
      <span class="test-status-badge ${passed ? 'passed' : 'failed'}">${passed ? 'Сдан' : 'Не сдан'}</span>
      <span class="rs-dir">${d ? d.code + ' · ' + d.name : last.code}</span>
    `;
    summary.classList.remove('hidden');
  } else {
    summary.classList.add('hidden');
  }

  body.innerHTML = rows.map(r => {
    const pct = Math.round((r.score / r.total) * 100);
    const passed = pct >= 60;
    const d = findDirection(r.code);
    return `
      <tr>
        <td>${d ? `${d.code} · ${d.name}` : r.code}</td>
        <td>${r.score}/${r.total}</td>
        <td><span class="test-status-badge ${passed ? 'passed' : 'failed'}">${passed ? 'Сдан' : 'Не сдан'}</span></td>
        <td>${r.date}</td>
      </tr>
    `;
  }).join('');
  empty.classList.toggle('hidden', rows.length > 0);
  table.classList.toggle('hidden', rows.length === 0);

  // --- Избранные направления ---
  const list = document.getElementById('dashFavorites');
  const favEmpty = document.getElementById('dashFavEmpty');
  const favs = DIRECTIONS.filter(d => user.favorites.includes(d.code));
  list.innerHTML = favs.map(d => `
    <li>
      <button class="dash-fav-row" data-open-dir="${d.code}">
        <span class="dash-fav-code">${d.code}</span>
        <span class="dash-fav-name">${d.name}</span>
        <span class="subject-arrow" aria-hidden="true">→</span>
      </button>
    </li>
  `).join('');
  favEmpty.classList.toggle('hidden', favs.length > 0);
  list.querySelectorAll('[data-open-dir]').forEach(btn => btn.addEventListener('click', () => openDirection(btn.dataset.openDir)));
}

function wireProfileForm() {
  const form = document.getElementById('profileForm');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    API.updateProfile({
      fullName: document.getElementById('pfFullName').value.trim(),
      phone: document.getElementById('pfPhone').value.trim(),
      education: document.getElementById('pfEducation').value.trim(),
      city: document.getElementById('pfCity').value.trim(),
    });
    const saved = document.getElementById('profileSaved');
    saved.classList.remove('hidden');
    clearTimeout(form._savedTimer);
    form._savedTimer = setTimeout(() => saved.classList.add('hidden'), 2000);
    refreshAuthUI();   // обновить имя в шапке
    renderDashboard();
    showToast('Личные данные сохранены');
  });
}

function openAuth(tab) {
  document.getElementById('account').scrollIntoView({ behavior: 'smooth' });
  switchAuthTab(tab || 'login');
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('is-active', t.dataset.tab === tab));
  document.getElementById('loginForm').classList.toggle('hidden', tab !== 'login');
  document.getElementById('registerForm').classList.toggle('hidden', tab !== 'register');
}

function wireAuth() {
  document.querySelectorAll('[data-open-auth]').forEach(el => {
    el.addEventListener('click', (e) => { e.preventDefault(); openAuth(el.dataset.openAuth); });
  });
  document.querySelectorAll('.auth-tab').forEach(t => t.addEventListener('click', () => switchAuthTab(t.dataset.tab)));

  document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    errorEl.textContent = '';
    API.login(email, password)
      .then(() => { showToast('Добро пожаловать!'); afterAuthChange(); })
      .catch(err => { errorEl.textContent = err.message; });
  });

  document.getElementById('registerForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const errorEl = document.getElementById('registerError');
    errorEl.textContent = '';
    API.register(name, email, password)
      .then(() => { showToast('Аккаунт создан'); afterAuthChange(); })
      .catch(err => { errorEl.textContent = err.message; });
  });

  document.getElementById('btnLogout').addEventListener('click', () => {
    API.logout();
    showToast('Вы вышли из аккаунта');
    afterAuthChange();
  });
  document.getElementById('btnGoDashboard').addEventListener('click', () => {
    document.getElementById('account').scrollIntoView({ behavior: 'smooth' });
  });
}

function afterAuthChange() {
  refreshAuthUI();
  renderDashboard();
  renderCatalog();
}

/* ---------------------------------------------------------
   TOAST
   --------------------------------------------------------- */
let toastTimeout = null;
function showToast(message) {
  const overlay = document.getElementById('toastOverlay');
  const toast = document.getElementById('toast');
  toast.textContent = message;
  overlay.classList.remove('hidden');
  overlay.style.background = 'transparent';
  overlay.style.alignItems = 'flex-start';
  overlay.style.justifyContent = 'center';
  overlay.style.paddingTop = '24px';
  overlay.style.pointerEvents = 'none';
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => overlay.classList.add('hidden'), 2200);
}

/* ---------------------------------------------------------
   ПОИСК
   --------------------------------------------------------- */
function wireSearch() {
  document.getElementById('searchBar').addEventListener('submit', (e) => {
    e.preventDefault();
    currentSearch = document.getElementById('fSearch').value.trim();
    renderCatalog();
    document.getElementById('catalog').scrollIntoView({ behavior: 'smooth' });
  });
  document.getElementById('fSearch').addEventListener('input', (e) => {
    currentSearch = e.target.value.trim();
    renderCatalog();
  });
}

/* ---------------------------------------------------------
   HERO VIDEO — бесшовная петля (кроссфейд двух копий)
   Два одинаковых видео сдвинуты на полдлительности; у стыка петли
   активная копия плавно гаснет, вторая (в середине клипа) — держит
   картинку. Резкого обрыва на loop не видно.
   --------------------------------------------------------- */
function wireHeroVideoLoop() {
  const a = document.getElementById('heroVidA');
  const b = document.getElementById('heroVidB');
  if (!a || !b) return;

  // При prefers-reduced-motion видео скрыто — петлю не запускаем
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const FADE = 0.7; // секунды перекрытия у краёв
  let dur = 0, ticking = false;

  const opacityFor = (t) => {
    if (!dur) return 1;
    const edge = Math.min(t, dur - t);      // расстояние до ближайшего стыка
    return Math.max(0, Math.min(1, edge / FADE));
  };

  const tick = () => {
    a.style.opacity = opacityFor(a.currentTime);
    b.style.opacity = opacityFor(b.currentTime);
    requestAnimationFrame(tick);
  };
  // Плавную петлю включаем только когда видео РЕАЛЬНО играет —
  // иначе (автоплей заблокирован) остаётся обычный первый кадр (A видимо, B скрыто).
  const startTick = () => { if (!ticking) { ticking = true; requestAnimationFrame(tick); } };

  const start = () => {
    dur = a.duration || 5;
    try { b.currentTime = dur / 2; } catch (e) {}   // сдвиг на полклипа
    a.play().catch(() => {});
    b.play().catch(() => {});
  };

  a.addEventListener('playing', startTick);
  if (a.readyState >= 1 && a.duration) start();
  else a.addEventListener('loadedmetadata', start, { once: true });
}

/* ---------------------------------------------------------
   MOBILE NAV (burger)
   --------------------------------------------------------- */
function wireMobileNav() {
  const toggle = document.getElementById('navToggle');
  const nav = document.getElementById('mainNav');
  const setOpen = (open) => {
    nav.classList.toggle('is-open', open);
    toggle.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  };
  toggle.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  document.addEventListener('click', (e) => {
    if (!nav.classList.contains('is-open')) return;
    if (!e.target.closest('#mainNav') && !e.target.closest('#navToggle')) setOpen(false);
  });
}

/* ---------------------------------------------------------
   INIT
   --------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  loadDB();
  renderCatalog();
  refreshAuthUI();
  renderDashboard();
  wireAuth();
  wireProfileForm();
  wireSearch();
  wireDirModal();
  wireQuiz();
  wireMobileNav();
  wireHeroVideoLoop();
});
