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
    { q: 'Раздел педагогики, изучающий теорию обучения, называется:', options: ['Андрагогика','Дидактика','Логопедия','Этнопедагогика'], correct: 1,
      why: 'Дидактика — теория обучения. Андрагогика — обучение взрослых, логопедия — коррекция речи, этнопедагогика — народное воспитание.' },
    { q: 'Автор культурно-исторической теории развития психики:', options: ['Павлов','Маслоу','Выготский','Пиаже'], correct: 2,
      why: 'Л. С. Выготский — автор культурно-исторической теории. Павлов — рефлексы, Маслоу — пирамида потребностей, Пиаже — стадии интеллекта.' },
    { q: 'Ведущая деятельность дошкольного возраста:', options: ['Труд','Игра','Учение','Общение'], correct: 1,
      why: 'В дошкольном возрасте ведущая деятельность — игра (через неё развивается ребёнок). Учение ведущее у школьника, труд — позже.' },
    { q: 'Принцип «от простого к сложному» относится к:', options: ['Методам контроля','Видам памяти','Формам воспитания','Принципам обучения'], correct: 3,
      why: 'Это дидактический принцип обучения (систематичность и последовательность), а не метод контроля или форма воспитания.' },
  ]},
  '7M02': { title: 'Профильный тест: искусство и философия', questions: [
    { q: 'Эпоха Возрождения зародилась в:', options: ['Германии','Италии','Франции','Англии'], correct: 1,
      why: 'Ренессанс зародился в Италии (XIV век, Флоренция) и оттуда распространился по Европе.' },
    { q: 'Раздел философии, изучающий бытие:', options: ['Гносеология','Этика','Онтология','Эстетика'], correct: 2,
      why: 'Онтология — учение о бытии. Гносеология — о познании, этика — о морали, эстетика — о прекрасном.' },
    { q: 'Автор труда «Критика чистого разума»:', options: ['Кант','Гегель','Ницше','Декарт'], correct: 0,
      why: 'Иммануил Кант написал «Критику чистого разума» (1781) — основу немецкой классической философии.' },
    { q: 'Жанр живописи, изображающий неодушевлённые предметы:', options: ['Пейзаж','Портрет','Натюрморт','Марина'], correct: 2,
      why: 'Натюрморт — изображение неодушевлённых предметов. Пейзаж — природа, портрет — человек, марина — море.' },
  ]},
  '7M03': { title: 'Профильный тест: социология и журналистика', questions: [
    { q: 'Метод сбора данных через систему вопросов:', options: ['Опрос','Наблюдение','Эксперимент','Контент-анализ'], correct: 0,
      why: 'Опрос собирает данные через вопросы (анкеты, интервью). Наблюдение — фиксация поведения, эксперимент — проверка гипотез, контент-анализ — анализ текстов.' },
    { q: 'Кто ввёл термин «социология»:', options: ['Маркс','Конт','Вебер','Дюркгейм'], correct: 1,
      why: 'Огюст Конт ввёл термин «социология» (1830-е) и считается основателем науки.' },
    { q: 'Жанр журналистики с глубоким разбором проблемы:', options: ['Заметка','Репортаж','Аналитическая статья','Интервью'], correct: 2,
      why: 'Аналитическая статья глубоко разбирает проблему. Заметка — короткий факт, репортаж — с места события, интервью — беседа.' },
    { q: 'Аббревиатура PR расшифровывается как:', options: ['Personal Record','Public Relations','Press Release','Public Report'], correct: 1,
      why: 'PR — Public Relations (связи с общественностью), формирование образа организации.' },
  ]},
  '7M04': { title: 'Профильный тест: экономика и менеджмент', questions: [
    { q: 'Согласно закону спроса, при росте цены спрос обычно:', options: ['Растёт','Падает','Не меняется','Удваивается'], correct: 1,
      why: 'Закон спроса: цена и величина спроса обратно связаны — цена выше, спрос ниже (при прочих равных).' },
    { q: 'Функция менеджмента, связанная с распределением задач и ресурсов:', options: ['Мотивация','Контроль','Планирование','Организация'], correct: 3,
      why: 'Организация — распределение задач, ресурсов и полномочий. Планирование ставит цели, мотивация побуждает, контроль сверяет результат.' },
    { q: 'ВВП — это:', options: ['Сумма всех зарплат','Стоимость всех конечных товаров и услуг за год','Объём экспорта','Размер госбюджета'], correct: 1,
      why: 'ВВП — рыночная стоимость всех конечных товаров и услуг, произведённых в стране за год.' },
    { q: 'Инфляция — это:', options: ['Снижение цен','Рост общего уровня цен','Рост ВВП','Падение курса акций'], correct: 1,
      why: 'Инфляция — устойчивый рост общего уровня цен, снижение покупательной способности денег. Снижение цен — это дефляция.' },
  ]},
  '7M05': { title: 'Профильный тест: математика и физика', questions: [
    { q: 'Производная функции f(x) = x²:', options: ['x','2x','2','x²/2'], correct: 1,
      why: 'По правилу (xⁿ)′ = n·xⁿ⁻¹, производная x² равна 2x¹ = 2x.' },
    { q: 'Единица измерения силы в системе СИ:', options: ['Джоуль','Ватт','Ньютон','Паскаль'], correct: 2,
      why: 'Сила измеряется в ньютонах (Н). Джоуль — энергия, ватт — мощность, паскаль — давление.' },
    { q: 'Определитель матрицы [[a,b],[c,d]] равен:', options: ['ab − cd','ad − bc','ac − bd','ad + bc'], correct: 1,
      why: 'Определитель матрицы 2×2 = ad − bc (произведение главной диагонали минус побочной).' },
    { q: 'Закон сохранения энергии гласит, что энергия:', options: ['Всегда возрастает','Не возникает из ничего и не исчезает','Исчезает при трении','Равна массе тела'], correct: 1,
      why: 'Энергия не возникает и не исчезает, а переходит из одной формы в другую. При трении она переходит в тепло, а не исчезает.' },
  ]},
  '7M06': { title: 'Профильный тест: программирование и ВТ', questions: [
    { q: 'Какой тег создаёт гиперссылку в HTML?', options: ['<link>','<a>','<href>','<nav>'], correct: 1,
      why: 'Тег <a> (anchor) с атрибутом href задаёт ссылку. <link> подключает внешние ресурсы (CSS), <nav> — блок навигации, тега <href> не существует.' },
    { q: 'Структура данных, работающая по принципу FIFO (первым пришёл — первым ушёл):', options: ['Стек','Очередь','Дерево','Граф'], correct: 1,
      why: 'Очередь работает по FIFO. Стек — по LIFO (последним пришёл — первым ушёл). Дерево и граф — нелинейные структуры.' },
    { q: 'Команда SQL для выборки данных:', options: ['SELECT','UPDATE','DELETE','INSERT'], correct: 0,
      why: 'SELECT читает (выбирает) данные. UPDATE изменяет, DELETE удаляет, INSERT добавляет строки.' },
    { q: 'Протокол защищённой передачи веб-страниц:', options: ['HTTP','FTP','HTTPS','SMTP'], correct: 2,
      why: 'HTTPS — это HTTP поверх TLS (шифрование). HTTP без шифрования, FTP — передача файлов, SMTP — отправка почты.' },
  ]},
  '7M07': { title: 'Профильный тест: техническая механика и графика', questions: [
    { q: 'Наука о прочности и деформации материалов:', options: ['Гидравлика','Сопротивление материалов','Термодинамика','Электротехника'], correct: 1,
      why: 'Сопротивление материалов изучает прочность, жёсткость и деформации. Гидравлика — жидкости, термодинамика — тепло, электротехника — ток.' },
    { q: 'Чертёж детали в трёх видах строится методом:', options: ['Центрального проецирования','Косого проецирования','Прямоугольного проецирования','Сферического проецирования'], correct: 2,
      why: 'Три вида (спереди, сверху, слева) строят прямоугольным (ортогональным) проецированием на взаимно перпендикулярные плоскости.' },
    { q: 'Единица измерения механического напряжения:', options: ['Ньютон','Паскаль','Джоуль','Ом'], correct: 1,
      why: 'Напряжение = сила / площадь, измеряется в паскалях (Па = Н/м²). Ньютон — сила, джоуль — энергия, ом — сопротивление.' },
    { q: 'Свойство материала сопротивляться вдавливанию и царапанью:', options: ['Пластичность','Упругость','Твёрдость','Хрупкость'], correct: 2,
      why: 'Твёрдость — сопротивление вдавливанию/царапанью. Пластичность — способность к остаточной деформации, упругость — возврат формы, хрупкость — разрушение без деформации.' },
  ]},
  '7M08': { title: 'Профильный тест: агрономия и зоотехния', questions: [
    { q: 'Наука о почвах называется:', options: ['Агрохимия','Почвоведение','Селекция','Мелиорация'], correct: 1,
      why: 'Почвоведение изучает почвы. Агрохимия — питание растений и удобрения, селекция — выведение сортов, мелиорация — улучшение земель.' },
    { q: 'Чередование сельхозкультур на полях по годам — это:', options: ['Монокультура','Пар','Севооборот','Вспашка'], correct: 2,
      why: 'Севооборот — научно обоснованное чередование культур по годам, сохраняет плодородие. Монокультура — одна культура постоянно.' },
    { q: 'Раздел животноводства о кормлении и разведении животных:', options: ['Ветеринария','Зоотехния','Агрономия','Ботаника'], correct: 1,
      why: 'Зоотехния — кормление, разведение, содержание животных. Ветеринария — лечение, агрономия и ботаника — о растениях.' },
    { q: 'Улучшение земель (орошение, осушение) называется:', options: ['Селекция','Севооборот','Вспашка','Мелиорация'], correct: 3,
      why: 'Мелиорация — комплекс мер по улучшению земель (орошение, осушение, борьба с эрозией).' },
  ]},
  '7M11': { title: 'Профильный тест: туризм и логистика', questions: [
    { q: 'Туроператор — это компания, которая:', options: ['Только продаёт готовые туры','Формирует (создаёт) туры','Перевозит грузы','Страхует туристов'], correct: 1,
      why: 'Туроператор формирует (создаёт) турпродукт. Продаёт готовые туры — турагент.' },
    { q: 'Логистика занимается прежде всего:', options: ['Управлением потоками товаров','Бухгалтерией','Рекламой','Кадрами'], correct: 0,
      why: 'Логистика управляет потоками товаров, информации и ресурсов от поставщика к потребителю с минимальными издержками.' },
    { q: 'Вид логистики, связанный с хранением товаров:', options: ['Транспортная','Складская','Финансовая','Кадровая'], correct: 1,
      why: 'Складская логистика отвечает за хранение и обработку запасов. Транспортная — за перевозку.' },
    { q: '«Звёздность» отеля обозначает:', options: ['Цену за ночь','Уровень комфорта и сервиса','Количество номеров','Год постройки'], correct: 1,
      why: 'Звёзды отеля отражают уровень комфорта и набор услуг (сервиса), а не цену или размер.' },
  ]},
  '7M12': { title: 'Профильный тест: нацбезопасность и военное дело', questions: [
    { q: 'Документ, определяющий основы национальной безопасности РК:', options: ['Трудовой кодекс','Стратегия национальной безопасности','Правила дорожного движения','Устав ООН'], correct: 1,
      why: 'Основы нацбезопасности РК закреплены в законе и Стратегии национальной безопасности. Трудовой кодекс и ПДД — иные сферы.' },
    { q: 'Раздел военного дела об организации и ведении боя:', options: ['Стратегия','Тактика','Логистика','Топография'], correct: 1,
      why: 'Тактика — подготовка и ведение боя (уровень подразделения). Стратегия — уровень войны в целом, логистика — снабжение, топография — местность.' },
    { q: 'Военная топография изучает:', options: ['Местность и ориентирование на ней','Историю войн','Воинские уставы','Виды вооружения'], correct: 0,
      why: 'Военная топография — изучение местности, чтение карт и ориентирование для боевых задач.' },
    { q: 'Основной закон, гарантирующий права и безопасность граждан:', options: ['Приказ','Конституция','Инструкция','Меморандум'], correct: 1,
      why: 'Конституция — основной закон государства, высшая юридическая сила, гарантирует права и свободы граждан.' },
  ]},
};

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
    throw new Error((data && data.error) ? data.error : `Ошибка сервера (${res.status})`);
  }
  return data;
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
    setToken(token); currentUser = user; return user;
  },

  logout() { clearToken(); currentUser = null; },

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

