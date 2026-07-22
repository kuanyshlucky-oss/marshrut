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
      'Listening — 8 вопросов: аудирование коротких диалогов и объявлений',
      'Reading — 8 вопросов: чтение и понимание академических текстов',
      'Тесты — 14 вопросов: грамматика и лексика',
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
// Конспекты по профильным предметам M001. Ключ — метка topic у вопроса, значение — файл и страница.
const CONSPECTS = {
  '1. Предмет и основные категории педагогики': { file: 'assets/konspekty/pedagogika.pdf', page: 1, title: 'Педагогика · Предмет и основные категории' },
  '2. Дидактика: теория обучения': { file: 'assets/konspekty/pedagogika.pdf', page: 1, title: 'Педагогика · Дидактика' },
  '3. Теория воспитания': { file: 'assets/konspekty/pedagogika.pdf', page: 3, title: 'Педагогика · Теория воспитания' },
  '4. Личность и её развитие в педагогике': { file: 'assets/konspekty/pedagogika.pdf', page: 4, title: 'Педагогика · Личность' },
  '5. Из истории педагогической мысли': { file: 'assets/konspekty/pedagogika.pdf', page: 5, title: 'Педагогика · История педагогики' },
  '6. Образование как система: функции и тенденции': { file: 'assets/konspekty/pedagogika.pdf', page: 5, title: 'Педагогика · Образование как система' },
  '7. Методология и эксперимент в педагогике': { file: 'assets/konspekty/pedagogika.pdf', page: 5, title: 'Педагогика · Методология' },
  '1. Предмет и структура психологии': { file: 'assets/konspekty/psikhologiya.pdf', page: 1, title: 'Психология · Предмет и структура' },
  '2. Из истории психологии': { file: 'assets/konspekty/psikhologiya.pdf', page: 1, title: 'Психология · История' },
  '3. Ощущения и восприятие': { file: 'assets/konspekty/psikhologiya.pdf', page: 1, title: 'Психология · Ощущения и восприятие' },
  '4. Внимание': { file: 'assets/konspekty/psikhologiya.pdf', page: 2, title: 'Психология · Внимание' },
  '5. Мышление и речь': { file: 'assets/konspekty/psikhologiya.pdf', page: 2, title: 'Психология · Мышление и речь' },
  '6. Воображение': { file: 'assets/konspekty/psikhologiya.pdf', page: 2, title: 'Психология · Воображение' },
  '7. Эмоционально-волевая сфера': { file: 'assets/konspekty/psikhologiya.pdf', page: 2, title: 'Психология · Эмоционально-волевая сфера' },
  '8. Личность: структура и типологии': { file: 'assets/konspekty/psikhologiya.pdf', page: 3, title: 'Психология · Личность' },
  '9. Возрастная психология': { file: 'assets/konspekty/psikhologiya.pdf', page: 3, title: 'Психология · Возрастная психология' },
  '10. Деятельность': { file: 'assets/konspekty/psikhologiya.pdf', page: 3, title: 'Психология · Деятельность' },
  '11. Виды психологического знания': { file: 'assets/konspekty/psikhologiya.pdf', page: 4, title: 'Психология · Виды психологического знания' },
};
function conspectLink(topic) {
  const c = topic && CONSPECTS[topic];
  if (!c) return '';
  // Конспект открывается через свою страницу-просмотрщик (картинки, без текстового слоя PDF),
  // а не прямой ссылкой на файл — чтобы текст нельзя было выделить и скопировать.
  const doc = c.file.split('/').pop().replace('.pdf', '');
  return `<a class="rev-konspekt-btn" href="konspekt.html?file=${doc}&page=${c.page}" target="_blank" rel="noopener">Открыть конспект: ${esc(c.title)}</a>`;
}

// Раздел «Конспекты» в личном кабинете — доступен только тем, кому выдан доступ
// к соответствующему направлению (та же test_access, что и у самих тестов).
// Ключ — код направления (как в test_access/INTERACTIVE_TEST_CODES).
const LIBRARY_CONSPECTS = {
  '7M01': {
    title: 'Педагогика и психология',
    file: 'pedagogika-course',
    pages: 29,
    topics: [
      { title: 'Тема 1. Приоритетная роль образования в современных условиях', page: 1 },
      { title: 'Тема 2. Общая характеристика педагогической профессии и деятельности', page: 3 },
      { title: 'Тема 3. Личность педагога и его профессиональная компетентность', page: 5 },
      { title: 'Тема 4. Факторы непрерывного профессионального роста педагога', page: 7 },
      { title: 'Тема 5. Педагогика в системе наук о человеке', page: 9 },
      { title: 'Тема 6. Методологические основы и методы педагогического исследования', page: 11 },
      { title: 'Тема 7. Личность как объект, субъект воспитания и факторы её развития и формирования', page: 12 },
      { title: 'Тема 8. Сущность и структура целостного педагогического процесса (ЦПП)', page: 14 },
      { title: 'Тема 9. Цель воспитания, её социальная обусловленность', page: 16 },
      { title: 'Тема 10. Научное мировоззрение как основа интеллектуального развития личности школьника', page: 17 },
      { title: 'Тема 11. Сущность и содержание воспитания в целостном педагогическом процессе', page: 18 },
      { title: 'Тема 12. Средства и формы воспитания', page: 19 },
      { title: 'Тема 13. Основы семейного воспитания', page: 20 },
      { title: 'Тема 14. Сущность обучения', page: 21 },
      { title: 'Тема 15. Научные основы содержания образования в современной школе', page: 22 },
      { title: 'Тема 16. Средства, формы обучения как двигательный механизм ЦПП', page: 23 },
      { title: 'Тема 17. Методы обучения', page: 24 },
      { title: 'Тема 18. Диагностика и контроль в обучении', page: 25 },
      { title: 'Тема 19. Активизация познавательной деятельности учащихся в целостном педагогическом процессе', page: 27 },
      { title: 'Тема 20. Технологии обучения в профессиональной деятельности учителя', page: 29 },
    ],
  },
};

// Рендерит раздел «Конспекты» в кабинете — только для кодов, к которым выдан доступ.
function renderConspectsLibrary() {
  const section = document.getElementById('konspektySection');
  if (!section) return; // раздел есть только на cabinet.html
  const user = API.getCurrentUser();
  const access = (user && user.access) || [];
  const available = access.map(code => ({ code, lib: LIBRARY_CONSPECTS[code] })).filter(x => x.lib);
  if (!available.length) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  section.innerHTML = available.map(({ code, lib }) => `
    <a class="dash-card konspekty-card" href="konspekty.html?code=${encodeURIComponent(code)}">
      <h3>Конспекты · ${esc(lib.title)}</h3>
      <p>${lib.topics.length} тем — откройте список слева и переключайтесь между темами, не теряя место.</p>
      <span class="konspekty-card-arrow" aria-hidden="true">→</span>
    </a>
  `).join('');
}

const INTERACTIVE_TEST_CODES = ["7M01","7M02","7M03","7M04","7M05","7M06","7M07","7M08","7M11","7M12"]; // какие направления имеют интерактивный тест (не секрет — просто UI-подсказка, доступ проверяется на бэкенде)

/* Статистика КТ-2025 по 147 группам образовательных программ (официальная сводка НЦТ).
   Используется новым каталогом на главной (поиск + категории + карточка статистики). */
const KT_STATS_GROUPS = [{"code": "M001", "name": "Педагогика и психология", "applications": 2055, "participants": 1872, "participation_pct": 91.09, "passed": 779, "passed_pct": 41.61, "failed": 1093, "failed_pct": 58.39}, {"code": "M002", "name": "Дошкольное обучение и воспитание", "applications": 265, "participants": 254, "participation_pct": 95.85, "passed": 56, "passed_pct": 22.05, "failed": 198, "failed_pct": 77.95}, {"code": "M003", "name": "Подготовка педагогов без предметной специализации", "applications": 1355, "participants": 1273, "participation_pct": 93.95, "passed": 420, "passed_pct": 32.99, "failed": 853, "failed_pct": 67.01}, {"code": "M004", "name": "Подготовка педагогов начальной военной подготовки", "applications": 31, "participants": 28, "participation_pct": 90.32, "passed": 3, "passed_pct": 10.71, "failed": 25, "failed_pct": 89.29}, {"code": "M005", "name": "Подготовка педагогов физической культуры", "applications": 852, "participants": 795, "participation_pct": 93.31, "passed": 97, "passed_pct": 12.2, "failed": 698, "failed_pct": 87.8}, {"code": "M006", "name": "Подготовка педагогов музыки", "applications": 170, "participants": 162, "participation_pct": 95.29, "passed": 40, "passed_pct": 24.69, "failed": 122, "failed_pct": 75.31}, {"code": "M007", "name": "Подготовка педагогов художественного труда, графики и проектирования", "applications": 193, "participants": 178, "participation_pct": 92.23, "passed": 45, "passed_pct": 25.28, "failed": 133, "failed_pct": 74.72}, {"code": "M009", "name": "Основы права и экономики", "applications": 23, "participants": 16, "participation_pct": 69.57, "passed": 1, "passed_pct": 6.25, "failed": 15, "failed_pct": 93.75}, {"code": "M010", "name": "Подготовка педагогов математики", "applications": 2381, "participants": 2290, "participation_pct": 96.18, "passed": 1287, "passed_pct": 56.2, "failed": 1003, "failed_pct": 43.8}, {"code": "M011", "name": "Подготовка педагогов физики", "applications": 999, "participants": 963, "participation_pct": 96.4, "passed": 415, "passed_pct": 43.09, "failed": 548, "failed_pct": 56.91}, {"code": "M012", "name": "Подготовка педагогов информатики", "applications": 1042, "participants": 979, "participation_pct": 93.95, "passed": 560, "passed_pct": 57.2, "failed": 419, "failed_pct": 42.8}, {"code": "M013", "name": "Подготовка педагогов химии", "applications": 1248, "participants": 1190, "participation_pct": 95.35, "passed": 693, "passed_pct": 58.24, "failed": 497, "failed_pct": 41.76}, {"code": "M014", "name": "Подготовка педагогов биологии", "applications": 1543, "participants": 1475, "participation_pct": 95.59, "passed": 614, "passed_pct": 41.63, "failed": 861, "failed_pct": 58.37}, {"code": "M015", "name": "Подготовка педагогов географии", "applications": 503, "participants": 477, "participation_pct": 94.83, "passed": 141, "passed_pct": 29.56, "failed": 336, "failed_pct": 70.44}, {"code": "M016", "name": "Подготовка педагогов истории", "applications": 1080, "participants": 1010, "participation_pct": 93.52, "passed": 456, "passed_pct": 45.15, "failed": 554, "failed_pct": 54.85}, {"code": "M017", "name": "Подготовка педагогов казахского языка и литературы", "applications": 1939, "participants": 1850, "participation_pct": 95.41, "passed": 631, "passed_pct": 34.11, "failed": 1219, "failed_pct": 65.89}, {"code": "M018", "name": "Подготовка педагогов русского языка и литературы", "applications": 685, "participants": 654, "participation_pct": 95.47, "passed": 254, "passed_pct": 38.84, "failed": 400, "failed_pct": 61.16}, {"code": "M019", "name": "Подготовка педагогов иностранного языка", "applications": 3800, "participants": 3604, "participation_pct": 94.84, "passed": 2735, "passed_pct": 75.89, "failed": 869, "failed_pct": 24.11}, {"code": "M020", "name": "Подготовка социальных педагогов", "applications": 63, "participants": 61, "participation_pct": 96.83, "passed": 32, "passed_pct": 52.46, "failed": 29, "failed_pct": 47.54}, {"code": "M021", "name": "Специальная педагогика", "applications": 525, "participants": 490, "participation_pct": 93.33, "passed": 283, "passed_pct": 57.76, "failed": 207, "failed_pct": 42.24}, {"code": "M022", "name": "Музыковедение", "applications": 9, "participants": 7, "participation_pct": 77.78, "passed": 6, "passed_pct": 85.71, "failed": 1, "failed_pct": 14.29}, {"code": "M023", "name": "Инструментальное исполнительство", "applications": 61, "participants": 59, "participation_pct": 96.72, "passed": 46, "passed_pct": 77.97, "failed": 13, "failed_pct": 22.03}, {"code": "M024", "name": "Вокальное искусство", "applications": 24, "participants": 19, "participation_pct": 79.17, "passed": 11, "passed_pct": 57.89, "failed": 8, "failed_pct": 42.11}, {"code": "M025", "name": "Традиционное музыкальное искусство", "applications": 92, "participants": 86, "participation_pct": 93.48, "passed": 60, "passed_pct": 69.77, "failed": 26, "failed_pct": 30.23}, {"code": "M026", "name": "Композиция", "applications": 4, "participants": 3, "participation_pct": 75.0, "passed": 2, "passed_pct": 66.67, "failed": 1, "failed_pct": 33.33}, {"code": "M027", "name": "Дирижирование", "applications": 19, "participants": 10, "participation_pct": 52.63, "passed": 9, "passed_pct": 90.0, "failed": 1, "failed_pct": 10.0}, {"code": "M028", "name": "Режиссура", "applications": 66, "participants": 50, "participation_pct": 75.76, "passed": 44, "passed_pct": 88.0, "failed": 6, "failed_pct": 12.0}, {"code": "M029", "name": "Театральное искусство", "applications": 21, "participants": 18, "participation_pct": 85.71, "passed": 13, "passed_pct": 72.22, "failed": 5, "failed_pct": 27.78}, {"code": "M030", "name": "Искусство эстрады", "applications": 17, "participants": 15, "participation_pct": 88.24, "passed": 12, "passed_pct": 80.0, "failed": 3, "failed_pct": 20.0}, {"code": "M031", "name": "Хореография", "applications": 23, "participants": 14, "participation_pct": 60.87, "passed": 13, "passed_pct": 92.86, "failed": 1, "failed_pct": 7.14}, {"code": "M032", "name": "Аудиовизуальное искусство и медиа производство", "applications": 34, "participants": 29, "participation_pct": 85.29, "passed": 23, "passed_pct": 79.31, "failed": 6, "failed_pct": 20.69}, {"code": "M033", "name": "Изобразительное искусство", "applications": 44, "participants": 39, "participation_pct": 88.64, "passed": 31, "passed_pct": 79.49, "failed": 8, "failed_pct": 20.51}, {"code": "M034", "name": "Искусствоведение", "applications": 22, "participants": 21, "participation_pct": 95.45, "passed": 13, "passed_pct": 61.9, "failed": 8, "failed_pct": 38.1}, {"code": "M035", "name": "Мода, дизайн", "applications": 170, "participants": 154, "participation_pct": 90.59, "passed": 104, "passed_pct": 67.53, "failed": 50, "failed_pct": 32.47}, {"code": "M036", "name": "Полиграфия", "applications": 18, "participants": 17, "participation_pct": 94.44, "passed": 12, "passed_pct": 70.59, "failed": 5, "failed_pct": 29.41}, {"code": "M037", "name": "Арт-менеджмент", "applications": 37, "participants": 30, "participation_pct": 81.08, "passed": 21, "passed_pct": 70.0, "failed": 9, "failed_pct": 30.0}, {"code": "M050", "name": "Философия и этика", "applications": 80, "participants": 77, "participation_pct": 96.25, "passed": 38, "passed_pct": 49.35, "failed": 39, "failed_pct": 50.65}, {"code": "M051", "name": "Религия и теология", "applications": 176, "participants": 158, "participation_pct": 89.77, "passed": 68, "passed_pct": 43.04, "failed": 90, "failed_pct": 56.96}, {"code": "M052", "name": "Исламоведение", "applications": 97, "participants": 83, "participation_pct": 85.57, "passed": 82, "passed_pct": 98.8, "failed": 1, "failed_pct": 1.2}, {"code": "M053", "name": "История", "applications": 134, "participants": 124, "participation_pct": 92.54, "passed": 52, "passed_pct": 41.94, "failed": 72, "failed_pct": 58.06}, {"code": "M054", "name": "Тюркология", "applications": 17, "participants": 17, "participation_pct": 100.0, "passed": 12, "passed_pct": 70.59, "failed": 5, "failed_pct": 29.41}, {"code": "M055", "name": "Востоковедение", "applications": 87, "participants": 79, "participation_pct": 90.8, "passed": 62, "passed_pct": 78.48, "failed": 17, "failed_pct": 21.52}, {"code": "M056", "name": "Переводческое дело, синхронный перевод", "applications": 217, "participants": 206, "participation_pct": 94.93, "passed": 155, "passed_pct": 75.24, "failed": 51, "failed_pct": 24.76}, {"code": "M057", "name": "Лингвистика", "applications": 22, "participants": 20, "participation_pct": 90.91, "passed": 13, "passed_pct": 65.0, "failed": 7, "failed_pct": 35.0}, {"code": "M058", "name": "Литература", "applications": 31, "participants": 31, "participation_pct": 100.0, "passed": 20, "passed_pct": 64.52, "failed": 11, "failed_pct": 35.48}, {"code": "M059", "name": "Иностранная филология", "applications": 259, "participants": 247, "participation_pct": 95.37, "passed": 165, "passed_pct": 66.8, "failed": 82, "failed_pct": 33.2}, {"code": "M060", "name": "Филология", "applications": 287, "participants": 270, "participation_pct": 94.08, "passed": 162, "passed_pct": 60.0, "failed": 108, "failed_pct": 40.0}, {"code": "M061", "name": "Социология", "applications": 92, "participants": 86, "participation_pct": 93.48, "passed": 43, "passed_pct": 50.0, "failed": 43, "failed_pct": 50.0}, {"code": "M062", "name": "Культурология", "applications": 34, "participants": 34, "participation_pct": 100.0, "passed": 18, "passed_pct": 52.94, "failed": 16, "failed_pct": 47.06}, {"code": "M063", "name": "Политология и конфликтология", "applications": 145, "participants": 139, "participation_pct": 95.86, "passed": 65, "passed_pct": 46.76, "failed": 74, "failed_pct": 53.24}, {"code": "M064", "name": "Международные отношения", "applications": 366, "participants": 342, "participation_pct": 93.44, "passed": 224, "passed_pct": 65.5, "failed": 118, "failed_pct": 34.5}, {"code": "M065", "name": "Регионоведение", "applications": 29, "participants": 28, "participation_pct": 96.55, "passed": 24, "passed_pct": 85.71, "failed": 4, "failed_pct": 14.29}, {"code": "M066", "name": "Психология", "applications": 763, "participants": 698, "participation_pct": 91.48, "passed": 421, "passed_pct": 60.32, "failed": 277, "failed_pct": 39.68}, {"code": "M067", "name": "Журналистика и репортерское дело", "applications": 379, "participants": 352, "participation_pct": 92.88, "passed": 89, "passed_pct": 25.28, "failed": 263, "failed_pct": 74.72}, {"code": "M068", "name": "Связь с общественностью", "applications": 85, "participants": 75, "participation_pct": 88.24, "passed": 25, "passed_pct": 33.33, "failed": 50, "failed_pct": 66.67}, {"code": "M069", "name": "Библиотечное дело, обработка информации и архивное дело", "applications": 51, "participants": 46, "participation_pct": 90.2, "passed": 12, "passed_pct": 26.09, "failed": 34, "failed_pct": 73.91}, {"code": "M070", "name": "Экономика", "applications": 788, "participants": 724, "participation_pct": 91.88, "passed": 287, "passed_pct": 39.64, "failed": 437, "failed_pct": 60.36}, {"code": "M071", "name": "Государственное и местное управление", "applications": 425, "participants": 387, "participation_pct": 91.06, "passed": 125, "passed_pct": 32.3, "failed": 262, "failed_pct": 67.7}, {"code": "M072", "name": "Менеджмент", "applications": 1625, "participants": 1512, "participation_pct": 93.05, "passed": 1007, "passed_pct": 66.6, "failed": 505, "failed_pct": 33.4}, {"code": "M073", "name": "Аудит и налогообложение", "applications": 495, "participants": 437, "participation_pct": 88.28, "passed": 187, "passed_pct": 42.79, "failed": 250, "failed_pct": 57.21}, {"code": "M074", "name": "Финансы, банковское и страховое дело", "applications": 846, "participants": 766, "participation_pct": 90.54, "passed": 488, "passed_pct": 63.71, "failed": 278, "failed_pct": 36.29}, {"code": "M075", "name": "Маркетинг и реклама", "applications": 418, "participants": 377, "participation_pct": 90.19, "passed": 177, "passed_pct": 46.95, "failed": 200, "failed_pct": 53.05}, {"code": "M076", "name": "Трудовые навыки", "applications": 7, "participants": 5, "participation_pct": 71.43, "passed": 0, "passed_pct": 0.0, "failed": 5, "failed_pct": 100.0}, {"code": "M077", "name": "Оценка", "applications": 14, "participants": 13, "participation_pct": 92.86, "passed": 4, "passed_pct": 30.77, "failed": 9, "failed_pct": 69.23}, {"code": "M078", "name": "Право", "applications": 2296, "participants": 2065, "participation_pct": 89.94, "passed": 785, "passed_pct": 38.01, "failed": 1280, "failed_pct": 61.99}, {"code": "M079", "name": "Судебная экспертиза", "applications": 64, "participants": 61, "participation_pct": 95.31, "passed": 33, "passed_pct": 54.1, "failed": 28, "failed_pct": 45.9}, {"code": "M080", "name": "Биология", "applications": 260, "participants": 243, "participation_pct": 93.46, "passed": 120, "passed_pct": 49.38, "failed": 123, "failed_pct": 50.62}, {"code": "M081", "name": "Генетика", "applications": 33, "participants": 32, "participation_pct": 96.97, "passed": 24, "passed_pct": 75.0, "failed": 8, "failed_pct": 25.0}, {"code": "M082", "name": "Биотехнология", "applications": 306, "participants": 289, "participation_pct": 94.44, "passed": 156, "passed_pct": 53.98, "failed": 133, "failed_pct": 46.02}, {"code": "M083", "name": "Геоботаника", "applications": 7, "participants": 7, "participation_pct": 100.0, "passed": 3, "passed_pct": 42.86, "failed": 4, "failed_pct": 57.14}, {"code": "M084", "name": "География", "applications": 151, "participants": 146, "participation_pct": 96.69, "passed": 81, "passed_pct": 55.48, "failed": 65, "failed_pct": 44.52}, {"code": "M085", "name": "Гидрология", "applications": 24, "participants": 23, "participation_pct": 95.83, "passed": 9, "passed_pct": 39.13, "failed": 14, "failed_pct": 60.87}, {"code": "M086", "name": "Метеорология", "applications": 21, "participants": 21, "participation_pct": 100.0, "passed": 14, "passed_pct": 66.67, "failed": 7, "failed_pct": 33.33}, {"code": "M087", "name": "Технология охраны окружающей среды", "applications": 310, "participants": 294, "participation_pct": 94.84, "passed": 99, "passed_pct": 33.67, "failed": 195, "failed_pct": 66.33}, {"code": "M088", "name": "Гидрогеология и инженерная геология", "applications": 31, "participants": 31, "participation_pct": 100.0, "passed": 16, "passed_pct": 51.61, "failed": 15, "failed_pct": 48.39}, {"code": "M089", "name": "Химия", "applications": 228, "participants": 222, "participation_pct": 97.37, "passed": 70, "passed_pct": 31.53, "failed": 152, "failed_pct": 68.47}, {"code": "M090", "name": "Физика", "applications": 303, "participants": 291, "participation_pct": 96.04, "passed": 168, "passed_pct": 57.73, "failed": 123, "failed_pct": 42.27}, {"code": "M091", "name": "Сейсмология", "applications": 6, "participants": 6, "participation_pct": 100.0, "passed": 4, "passed_pct": 66.67, "failed": 2, "failed_pct": 33.33}, {"code": "M092", "name": "Математика и статистика", "applications": 382, "participants": 361, "participation_pct": 94.5, "passed": 213, "passed_pct": 59.0, "failed": 148, "failed_pct": 41.0}, {"code": "M093", "name": "Механика", "applications": 32, "participants": 32, "participation_pct": 100.0, "passed": 16, "passed_pct": 50.0, "failed": 16, "failed_pct": 50.0}, {"code": "M094", "name": "Информационные технологии", "applications": 5139, "participants": 4897, "participation_pct": 95.29, "passed": 3301, "passed_pct": 67.41, "failed": 1596, "failed_pct": 32.59}, {"code": "M095", "name": "Информационная безопасность", "applications": 874, "participants": 829, "participation_pct": 94.85, "passed": 426, "passed_pct": 51.39, "failed": 403, "failed_pct": 48.61}, {"code": "M096", "name": "Коммуникации и коммуникационные технологии", "applications": 330, "participants": 308, "participation_pct": 93.33, "passed": 107, "passed_pct": 34.74, "failed": 201, "failed_pct": 65.26}, {"code": "M097", "name": "Химическая инженерия и процессы", "applications": 367, "participants": 350, "participation_pct": 95.37, "passed": 190, "passed_pct": 54.29, "failed": 160, "failed_pct": 45.71}, {"code": "M098", "name": "Теплоэнергетика", "applications": 189, "participants": 179, "participation_pct": 94.71, "passed": 32, "passed_pct": 17.88, "failed": 147, "failed_pct": 82.12}, {"code": "M099", "name": "Энергетика и электротехника", "applications": 932, "participants": 876, "participation_pct": 93.99, "passed": 236, "passed_pct": 26.94, "failed": 640, "failed_pct": 73.06}, {"code": "M100", "name": "Автоматизация и управление", "applications": 618, "participants": 585, "participation_pct": 94.66, "passed": 273, "passed_pct": 46.67, "failed": 312, "failed_pct": 53.33}, {"code": "M101", "name": "Материаловедение и технология новых материалов", "applications": 46, "participants": 45, "participation_pct": 97.83, "passed": 18, "passed_pct": 40.0, "failed": 27, "failed_pct": 60.0}, {"code": "M102", "name": "Робототехника и мехатроника", "applications": 131, "participants": 124, "participation_pct": 94.66, "passed": 27, "passed_pct": 21.77, "failed": 97, "failed_pct": 78.23}, {"code": "M103", "name": "Механика и металлообработка", "applications": 311, "participants": 296, "participation_pct": 95.18, "passed": 59, "passed_pct": 19.93, "failed": 237, "failed_pct": 80.07}, {"code": "M104", "name": "Транспорт, транспортная техника и технологии", "applications": 334, "participants": 299, "participation_pct": 89.52, "passed": 93, "passed_pct": 31.1, "failed": 206, "failed_pct": 68.9}, {"code": "M105", "name": "Авиационная техника и технологии", "applications": 52, "participants": 49, "participation_pct": 94.23, "passed": 30, "passed_pct": 61.22, "failed": 19, "failed_pct": 38.78}, {"code": "M106", "name": "Летная эксплуатация летательных аппаратов и двигателей", "applications": 20, "participants": 18, "participation_pct": 90.0, "passed": 16, "passed_pct": 88.89, "failed": 2, "failed_pct": 11.11}, {"code": "M107", "name": "Космическая инженерия", "applications": 62, "participants": 61, "participation_pct": 98.39, "passed": 42, "passed_pct": 68.85, "failed": 19, "failed_pct": 31.15}, {"code": "M108", "name": "Наноматериалы и нанотехнологии (по областям применения)", "applications": 39, "participants": 38, "participation_pct": 97.44, "passed": 23, "passed_pct": 60.53, "failed": 15, "failed_pct": 39.47}, {"code": "M109", "name": "Нефтяная и рудная геофизика", "applications": 49, "participants": 46, "participation_pct": 93.88, "passed": 16, "passed_pct": 34.78, "failed": 30, "failed_pct": 65.22}, {"code": "M110", "name": "Морская техника и технологии", "applications": 12, "participants": 12, "participation_pct": 100.0, "passed": 5, "passed_pct": 41.67, "failed": 7, "failed_pct": 58.33}, {"code": "M111", "name": "Производство продуктов питания", "applications": 355, "participants": 336, "participation_pct": 94.65, "passed": 68, "passed_pct": 20.24, "failed": 268, "failed_pct": 79.76}, {"code": "M112", "name": "Технология деревообработки и изделий из дерева (по областям применения)", "applications": 3, "participants": 2, "participation_pct": 66.67, "passed": 0, "passed_pct": 0.0, "failed": 2, "failed_pct": 100.0}, {"code": "M114", "name": "Текстиль: одежда, обувь и кожаные изделия", "applications": 73, "participants": 65, "participation_pct": 89.04, "passed": 16, "passed_pct": 24.62, "failed": 49, "failed_pct": 75.38}, {"code": "M115", "name": "Нефтяная инженерия", "applications": 484, "participants": 436, "participation_pct": 90.08, "passed": 145, "passed_pct": 33.26, "failed": 291, "failed_pct": 66.74}, {"code": "M116", "name": "Горная инженерия", "applications": 306, "participants": 272, "participation_pct": 88.89, "passed": 75, "passed_pct": 27.57, "failed": 197, "failed_pct": 72.43}, {"code": "M117", "name": "Металлургическая инженерия", "applications": 129, "participants": 117, "participation_pct": 90.7, "passed": 4, "passed_pct": 3.42, "failed": 113, "failed_pct": 96.58}, {"code": "M118", "name": "Обогащение полезных ископаемых", "applications": 70, "participants": 60, "participation_pct": 85.71, "passed": 15, "passed_pct": 25.0, "failed": 45, "failed_pct": 75.0}, {"code": "M119", "name": "Технология фармацевтического производства", "applications": 311, "participants": 285, "participation_pct": 91.64, "passed": 73, "passed_pct": 25.61, "failed": 212, "failed_pct": 74.39}, {"code": "M120", "name": "Маркшейдерское дело", "applications": 27, "participants": 22, "participation_pct": 81.48, "passed": 5, "passed_pct": 22.73, "failed": 17, "failed_pct": 77.27}, {"code": "M121", "name": "Геология", "applications": 213, "participants": 193, "participation_pct": 90.61, "passed": 61, "passed_pct": 31.61, "failed": 132, "failed_pct": 68.39}, {"code": "M122", "name": "Архитектура", "applications": 395, "participants": 377, "participation_pct": 95.44, "passed": 203, "passed_pct": 53.85, "failed": 174, "failed_pct": 46.15}, {"code": "M123", "name": "Геодезия", "applications": 416, "participants": 398, "participation_pct": 95.67, "passed": 86, "passed_pct": 21.61, "failed": 312, "failed_pct": 78.39}, {"code": "M124", "name": "Строительство", "applications": 948, "participants": 885, "participation_pct": 93.35, "passed": 340, "passed_pct": 38.42, "failed": 545, "failed_pct": 61.58}, {"code": "M125", "name": "Производство строительных материалов, изделий и конструкций", "applications": 152, "participants": 150, "participation_pct": 98.68, "passed": 59, "passed_pct": 39.33, "failed": 91, "failed_pct": 60.67}, {"code": "M126", "name": "Транспортное строительство", "applications": 74, "participants": 69, "participation_pct": 93.24, "passed": 12, "passed_pct": 17.39, "failed": 57, "failed_pct": 82.61}, {"code": "M127", "name": "Инженерные системы и сети", "applications": 102, "participants": 96, "participation_pct": 94.12, "passed": 42, "passed_pct": 43.75, "failed": 54, "failed_pct": 56.25}, {"code": "M128", "name": "Землеустройство", "applications": 278, "participants": 268, "participation_pct": 96.4, "passed": 41, "passed_pct": 15.3, "failed": 227, "failed_pct": 84.7}, {"code": "M129", "name": "Гидротехническое строительство", "applications": 2, "participants": 2, "participation_pct": 100.0, "passed": 2, "passed_pct": 100.0, "failed": 0, "failed_pct": 0.0}, {"code": "M130", "name": "Стандартизация, сертификация и метрология (по отраслям)", "applications": 237, "participants": 231, "participation_pct": 97.47, "passed": 69, "passed_pct": 29.87, "failed": 162, "failed_pct": 70.13}, {"code": "M131", "name": "Растениеводство", "applications": 183, "participants": 166, "participation_pct": 90.71, "passed": 26, "passed_pct": 15.66, "failed": 140, "failed_pct": 84.34}, {"code": "M132", "name": "Животноводство", "applications": 64, "participants": 56, "participation_pct": 87.5, "passed": 17, "passed_pct": 30.36, "failed": 39, "failed_pct": 69.64}, {"code": "M133", "name": "Лесное хозяйство", "applications": 107, "participants": 98, "participation_pct": 91.59, "passed": 26, "passed_pct": 26.53, "failed": 72, "failed_pct": 73.47}, {"code": "M134", "name": "Рыбное хозяйство", "applications": 17, "participants": 15, "participation_pct": 88.24, "passed": 3, "passed_pct": 20.0, "failed": 12, "failed_pct": 80.0}, {"code": "M135", "name": "Энергообеспечение сельского хозяйства", "applications": 12, "participants": 12, "participation_pct": 100.0, "passed": 1, "passed_pct": 8.33, "failed": 11, "failed_pct": 91.67}, {"code": "M136", "name": "Аграрная техника и технологии", "applications": 43, "participants": 39, "participation_pct": 90.7, "passed": 6, "passed_pct": 15.38, "failed": 33, "failed_pct": 84.62}, {"code": "M137", "name": "Водные ресурсы и водопользования", "applications": 54, "participants": 50, "participation_pct": 92.59, "passed": 10, "passed_pct": 20.0, "failed": 40, "failed_pct": 80.0}, {"code": "M138", "name": "Ветеринария", "applications": 230, "participants": 213, "participation_pct": 92.61, "passed": 72, "passed_pct": 33.8, "failed": 141, "failed_pct": 66.2}, {"code": "M139", "name": "Менеджмент в здравоохранении", "applications": 226, "participants": 203, "participation_pct": 89.82, "passed": 57, "passed_pct": 28.08, "failed": 146, "failed_pct": 71.92}, {"code": "M140", "name": "Общественное здравоохранение", "applications": 481, "participants": 424, "participation_pct": 88.15, "passed": 165, "passed_pct": 38.92, "failed": 259, "failed_pct": 61.08}, {"code": "M141", "name": "Сестринское дело", "applications": 64, "participants": 60, "participation_pct": 93.75, "passed": 23, "passed_pct": 38.33, "failed": 37, "failed_pct": 61.67}, {"code": "M142", "name": "Фармация", "applications": 434, "participants": 388, "participation_pct": 89.4, "passed": 107, "passed_pct": 27.58, "failed": 281, "failed_pct": 72.42}, {"code": "M143", "name": "Биомедицина", "applications": 16, "participants": 15, "participation_pct": 93.75, "passed": 4, "passed_pct": 26.67, "failed": 11, "failed_pct": 73.33}, {"code": "M144", "name": "Медицина", "applications": 287, "participants": 247, "participation_pct": 86.06, "passed": 101, "passed_pct": 40.89, "failed": 146, "failed_pct": 59.11}, {"code": "M145", "name": "Медико-профилактическое дело", "applications": 51, "participants": 45, "participation_pct": 88.24, "passed": 9, "passed_pct": 20.0, "failed": 36, "failed_pct": 80.0}, {"code": "M146", "name": "Социальная работа", "applications": 142, "participants": 138, "participation_pct": 97.18, "passed": 32, "passed_pct": 23.19, "failed": 106, "failed_pct": 76.81}, {"code": "M147", "name": "Туризм", "applications": 313, "participants": 290, "participation_pct": 92.65, "passed": 185, "passed_pct": 63.79, "failed": 105, "failed_pct": 36.21}, {"code": "M148", "name": "Досуг", "applications": 23, "participants": 23, "participation_pct": 100.0, "passed": 1, "passed_pct": 4.35, "failed": 22, "failed_pct": 95.65}, {"code": "M149", "name": "Ресторанное дело и гостиничный бизнес", "applications": 141, "participants": 129, "participation_pct": 91.49, "passed": 60, "passed_pct": 46.51, "failed": 69, "failed_pct": 53.49}, {"code": "M150", "name": "Санитарно-профилактические мероприятия", "applications": 323, "participants": 312, "participation_pct": 96.59, "passed": 96, "passed_pct": 30.77, "failed": 216, "failed_pct": 69.23}, {"code": "M151", "name": "Транспортные услуги", "applications": 174, "participants": 153, "participation_pct": 87.93, "passed": 64, "passed_pct": 41.83, "failed": 89, "failed_pct": 58.17}, {"code": "M152", "name": "Логистика (по отраслям)", "applications": 219, "participants": 207, "participation_pct": 94.52, "passed": 140, "passed_pct": 67.63, "failed": 67, "failed_pct": 32.37}, {"code": "M153", "name": "Археология и этнология", "applications": 31, "participants": 29, "participation_pct": 93.55, "passed": 13, "passed_pct": 44.83, "failed": 16, "failed_pct": 55.17}, {"code": "M154", "name": "Спорт", "applications": 4, "participants": 4, "participation_pct": 100.0, "passed": 1, "passed_pct": 25.0, "failed": 3, "failed_pct": 75.0}, {"code": "M173", "name": "Государственный аудит", "applications": 68, "participants": 59, "participation_pct": 86.76, "passed": 30, "passed_pct": 50.85, "failed": 29, "failed_pct": 49.15}, {"code": "M195", "name": "Криптология", "applications": 19, "participants": 18, "participation_pct": 94.74, "passed": 9, "passed_pct": 50.0, "failed": 9, "failed_pct": 50.0}, {"code": "M200", "name": "Подготовка педагогов профессионального обучения", "applications": 10, "participants": 0, "participation_pct": 0.0, "passed": 0, "passed_pct": 0.0, "failed": 0, "failed_pct": 0.0}, {"code": "M210", "name": "Магистральные сети и инфраструктура", "applications": 20, "participants": 19, "participation_pct": 95.0, "passed": 4, "passed_pct": 21.05, "failed": 15, "failed_pct": 78.95}, {"code": "M310", "name": "Транспортные сооружения", "applications": 13, "participants": 12, "participation_pct": 92.31, "passed": 2, "passed_pct": 16.67, "failed": 10, "failed_pct": 83.33}, {"code": "M329", "name": "Водоснабжение и водоотведение", "applications": 3, "participants": 1, "participation_pct": 33.33, "passed": 0, "passed_pct": 0.0, "failed": 1, "failed_pct": 100.0}, {"code": "M429", "name": "Гидротехническое строительство и управление водными ресурсами", "applications": 1, "participants": 1, "participation_pct": 100.0, "passed": 0, "passed_pct": 0.0, "failed": 1, "failed_pct": 100.0}];