/* Гейт: тест/КТ доступны только вошедшим. Возвращает true, если можно продолжать.
   courseCode/courseName — код и название направления для текста сообщения в WhatsApp. */
const WHATSAPP_PHONE = '77473334123';
function requireAuth(courseCode, courseName) {
  if (API.getCurrentUser()) return true;
  const buyBtn = document.getElementById('gateBuyBtn');
  if (buyBtn) {
    const codePrefix = courseCode ? `*${courseCode}* ` : '';
    const text = `Здравствуйте! Я хочу приобрести доступ к курсу подготовки по направлению "${codePrefix}${courseName || 'на сайте'}". Подскажите, пожалуйста, как произвести оплату?`;
    buyBtn.href = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(text)}`;
  }
  document.getElementById('gateModal').classList.remove('hidden');
  return false;
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
function startQuiz(code) {
  const test = DIRECTION_TESTS[code];
  const d = findDirection(code);
  activeQuiz = { code, qIndex: 0, answers: new Array(test.questions.length).fill(null) };

  document.getElementById('testTitle').textContent = test.title;
  document.getElementById('testSub').textContent = `${d.code} · ${d.name}`;
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

function renderQuizQuestion() {
  const test = DIRECTION_TESTS[activeQuiz.code];
  const q = test.questions[activeQuiz.qIndex];
  document.getElementById('testQNum').textContent = `${activeQuiz.qIndex + 1}.`;
  document.getElementById('testQuestion').textContent = q.q;

  const optionsEl = document.getElementById('testOptions');
  optionsEl.innerHTML = q.options.map((opt, i) => `
    <button class="test-opt ${activeQuiz.answers[activeQuiz.qIndex] === i ? 'is-selected' : ''}" data-option="${i}">
      <span class="test-radio" aria-hidden="true"></span><span class="test-opt-label">${esc(opt)}</span>
    </button>`).join('');
  optionsEl.querySelectorAll('[data-option]').forEach(btn => {
    btn.addEventListener('click', () => { activeQuiz.answers[activeQuiz.qIndex] = Number(btn.dataset.option); renderQuizQuestion(); });
  });

  document.getElementById('testNext').textContent =
    activeQuiz.qIndex === test.questions.length - 1 ? 'Завершить' : 'Далее';
  document.getElementById('testPrev').disabled = activeQuiz.qIndex === 0;
}

function quizPrev() {
  if (activeQuiz.qIndex > 0) { activeQuiz.qIndex--; renderQuizQuestion(); }
}

function quizNext() {
  const test = DIRECTION_TESTS[activeQuiz.code];
  if (activeQuiz.qIndex < test.questions.length - 1) { activeQuiz.qIndex++; renderQuizQuestion(); }
  else finishQuiz();
}

function finishQuiz() {
  const test = DIRECTION_TESTS[activeQuiz.code];
  let score = 0;
  test.questions.forEach((q, i) => { if (activeQuiz.answers[i] === q.correct) score++; });
  const total = test.questions.length;
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
  const test = DIRECTION_TESTS[activeQuiz.code];
  const d = findDirection(activeQuiz.code);
  let score = 0;
  test.questions.forEach((q, i) => { if (activeQuiz.answers[i] === q.correct) score++; });
  document.getElementById('reviewSub').textContent = `${d.code} · ${d.name} — ${score} из ${test.questions.length}`;

  document.getElementById('reviewList').innerHTML = test.questions.map((q, i) => {
    const ua = activeQuiz.answers[i]; // ответ пользователя (или null)
    const wrong = ua !== q.correct;
    const opts = q.options.map((o, oi) => {
      let cls = 'rev-opt', tag = '';
      if (oi === q.correct) { cls += ' correct'; tag = oi === ua ? '<span class="rev-tag ok">Ваш ответ ✓</span>' : '<span class="rev-tag ok">Правильный ответ</span>'; }
      else if (oi === ua) { cls += ' wrong'; tag = '<span class="rev-tag bad">Ваш ответ ✗</span>'; }
      return `<div class="${cls}"><span>${esc(o)}</span>${tag}</div>`;
    }).join('');
    const why = q.why
      ? `<div class="rev-why"><b>Почему:</b> ${esc(q.why)}</div>`
      : `<div class="rev-why"><b>Правильный ответ:</b> ${esc(q.options[q.correct])}</div>`;
    return `
      <div class="rev-item ${wrong ? 'is-wrong' : 'is-ok'}">
        <p class="rev-q"><span class="test-qnum">${i + 1}.</span> ${esc(q.q)}</p>
        <div class="rev-opts">${opts}</div>
        ${why}
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

function wireQuiz() {
  if (!document.getElementById('testPage')) return; // страница теста только на index.html
  document.getElementById('testExit').addEventListener('click', closeQuiz);
  document.getElementById('testPrev').addEventListener('click', quizPrev);
  document.getElementById('testNext').addEventListener('click', quizNext);
  document.getElementById('reviewBtn').addEventListener('click', openReview);
  document.getElementById('reviewExit').addEventListener('click', closeReview);
  document.getElementById('reviewClose').addEventListener('click', closeReview);
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
    authZone?.classList.remove('hidden');
    dashboard?.classList.add('hidden');
  }
}