/* Категории для плиток каталога — группировка 147 ГОП по крупным научным областям (диапазоны кодов). */
const CATALOG_CATEGORIES = [
  { id: 'pedagogy', label: 'Педагогические науки', icon: 'cap', ranges: [[1, 21], [200, 200]] },
  { id: 'arts', label: 'Искусство и гуманитарные науки', icon: 'mask', ranges: [[22, 37], [50, 60]] },
  { id: 'social', label: 'Социальные науки и журналистика', icon: 'chat', ranges: [[61, 69]] },
  { id: 'business', label: 'Бизнес, право и управление', icon: 'briefcase', ranges: [[70, 79], [173, 173]] },
  { id: 'science', label: 'Естественные науки и математика', icon: 'flask', ranges: [[80, 93]] },
  { id: 'engineering', label: 'Инженерия и IT', icon: 'chip', ranges: [[94, 121], [195, 195], [210, 210]] },
  { id: 'construction', label: 'Строительство и сельское хозяйство', icon: 'building', ranges: [[122, 137], [310, 310], [329, 329], [429, 429]] },
  { id: 'health', label: 'Здравоохранение и услуги', icon: 'heart', ranges: [[138, 154]] },
];

const CAT_ICONS = {
  all: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
  cap: '<svg viewBox="0 0 24 24"><path d="M12 3 2 8l10 5 10-5-10-5Z"/><path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5"/><path d="M22 8v6"/></svg>',
  mask: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 10h.01M16 10h.01M8 15c1.5 1.3 6.5 1.3 8 0"/></svg>',
  chat: '<svg viewBox="0 0 24 24"><path d="M4 5h16v10H8l-4 4V5Z"/></svg>',
  briefcase: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="12" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  flask: '<svg viewBox="0 0 24 24"><path d="M9 2v6L4 19a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-5-11V2"/><path d="M9 2h6"/></svg>',
  chip: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/></svg>',
  building: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="10" height="18"/><path d="M14 21V9l6 3v9"/><path d="M7 7h1M7 11h1M7 15h1"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-4.3-9.5-8.5C1 9 2 5.5 5.3 4.6 7.6 4 9.9 5 12 7.5 14.1 5 16.4 4 18.7 4.6 22 5.5 23 9 21.5 12.5 19 16.7 12 21 12 21Z"/></svg>',
};

function categoryOf(code) {
  const n = parseInt(code.slice(1), 10);
  const cat = CATALOG_CATEGORIES.find(c => c.ranges.some(([a, b]) => n >= a && n <= b));
  return cat ? cat.id : 'other';
}

function groupMatchesSearch(g) {
  if (!statsSearch) return true;
  const q = statsSearch.toLowerCase();
  return g.code.toLowerCase().includes(q) || g.name.toLowerCase().includes(q);
}

function sortStatsGroups(list) {
  const arr = [...list];
  if (statsSortKey === 'passed') arr.sort((a, b) => b.passed_pct - a.passed_pct);
  else if (statsSortKey === 'participants') arr.sort((a, b) => b.participants - a.participants);
  else arr.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  return arr;
}

function pluralizeGroups(n) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'группа';
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'группы';
  return 'групп';
}

function renderCategoryTiles() {
  const wrap = document.getElementById('catTiles');
  if (!wrap) return;
  const counts = {};
  KT_STATS_GROUPS.forEach(g => { const c = categoryOf(g.code); counts[c] = (counts[c] || 0) + 1; });
  wrap.innerHTML = `
    <button class="kcat-tile ${activeCategory === null ? 'is-active' : ''}" data-cat="">
      <span class="kcat-tile-icon">${CAT_ICONS.all}</span>
      <span class="kcat-tile-label">Все группы</span>
      <span class="kcat-tile-count">${KT_STATS_GROUPS.length}</span>
    </button>
    ${CATALOG_CATEGORIES.map(c => `
    <button class="kcat-tile ${activeCategory === c.id ? 'is-active' : ''}" data-cat="${c.id}">
      <span class="kcat-tile-icon">${CAT_ICONS[c.icon]}</span>
      <span class="kcat-tile-label">${c.label}</span>
      <span class="kcat-tile-count">${counts[c.id] || 0}</span>
    </button>`).join('')}
  `;
  wrap.querySelectorAll('[data-cat]').forEach(btn => btn.addEventListener('click', () => {
    activeCategory = btn.dataset.cat || null;
    renderStatsCatalog();
  }));
}

function renderStatsCatalog() {
  const listEl = document.getElementById('statsList');
  if (!listEl) return; // новый каталог только на index.html
  const empty = document.getElementById('statsEmpty');
  const count = document.getElementById('statsCount');

  renderCategoryTiles();

  let matched = KT_STATS_GROUPS.filter(groupMatchesSearch);
  if (activeCategory) matched = matched.filter(g => categoryOf(g.code) === activeCategory);
  matched = sortStatsGroups(matched);

  listEl.innerHTML = matched.map(g => `
    <button class="kcat-row" data-code="${g.code}">
      <span class="kcat-row-code">${g.code}</span>
      <span class="kcat-row-name">${esc(g.name)}</span>
      <span class="kcat-row-pct" style="color:${g.passed_pct >= 50 ? 'var(--teal)' : 'var(--danger)'}">${g.passed_pct.toFixed(1)}%</span>
    </button>
  `).join('');
  empty.classList.toggle('hidden', matched.length > 0);
  count.textContent = `${matched.length} ${pluralizeGroups(matched.length)}`;

  listEl.querySelectorAll('[data-code]').forEach(btn => btn.addEventListener('click', () => openGopGroup(btn.dataset.code)));
}

/* Клик по группе — модалка (как в прежней «Практике»): статистика КТ-2025 +
   предметы/темы. Темами пока заполнена только пилотная группа GOP_PILOT_CODE —
   у остальных 146 показывается заглушка «материалы скоро появятся». */
const GOP_PILOT_CODE = 'M001';
const GOP_SUBJECTS = {
  M001: [
    ...COMMON_SUBJECTS,
    { id: 'p1', title: 'Педагогика', sub: 'теория и практика обучения и воспитания', kind: 'profile', topics: [
      'Дидактика: теория обучения', 'Теория и методика воспитания',
      'Современные педагогические технологии', 'История педагогики и образования' ]},
    { id: 'p2', title: 'Психология', sub: 'общая и возрастная психология', kind: 'profile', topics: [
      'Общая психология: процессы и свойства', 'Возрастная и педагогическая психология',
      'Психология личности', 'Социальная психология' ]},
  ],
};

function openGopGroup(code) {
  renderGopModalView(code);
  document.getElementById('dirModal').classList.remove('hidden');
}

/* Тест/КТ для пилотной группы переиспользуют данные направления 7M01 (Педагогические
   науки) — тот же профиль (педагогика+психология), пока под каждую из 147 групп
   отдельный банк вопросов не подготовлен. */
const GOP_DIRECTION_MAP = { M001: '7M01' };