function renderDashboard() {
  const user = API.getCurrentUser();
  if (!user || !document.getElementById('dashboard')) return; // дашборд только на cabinet.html

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
    if (typeof DIRECTION_TESTS !== 'undefined' && DIRECTION_TESTS[code]) {
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
  const btnGoDash = document.getElementById('btnGoDashboard');
  if (btnGoDash) btnGoDash.addEventListener('click', () => { location.href = 'cabinet.html'; });
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
  high:   { label: 'Высокий шанс',  cls: 'high' },
  medium: { label: 'Средний шанс',  cls: 'medium' },
  low:    { label: 'Низкий шанс',   cls: 'low' },
  none:   { label: 'Ниже порога',   cls: 'low' },
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
      const recs = (r.recommendations || []).map(rec => `
        <li><b>${esc(rec.name)}</b> (${esc(rec.city)}) — проходной ${rec.avg_score}, конкурс ${rec.competition_ratio.toFixed(1)}</li>
      `).join('');
      box.innerHTML = `
        <div class="calc-verdict ${lv.cls}">
          <span class="calc-level">${lv.label}</span>
          <span class="calc-score">${r.total} / проходной ${r.avg_passing_score}</span>
        </div>
        <p class="calc-msg">${esc(r.message)} Грантов: ${r.grant_count}, заявлений в прошлом году: ${r.applicants_count}.</p>
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
  refreshAuthUI();
  wireAuth();
  wireProfileForm();
  wireProfileModes();
  wireSearch();
  wireDirModal();
  wireGate();
  wireQuiz();
  wireMobileNav();
  wireHeroVideoLoop();
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
    if (DIRECTION_TESTS[testCode]) startQuiz(testCode);
    else showToast('Тест для этого направления временно недоступен');
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
});

/* Страница деталей пройденного теста (без данных о конкретных ответах —
   БД хранит только score/total; показываем вопросы с правильными ответами). */
function openResultDetail(code, score, total, date) {
  const test = DIRECTION_TESTS[code];
  const d = findDirection(code);
  if (!test || !d) { showToast('Тест для этого направления недоступен'); return; }
  const passed = total > 0 && Math.round((score / total) * 100) >= 60;

  document.getElementById('resultStamp').classList.toggle('is-fail', !passed);
  document.getElementById('resultStampStatus').textContent = passed ? 'Сдано' : 'Не сдано';
  document.getElementById('resultStampScore').textContent = `${score}/${total}`;
  document.getElementById('resultTitle').textContent = `${d.code} · ${d.name}`;
  document.getElementById('resultSub').textContent = date ? `Пройден ${date}` : '';

  document.getElementById('resultQList').innerHTML = test.questions.map((q, i) => {
    const opts = q.options.map((o, oi) => `
      <div class="rev-opt ${oi === q.correct ? 'correct' : ''}"><span>${esc(o)}</span>${oi === q.correct ? '<span class="rev-tag ok">Правильный ответ</span>' : ''}</div>
    `).join('');
    const why = q.why
      ? `<div class="rev-why"><b>Почему:</b> ${esc(q.why)}</div>`
      : `<div class="rev-why"><b>Правильный ответ:</b> ${esc(q.options[q.correct])}</div>`;
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