function renderGopModalView(code) {
  const g = KT_STATS_GROUPS.find(x => x.code === code);
  const subjects = GOP_SUBJECTS[code];
  const body = document.getElementById('dirModalBody');
  body.innerHTML = `
    <p class="eyebrow">${g.code} · Магистратура</p>
    <h3 class="modal-title">${esc(g.name)}</h3>
    <div class="kcat-stat-grid" style="margin:14px 0 22px">
      <div class="kcat-stat">
        <div class="kcat-stat-label">Заявлений</div>
        <div class="kcat-stat-value">${g.applications.toLocaleString('ru-RU')}</div>
      </div>
      <div class="kcat-stat">
        <div class="kcat-stat-label">Участников КТ</div>
        <div class="kcat-stat-value">${g.participants.toLocaleString('ru-RU')} <small>${g.participation_pct.toFixed(1)}%</small></div>
      </div>
      <div class="kcat-stat">
        <div class="kcat-stat-label">Набрали порог</div>
        <div class="kcat-stat-value" style="color:var(--teal)">${g.passed.toLocaleString('ru-RU')} <small>${g.passed_pct.toFixed(1)}%</small></div>
      </div>
      <div class="kcat-stat">
        <div class="kcat-stat-label">Не набрали порог</div>
        <div class="kcat-stat-value" style="color:var(--danger)">${g.failed.toLocaleString('ru-RU')} <small>${g.failed_pct.toFixed(1)}%</small></div>
      </div>
    </div>
    ${subjects ? `
      <p class="modal-lead">Вступительный экзамен включает предметы для подготовки. Выберите предмет, чтобы увидеть темы.</p>
      <ul class="subject-list">
        ${subjects.map(s => `
          <li>
            <button class="subject-row" data-open-gop-subject="${s.id}">
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
    ` : `
      <p class="modal-lead">Материалы по предметам и темам для этой группы пока не добавлены — скоро появятся.</p>
    `}
    ${GOP_DIRECTION_MAP[code] ? `
      <button class="btn btn-primary btn-block" id="gopTestBtn">Пройти тест по направлению</button>
      <button class="btn btn-ghost btn-block" id="gopKTBtn" style="margin-top:10px">Симуляция КТ (полный формат)</button>
    ` : ''}
  `;
  if (subjects) {
    body.querySelectorAll('[data-open-gop-subject]').forEach(btn => btn.addEventListener('click', () => renderGopSubjectView(code, btn.dataset.openGopSubject)));
  }
  const dirCode = GOP_DIRECTION_MAP[code];
  if (dirCode) {
    document.getElementById('gopTestBtn').addEventListener('click', () => { if (requireAuth(g.code, g.name)) startQuiz(dirCode); });
    document.getElementById('gopKTBtn').addEventListener('click', () => { if (requireAuth(g.code, g.name)) { closeDirModal(); window.openKT(dirCode); } });
  }
}

function renderGopSubjectView(code, subjectId) {
  const g = KT_STATS_GROUPS.find(x => x.code === code);
  const s = GOP_SUBJECTS[code].find(x => x.id === subjectId);
  const body = document.getElementById('dirModalBody');
  body.innerHTML = `
    <button class="back-link" id="gopSubjectBack">← ${g.code} · ${esc(g.name)}</button>
    <p class="eyebrow">${s.kind === 'common' ? 'Общий предмет' : 'Профильный предмет'}</p>
    <h3 class="modal-title">${s.title}</h3>
    <p class="modal-lead">${s.sub}</p>
    <p class="topics-head">Темы для подготовки</p>
    <ol class="topic-list">
      ${s.topics.map(t => `<li><span class="topic-dot" aria-hidden="true"></span>${t}</li>`).join('')}
    </ol>
  `;
  document.getElementById('gopSubjectBack').addEventListener('click', () => renderGopModalView(code));
}

function subjectsFor(direction) { return [...COMMON_SUBJECTS, ...direction.profile]; }
function findDirection(code) { return DIRECTIONS.find(d => d.code === code); }
function findSubject(direction, subjectId) { return subjectsFor(direction).find(s => s.id === subjectId); }

/* ---------------------------------------------------------
   2) BACKEND — реальный REST API (Go + SQLite, хостинг Render)
   Объект API ходит по fetch() к серверу. Текущий пользователь
   кэшируется в currentUser, чтобы getCurrentUser() оставался
   синхронным для рендер-функций. Токен хранится в localStorage.
   --------------------------------------------------------- */
const API_BASE = 'https://marshrut-9c5z.onrender.com';
const TOKEN_KEY = 'marshrut_token';

let currentUser = null; // кэш пользователя, полученного с сервера

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); }

async function apiFetch(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const t = getToken();
    if (t) headers['Authorization'] = 'Bearer ' + t;
  }
  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (_) { /* тело может быть пустым */ }
  if (!res.ok) {
    // Сессия вытеснена входом с другого устройства: сервер отвечает 401 с этим текстом.
    if (auth && res.status === 401 && data && /друг(ого|ое) устрой/.test(data.error || '')) {
      handleSessionKicked();
    }
    const err = new Error((data && data.error) ? data.error : `Ошибка сервера (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/* Пользователя вытеснили новым входом на этот же аккаунт — разлогиниваем и уведомляем. */
let sessionKickedHandled = false;
function handleSessionKicked() {
  if (sessionKickedHandled) return; // не дублировать при параллельных запросах
  sessionKickedHandled = true;
  clearToken();
  currentUser = null;
  if (typeof showToast === 'function') showToast('Вы вышли: выполнен вход в аккаунт с другого устройства');
  refreshAuthUI?.();
  if (location.pathname.endsWith('cabinet.html')) {
    setTimeout(() => location.reload(), 1800);
  }
}

const API = {
  async register(name, email, password) {
    const { token, user } = await apiFetch('/api/auth/register', {
      method: 'POST', body: { name, email, password },
    });
    setToken(token); currentUser = user; return user;
  },

  async login(email, password) {
    const { token, user } = await apiFetch('/api/auth/login', {
      method: 'POST', body: { email, password },
    });
    setToken(token); currentUser = user; sessionKickedHandled = false; return user;
  },

  logout() {
    // локальный стейт чистим сразу (мгновенный отклик UI), а обнуление сессии
    // на сервере шлём в фоне — best-effort, чтобы токен нельзя было переиспользовать
    const token = getToken();
    clearToken(); currentUser = null;
    if (token) fetch(API_BASE + '/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + token } }).catch(() => {});
  },

  // Синхронно возвращает кэш (обновляется при login/fetchMe/мутациях)
  getCurrentUser() { return currentUser; },

  // Подтягивает пользователя по сохранённому токену (при загрузке страницы)
  async fetchMe() {
    if (!getToken()) { currentUser = null; return null; }
    try {
      currentUser = await apiFetch('/api/me', { auth: true });
    } catch (_) {
      clearToken(); currentUser = null; // токен невалиден/протух
    }
    return currentUser;
  },

  async updateProfile(profile) {
    currentUser = await apiFetch('/api/profile', { method: 'PUT', auth: true, body: profile });
    return currentUser;
  },

  async toggleFavorite(code) {
    currentUser = await apiFetch('/api/favorites/toggle', { method: 'POST', auth: true, body: { code } });
    return currentUser;
  },

  async saveResult(code, score, total) {
    currentUser = await apiFetch('/api/results', { method: 'POST', auth: true, body: { code, score, total } });
    return currentUser;
  },

  // Контент теста (вопросы) — отдаётся бэкендом только тем, у кого есть доступ.
  // Бросает ошибку с data.status===403, если доступа нет (ловится в getOrFetchTestContent).
  getTestContent(code) {
    return apiFetch('/api/tests/' + code, { auth: true });
  },
};

/* ---------------------------------------------------------
   STATE
   --------------------------------------------------------- */
let currentSearch = '';
let activeQuiz = null; // { code, qIndex, answers, timerHandle, secondsLeft }
let statsSearch = '';
let statsSortKey = 'alpha';
let activeCategory = null;

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
  if (!grid) return; // каталог только на index.html
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

async function handleFavorite(code) {
  const user = API.getCurrentUser();
  if (!user) { showToast('Войдите в аккаунт, чтобы сохранять направления'); openAuth('login'); return; }
  try {
    await API.toggleFavorite(code);
    const nowFav = API.getCurrentUser().favorites.includes(code);
    showToast(nowFav ? 'Направление добавлено в избранное' : 'Направление убрано из избранного');
    renderCatalog();
    renderDashboard();
  } catch (e) {
    showToast(e.message);
  }
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
    <button class="btn btn-ghost btn-block" id="dirKTBtn" style="margin-top:10px">Симуляция КТ (полный формат)</button>
  `;

  body.querySelectorAll('[data-open-subject]').forEach(btn => btn.addEventListener('click', () => renderSubjectView(code, btn.dataset.openSubject)));
  document.getElementById('dirTestBtn').addEventListener('click', () => { if (requireAuth(d.code, d.name)) startQuiz(code); });
  document.getElementById('dirKTBtn').addEventListener('click', () => { if (requireAuth(d.code, d.name)) { closeDirModal(); window.openKT(code); } });
}

/* Гейт: тест/КТ доступны только вошедшим И только с выданным доступом. Возвращает
   true, если можно продолжать. courseCode/courseName — для текста сообщения в WhatsApp.
   reason: 'auth' — не вошёл в аккаунт; 'access' — вошёл, но доступ к этому тесту не выдан. */
const WHATSAPP_PHONE = '77473334123';
function showAccessGate(courseCode, courseName, reason) {
  const buyBtn = document.getElementById('gateBuyBtn');
  if (buyBtn) {
    const codePrefix = courseCode ? `*${courseCode}* ` : '';
    const text = `Здравствуйте! Я хочу приобрести доступ к курсу подготовки по направлению "${codePrefix}${courseName || 'на сайте'}". Подскажите, пожалуйста, как произвести оплату?`;
    buyBtn.href = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(text)}`;
  }
  const title = document.getElementById('gateTitle');
  const lead = document.getElementById('gateLead');
  const loginBtn = document.getElementById('gateLoginBtn');
  if (reason === 'access') {
    if (title) title.textContent = 'Доступ к этому тесту пока не выдан';
    if (lead) lead.textContent = 'Материал открывается индивидуально после оплаты. Напишите нам, чтобы получить доступ.';
    loginBtn?.classList.add('hidden');
  } else {
    if (title) title.textContent = 'Доступ к тестированию открывается после входа';
    if (lead) lead.textContent = 'Для прохождения теста и симуляции КТ необходим личный аккаунт. Войдите в систему или обратитесь к администратору для получения доступа.';
    loginBtn?.classList.remove('hidden');
  }
  document.getElementById('gateModal').classList.remove('hidden');
}

function requireAuth(courseCode, courseName) {
  if (API.getCurrentUser()) return true;
  showAccessGate(courseCode, courseName, 'auth');
  return false;
}

// Контент теста кэшируется на время сессии страницы. На 403 (нет выданного доступа)
// показывает тот же гейт-модал, что и requireAuth, но с текстом про оплату/доступ.
const testContentCache = {};
async function getOrFetchTestContent(code) {
  if (testContentCache[code]) return testContentCache[code];
  try {
    const content = await API.getTestContent(code);
    testContentCache[code] = content;
    return content;
  } catch (e) {
    if (e.status === 403) {
      const d = findDirection(code);
      showAccessGate(code, d && d.name, 'access');
    } else {
      showToast(e.message || 'Не удалось загрузить тест');
    }
    return null;
  }
}

function wireGate() {
  const modal = document.getElementById('gateModal');
  if (!modal) return;
  const close = () => modal.classList.add('hidden');
  document.getElementById('gateClose').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target.id === 'gateModal') close(); });
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
  if (!document.getElementById('dirModal')) return;
  document.getElementById('dirClose').addEventListener('click', closeDirModal);
  document.getElementById('dirModal').addEventListener('click', (e) => { if (e.target.id === 'dirModal') closeDirModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('dirModal').classList.contains('hidden')) closeDirModal();
  });
}

/* ---------------------------------------------------------
   5) КВИЗ-ДВИЖОК (тест по направлению)
   --------------------------------------------------------- */
// Перемешивает копию массива (Фишер-Йейтс), не трогая исходный пул.
function shuffleArr(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const QUIZ_MAX_QUESTIONS = 50;

async function startQuiz(code) {
  showSubjectPicker(code);
}

// Экран выбора предмета — только для простого теста (не для симуляции КТ, та
// специально всегда комбинированная, как настоящий экзамен). Всегда 4 секции,
// как на настоящем КТ: 2 общих (Английский, ТГО) + 2 профильных. Общие секции
// не требуют выданного доступа (как и в симуляции КТ) — только вход в аккаунт;
// доступ проверяется отдельно, только при выборе профильного предмета.
function showSubjectPicker(code) {
  const d = findDirection(code);
  const subj = (typeof KT_SUBJECT_NAMES !== 'undefined' && KT_SUBJECT_NAMES[code])
    || { subj1: 'Профильный предмет №1', subj2: 'Профильный предмет №2' };
  const body = document.getElementById('subjectModalBody');
  body.innerHTML = `
    <p class="eyebrow">${d ? d.code + ' · ' : ''}Пройти тест</p>
    <h3 class="modal-title">Выберите предмет</h3>
    <p class="modal-lead">Тест состоит из 4 предметов, как на настоящем КТ — потренируйтесь по каждому отдельно.</p>
    <div class="kt-type-cards">
      <button class="kt-type-card" data-subject="lang"><span class="kt-type-name">Английский</span></button>
      <button class="kt-type-card" data-subject="logic"><span class="kt-type-name">ТГО</span></button>
      <button class="kt-type-card" data-subject="subj1"><span class="kt-type-name">${subj.subj1}</span></button>
      <button class="kt-type-card" data-subject="subj2"><span class="kt-type-name">${subj.subj2}</span></button>
    </div>
  `;
  body.querySelectorAll('[data-subject]').forEach(btn => btn.addEventListener('click', () => {
    document.getElementById('subjectModal').classList.add('hidden');
    beginQuizSection(code, btn.dataset.subject);
  }));
  document.getElementById('subjectModal').classList.remove('hidden');
}

function wireSubjectModal() {
  const modal = document.getElementById('subjectModal');
  if (!modal) return;
  const close = () => modal.classList.add('hidden');
  document.getElementById('subjectClose').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target.id === 'subjectModal') close(); });
}

async function beginQuizSection(code, section) {
  const d = findDirection(code);
  let source, title;
  if (section === 'lang') {
    source = [...KT_LANG_EN_STAGES.listening, ...KT_LANG_EN_STAGES.grammar, ...KT_LANG_EN_STAGES.reading];
    title = 'Английский язык';
  } else if (section === 'logic') {
    source = KT_LOGIC_POOL;
    title = 'Тест готовности к обучению (ТГО)';
  } else {
    // Профильный предмет — здесь и только здесь нужен выданный доступ.
    const content = await getOrFetchTestContent(code);
    if (!content) return; // нет доступа или ошибка сети — гейт/тост уже показаны
    source = (content.bySubject && content.bySubject[section]) ? content.bySubject[section] : content.questions;
    const names = (typeof KT_SUBJECT_NAMES !== 'undefined' && KT_SUBJECT_NAMES[code]) || null;
    title = (names && names[section]) || content.title;
  }

  // Пул перемешивается и ограничивается разумной длиной теста, чтобы при большом
  // банке вопросов (несколько вариантов) каждая попытка была разной, а не показывала
  // все вопросы подряд за одну сессию.
  const pool = shuffleArr(source).slice(0, QUIZ_MAX_QUESTIONS);
  activeQuiz = { code, section, qIndex: 0, answers: new Array(pool.length).fill(null), pool };

  document.getElementById('testTitle').textContent = title;
  document.getElementById('testSub').textContent = d ? `${d.code} · ${d.name}` : '';
  document.getElementById('testRun').classList.remove('hidden');
  document.getElementById('testResult').classList.add('hidden');
  document.getElementById('dirModal').classList.add('hidden');
  document.getElementById('resultPage')?.classList.add('hidden'); // если открыт со страницы деталей прошлой попытки

  renderQuizQuestion();
  document.getElementById('testPage').classList.remove('hidden');
  document.body.classList.add('test-open');
  window.scrollTo(0, 0);
}

function closeQuiz() {
  document.getElementById('testPage').classList.add('hidden');
  document.body.classList.remove('test-open');
  activeQuiz = null;
}

// экранирование HTML — варианты могут содержать <a>, <link> и т.п.
function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Номерная навигация по вопросам (как в симуляции КТ) — клик прыгает на вопрос,
// текущий подсвечен акцентом, отвеченные становятся тёмными.
function renderQuizQnav() {
  const qnav = document.getElementById('testQnav');
  if (!qnav) return;
  qnav.innerHTML = activeQuiz.pool.map((q, i) => {
    const ans = activeQuiz.answers[i];
    const answered = ans != null && (!Array.isArray(ans) || ans.length);
    const cls = i === activeQuiz.qIndex ? 'is-current' : (answered ? 'is-answered' : '');
    return `<button class="kt-qnav-btn ${cls}" data-idx="${i}">${i + 1}</button>`;
  }).join('');
  qnav.querySelectorAll('.kt-qnav-btn').forEach(b => b.addEventListener('click', () => quizGoTo(Number(b.dataset.idx))));
  const curBtn = qnav.querySelector('.kt-qnav-btn.is-current');
  if (curBtn) curBtn.scrollIntoView({ block: 'nearest', inline: 'center' });
}

function quizGoTo(idx) {
  if (idx >= 0 && idx < activeQuiz.pool.length) { activeQuiz.qIndex = idx; renderQuizQuestion(); }
}

function renderQuizQuestion() {
  const q = activeQuiz.pool[activeQuiz.qIndex];
  renderQuizQnav();
  document.getElementById('testQNum').textContent = `${activeQuiz.qIndex + 1}.`;
  document.getElementById('testQuestion').textContent = q.q;

  // Аудио (Listening) или текст для чтения (Reading) — только у блока «Английский».
  const mediaEl = document.getElementById('testMedia');
  if (mediaEl) {
    mediaEl.innerHTML = q.audio
      ? `<audio controls preload="none" src="${q.audio}" class="quiz-audio-player"></audio>`
      : (q.passage ? `<div class="kt-reading-passage">${esc(q.passage)}</div>` : '');
  }
  // Картинка к вопросу — есть у части вопросов ТГО (математика).
  const imageEl = document.getElementById('testImage');
  if (imageEl) {
    imageEl.innerHTML = q.image ? `<div class="kt-question-image"><img src="${q.image}" alt="Условие вопроса"></div>` : '';
  }

  const isMulti = Array.isArray(q.correct);
  const curAns = activeQuiz.answers[activeQuiz.qIndex];
  const hintEl = document.getElementById('testMultiHint');
  if (hintEl) hintEl.remove();
  if (isMulti) {
    const hint = document.createElement('p');
    hint.id = 'testMultiHint';
    hint.className = 'kt-multi-hint';
    hint.textContent = 'Выберите все подходящие варианты';
    document.getElementById('testQuestion').insertAdjacentElement('afterend', hint);
  }

  const optionsEl = document.getElementById('testOptions');
  optionsEl.innerHTML = q.options.map((opt, i) => {
    const isSel = isMulti ? (Array.isArray(curAns) && curAns.includes(i)) : curAns === i;
    return `
    <button class="test-opt ${isSel ? 'is-selected' : ''}" data-option="${i}">
      <span class="test-radio ${isMulti ? 'is-checkbox' : ''}" aria-hidden="true"></span><span class="test-opt-label">${esc(opt)}</span>
    </button>`;
  }).join('');
  optionsEl.querySelectorAll('[data-option]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.option);
      if (Array.isArray(q.correct)) {
        const cur = Array.isArray(activeQuiz.answers[activeQuiz.qIndex]) ? activeQuiz.answers[activeQuiz.qIndex].slice() : [];
        const pos = cur.indexOf(i);
        if (pos === -1) cur.push(i); else cur.splice(pos, 1);
        activeQuiz.answers[activeQuiz.qIndex] = cur;
      } else {
        activeQuiz.answers[activeQuiz.qIndex] = i;
      }
      renderQuizQuestion();
    });
  });

  document.getElementById('testNext').textContent =
    activeQuiz.qIndex === activeQuiz.pool.length - 1 ? 'Завершить' : 'Далее';
  document.getElementById('testPrev').disabled = activeQuiz.qIndex === 0;
}

function quizPrev() {
  if (activeQuiz.qIndex > 0) { activeQuiz.qIndex--; renderQuizQuestion(); }
}

function quizNext() {
  if (activeQuiz.qIndex < activeQuiz.pool.length - 1) { activeQuiz.qIndex++; renderQuizQuestion(); }
  else finishQuiz();
}

// Правильность ответа: q.correct — число (один вариант) или массив (несколько верных, Психология).
function quizIsCorrect(q, ua) {
  if (Array.isArray(q.correct)) {
    if (!Array.isArray(ua) || ua.length === 0) return false;
    return q.correct.slice().sort().join(',') === ua.slice().sort().join(',');
  }
  return ua === q.correct;
}

function finishQuiz() {
  let score = 0;
  activeQuiz.pool.forEach((q, i) => { if (quizIsCorrect(q, activeQuiz.answers[i])) score++; });
  const total = activeQuiz.pool.length;
  const passed = Math.round((score / total) * 100) >= 60;

  const user = API.getCurrentUser();
  if (user) {
    API.saveResult(activeQuiz.code, score, total).then(() => renderDashboard()).catch((e) => showToast(e.message));
  }

  document.getElementById('quizStamp').classList.toggle('is-fail', !passed);
  document.getElementById('stampStatus').textContent = passed ? 'Сдано' : 'Не сдано';
  document.getElementById('stampScore').textContent = `${score}/${total}`;
  document.getElementById('resultHeadline').textContent = passed ? 'Тест пройден' : 'Пока не получилось';
  document.getElementById('resultText').textContent = user
    ? `Правильно ${score} из ${total}. Результат сохранён в кабинете.`
    : `Правильно ${score} из ${total}. Войдите в аккаунт, чтобы сохранять результаты.`;

  document.getElementById('testRun').classList.add('hidden');
  document.getElementById('testResult').classList.remove('hidden');
}

// Работа над ошибками: разбор всех вопросов с правильными/неправильными ответами.
function openReview() {
  const d = findDirection(activeQuiz.code);
  let score = 0;
  activeQuiz.pool.forEach((q, i) => { if (quizIsCorrect(q, activeQuiz.answers[i])) score++; });
  document.getElementById('reviewSub').textContent = `${d.code} · ${d.name} — ${score} из ${activeQuiz.pool.length}`;

  document.getElementById('reviewList').innerHTML = activeQuiz.pool.map((q, i) => {
    const ua = activeQuiz.answers[i]; // ответ пользователя (или null)
    const isMulti = Array.isArray(q.correct);
    const correctSet = isMulti ? q.correct : [q.correct];
    const userSet = isMulti ? (Array.isArray(ua) ? ua : []) : (ua == null ? [] : [ua]);
    const wrong = !quizIsCorrect(q, ua);
    const opts = q.options.map((o, oi) => {
      const isCorrectOpt = correctSet.includes(oi);
      const isUserOpt = userSet.includes(oi);
      let cls = 'rev-opt', tag = '';
      if (isCorrectOpt) { cls += ' correct'; tag = isUserOpt ? '<span class="rev-tag ok">Ваш ответ ✓</span>' : '<span class="rev-tag ok">Правильный ответ</span>'; }
      else if (isUserOpt) { cls += ' wrong'; tag = '<span class="rev-tag bad">Ваш ответ ✗</span>'; }
      // Объяснение для студентов по каждому варианту, если есть в данных.
      const expl = q.explanations && q.explanations[oi]
        ? `<div class="rev-opt-expl">${esc(q.explanations[oi])}</div>` : '';
      return `<div class="${cls}"><div class="rev-opt-row"><span>${esc(o)}</span>${tag}</div>${expl}</div>`;
    }).join('');
    const why = q.explanations ? '' : (q.why
      ? `<div class="rev-why"><b>Почему:</b> ${esc(q.why)}</div>`
      : `<div class="rev-why"><b>Правильный ответ:</b> ${esc(q.options[correctSet[0]])}</div>`);
    // Ссылка на конспект по теме вопроса — только при неверном ответе.
    const konspekt = wrong ? conspectLink(q.topic) : '';
    return `
      <div class="rev-item ${wrong ? 'is-wrong' : 'is-ok'}">
        <p class="rev-q"><span class="test-qnum">${i + 1}.</span> ${esc(q.q)}</p>
        ${q.image ? `<div class="kt-question-image"><img src="${q.image}" alt="Условие вопроса"></div>` : ''}
        <div class="rev-opts">${opts}</div>
        ${why}
        ${konspekt}
      </div>`;
  }).join('');

  document.getElementById('testPage').classList.add('hidden');
  document.getElementById('reviewPage').classList.remove('hidden');
  document.body.classList.add('test-open');
  window.scrollTo(0, 0);
}

function closeReview() {
  document.getElementById('reviewPage').classList.add('hidden');
  document.body.classList.remove('test-open');
  activeQuiz = null;
}

// Запрет копирования/выделения текста вопросов, пока открыт тест/КТ/разбор (body.test-open).
function wireAntiCopy() {
  const guard = (e) => { if (document.body.classList.contains('test-open')) e.preventDefault(); };
  ['copy', 'cut', 'contextmenu', 'selectstart'].forEach(evt => document.addEventListener(evt, guard));
  document.addEventListener('keydown', (e) => {
    if (!document.body.classList.contains('test-open')) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && (k === 'c' || k === 'x' || k === 'a' || k === 'u' || k === 's' || k === 'p')) e.preventDefault();
  });
}

function wireQuiz() {
  if (!document.getElementById('testPage')) return; // страница теста только на index.html
  document.getElementById('testExit').addEventListener('click', closeQuiz);
  document.getElementById('testPrev').addEventListener('click', quizPrev);
  document.getElementById('testNext').addEventListener('click', quizNext);
  document.getElementById('reviewBtn').addEventListener('click', openReview);
  document.getElementById('reviewExit').addEventListener('click', closeReview);
  document.getElementById('reviewClose').addEventListener('click', closeReview);
  document.getElementById('reviewScrollTop').addEventListener('click', () => {
    document.getElementById('reviewPage').scrollTo({ top: 0, behavior: 'smooth' });
  });
  document.getElementById('quizDashBtn').addEventListener('click', () => {
    closeQuiz();
    location.href = 'cabinet.html';
  });

  // Клавиатура: ENTER = далее, цифры 1-9 = выбор варианта, ESC = выход
  document.addEventListener('keydown', (e) => {
    const page = document.getElementById('testPage');
    if (page.classList.contains('hidden')) return;
    const onResult = !document.getElementById('testResult').classList.contains('hidden');
    if (e.key === 'Escape') { closeQuiz(); return; }
    if (onResult) return;
    if (e.key === 'Enter') { e.preventDefault(); quizNext(); return; }
    if (/^[1-9]$/.test(e.key)) {
      const btns = document.querySelectorAll('#testOptions [data-option]');
      const b = btns[Number(e.key) - 1];
      if (b) b.click();
    }
  });
}

/* ---------------------------------------------------------
   6) АВТОРИЗАЦИЯ / ЛИЧНЫЙ КАБИНЕТ
   --------------------------------------------------------- */
function refreshAuthUI() {
  // элементы различаются на index.html и cabinet.html — всё null-safe
  const user = API.getCurrentUser();
  const chip = document.getElementById('userChip');
  const guestLogin = document.getElementById('btnGuestLogin');
  const guestRegister = document.getElementById('btnGuestRegister');
  const authZone = document.getElementById('authZone');
  const dashboard = document.getElementById('dashboard');
  const avatar = document.getElementById('userAvatar');
  const nameLabel = document.getElementById('userNameLabel');

  if (user) {
    chip?.classList.remove('hidden');
    guestLogin?.classList.add('hidden');
    guestRegister?.classList.add('hidden');
    if (avatar) avatar.textContent = (user.name || '?').trim()[0].toUpperCase();
    if (nameLabel) nameLabel.textContent = user.name;
    authZone?.classList.add('hidden');
    dashboard?.classList.remove('hidden');
  } else {
    chip?.classList.add('hidden');
    guestLogin?.classList.remove('hidden');
    guestRegister?.classList.remove('hidden');
    // Токен оказался невалидным/просроченным (или его не было) — снимаем класс,
    // который до fetchMe() прятал гостевой экран, иначе он останется скрытым навсегда.
    document.documentElement.classList.remove('has-token');
    authZone?.classList.remove('hidden');
    dashboard?.classList.add('hidden');
  }
}

function renderDashboard() {
  const user = API.getCurrentUser();
  if (!user || !document.getElementById('dashboard')) return; // дашборд только на cabinet.html

  // «Пройти тест»: если доступ уже выдан — сразу открываем модалку направления
  // (без похода в каталог); если доступа ещё нет — как раньше, ведём в каталог.
  const ctaCard = document.getElementById('testCtaCard');
  if (ctaCard) {
    const grantedCode = user.access && user.access[0];
    ctaCard.href = grantedCode ? `index.html?openDir=${encodeURIComponent(grantedCode)}` : 'index.html#catalog';
  }
  renderConspectsLibrary();

  // --- Личные данные: просмотр или редактирование ---
  const p = user.profile;
  fillProfileForm(user);
  renderProfileView(user);
  // пустой профиль → сразу форма (без «Отмены»); есть данные → просмотр
  setProfileMode(profileIsEmpty(p) ? 'first' : 'view');

  // калькулятор: префилл из профиля
  if (p.specialityId) document.getElementById('calcSpec').value = String(p.specialityId);
  if (p.foreignScore) document.getElementById('calcForeign').value = p.foreignScore;
  if (p.profileScore) document.getElementById('calcProfile').value = p.profileScore;
  if (p.bonusPoints) document.getElementById('calcBonus').value = p.bonusPoints;

  loadRoadmap();

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
    const q = new URLSearchParams({ result: r.code, score: r.score, total: r.total, date: r.date });
    return `
      <tr class="results-row" data-href="index.html?${q.toString()}" tabindex="0">
        <td>${d ? `${d.code} · ${d.name}` : r.code}</td>
        <td>${r.score}/${r.total}</td>
        <td><span class="test-status-badge ${passed ? 'passed' : 'failed'}">${passed ? 'Сдан' : 'Не сдан'}</span></td>
        <td>${r.date}</td>
      </tr>
    `;
  }).join('');
  body.querySelectorAll('.results-row').forEach(tr => {
    const go = () => location.href = tr.dataset.href;
    tr.addEventListener('click', go);
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  });
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
  // клик по избранному → переход на тест направления (страница теста живёт на index.html)
  list.querySelectorAll('[data-open-dir]').forEach(btn => btn.addEventListener('click', () => {
    const code = btn.dataset.openDir;
    if (INTERACTIVE_TEST_CODES.includes(code)) {
      location.href = 'index.html?test=' + encodeURIComponent(code);
    } else {
      showToast('Тест для этого направления временно недоступен');
    }
  }));
}

/* --- Личные данные: режимы просмотра / редактирования --- */
function profileIsEmpty(p) {
  return !(p.fullName || p.phone || p.education || p.city || p.specialityId);
}

function fillProfileForm(user) {
  const p = user.profile;
  document.getElementById('pfFullName').value = p.fullName || '';
  document.getElementById('pfEmail').value = user.email || '';
  document.getElementById('pfPhone').value = p.phone || '';
  document.getElementById('pfEducation').value = p.education || '';
  document.getElementById('pfCity').value = p.city || '';
  document.getElementById('pfSpeciality').value = String(p.specialityId || 0);
  document.getElementById('pfLanguage').value = p.language || '';
  document.getElementById('pfTarget').value = p.targetType || '';
  document.getElementById('pfForeign').value = p.foreignScore || '';
  document.getElementById('pfProfileScore').value = p.profileScore || '';
  document.getElementById('pfBonus').value = p.bonusPoints || '';
}

function renderProfileView(user) {
  const view = document.getElementById('profileView');
  if (!view) return;
  const p = user.profile;
  const spec = REF.specialities.find(s => s.id === p.specialityId);
  const langNames = { rus: 'Русский', kaz: 'Казахский', eng: 'Английский' };
  const targetNames = { grant: 'Грант', paid: 'Платное', any: 'Неважно' };
  const dash = '—';
  const rows = [
    ['ФИО', p.fullName], ['Email', user.email], ['Телефон', p.phone],
    ['Образование', p.education], ['Город', p.city],
    ['Специальность', spec ? spec.name : ''],
    ['Язык обучения', langNames[p.language] || ''],
    ['Цель', targetNames[p.targetType] || ''],
    ['Баллы КТ', (p.foreignScore || p.profileScore)
      ? `ин. язык ${p.foreignScore || 0} · профильный ${p.profileScore || 0} · бонусы ${p.bonusPoints || 0}` : ''],
  ];
  view.innerHTML = rows.map(([k, v]) => `
    <div class="pv-row"><span class="pv-key">${k}</span><span class="pv-val">${v ? esc(String(v)) : dash}</span></div>
  `).join('');
}

// mode: 'view' | 'edit' | 'first' (первое заполнение — форма без «Отмены»)
function setProfileMode(mode) {
  const view = document.getElementById('profileView');
  const form = document.getElementById('profileForm');
  const editBtn = document.getElementById('pfEditBtn');
  const cancelBtn = document.getElementById('pfCancelBtn');
  if (!view || !form) return;
  const editing = mode !== 'view';
  view.classList.toggle('hidden', editing);
  form.classList.toggle('hidden', !editing);
  editBtn?.classList.toggle('hidden', editing);
  cancelBtn?.classList.toggle('hidden', mode !== 'edit');
}

function wireProfileModes() {
  const editBtn = document.getElementById('pfEditBtn');
  const cancelBtn = document.getElementById('pfCancelBtn');
  if (editBtn) editBtn.addEventListener('click', () => setProfileMode('edit'));
  if (cancelBtn) cancelBtn.addEventListener('click', () => {
    const u = API.getCurrentUser();
    if (u) fillProfileForm(u); // отбросить несохранённые изменения
    setProfileMode('view');
  });
}

function wireProfileForm() {
  const form = document.getElementById('profileForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    setBtnLoading(btn, true, 'Сохранение…');
    try {
      await API.updateProfile({
        fullName: document.getElementById('pfFullName').value.trim(),
        phone: document.getElementById('pfPhone').value.trim(),
        education: document.getElementById('pfEducation').value.trim(),
        city: document.getElementById('pfCity').value.trim(),
        specialityId: Number(document.getElementById('pfSpeciality').value) || 0,
        language: document.getElementById('pfLanguage').value,
        targetType: document.getElementById('pfTarget').value,
        foreignScore: Number(document.getElementById('pfForeign').value) || 0,
        profileScore: Number(document.getElementById('pfProfileScore').value) || 0,
        bonusPoints: Number(document.getElementById('pfBonus').value) || 0,
      });
      const saved = document.getElementById('profileSaved');
      saved.classList.remove('hidden');
      clearTimeout(form._savedTimer);
      form._savedTimer = setTimeout(() => saved.classList.add('hidden'), 2000);
      refreshAuthUI();   // обновить имя в шапке
      const u = API.getCurrentUser();
      renderProfileView(u);
      setProfileMode('view'); // после сохранения — режим просмотра
      showToast('Личные данные сохранены');
    } catch (err) {
      showToast(err.message);
    } finally {
      setBtnLoading(btn, false);
    }
  });
}

/* Индикатор загрузки на кнопке (для медленного холодного старта сервера) */
function setBtnLoading(btn, loading, label) {
  if (!btn) return;
  if (loading) {
    btn.dataset.orig = btn.textContent;
    btn.textContent = label || 'Подождите…';
    btn.disabled = true;
  } else {
    if (btn.dataset.orig) btn.textContent = btn.dataset.orig;
    btn.disabled = false;
  }
}

function openAuth() {
  // кабинет живёт на отдельной странице; с других страниц — переход
  const zone = document.getElementById('authZone');
  if (!zone) { location.href = 'cabinet.html'; return; }
  document.getElementById('account').scrollIntoView({ behavior: 'smooth' });
}

function wireAuth() {
  document.querySelectorAll('[data-open-auth]').forEach(el => {
    el.addEventListener('click', (e) => { e.preventDefault(); openAuth(); });
  });
  const loginForm = document.getElementById('loginForm');
  if (loginForm) loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    const btn = e.target.querySelector('button[type="submit"]');
    errorEl.textContent = '';
    setBtnLoading(btn, true, 'Вход…');
    try {
      await API.login(email, password);
      showToast('Добро пожаловать!');
      afterAuthChange();
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      setBtnLoading(btn, false);
    }
  });

  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) btnLogout.addEventListener('click', () => {
    API.logout();
    showToast('Вы вышли из аккаунта');
    afterAuthChange();
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
  if (!document.getElementById('searchBar')) return;
  document.getElementById('searchBar').addEventListener('submit', (e) => {
    e.preventDefault();
    statsSearch = document.getElementById('fSearch').value.trim();
    renderStatsCatalog();
    document.getElementById('catalog').scrollIntoView({ behavior: 'smooth' });
  });
  document.getElementById('fSearch').addEventListener('input', (e) => {
    statsSearch = e.target.value.trim();
    renderStatsCatalog();
  });
  document.getElementById('statsSortSelect')?.addEventListener('change', (e) => {
    statsSortKey = e.target.value;
    renderStatsCatalog();
  });
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
   МагистрТрек: справочники, дорожная карта, калькулятор
   --------------------------------------------------------- */
let REF = { specialities: [], universities: [] };

async function loadRefs() {
  try {
    const [specs, unis] = await Promise.all([
      apiFetch('/api/specialities'),
      apiFetch('/api/universities'),
    ]);
    REF.specialities = specs || [];
    REF.universities = unis || [];
  } catch (_) { /* сервер спит — селекты останутся пустыми, не критично */ }

  const pfSel = document.getElementById('pfSpeciality');
  const calcSpec = document.getElementById('calcSpec');
  const calcUni = document.getElementById('calcUni');
  const specOpts = REF.specialities.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  if (pfSel) pfSel.innerHTML = '<option value="0">Не выбрана</option>' + specOpts;
  if (calcSpec) calcSpec.innerHTML = specOpts;
  if (calcUni) calcUni.innerHTML = REF.universities.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
}

/* --- Дорожная карта --- */
async function loadRoadmap() {
  const list = document.getElementById('rmList');
  if (!list || !API.getCurrentUser()) return;
  try {
    renderRoadmap(await apiFetch('/api/roadmap', { auth: true }));
  } catch (_) {
    document.getElementById('rmEmpty').classList.remove('hidden');
  }
}

function renderRoadmap(data) {
  document.getElementById('rmYear').textContent = data.year;
  document.getElementById('rmProgressBar').style.width = data.progress + '%';
  document.getElementById('rmProgressLabel').textContent = data.progress + '%';
  document.getElementById('rmEmpty').classList.add('hidden');

  const fmt = (d) => { const [y, m, day] = d.split('-'); return `до ${Number(day)}.${m}.${y}`; };
  document.getElementById('rmList').innerHTML = data.steps.map(s => `
    <li class="rm-step ${s.completed ? 'is-done' : ''}">
      <button class="rm-check" data-rm="${s.template_id}" aria-label="Отметить шаг">${s.completed ? '✓' : ''}</button>
      <span class="rm-text">${esc(s.description)}</span>
      <span class="rm-deadline">${fmt(s.deadline)}</span>
    </li>
  `).join('');

  document.querySelectorAll('[data-rm]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        renderRoadmap(await apiFetch('/api/roadmap/toggle', {
          method: 'POST', auth: true, body: { template_id: Number(btn.dataset.rm) },
        }));
      } catch (e) { showToast(e.message); }
    });
  });
}

/* --- Калькулятор шансов --- */
const CALC_LEVELS = {
  high:    { label: 'Высокий шанс',    cls: 'high' },
  medium:  { label: 'Средний шанс',    cls: 'medium' },
  low:     { label: 'Низкий шанс',     cls: 'low' },
  none:    { label: 'Ниже порога',     cls: 'low' },
  no_data: { label: 'Нет данных по вузу', cls: 'medium' },
};

function wireCalc() {
  const btn = document.getElementById('calcBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const box = document.getElementById('calcResult');
    const q = new URLSearchParams({
      university_id: document.getElementById('calcUni').value,
      speciality_id: document.getElementById('calcSpec').value,
      foreign: document.getElementById('calcForeign').value || '0',
      profile: document.getElementById('calcProfile').value || '0',
      bonus: document.getElementById('calcBonus').value || '0',
    });
    setBtnLoading(btn, true, 'Считаем…');
    try {
      const r = await apiFetch('/api/calculate-chances?' + q.toString(), { auth: true });
      const lv = CALC_LEVELS[r.level] || CALC_LEVELS.low;
      const kt = r.kt_stats ? `<p class="calc-kt">По стране на КТ-2025 порог набрали <b>${r.kt_stats.passed_pct.toFixed(1)}%</b> из ${r.kt_stats.participants} участников этой группы.</p>` : '';

      if (r.level === 'no_data') {
        box.innerHTML = `
          <div class="calc-verdict ${lv.cls}">
            <span class="calc-level">${lv.label}</span>
            <span class="calc-score">Балл: ${r.total}</span>
          </div>
          <p class="calc-msg">${esc(r.message)}</p>
        `;
        box.classList.remove('hidden');
        return;
      }

      const recs = (r.recommendations || []).map(rec => `
        <li><b>${esc(rec.name)}</b> (${esc(rec.city)}) — проходной ${rec.avg_score}, конкурс ${rec.competition_ratio.toFixed(1)}</li>
      `).join('');
      box.innerHTML = `
        <div class="calc-verdict ${lv.cls}">
          <span class="calc-level">${lv.label}</span>
          <span class="calc-score">${r.total} / проходной ${r.avg_passing_score}</span>
        </div>
        <p class="calc-msg">${esc(r.message)} Грантов: ${r.grant_count}, заявлений в прошлом году: ${r.applicants_count}.</p>
        ${kt}
        ${recs ? `<p class="calc-rec-head">Куда шансы выше:</p><ul class="calc-recs">${recs}</ul>` : ''}
      `;
      box.classList.remove('hidden');
    } catch (e) {
      box.innerHTML = `<p class="calc-msg">${esc(e.message)}</p>`;
      box.classList.remove('hidden');
    } finally {
      setBtnLoading(btn, false);
    }
  });
}

/* ---------------------------------------------------------
   INIT
   --------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', async () => {
  // сразу рисуем то, что не зависит от пользователя, и вешаем обработчики
  renderCatalog();
  renderStatsCatalog();
  // Если токен уже есть в localStorage, пользователь почти наверняка залогинен —
  // скрываем гостевой экран («Войдите, чтобы продолжить») сразу, не дожидаясь
  // fetchMe(), иначе на долю секунды мелькает неверное состояние. Дашборд по
  // умолчанию и так скрыт разметкой (class="hidden"), покажем его позже.
  if (getToken()) document.getElementById('authZone')?.classList.add('hidden');
  else refreshAuthUI();
  wireAuth();
  wireProfileForm();
  wireProfileModes();
  wireSearch();
  wireDirModal();
  wireGate();
  wireSubjectModal();
  wireQuiz();
  wireAntiCopy();
  wireMobileNav();
  document.getElementById('pathPrepBtn')?.addEventListener('click', () => {
    document.getElementById('catalog').scrollIntoView({ behavior: 'smooth' });
  });
  wireCalc();

  // справочники нужны ДО renderDashboard (иначе селекты пустые и value не встанет)
  await loadRefs();

  // подтягиваем пользователя по сохранённому токену (может быть медленно
  // на «холодном» сервере) и перерисовываем зависимые от него части
  await API.fetchMe();
  refreshAuthUI();
  renderDashboard();
  renderCatalog(); // чтобы подсветить избранное на карточках

  // автозапуск теста по ссылке из кабинета: index.html?test=7M06
  const testCode = new URLSearchParams(location.search).get('test');
  const testCodeDir = testCode ? findDirection(testCode) : null;
  if (testCode && document.getElementById('testPage') && requireAuth(testCodeDir && testCodeDir.code, testCodeDir && testCodeDir.name)) {
    if (INTERACTIVE_TEST_CODES.includes(testCode)) startQuiz(testCode);
    else showToast('Тест для этого направления временно недоступен');
  }

  // автозапуск симуляции КТ по ссылке (например, со страницы статистики): index.html?kt=7M01
  const ktCode = new URLSearchParams(location.search).get('kt');
  const ktCodeDir = ktCode ? findDirection(ktCode) : null;
  if (ktCode && document.getElementById('ktPage') && requireAuth(ktCodeDir && ktCodeDir.code, ktCodeDir && ktCodeDir.name)) {
    if (INTERACTIVE_TEST_CODES.includes(ktCode) && window.openKT) window.openKT(ktCode);
    else showToast('Симуляция КТ для этого направления временно недоступна');
  }

  // страница деталей пройденного теста: index.html?result=7M06&score=3&total=4&date=2026-07-05
  const qs = new URLSearchParams(location.search);
  const resultCode = qs.get('result');
  if (resultCode && document.getElementById('resultPage')) {
    const rDir = findDirection(resultCode);
    if (requireAuth(rDir && rDir.code, rDir && rDir.name)) {
      openResultDetail(resultCode, Number(qs.get('score')), Number(qs.get('total')), qs.get('date') || '');
    }
  }

  // открыть модалку направления сразу по ссылке из кабинета: index.html?openDir=7M01
  const openDirCode = qs.get('openDir');
  if (openDirCode && document.getElementById('dirModal') && findDirection(openDirCode)) {
    openDirection(openDirCode);
  }
});

/* Страница деталей пройденного теста (без данных о конкретных ответах —
   БД хранит только score/total; показываем вопросы с правильными ответами). */
async function openResultDetail(code, score, total, date) {
  const d = findDirection(code);
  const test = await getOrFetchTestContent(code);
  if (!test || !d) return; // нет доступа/направления — гейт или тост уже показаны
  const passed = total > 0 && Math.round((score / total) * 100) >= 60;

  document.getElementById('resultStamp').classList.toggle('is-fail', !passed);
  document.getElementById('resultStampStatus').textContent = passed ? 'Сдано' : 'Не сдано';
  document.getElementById('resultStampScore').textContent = `${score}/${total}`;
  document.getElementById('resultTitle').textContent = `${d.code} · ${d.name}`;
  document.getElementById('resultSub').textContent = date ? `Пройден ${date}` : '';

  document.getElementById('resultQList').innerHTML = test.questions.slice(0, QUIZ_MAX_QUESTIONS).map((q, i) => {
    const correctSet = Array.isArray(q.correct) ? q.correct : [q.correct];
    const opts = q.options.map((o, oi) => `
      <div class="rev-opt ${correctSet.includes(oi) ? 'correct' : ''}"><span>${esc(o)}</span>${correctSet.includes(oi) ? '<span class="rev-tag ok">Правильный ответ</span>' : ''}</div>
    `).join('');
    const why = q.why
      ? `<div class="rev-why"><b>Почему:</b> ${esc(q.why)}</div>`
      : (q.explanations ? '' : `<div class="rev-why"><b>Правильный ответ:</b> ${esc(q.options[correctSet[0]])}</div>`);
    return `
      <div class="rev-item">
        <p class="rev-q"><span class="test-qnum">${i + 1}.</span> ${esc(q.q)}</p>
        <div class="rev-opts">${opts}</div>
        ${why}
      </div>`;
  }).join('');

  document.getElementById('resultExit').onclick = () => location.href = 'cabinet.html';
  document.getElementById('resultCloseBtn').onclick = () => location.href = 'cabinet.html';
  document.getElementById('resultRetryBtn').onclick = () => startQuiz(code);

  document.getElementById('resultPage').classList.remove('hidden');
  document.body.classList.add('test-open');
  window.scrollTo(0, 0);
}
