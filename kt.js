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

// Реальные названия профильных предметов по коду направления (пока заполнено только для 7M01/M001).
const KT_SUBJECT_NAMES = {
  '7M01': { subj1: 'Педагогика', subj2: 'Психология' },
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

/* Английский — реальный банк вопросов (16 Listening + 18 Grammar + 16 Reading = 50).
   Listening разбит на 2 аудиозаписи: вопросы 1-8 → audio-1-8.mp3, 9-16 → audio-9-16.mp3. */
const KT_LANG_EN_STAGES = {
  listening: [
    {"q":"Fighting negative stereotypes involves learning about ______.","options":["new books","recent events","different cultures","weather forecast"],"correct":2,"explanations":["в аудио не упоминаются «новые книги» как способ борьбы со стереотипами --- это отвлекающий вариант.","«recent events» (последние события) нигде не звучит в тексте --- стереотипы не связаны с новостями в этом разговоре.","Верно! В конце аудио прямо говорится: «By learning about different cultures, traveling and engaging in open discussions» --- именно изучение разных культур помогает бороться со стереотипами.","«weather forecast» (прогноз погоды) вообще не относится к теме разговора --- явно лишний вариант."],"audio":"assets/listening-en/audio-1-8.mp3"},
    {"q":"National holidays also ___ family values and traditions.","options":["ignore","deny","highlight","neglect"],"correct":2,"explanations":["«ignore» (игнорировать) --- противоположность смыслу: праздники не игнорируют, а отражают ценности.","«deny» (отрицать) --- тоже противоположное по смыслу слово, не подходит логически.","Верно! В аудио сказано: «Holidays reflect traditions and values» и «Chinese New Year highlights family and prosperity» --- праздники подчёркивают (highlight) ценности.","«neglect» (пренебрегать) --- снова антоним нужного значения."],"audio":"assets/listening-en/audio-1-8.mp3"},
    {"q":"Independence Day and Chinese New Year symbolize cultural values and ___.","options":["industrial growth","modern technology","national traditions","economic policies"],"correct":2,"explanations":["«industrial growth» (промышленный рост) не связан с темой праздников и традиций.","«modern technology» --- тоже не по теме, в аудио речь о культуре, а не о технологиях.","Верно! Спикер говорит: «Holidays reflect traditions and values» --- праздники символизируют культурные ценности и национальные традиции.","«economic policies» (экономическая политика) --- не упоминается в разговоре о праздниках."],"audio":"assets/listening-en/audio-1-8.mp3"},
    {"q":"Stereotypes form from history, media and ___ experiences.","options":["economic","geographical","political","personal"],"correct":3,"explanations":["«economic» не звучит в аудио --- экономика не упоминается как источник стереотипов.","«geographical» тоже отсутствует в тексте аудио.","«political» не упоминается --- в разговоре нет ссылки на политику.","Верно! Дословно в аудио: «Stereotypes come from history, media and personal experiences»."],"audio":"assets/listening-en/audio-1-8.mp3"},
    {"q":"___ French is often stereotyped as being always romantic.","options":["few","most","some","every"],"correct":3,"explanations":["«few» означает «немногие», а в аудио говорится о всеобщем стереотипе --- «few» противоречит смыслу «always».","«most» (большинство) --- близко, но в аудио используется обобщение «all French people», что точнее передаётся словом «every».","«some» (некоторые) --- слишком слабое обобщение, не соответствует фразе «always romantic» из аудио.","Верно! В аудио: «all French people are always romantic» --- «all» по смыслу равно «every» (каждый/все)."],"audio":"assets/listening-en/audio-1-8.mp3"},
    {"q":"Some people assume all British people drink ___ all day.","options":["water","wine","tea","coffee"],"correct":2,"explanations":["«water» не упоминается в аудио как стереотипный напиток британцев.","«wine» ассоциируется скорее с французским стереотипом, а не с британским --- отвлекающий вариант.","Верно! Дословно: «people assume all British people drink tea all day».","«coffee» --- частый стереотип, но не тот, что упомянут именно в этом аудио."],"audio":"assets/listening-en/audio-1-8.mp3"},
    {"q":"Open discussions promote understanding among different cultures ___.","options":["which is optional","only during holidays","which is essential","which leads to conflicts"],"correct":2,"explanations":["«which is optional» противоречит смыслу --- в аудио открытые дискуссии подаются как важный, а не необязательный инструмент.","«only during holidays» --- такое ограничение не упоминается в тексте.","Верно! Финальная мысль аудио: «The more we understand each other, the fewer stereotypes we believe in» --- открытые дискуссии показаны как необходимый (essential) способ понимания.","«which leads to conflicts» --- противоположный смысл: дискуссии, наоборот, снижают недопонимание, а не создают конфликты."],"audio":"assets/listening-en/audio-1-8.mp3"},
    {"q":"Stereotypes come from history, media, and ___.","options":["personal experiences","literature","government policies","travel"],"correct":0,"explanations":["Верно! Аудио: «Stereotypes come from history, media and personal experiences» --- тот же список, что и в вопросе 4.","«literature» (литература) не упоминается в аудио как источник стереотипов.","«government policies» тоже нигде не звучит.","«travel» --- хитрая ловушка: путешествия в аудио названы способом БОРЬБЫ со стереотипами, а не их источником."],"audio":"assets/listening-en/audio-1-8.mp3"},
    {"q":"Dubai Shopping Festival lasts","options":["two months","one month","three months","four months"],"correct":1,"explanations":["«two months» --- неверная продолжительность, в аудио сказано иначе.","Верно! В аудио: «The month-long Dubai Shopping Festival» --- фестиваль длится ровно один месяц.","«three months» --- не соответствует аудио.","«four months» --- тоже неверно, явно завышенная цифра."],"audio":"assets/listening-en/audio-9-16.mp3"},
    {"q":"Dubai Shopping Festival sells","options":["artificial snow","brand clothes","adventure books","nightly fireworks"],"correct":1,"explanations":["«artificial snow» (искусственный снег) относится к Ski Dubai, а не к шоппинг-фестивалю --- это ловушка на смешение фактов.","Верно! В аудио говорится про «huge sales on luxury items» --- распродажи брендовых/люксовых товаров, то есть «brand clothes».","«adventure books» нигде не упоминаются в тексте.","«nightly fireworks» --- это МЕРОПРИЯТИЕ фестиваля, а не то, что «продаётся» --- внимательно читайте вопрос: спрашивается именно про продажи."],"audio":"assets/listening-en/audio-9-16.mp3"},
    {"q":"In Dubai there are","options":["only month -- long shopping","no shopping centres","many activities to enjoy","no tourists year round"],"correct":2,"explanations":["«only month-long shopping» неверно: в аудио перечислено много других активностей (дайвинг, катание на верблюдах, сэнд-скиинг), а не только шоппинг.","«no shopping centres» прямо противоречит аудио, где Дубай называют «shopping capital of the Middle East».","Верно! Аудио перечисляет: scuba diving, camel racing, shopping, sand skiing, Ski Dubai --- то есть «many activities to enjoy».","«no tourists year round» противоречит фразе «millions of visitors come to Dubai» --- туристы приезжают круглый год."],"audio":"assets/listening-en/audio-9-16.mp3"},
    {"q":"Dubai is surrounded by","options":["resorts","desert","woods","forests"],"correct":1,"explanations":["«resorts» (курорты) находятся В Дубае, а не окружают его.","Верно! В аудио прямо: «surrounding desert» --- Дубай окружён пустыней.","«woods» (леса) не подходят по климату и не упоминаются в тексте.","«forests» --- тоже неверно по той же причине, лесов в пустынном климате Дубая нет."],"audio":"assets/listening-en/audio-9-16.mp3"},
    {"q":"Ski Dubai is a/an","options":["snow park","sand dunes","beach resort","health resort"],"correct":0,"explanations":["Верно! В аудио: «It is the largest indoor snow park in the world» --- именно снежный парк.","«sand dunes» (песчаные дюны) относятся к сэнд-скиингу, а не к Ski Dubai --- разные активности перепутаны.","«beach resort» не упоминается в связи со Ski Dubai.","«health resort» тоже не соответствует описанию в аудио."],"audio":"assets/listening-en/audio-9-16.mp3"},
    {"q":"Dubai attracts tourists with sunny","options":["restaurants","hotels","beaches","architecture"],"correct":2,"explanations":["«restaurants» упоминаются в аудио, но не как «sunny» (солнечные) --- это не сочетается по смыслу.","«hotels» тоже упомянуты отдельно, но не с определением «sunny».","Верно! Дословная фраза из аудио: «sunny beaches».","«architecture» описана как «beautiful», а не «sunny» --- сочетание слов другое."],"audio":"assets/listening-en/audio-9-16.mp3"},
    {"q":"Dubai Shopping Festival is famous for its","options":["big sales","local food","scuba diving","sports events"],"correct":0,"explanations":["Верно! Аудио: «the huge sales on luxury items» --- фестиваль славится именно масштабными распродажами.","«local food» нигде не упоминается в контексте фестиваля.","«scuba diving» --- это отдельная активность в Дубае в целом, не связанная именно с фестивалем.","«sports events» тоже не упоминаются применительно к фестивалю."],"audio":"assets/listening-en/audio-9-16.mp3"},
    {"q":"The number of annual visitors come to Dubai","options":["millions","thousands","hundreds","billions"],"correct":0,"explanations":["Верно! Аудио начинается словами: «Every year millions of visitors come to Dubai».","«thousands» --- заниженная цифра по сравнению с текстом аудио.","«hundreds» --- ещё сильнее заниженная и явно неверная цифра.","«billions» --- наоборот, завышенная и нереалистичная цифра."],"audio":"assets/listening-en/audio-9-16.mp3"}
  ],
  grammar: [
    {"q":"___ has improved enormously.","options":["Agila's piano playing","Agilas' piano playing","Agila piano playing","Agila playing piano"],"correct":0,"explanations":["Верно! Притяжательный падеж для имени в единственном числе образуется через 's: «Agila's piano playing» = «игра Агилы на пианино».","«Agilas'» --- апостроф после S используется для МНОЖЕСТВЕННОГО числа существительных (the students' books), но «Agila» --- имя собственное в единственном числе, поэтому такая форма неверна.","Пропущен апостроф с 's --- без него нет грамматической связи притяжательности между «Agila» и «piano playing».","«Agila playing piano» --- здесь нет чёткой grammatической конструкции подлежащего для «has improved»; стандартная форма требует притяжательного падежа перед герундием."]},
    {"q":"Young children usually start school at the age of ____.","options":["twelve","seven","three","ten"],"correct":1,"explanations":["«twelve» --- это возраст перехода в старшую школу, а не начало обучения.","Верно! В большинстве стран (в том числе в Казахстане) дети обычно идут в школу в 7 лет.","«three» --- это возраст детского сада, а не школы.","«ten» тоже не соответствует стандартному возрасту начала обучения в школе."]},
    {"q":"It was an __________ experience. I was so _________.","options":["amazing / exciting","amazed / excited","amazed / exciting","amazing / excited"],"correct":3,"explanations":["Второй пропуск неверен: человек не может быть «exciting» (это означало бы, что человек сам вызывает восторг у других, а не испытывает его).","Первый пропуск неверен: неодушевлённое существительное «experience» (впечатление) не может быть «amazed» --- форма на -ed используется для людей, которые ИСПЫТЫВАЮТ эмоцию.","Оба пропуска перепутаны местами --- оба неверны.","Верно! «experience» вызывает эмоцию → amazing (-ing); «I» испытываю эмоцию → excited (-ed). Правило: -ing описывает причину, -ed описывает того, кто чувствует."]},
    {"q":"You are ________ woman I've ever met in my life!","options":["an beautiful","more beautiful","the most beautiful","the beautifuller"],"correct":2,"explanations":["«an beautiful» неверно вдвойне: артикль «an» не ставится перед согласным звуком, а форма без степени сравнения тут не подходит по смыслу.","«more beautiful» --- сравнительная степень, но конструкция «...I've ever met» требует ПРЕВОСХОДНОЙ степени.","Верно! Конструкция «the most + прилагательное + ...I've ever met» --- стандартная превосходная степень для выражения «самый ... из всех, кого я встречал».","«the beautifuller» --- грамматически неверная форма: многосложные прилагательные (beautiful) не образуют степени через -er/-est, только через more/most."]},
    {"q":"Please give me ___ pen.","options":["those","it","these","that"],"correct":3,"explanations":["«those» --- указательное местоимение множественного числа, а «pen» стоит в единственном числе.","«it» не может использоваться как определитель перед существительным («give me it pen» --- грамматически неверно).","«these» --- тоже множественное число, не подходит к единственному «pen».","Верно! «that» --- указательное местоимение единственного числа, согласуется с «pen»."]},
    {"q":"The meeting will start on Monday. It is _________ of June.","options":["the one","one","the first","first"],"correct":2,"explanations":["«the one of June» --- не стандартная конструкция для обозначения даты.","«one» без артикля «the» не используется в датах такого типа.","Верно! Стандартная форма даты: «the first of June» --- с определённым артиклем перед порядковым числительным.","«first» без «the» грамматически неполно для этой конструкции с датой."]},
    {"q":"He ___ his work before you came","options":["finishes","has finished","had finished","finished"],"correct":2,"explanations":["«finishes» --- настоящее простое время, не подходит для описания прошлой последовательности событий.","«has finished» (Present Perfect) не сочетается с явным указанием прошлого времени «before you came».","Верно! Past Perfect («had finished») используется, когда одно действие в прошлом завершилось РАНЬШЕ другого прошлого действия (came).","«finished» (Past Simple) не показывает чёткой последовательности «раньше другого прошлого события» так явно, как Past Perfect, который требуется при «before + Past Simple»."]},
    {"q":"My teacher suggested ______________ an interpreter in the future.","options":["to becoming","becoming","to become","become"],"correct":1,"explanations":["«to becoming» --- смешение инфинитива «to» и герундия «-ing», такая форма не существует в стандартной грамматике.","Верно! Глагол «suggest» требует после себя герундий: «suggest doing something».","«to become» (инфинитив) --- стандартная ошибка, «suggest» НЕ используется с инфинитивом с «to» (в отличие от «want to do»).","«become» --- форма голого инфинитива тоже неверна после «suggested»."]},
    {"q":"You are very good at languages. You _________ five languages, don't you?","options":["spoke","are speaking","speaks","speak"],"correct":3,"explanations":["«spoke» --- прошедшее время, не подходит: речь идёт о текущей способности человека, а не о прошлом факте.","«are speaking» (Present Continuous) неверно: владение языками --- это постоянное состояние/способность, а не действие в моменте.","«speaks» --- неверное согласование с подлежащим «you» (нужна форма без -s).","Верно! Present Simple используется для общих фактов и способностей; форма «speak» также согласуется с разделительным вопросом «don't you?»."]},
    {"q":"When you called me yesterday, I _______.","options":["have cooked","was cooking","am cooking","cook"],"correct":1,"explanations":["«have cooked» (Present Perfect) не сочетается с явным указанием прошедшего времени «yesterday».","Верно! Past Continuous показывает действие, которое уже происходило в момент, когда его прервало другое прошедшее действие (звонок).","«am cooking» --- настоящее время, не подходит для рассказа о вчерашнем дне.","«cook» (Present Simple) не показывает процесс, длившийся в конкретный момент в прошлом."]},
    {"q":"Can I take this newspaper? ___________ with it?","options":["Did you finish","Have you finished","Had you finished","Do you finish"],"correct":1,"explanations":["«Did you finish» (Past Simple) спрашивает о прошлом действии без явной связи с настоящим моментом --- здесь же важно, закончил ли собеседник ИМЕННО СЕЙЧАС.","Верно! Present Perfect используется, когда важен результат действия к текущему моменту --- «закончил(и) ли вы к настоящему времени».","«Had you finished» (Past Perfect) требует точки отсчёта в прошлом, которой здесь нет.","«Do you finish» (Present Simple) звучит как вопрос о привычке, а не о завершённости конкретного действия."]},
    {"q":"Lisa called you, while you were out. Ok. I ______ her back.","options":["will call","call","have call","am going to"],"correct":0,"explanations":["Верно! «will» используется для спонтанного решения, принятого прямо в момент речи --- именно такая ситуация здесь.","«call» (Present Simple) не выражает будущее решение или намерение.","«have call» --- грамматически некорректная форма (не существует такого сочетания).","«am going to» используется для заранее спланированных намерений, а не для решений, принятых спонтанно прямо сейчас."]},
    {"q":"He ... up at six o'clock every morning last week.","options":["gets","is getting","gotten","got"],"correct":3,"explanations":["«gets» (Present Simple) не подходит: указано прошедшее время «last week».","«is getting» (Present Continuous) тоже не сочетается с прошедшим временем.","«gotten» --- причастие прошедшего времени само по себе не может быть сказуемым без вспомогательного глагола.","Верно! Past Simple («got») используется для повторяющегося действия в конкретный период прошлого --- «every morning last week»."]},
    {"q":"Passengers are forbidden _____ to the driver","options":["talk","to talk","talkings","talked"],"correct":1,"explanations":["«talk» --- голый инфинитив без «to» не используется после прилагательного «forbidden».","Верно! Конструкция «forbidden + to + infinitive» --- стандартный грамматический шаблон.","«talkings» --- несуществующая форма слова (talk не образует такое множественное число).","«talked» --- прошедшее время не подходит к инфинитивной конструкции после «forbidden»."]},
    {"q":"I have given up ______ any books or magazines.","options":["to reading","read","reading","to read"],"correct":2,"explanations":["«to reading» --- смешение инфинитива и герундия, такой формы не существует.","«read» --- голый инфинитив, не подходит после фразового глагола «give up».","Верно! «give up» --- фразовый глагол, требующий после себя герундий (give up doing something).","«to read» (инфинитив с to) тоже неверен --- «give up» не сочетается с инфинитивом."]},
    {"q":"I was woken up by ____________.","options":["the rings bell","the bell rings","the bell to ringing","the bell ringing"],"correct":3,"explanations":["«the rings bell» --- неверный порядок слов, «rings» не может стоять как прилагательное перед «bell».","«the bell rings» --- это полноценное предложение (подлежащее + сказуемое), оно не может быть объектом предлога «by».","«the bell to ringing» --- грамматически невозможное сочетание инфинитива с «-ing».","Верно! Конструкция «существительное + причастие настоящего времени» (the bell ringing = звонящий звонок) корректно используется как объект предлога «by»."]},
    {"q":"If my mom _ the lottery, she'd give some of the money to each member of her family.","options":["won","have won","will win","wins"],"correct":0,"explanations":["Верно! Второй тип условных предложений (Second Conditional): If + Past Simple, ... would + базовый глагол --- для гипотетической ситуации в настоящем/будущем.","«have won» --- неверная форма, не соответствует ни одному стандартному типу условных предложений с «she'd» (would).","«will win» относится к Первому типу условных (реальное будущее условие), но в главном предложении используется «would», что требует Past Simple в придаточном.","«wins» (Present Simple) тоже не сочетается с «would» в главном предложении --- нужен Past Simple."]},
    {"q":"If you are robbed, do ___ the police!","options":["called","call","to call","calling"],"correct":1,"explanations":["«called» --- прошедшее время, не подходит для повелительного наклонения (императива).","Верно! Усилительная конструкция «do + базовый глагол» используется в повелительном наклонении для акцента: «do call the police!».","«to call» (инфинитив с to) не используется после эмфатического «do» в императиве.","«calling» (герундий) тоже не подходит после «do» в этой конструкции."]}
  ],
  reading: [
    {"q":"What is the weather in the summer?","options":["The weather is wet.","The weather is rainy.","The weather is dry.","The weather is snowy."],"correct":2,"explanations":["«wet» относится к сезону дождей в целом, но не к описанию именно лета в тексте.","«rainy» тоже не подходит: летом (в центральной части) текст описывает погоду как «sunny and dry».","Верно! В тексте: «the summer is usually sunny and dry» --- прямое указание на сухую погоду летом.","«snowy» описывает лишь высокогорные районы зимой, а не лето в целом."],"passage":"Madagascar Madagascar has two seasons, a warm, wet season from November to April, and a cooler dry season between May and October. However, different parts of the country have very different weather. The east coast is hotter and wetter, with up to 4000mm of rainfall per year. In the rainy season, there are strong winds, and these can cause a lot of damage. Avoid visiting eastern Madagascar between January and March because the weather can make road travel very difficult. The dry season is cooler and more pleasant. The high, central part of the country is much drier and cooler. About 1,400mm of rain falls in the rainy season, with some thunderstorms, but the summer is usually sunny and dry, but it can be cold, especially in the mornings, with freezing showers, and it may snow in mountain areas above 2,400m, and even stay there for several days. The west coast is the driest part of the island. Here, the winter months are pleasant with little rain, cooler temperatures and blue skies. The summers can be extremely hot, especially in the southwest. This part of the country is semi-desert, and only gets around 300mm of rain per year."},
    {"q":"The east coast of Madagascar is ___ weather?","options":["cold and dry","hot and wet","cloudy and warm","shiny and wet"],"correct":1,"explanations":["«cold and dry» --- прямо противоположно описанию в тексте.","Верно! Текст: «The east coast is hotter and wetter, with up to 4000mm of rainfall per year».","«cloudy and warm» не соответствует формулировке текста.","«shiny and wet» --- «shiny» не используется в тексте для описания погоды восточного побережья."],"passage":"Madagascar Madagascar has two seasons, a warm, wet season from November to April, and a cooler dry season between May and October. However, different parts of the country have very different weather. The east coast is hotter and wetter, with up to 4000mm of rainfall per year. In the rainy season, there are strong winds, and these can cause a lot of damage. Avoid visiting eastern Madagascar between January and March because the weather can make road travel very difficult. The dry season is cooler and more pleasant. The high, central part of the country is much drier and cooler. About 1,400mm of rain falls in the rainy season, with some thunderstorms, but the summer is usually sunny and dry, but it can be cold, especially in the mornings, with freezing showers, and it may snow in mountain areas above 2,400m, and even stay there for several days. The west coast is the driest part of the island. Here, the winter months are pleasant with little rain, cooler temperatures and blue skies. The summers can be extremely hot, especially in the southwest. This part of the country is semi-desert, and only gets around 300mm of rain per year."},
    {"q":"What is the weather in different parts of Madagascar?","options":["cold","warm","hot","different"],"correct":3,"explanations":["«cold» описывает только отдельные горные районы, а не всю страну.","«warm» тоже касается лишь части описания (сезон), а не общего ответа на вопрос.","«hot» относится только к части побережий, не ко всей стране.","Верно! Текст прямо говорит: «different parts of the country have very different weather» --- главная мысль абзаца."],"passage":"Madagascar Madagascar has two seasons, a warm, wet season from November to April, and a cooler dry season between May and October. However, different parts of the country have very different weather. The east coast is hotter and wetter, with up to 4000mm of rainfall per year. In the rainy season, there are strong winds, and these can cause a lot of damage. Avoid visiting eastern Madagascar between January and March because the weather can make road travel very difficult. The dry season is cooler and more pleasant. The high, central part of the country is much drier and cooler. About 1,400mm of rain falls in the rainy season, with some thunderstorms, but the summer is usually sunny and dry, but it can be cold, especially in the mornings, with freezing showers, and it may snow in mountain areas above 2,400m, and even stay there for several days. The west coast is the driest part of the island. Here, the winter months are pleasant with little rain, cooler temperatures and blue skies. The summers can be extremely hot, especially in the southwest. This part of the country is semi-desert, and only gets around 300mm of rain per year."},
    {"q":"What is the most pleasant season in Madagascar?","options":["dry season","hot season","wet season","cold season"],"correct":0,"explanations":["Верно! Текст: «The dry season is cooler and more pleasant» (восточное побережье) и «the winter months are pleasant» (западное побережье, тоже сухой сезон).","«hot season» нигде не называется «pleasant» в тексте.","«wet season», наоборот, описывается как сезон сильных ветров и разрушений («strong winds... can cause a lot of damage»).","«cold season» отдельно не упоминается как «pleasant»."],"passage":"Madagascar Madagascar has two seasons, a warm, wet season from November to April, and a cooler dry season between May and October. However, different parts of the country have very different weather. The east coast is hotter and wetter, with up to 4000mm of rainfall per year. In the rainy season, there are strong winds, and these can cause a lot of damage. Avoid visiting eastern Madagascar between January and March because the weather can make road travel very difficult. The dry season is cooler and more pleasant. The high, central part of the country is much drier and cooler. About 1,400mm of rain falls in the rainy season, with some thunderstorms, but the summer is usually sunny and dry, but it can be cold, especially in the mornings, with freezing showers, and it may snow in mountain areas above 2,400m, and even stay there for several days. The west coast is the driest part of the island. Here, the winter months are pleasant with little rain, cooler temperatures and blue skies. The summers can be extremely hot, especially in the southwest. This part of the country is semi-desert, and only gets around 300mm of rain per year."},
    {"q":"What is the season with the hottest weather?","options":["summer","autumn","winter","spring"],"correct":0,"explanations":["Верно! Текст: «The summers can be extremely hot, especially in the southwest».","«autumn» вообще не упоминается в тексте.","«winter» описывается как приятный и прохладный сезон, а не жаркий.","«spring» тоже не упоминается в тексте о Мадагаскаре."],"passage":"Madagascar Madagascar has two seasons, a warm, wet season from November to April, and a cooler dry season between May and October. However, different parts of the country have very different weather. The east coast is hotter and wetter, with up to 4000mm of rainfall per year. In the rainy season, there are strong winds, and these can cause a lot of damage. Avoid visiting eastern Madagascar between January and March because the weather can make road travel very difficult. The dry season is cooler and more pleasant. The high, central part of the country is much drier and cooler. About 1,400mm of rain falls in the rainy season, with some thunderstorms, but the summer is usually sunny and dry, but it can be cold, especially in the mornings, with freezing showers, and it may snow in mountain areas above 2,400m, and even stay there for several days. The west coast is the driest part of the island. Here, the winter months are pleasant with little rain, cooler temperatures and blue skies. The summers can be extremely hot, especially in the southwest. This part of the country is semi-desert, and only gets around 300mm of rain per year."},
    {"q":"When can the weather make road travel very difficult?","options":["between November and April","between January and May","between May and October","between January and March"],"correct":3,"explanations":["«November and April» --- это общий период влажного сезона, но не тот конкретный отрезок, что назван в тексте для опасных дорог.","«January and May» --- такой период в тексте не указан.","«May and October» --- это, наоборот, сухой сезон, который описан как более приятный.","Верно! Текст: «Avoid visiting eastern Madagascar between January and March because the weather can make road travel very difficult»."],"passage":"Madagascar Madagascar has two seasons, a warm, wet season from November to April, and a cooler dry season between May and October. However, different parts of the country have very different weather. The east coast is hotter and wetter, with up to 4000mm of rainfall per year. In the rainy season, there are strong winds, and these can cause a lot of damage. Avoid visiting eastern Madagascar between January and March because the weather can make road travel very difficult. The dry season is cooler and more pleasant. The high, central part of the country is much drier and cooler. About 1,400mm of rain falls in the rainy season, with some thunderstorms, but the summer is usually sunny and dry, but it can be cold, especially in the mornings, with freezing showers, and it may snow in mountain areas above 2,400m, and even stay there for several days. The west coast is the driest part of the island. Here, the winter months are pleasant with little rain, cooler temperatures and blue skies. The summers can be extremely hot, especially in the southwest. This part of the country is semi-desert, and only gets around 300mm of rain per year."},
    {"q":"When is the wet season in Madagascar?","options":["from January to March","from November to April","from May to October","during the year"],"correct":1,"explanations":["«January to March» --- это лишь часть влажного сезона (самая опасная для дорог), а не весь его период.","Верно! Текст: «a warm, wet season from November to April».","«May to October» --- это, наоборот, сухой сезон.","«during the year» слишком расплывчато и не отвечает на конкретный вопрос о датах."],"passage":"Madagascar Madagascar has two seasons, a warm, wet season from November to April, and a cooler dry season between May and October. However, different parts of the country have very different weather. The east coast is hotter and wetter, with up to 4000mm of rainfall per year. In the rainy season, there are strong winds, and these can cause a lot of damage. Avoid visiting eastern Madagascar between January and March because the weather can make road travel very difficult. The dry season is cooler and more pleasant. The high, central part of the country is much drier and cooler. About 1,400mm of rain falls in the rainy season, with some thunderstorms, but the summer is usually sunny and dry, but it can be cold, especially in the mornings, with freezing showers, and it may snow in mountain areas above 2,400m, and even stay there for several days. The west coast is the driest part of the island. Here, the winter months are pleasant with little rain, cooler temperatures and blue skies. The summers can be extremely hot, especially in the southwest. This part of the country is semi-desert, and only gets around 300mm of rain per year."},
    {"q":"What is the driest part of Madagascar?","options":["the west coast","the southern coast","the east coast","the northern coast"],"correct":0,"explanations":["Верно! Текст: «The west coast is the driest part of the island».","«southern coast» отдельно не упоминается в тексте как самостоятельный регион.","«east coast», наоборот, назван самым влажным («hotter and wetter»).","«northern coast» вообще не упоминается в тексте."],"passage":"Madagascar Madagascar has two seasons, a warm, wet season from November to April, and a cooler dry season between May and October. However, different parts of the country have very different weather. The east coast is hotter and wetter, with up to 4000mm of rainfall per year. In the rainy season, there are strong winds, and these can cause a lot of damage. Avoid visiting eastern Madagascar between January and March because the weather can make road travel very difficult. The dry season is cooler and more pleasant. The high, central part of the country is much drier and cooler. About 1,400mm of rain falls in the rainy season, with some thunderstorms, but the summer is usually sunny and dry, but it can be cold, especially in the mornings, with freezing showers, and it may snow in mountain areas above 2,400m, and even stay there for several days. The west coast is the driest part of the island. Here, the winter months are pleasant with little rain, cooler temperatures and blue skies. The summers can be extremely hot, especially in the southwest. This part of the country is semi-desert, and only gets around 300mm of rain per year."},
    {"q":"According to the researcher Nina Kraus playing a musical instrument:","options":["can boost a person's hearing ability","can boost a person's dancing skills","can boost a person's ability to talk in a noisy room","can boost a person's writing skills"],"correct":0,"explanations":["Верно! Текст: «playing a musical instrument can improve a person's hearing ability».","«dancing skills» вообще не упоминаются в тексте.","«ability to talk in a noisy room» --- в тексте речь о способности СЛЫШАТЬ в шумной комнате, а не говорить.","«writing skills» тоже не упоминаются как результат исследования Kraus."],"passage":"A MUSICAL BOOST Is there a connection between music and language? According to recent studies, the answer is yes: music boosts certain language abilities in the brain. Here, we look at two examples. Music and Hearing A recent study by researcher Nina Kraus shows that playing a musical instrument can improve a person's hearing ability. As a part of the study, two groups of people listened to a person talking in a noisy room. The people in the first group were musicians, while those in the second group had no musical training. The musicians were able to hear the talking person more clearly. Musicians hear better, says Kraus, because they learn to pay attention to certain sounds. Think about violinists in an orchestra. When the violinists play with the group, they hear their own instrument and many others too. But the violinists must listen closely to what they are playing, and ignore the other sounds. In this way, musicians are able to concentrate on certain sounds, even in a room with lots of noise. Music and Speaking Gottfried Schlaug, a doctor at Harvard Medical School, works with stroke patients. Because of their illness, these people cannot say their names, addresses, or other information normally. However, they can still sing. Dr. Schlaug was surprised to find that singing words helped his patients to eventually speak. Why does this work? Schlaug isn't sure. Music seems to activate different parts of the brain, including the damaged parts. This somehow helps patients to use that part of the brain again. Understanding the Results Music improves concentration, memory, listening skills, and our overall language abilities. It can even help sick people get better. Playing an instrument or singing, says Nina Kraus, can help us do better in school and keep our brain sharp as we get older. Music, she adds is not only enjoyable, it's also good for us in many other ways."},
    {"q":"Music improves:","options":["hearing abilities in the brain","reading skills in the brain","writing skills in the brain","language abilities in the brain"],"correct":3,"explanations":["«hearing abilities» --- это лишь ЧАСТЬ исследования (раздел «Music and Hearing»), не главный обобщающий вывод всего текста.","«reading skills» нигде не упоминаются в тексте.","«writing skills» тоже не упоминаются.","Верно! Заголовок статьи и раздел «Understanding the Results» обобщают: «music boosts certain language abilities in the brain» / «our overall language abilities»."],"passage":"A MUSICAL BOOST Is there a connection between music and language? According to recent studies, the answer is yes: music boosts certain language abilities in the brain. Here, we look at two examples. Music and Hearing A recent study by researcher Nina Kraus shows that playing a musical instrument can improve a person's hearing ability. As a part of the study, two groups of people listened to a person talking in a noisy room. The people in the first group were musicians, while those in the second group had no musical training. The musicians were able to hear the talking person more clearly. Musicians hear better, says Kraus, because they learn to pay attention to certain sounds. Think about violinists in an orchestra. When the violinists play with the group, they hear their own instrument and many others too. But the violinists must listen closely to what they are playing, and ignore the other sounds. In this way, musicians are able to concentrate on certain sounds, even in a room with lots of noise. Music and Speaking Gottfried Schlaug, a doctor at Harvard Medical School, works with stroke patients. Because of their illness, these people cannot say their names, addresses, or other information normally. However, they can still sing. Dr. Schlaug was surprised to find that singing words helped his patients to eventually speak. Why does this work? Schlaug isn't sure. Music seems to activate different parts of the brain, including the damaged parts. This somehow helps patients to use that part of the brain again. Understanding the Results Music improves concentration, memory, listening skills, and our overall language abilities. It can even help sick people get better. Playing an instrument or singing, says Nina Kraus, can help us do better in school and keep our brain sharp as we get older. Music, she adds is not only enjoyable, it's also good for us in many other ways."},
    {"q":"Find the true statement","options":["Nina Kraus plays in an orchestra","Nina Kraus is a graduate of Harvard University","Nina Kraus is a researcher","Nina Kraus is a violinist"],"correct":2,"explanations":["Про скрипачей в оркестре текст говорит в общем примере, а не про саму Нину Краус лично.","Выпускник Гарварда в тексте --- это Готфрид Шлауг (Gottfried Schlaug), а не Нина Краус --- их легко перепутать, будьте внимательны.","Верно! Текст: «A recent study by researcher Nina Kraus...» --- она прямо названа исследователем.","Про то, что Краус --- скрипачка, в тексте ничего не сказано."],"passage":"A MUSICAL BOOST Is there a connection between music and language? According to recent studies, the answer is yes: music boosts certain language abilities in the brain. Here, we look at two examples. Music and Hearing A recent study by researcher Nina Kraus shows that playing a musical instrument can improve a person's hearing ability. As a part of the study, two groups of people listened to a person talking in a noisy room. The people in the first group were musicians, while those in the second group had no musical training. The musicians were able to hear the talking person more clearly. Musicians hear better, says Kraus, because they learn to pay attention to certain sounds. Think about violinists in an orchestra. When the violinists play with the group, they hear their own instrument and many others too. But the violinists must listen closely to what they are playing, and ignore the other sounds. In this way, musicians are able to concentrate on certain sounds, even in a room with lots of noise. Music and Speaking Gottfried Schlaug, a doctor at Harvard Medical School, works with stroke patients. Because of their illness, these people cannot say their names, addresses, or other information normally. However, they can still sing. Dr. Schlaug was surprised to find that singing words helped his patients to eventually speak. Why does this work? Schlaug isn't sure. Music seems to activate different parts of the brain, including the damaged parts. This somehow helps patients to use that part of the brain again. Understanding the Results Music improves concentration, memory, listening skills, and our overall language abilities. It can even help sick people get better. Playing an instrument or singing, says Nina Kraus, can help us do better in school and keep our brain sharp as we get older. Music, she adds is not only enjoyable, it's also good for us in many other ways."},
    {"q":"The text is about:","options":["different instruments and musicians","brain functioning and different types of patients","playing different types of musical instruments","a connection between music and language abilities"],"correct":3,"explanations":["«different instruments and musicians» --- слишком узко, это лишь часть содержания (пример со скрипачами).","«brain functioning and different types of patients» --- тоже описывает только один из двух примеров текста (пациенты Шлауга).","«playing different types of musical instruments» --- текст не сравнивает разные инструменты между собой.","Верно! Первое предложение текста задаёт главную тему: «Is there a connection between music and language?» --- именно эта связь и есть тема всего текста."],"passage":"A MUSICAL BOOST Is there a connection between music and language? According to recent studies, the answer is yes: music boosts certain language abilities in the brain. Here, we look at two examples. Music and Hearing A recent study by researcher Nina Kraus shows that playing a musical instrument can improve a person's hearing ability. As a part of the study, two groups of people listened to a person talking in a noisy room. The people in the first group were musicians, while those in the second group had no musical training. The musicians were able to hear the talking person more clearly. Musicians hear better, says Kraus, because they learn to pay attention to certain sounds. Think about violinists in an orchestra. When the violinists play with the group, they hear their own instrument and many others too. But the violinists must listen closely to what they are playing, and ignore the other sounds. In this way, musicians are able to concentrate on certain sounds, even in a room with lots of noise. Music and Speaking Gottfried Schlaug, a doctor at Harvard Medical School, works with stroke patients. Because of their illness, these people cannot say their names, addresses, or other information normally. However, they can still sing. Dr. Schlaug was surprised to find that singing words helped his patients to eventually speak. Why does this work? Schlaug isn't sure. Music seems to activate different parts of the brain, including the damaged parts. This somehow helps patients to use that part of the brain again. Understanding the Results Music improves concentration, memory, listening skills, and our overall language abilities. It can even help sick people get better. Playing an instrument or singing, says Nina Kraus, can help us do better in school and keep our brain sharp as we get older. Music, she adds is not only enjoyable, it's also good for us in many other ways."},
    {"q":"The reason why musicians can hear better is","options":["that they use certain language abilities in the brain","that they are trained to sing and play different instruments","that they are trained to pay attention to particular sounds","that they hear their own instruments and many others"],"correct":2,"explanations":["«language abilities» относится к другому разделу текста (Music and Speaking), а не к причине лучшего слуха музыкантов.","«trained to sing and play different instruments» --- искажает формулировку текста, речь не про обучение пению.","Верно! Текст: «Musicians hear better, says Kraus, because they learn to pay attention to certain sounds» --- прямая причинно-следственная связь.","«hear their own instruments and many others» --- это описание ситуации скрипачей в оркестре (контекст), а не сама названная ПРИЧИНА лучшего слуха."],"passage":"A MUSICAL BOOST Is there a connection between music and language? According to recent studies, the answer is yes: music boosts certain language abilities in the brain. Here, we look at two examples. Music and Hearing A recent study by researcher Nina Kraus shows that playing a musical instrument can improve a person's hearing ability. As a part of the study, two groups of people listened to a person talking in a noisy room. The people in the first group were musicians, while those in the second group had no musical training. The musicians were able to hear the talking person more clearly. Musicians hear better, says Kraus, because they learn to pay attention to certain sounds. Think about violinists in an orchestra. When the violinists play with the group, they hear their own instrument and many others too. But the violinists must listen closely to what they are playing, and ignore the other sounds. In this way, musicians are able to concentrate on certain sounds, even in a room with lots of noise. Music and Speaking Gottfried Schlaug, a doctor at Harvard Medical School, works with stroke patients. Because of their illness, these people cannot say their names, addresses, or other information normally. However, they can still sing. Dr. Schlaug was surprised to find that singing words helped his patients to eventually speak. Why does this work? Schlaug isn't sure. Music seems to activate different parts of the brain, including the damaged parts. This somehow helps patients to use that part of the brain again. Understanding the Results Music improves concentration, memory, listening skills, and our overall language abilities. It can even help sick people get better. Playing an instrument or singing, says Nina Kraus, can help us do better in school and keep our brain sharp as we get older. Music, she adds is not only enjoyable, it's also good for us in many other ways."},
    {"q":"The synonym of improve is","options":["roast","toast","goast","boost"],"correct":3,"explanations":["«roast» (жарить) --- не связано по смыслу, просто похоже по звучанию --- отвлекающий вариант.","«toast» (тост) --- тоже совпадает лишь по звучанию, не по смыслу.","«goast» --- вообще не является настоящим английским словом.","Верно! В тексте слова «improve» и «boost» используются как синонимы: «music boosts certain language abilities» = «music improves...»."],"passage":"A MUSICAL BOOST Is there a connection between music and language? According to recent studies, the answer is yes: music boosts certain language abilities in the brain. Here, we look at two examples. Music and Hearing A recent study by researcher Nina Kraus shows that playing a musical instrument can improve a person's hearing ability. As a part of the study, two groups of people listened to a person talking in a noisy room. The people in the first group were musicians, while those in the second group had no musical training. The musicians were able to hear the talking person more clearly. Musicians hear better, says Kraus, because they learn to pay attention to certain sounds. Think about violinists in an orchestra. When the violinists play with the group, they hear their own instrument and many others too. But the violinists must listen closely to what they are playing, and ignore the other sounds. In this way, musicians are able to concentrate on certain sounds, even in a room with lots of noise. Music and Speaking Gottfried Schlaug, a doctor at Harvard Medical School, works with stroke patients. Because of their illness, these people cannot say their names, addresses, or other information normally. However, they can still sing. Dr. Schlaug was surprised to find that singing words helped his patients to eventually speak. Why does this work? Schlaug isn't sure. Music seems to activate different parts of the brain, including the damaged parts. This somehow helps patients to use that part of the brain again. Understanding the Results Music improves concentration, memory, listening skills, and our overall language abilities. It can even help sick people get better. Playing an instrument or singing, says Nina Kraus, can help us do better in school and keep our brain sharp as we get older. Music, she adds is not only enjoyable, it's also good for us in many other ways."},
    {"q":"Music helps people to improve","options":["sleeping, swimming and walking","memory, listening and concentration","writing, listening and painting","reading, speaking and dancing"],"correct":1,"explanations":["«sleeping, swimming and walking» не упоминаются в тексте вообще.","Верно! Текст: «Music improves concentration, memory, listening skills...».","«writing» и «painting» не упоминаются в тексте, хотя «listening» действительно верно --- но остальные слова в варианте неверны.","«reading, speaking and dancing» тоже не соответствуют перечню из текста."],"passage":"A MUSICAL BOOST Is there a connection between music and language? According to recent studies, the answer is yes: music boosts certain language abilities in the brain. Here, we look at two examples. Music and Hearing A recent study by researcher Nina Kraus shows that playing a musical instrument can improve a person's hearing ability. As a part of the study, two groups of people listened to a person talking in a noisy room. The people in the first group were musicians, while those in the second group had no musical training. The musicians were able to hear the talking person more clearly. Musicians hear better, says Kraus, because they learn to pay attention to certain sounds. Think about violinists in an orchestra. When the violinists play with the group, they hear their own instrument and many others too. But the violinists must listen closely to what they are playing, and ignore the other sounds. In this way, musicians are able to concentrate on certain sounds, even in a room with lots of noise. Music and Speaking Gottfried Schlaug, a doctor at Harvard Medical School, works with stroke patients. Because of their illness, these people cannot say their names, addresses, or other information normally. However, they can still sing. Dr. Schlaug was surprised to find that singing words helped his patients to eventually speak. Why does this work? Schlaug isn't sure. Music seems to activate different parts of the brain, including the damaged parts. This somehow helps patients to use that part of the brain again. Understanding the Results Music improves concentration, memory, listening skills, and our overall language abilities. It can even help sick people get better. Playing an instrument or singing, says Nina Kraus, can help us do better in school and keep our brain sharp as we get older. Music, she adds is not only enjoyable, it's also good for us in many other ways."},
    {"q":"The synonym of \"to ignore\":","options":["to look for","to vote for","to pay no attention to","to stay for"],"correct":2,"explanations":["«to look for» (искать) --- противоположный смысл, не синоним.","«to vote for» (голосовать за) --- вообще из другой смысловой области.","Верно! В тексте: «...ignore the other sounds» = «не обращать внимания на другие звуки» = «to pay no attention to».","«to stay for» (оставаться ради) --- не связано по смыслу со словом «ignore»."],"passage":"A MUSICAL BOOST Is there a connection between music and language? According to recent studies, the answer is yes: music boosts certain language abilities in the brain. Here, we look at two examples. Music and Hearing A recent study by researcher Nina Kraus shows that playing a musical instrument can improve a person's hearing ability. As a part of the study, two groups of people listened to a person talking in a noisy room. The people in the first group were musicians, while those in the second group had no musical training. The musicians were able to hear the talking person more clearly. Musicians hear better, says Kraus, because they learn to pay attention to certain sounds. Think about violinists in an orchestra. When the violinists play with the group, they hear their own instrument and many others too. But the violinists must listen closely to what they are playing, and ignore the other sounds. In this way, musicians are able to concentrate on certain sounds, even in a room with lots of noise. Music and Speaking Gottfried Schlaug, a doctor at Harvard Medical School, works with stroke patients. Because of their illness, these people cannot say their names, addresses, or other information normally. However, they can still sing. Dr. Schlaug was surprised to find that singing words helped his patients to eventually speak. Why does this work? Schlaug isn't sure. Music seems to activate different parts of the brain, including the damaged parts. This somehow helps patients to use that part of the brain again. Understanding the Results Music improves concentration, memory, listening skills, and our overall language abilities. It can even help sick people get better. Playing an instrument or singing, says Nina Kraus, can help us do better in school and keep our brain sharp as we get older. Music, she adds is not only enjoyable, it's also good for us in many other ways."}
  ],
};

const KT_LANG_STAGE_LABELS = { listening: 'Listening', grammar: 'Grammar', reading: 'Reading' };

// ТГО — реальный банк (15 Математика + 15 Русский язык = 30).
const KT_LOGIC_POOL = [
  {"image":"assets/math-tgo/q1.png","q":"Если |a b; c d| = ad − bc, то вычислите |3 4; -2 8| =","options":["-4","26","16","32","20"],"correct":3,"explanations":["неверно --- похоже на ошибку в знаках при перемножении элементов определителя.","неверно --- не соответствует формуле ad−bc для данных чисел.","получится, если по ошибке подставить c=2 вместо c=−2: 3×8−4×2=24−8=16 --- знак потерян.","Верно! ad−bc = 3×8 − 4×(−2) = 24 − (−8) = 24+8 = 32.","неверно --- не соответствует правильному вычислению."]},
  {"image":"assets/math-tgo/q2.png","q":"Если площадь прямоугольника ABCD будет равна 70, то найдите площадь квадрата EFGH.","options":["249","281","209","156","176"],"correct":1,"explanations":["неверное значение --- не получается при правильном решении уравнения.","Верно! Площадь ABCD = (x+3)(x+2) = 70 ⟹ x²+5x−64=0. Сторона квадрата = 2x+5 = √281 (числа подобраны так, что 2x+5 при решении уравнения даёт ровно √281), значит площадь квадрата = (√281)² = 281.","неверное значение --- не соответствует решению.","неверное значение --- не соответствует решению.","неверное значение --- не соответствует решению."]},
  {"image":"assets/math-tgo/q3.png","q":"Сравните величины A и B. A = 0,3⁵/0,3³. B: 0,1x − 0,001 = 0,01, найдите x.","options":["Недостаточно информации для сравнения","Величины равны","Величина B больше","Величина A больше"],"correct":2,"explanations":["неверно --- обе величины вычисляются однозначно, сравнить можно.","неверно --- A=0,09, а B=0,11, значения разные.","Верно! A = 0,3⁵∕0,3³ = 0,3² = 0,09. B: 0,1x=0,011 ⟹ x=0,11. Так как 0,11 > 0,09, величина B больше.","неверно --- всё наоборот, B больше, а не A."]},
  {"image":"assets/math-tgo/q4.png","q":"Если f(x) = ax² − x и f(3) = 6, то определите значение f(−2).","options":["-2","-8","1","4","6"],"correct":4,"explanations":["неверно --- результат ошибки при подстановке.","неверно --- результат ошибки при нахождении a или подстановке.","неверно --- не соответствует правильному вычислению.","неверно --- не соответствует правильному вычислению.","Верно! Из f(3)=6: 9a−3=6 ⟹ a=1, то есть f(x)=x²−x. Тогда f(−2) = (−2)² − (−2) = 4+2 = 6."]},
  {"image":"assets/math-tgo/q5.png","q":"Промежуток, показывающий решение неравенства x² + 4 < 0","options":["x∈∅","x∈(−2;2)","x∈(−∞;−2)∪(−2;2)∪(2;+∞)","x∈(−∞;−2)∪(2;+∞)","x∈(−∞;+∞)"],"correct":0,"explanations":["Верно! x² всегда ≥ 0 для любого x, значит x²+4 ≥ 4 > 0 всегда. Неравенство x²+4<0 не выполняется никогда, решений нет.","это было бы решением другого неравенства (например, x²−4<0), а не x²+4<0.","не относится к данному неравенству, здесь перепутаны знаки.","не относится к данному неравенству.","это было бы решением неравенства x²+4>0 (верного всегда), а не «<0»."]},
  {"image":"assets/math-tgo/q6.png","q":"Произведение 5² · 9² · 3³ заканчивается цифрой","options":["3","2","5","1","0"],"correct":2,"explanations":["неверно --- не совпадает с последней цифрой произведения.","неверно --- не совпадает.","Верно! 5²·9²·3³ = 25×81×27. 25×81=2025 (оканчивается на 5), 2025×27=54675 --- оканчивается на 5.","неверно --- не совпадает.","неверно --- произведение не кратно 10, так как среди множителей нет числа, дающего в конце 0."]},
  {"image":"assets/math-tgo/q7.png","q":"Если a=1, b=1, то вычислите значение выражения (√3a⁻²b − √27ab⁻²) / √3a⁻²b⁻²","options":["1","-2","9","-1","-9"],"correct":1,"explanations":["неверно --- не соответствует вычислению.","Верно! При a=1,b=1: числитель = √3 − √27 = √3 − 3√3 = −2√3; знаменатель = √3. Итог: −2√3 / √3 = −2.","неверно --- не соответствует вычислению.","неверно --- похоже на потерю множителя 2 в ответе.","неверно --- не соответствует вычислению."]},
  {"image":"assets/math-tgo/q8.png","q":"Сравните A и B. A: решите уравнение (x−7)(x+7)+49=0. B: 7³ − 343 =","options":["Величина B больше","Недостаточно информации для сравнения","Величина A больше","Величины равны"],"correct":3,"explanations":["неверно --- обе величины равны 0.","неверно --- обе величины вычисляются точно.","неверно --- обе величины равны 0.","Верно! A: (x−7)(x+7)+49=0 ⟹ x²−49+49=0 ⟹ x²=0 ⟹ x=0. B: 7³−343 = 343−343 = 0. Обе величины равны 0."]},
  {"image":"assets/math-tgo/q9.png","q":"Решите неравенство |2x−1| > 1 и укажите верный промежуток для переменной x","options":["x∈(−∞;+∞)","x∈(−∞;0)∪(1;+∞)","x∈∅","x∈(0;1)","x∈(−1;+∞)"],"correct":1,"explanations":["неверно --- неравенство выполняется не для всех x (например, x=0,5 не подходит).","Верно! |2x−1|>1 ⟹ 2x−1>1 или 2x−1<−1 ⟹ x>1 или x<0, то есть x∈(−∞;0)∪(1;+∞).","неверно --- решения существуют.","неверно --- это как раз промежуток, где неравенство НЕ выполняется.","неверно --- не соответствует решению."]},
  {"image":"assets/math-tgo/q10.png","q":"Опрос 150 учащихся: 68 --- алгебра, 68 --- химия, 80 --- физика; 28 алгебра и химия, 35 алгебра и физика, 30 физика и химия, 20 --- все три предмета. Сколько не выбрали или им не нравится ни один из предметов?","options":["7","4","5","6","8"],"correct":0,"explanations":["Верно! По формуле включений-исключений: |A∪Х∪Ф| = 68+68+80−28−35−30+20 = 143. Не выбрали ни один предмет: 150−143 = 7.","неверно --- не соответствует расчёту по формуле включений-исключений.","неверно --- не соответствует расчёту.","неверно --- не соответствует расчёту.","неверно --- не соответствует расчёту."]},
  {"image":"assets/math-tgo/q11.png","q":"Таблица зарплат: 5 работников×100000, 4×112000, 8×118000, 3×125000. Вычислите среднюю заработную плату.","options":["117 650","115 150","114 850","119 900","113 350"],"correct":4,"explanations":["неверно --- не соответствует расчёту средневзвешенного значения.","неверно --- не соответствует расчёту.","неверно --- не соответствует расчёту.","неверно --- не соответствует расчёту.","Верно! Сумма = 5×100000+4×112000+8×118000+3×125000 = 500000+448000+944000+375000 = 2 267 000. Количество работников = 20. Средняя = 2 267 000 / 20 = 113 350."]},
  {"image":"assets/math-tgo/q12.png","q":"Найдите угол x°. Треугольник с углами (y°+x°), (70°−y°) и 85°.","options":["30°","10°","45°","25°","20°"],"correct":3,"explanations":["неверно --- не соответствует расчёту суммы углов треугольника.","неверно --- не соответствует расчёту.","неверно --- не соответствует расчёту.","Верно! Сумма углов треугольника = 180°: (y+x)+(70−y)+85=180 ⟹ x+155=180 ⟹ x=25°. Слагаемые y взаимно уничтожаются.","неверно --- не соответствует расчёту."]},
  {"image":"assets/math-tgo/q13.png","q":"Сравните A и B. A: сумма чисел 7,8,16,19 равна сумме чисел 3,4,x и x+3 --- найдите x. B: наибольшее простое число между 10 и 20.","options":["Величина A больше","Недостаточно информации для сравнения","Величины равны","Величина B больше"],"correct":0,"explanations":["Верно! A: 7+8+16+19=50; 3+4+x+(x+3)=50 ⟹ 2x+10=50 ⟹ x=20. B: наибольшее простое число между 10 и 20 --- это 19. Так как 20>19, величина A больше.","неверно --- обе величины вычисляются однозначно.","неверно --- 20 ≠ 19, величины не равны.","неверно --- 19<20, величина B меньше, а не больше."]},
  {"image":"assets/math-tgo/q14.png","q":"Если |5x−4| > 2 и x < 1, то x примет одно из следующих значений","options":["-0,6","0,6","1","0,5","1,3"],"correct":0,"explanations":["Верно! |5x−4|>2 ⟹ 5x−4>2 или 5x−4<−2 ⟹ x>1,2 или x<0,4. С учётом условия x<1 остаётся только x<0,4 --- этому удовлетворяет −0,6.","неверно --- 0,6 не входит ни в x<0,4, ни в x>1,2, поэтому не удовлетворяет неравенству.","неверно --- x=1 не удовлетворяет условию x<1 (не строго меньше единицы).","неверно --- 0,5 не входит ни в один из промежутков решения (x<0,4 или x>1,2).","неверно --- хотя 1,3>1,2 удовлетворяет неравенству, оно противоречит условию x<1."]},
  {"image":"assets/math-tgo/q15.png","q":"Если d>a и P<a, то одно из следующих выражений будет неверно","options":["d−P=3","P−a=5","P−a=−5","P−d=−12","P+d=12"],"correct":1,"explanations":["может быть верным --- так как d>a>P, разность d−P положительна, значение 3 не противоречит условию.","Верно, это НЕВЕРНОЕ выражение! Так как P<a, разность P−a обязательно отрицательна. Значение +5 (положительное) противоречит этому условию.","может быть верным --- P−a=−5 (отрицательное значение) полностью соответствует условию P<a.","может быть верным --- так как d>P, разность P−d отрицательна, значение −12 не противоречит условию.","может быть верным --- сумма P+d не ограничена условиями задачи, значение 12 не противоречит ничему."]},
  {"q":"...покрыл город столь быстро, что люди были застигнуты на ступеньках лестниц, а в сосудах даже сохранилась пища (о Помпеях).","options":["сумрак","холод","потоп","голод","пепел"],"correct":4,"explanations":["не подходит по смыслу --- «сумрак» не может физически «покрыть город» и сохранить предметы под собой.","не подходит --- холод не оставляет вещественных следов такого рода и не «покрывает» город слоем.","не подходит по историческому факту --- Помпеи погибли не от наводнения, а от извержения вулкана Везувий.","не подходит по смыслу --- голод не может «покрыть город» физически.","Верно! Помпеи были засыпаны пеплом при извержении Везувия в 79 г. н.э. --- именно пепел мгновенно покрыл город, сохранив предметы и тела."]},
  {"q":"Значение этих данных зачастую остается ... до тех пор, пока он не вернется в лабораторию и не проанализирует их.","options":["неизменным","постоянным","неясным","важным","неважным"],"correct":2,"explanations":["не подходит по смыслу --- речь не о том, меняются ли данные, а о понимании их значения.","не подходит по смыслу --- «постоянным» не связано с необходимостью анализа для понимания.","Верно! Смысл предложения: значение данных остаётся НЕЯСНЫМ (непонятным) до анализа в лаборатории --- именно анализ раскрывает их смысл.","не подходит логически --- если данные уже «важны», это не объясняет, зачем нужен анализ.","противоречит смыслу текста --- весь абзац посвящён ценности данных для науки, они не «неважны»."]},
  {"q":"Ключом к культуре является ее понимание как системы символов. Наиболее распространенной символической системой является ... как средство устного и письменного общения.","options":["баллада","язык","высказывание","диалог","монолог"],"correct":1,"explanations":["не подходит --- баллада это литературный жанр, не «средство устного и письменного общения» в целом.","Верно! Язык --- это универсальная символическая система, служащая средством и устного, и письменного общения, о которой дальше идёт речь применительно к лингвистам.","не подходит --- высказывание это лишь единица речи, а не целая символическая система.","не подходит --- диалог это форма общения, а не сама символическая система.","не подходит --- монолог тоже лишь форма речи, а не система символов в целом."]},
  {"q":"Согласно содержанию текста верным является утверждение, что","options":["жизнь на Земле появилась практически одновременно с ее образованием","существование воды на планете в определенный период можно доказать по составу и строению кристаллов некоторых элементов","самое раннее свидетельство жизни - облегченный изотопный состав углерода, обнаруженный в Австралии","самое раннее свидетельство жизни - облегченный изотопный состав углерода, обнаруженный в Южной Африке","существование воды на планете в определенный период доказать невозможно"],"correct":1,"explanations":["не подтверждается напрямую --- текст лишь предполагает, что жизнь появилась «не очень долго» после образования Земли, но точных доказательств для первых 700--800 млн лет нет.","Верно! Текст прямо говорит: кристаллы циркона возрастом 4,4 млрд лет --- их «строение и изотопный состав... позволяют предположить, что они сформировались в присутствии воды».","ошибка в географии --- самое раннее свидетельство жизни (изотопный состав углерода) найдено в Гренландии, а не в Австралии (в Австралии найдены кристаллы циркона --- свидетельство ВОДЫ, а не жизни).","ошибка --- Южная Африка упоминается в связи с ископаемыми микроорганизмами возрастом 3,5 млрд лет, а не как самое РАННЕЕ свидетельство (самое раннее --- 3,8 млрд лет, Гренландия).","противоречит тексту --- существование воды доказывается по кристаллам циркона, то есть доказать можно."]},
  {"q":"Согласно содержанию текста верным является утверждение, что","options":["следы возникновения жизни на Земле можно найти в вулканических породах","возраст Земли составляет 700-800 млн лет","самым ранним свидетельствам образования воды на Земле 3,8 млрд лет","жизнь на Земле появилась раньше гидросферы","вода на Земле появилась практически одновременно с образованием планеты"],"correct":4,"explanations":["противоречит тексту --- текст говорит, что НЕ сохранилось осадочных пород для древнейшего периода, о вулканических породах речи вообще нет.","ошибка --- 700-800 млн лет это период, за который НЕ СОХРАНИЛОСЬ следов, а не возраст Земли (возраст Земли --- 4,5--4,6 млрд лет).","ошибка --- 3,8 млрд лет это возраст самого раннего свидетельства ЖИЗНИ, а не воды (свидетельство воды --- кристаллы циркона возрастом 4,4 млрд лет).","противоречит тексту --- гидросфера (4,4 млрд лет) появилась раньше самого раннего свидетельства жизни (3,8 млрд лет), а не наоборот.","Верно! Земля сформировалась 4,5--4,6 млрд лет назад, а гидросфера (согласно кристаллам циркона) появилась уже 4,4 млрд лет назад --- то есть «очень рано», практически сразу после образования планеты."]},
  {"q":"Слово «следы» в тексте означает","options":["характеристики","свидетельства","соотношения","отпечатки","оттиски"],"correct":1,"explanations":["не подходит по контексту --- «характеристики» не передают смысл вещественных доказательств прошлого.","Верно! В контексте «более достоверные следы жизни» слово «следы» означает именно СВИДЕТЕЛЬСТВА, доказательства существования чего-либо в прошлом.","не подходит по смыслу --- «соотношения» относится к математическим пропорциям, а не к доказательствам.","частично близко, но «отпечатки» подразумевает физический оттиск формы, а в тексте речь об изотопном составе --- то есть о свидетельстве, а не форме.","аналогично --- «оттиски» это буквальный физический след формы, не подходит для описания изотопных данных."]},
  {"q":"Коммуникативная цель текста -- рассказать","options":["о театрах в Бостоне, Чикаго и Филадельфии","о зарождении и развитии американского театрального искусства","о драматургии Северной Америки","об английской драматургии времен Шекспира","об эстетических канонах бродвейских постановок"],"correct":1,"explanations":["слишком узко --- это лишь один эпизод из середины текста, не отражающий весь текст целиком.","Верно! Текст последовательно охватывает всю историю: от миссионеров XVII века, через первый театр 1751 года, коммерческий театр XIX-XX века, Бродвей, до студий начала XX века --- то есть зарождение и развитие американского театра.","слишком узко --- текст говорит не только о драматургии, но и об актёрах, режиссёрах, институтах театра.","не по теме --- английская драматургия времён Шекспира упоминается лишь мимоходом как репертуар первого американского театра.","слишком узко --- это лишь часть содержания одного абзаца, а не цель всего текста."]},
  {"q":"В последнем абзаце текста говорится","options":["об особенностях европейского театра","о реформаторской деятельности М. Рейнхардта","о творчестве Юджина О'Нила","о театральной деятельности Кука и Ленгнера","о методике К.С. Станиславского и Вл. И. Немировича-Данченко"],"correct":3,"explanations":["не главная тема абзаца --- европейский театр упомянут лишь как ориентир для Кука и Ленгнера, не как основной предмет разговора.","не главная тема --- Рейнхардт упомянут вскользь в перечислении, наравне с другими режиссёрами.","неточно --- О'Нил упомянут лишь в последнем предложении как открытие Кука, это не главная тема всего абзаца.","Верно! Весь абзац посвящён студиям «Провинстаун плейерс» и «Вашингтон сквер» и их руководителям --- Дж. Куку и Л. Ленгнеру, их деятельности и взглядам.","не главная тема --- Станиславский и Немирович-Данченко упомянуты лишь как образец для подражания, а не предмет рассказа."]},
  {"q":"Автор текста утверждает, что","options":["американский театр последних двух веков существует как коммерческое предприятие","европейский театр не оказал никакого влияния на творчество Кука и Ленгнера","постоянные театры возникли в Северной Америке в 20 веке","постоянные театры стали законодателями театральной моды","на Бродвее можно увидеть только развлекательные шоу"],"correct":0,"explanations":["Верно! Текст прямо говорит: «Американский театр XIX --- начала XX в. следовал исключительно коммерческим законам», а также что Бродвей «сохранил эти позиции до сих пор» --- то есть коммерческий характер сохраняется два века.","противоречит тексту --- сказано, что Кук и Ленгнер «ориентировались на опыт современного им европейского театра», то есть влияние было.","противоречит тексту --- постоянные театры возникли «в середине XIX в.», а не в XX веке.","неточно --- законодателем театральной моды стал именно Бродвей, а не «постоянные театры» в целом.","противоречит тексту --- прямо сказано, что на Бродвее ставились «не одни лишь второсортные пьесы... но и произведения лучших американских драматургов»."]},
  {"q":"В тексте активно используются","options":["профессионализмы","терминологическая лексика","общественно-политическая лексика","жаргонизмы","диалектизмы"],"correct":1,"explanations":["неточно --- профессионализмы это неофициальные обозначения внутри профессии, а в тексте используются именно официальные термины искусствоведения.","Верно! Слова «киноискусство», «изобразительное», «режиссерское творчество» --- это специальные термины из области искусствоведения, то есть терминологическая лексика.","не подходит --- в тексте нет политической или общественной лексики, только искусствоведческая.","не подходит --- жаргонизмы это неформальная лексика узких групп, в тексте её нет.","не подходит --- диалектизмы это региональные слова, в тексте используется нейтральная научная лексика."]},
  {"q":"С функционально-стилистической точки зрения текст относится","options":["к публицистическому стилю","к научному стилю","к разговорному стилю","к официально-деловому стилю","к художественному стилю"],"correct":1,"explanations":["не подходит --- в публицистике присутствует эмоциональная оценка и призыв, здесь же нейтральное определение понятия.","Верно! Текст даёт чёткое, объективное определение термина «киноискусство» с использованием терминологии --- это характерно именно для научного стиля.","не подходит --- в тексте нет разговорных оборотов, он строго формален.","не подходит --- нет характерных для официально-делового стиля клише, регламентов, формуляров.","не подходит --- нет образности, метафор, эмоциональности, характерных для художественного стиля."]},
  {"q":"Со стилевой точки зрения текст характеризуется","options":["эмоциональностью","строгой логичностью","образностью","отсутствием логичности","оценочностью"],"correct":1,"explanations":["не подходит --- научный стиль, к которому относится текст, избегает эмоциональности.","Верно! Текст логично и последовательно определяет понятие через перечисление составляющих (слияние искусств) --- это признак строгой логичности научного стиля.","не подходит --- в тексте нет метафор и художественных образов.","противоречит тексту --- определение выстроено чётко и последовательно, логика прослеживается ясно.","не подходит --- текст объективен, не содержит личной оценки автора."]},
  {"q":"Ключевые слова общие для обоих текстов","options":["пьеса, гуманист, гармония, надежда","«Укрощение строптивой», «Много шума из ничего», «Сон в летнюю ночь»","катастрофа, хаос, разрушение, персонаж","театр, комедия, актер, пьеса","театр, искусство, Франция, Англия, Древний Рим"],"correct":3,"explanations":["«гуманист», «гармония», «надежда» встречаются только во втором тексте (о Шекспире), в тексте о Мольере таких слов нет.","это названия пьес --- они относятся только к Тексту 2 (Шекспир), в Тексте 1 не встречаются.","эти слова («катастрофа», «хаос», «разрушение») относятся только к разделу о трагедиях Шекспира, в тексте о Мольере их нет.","Верно! Оба героя --- люди ТЕАТРА, оба писали КОМЕДИИ, оба были АКТЁРАМИ своих трупп и писали ПЬЕСЫ --- эти слова напрямую встречаются в обоих текстах.","«Франция» относится только к Мольеру, «Англия» и «Древний Рим» --- только к Шекспиру, то есть это не общие, а разделяющие слова."]},
  {"q":"Верное утверждение для обоих текстов","options":["Шекспир и Мольер начинали свои карьеры как бродячие комедианты","в произведениях Мольера и Шекспира отражены социальные конфликты феодализма","европейские драматические произведения 16-17 веков актуальны до сих пор","Шекспир и Мольер испытывали давление и гонения со стороны духовенства","Шекспир и Мольер занимались в своих театрах только режиссурой"],"correct":2,"explanations":["верно только для Мольера («исколесив всю Францию с бродячими комедиантами»), про Шекспира текст говорит, что он сразу был актёром лондонской труппы «Глобус», а не бродячим комедиантом.","феодальные социальные конфликты явно упомянуты только в тексте о Шекспире («В исторических хрониках... запечатлены кризис феодального общества»), в тексте о Мольере --- нет.","Верно! Про Мольера: «Герои... оказались узнаваемыми... вплоть до наших дней». Про Шекспира: «...находят в его драмах глубокое созвучие с вопросами... современного человечества». Оба текста прямо утверждают актуальность произведений до сих пор.","гонения со стороны церкви упомянуты только для Мольера («всю жизнь преследуемый церковью»), про Шекспира об этом ничего не сказано.","неверно для обоих --- и Мольер, и Шекспир были в первую очередь АКТЁРАМИ своих трупп, а не только режиссёрами."]},
  {"q":"Оба текста относятся к функционально-смысловому типу","options":["описание","рассуждение-доказательство","рассуждение-размышление","повествование с элементами описания","повествование с элементами рассуждения"],"correct":4,"explanations":["неточно --- чистое описание не передаёт развитие событий (карьеру, биографию), а оба текста именно рассказывают историю жизни героев.","неверно --- тексты не доказывают тезис через формальную систему аргументов, а излагают биографические факты.","неверно --- авторы не размышляют вслух от своего лица, а последовательно сообщают факты о жизни и творчестве.","неточно --- тексты не просто описывают (внешние черты, детали), они содержат именно РАССУЖДЕНИЕ: например, «Вот почему режиссеры всех стран... всегда находят возможность говорить о том, что волнует их самих» (текст 1) и «Но трагедии Шекспира не оставляют у нас чувства безнадежности... Они несут в себе силу нравственного сопротивления злу» (текст 2) --- это объяснение значения и смысла творчества, а не просто описание.","Верно! Оба текста рассказывают биографию (повествование) и при этом содержат авторские рассуждения о значении и актуальности творчества своих героев --- это повествование с элементами рассуждения."]}
];

/* ---------- Сборка теста ---------- */

// Циклически добираем массив до нужной длины n (пул может быть меньше блока).
function ktCycle(pool, n) {
  const out = [];
  if (!pool || pool.length === 0) return out;
  for (let i = 0; i < n; i++) out.push(pool[i % pool.length]);
  return out;
}

// Пул профильных вопросов направления. Если у направления есть разбивка
// по предметам (bySubject — сейчас только 7M01: Педагогика/Психология), берём
// её; иначе (остальные направления) — общий синтетический пул для обоих блоков.
function ktSubjectPool(code, subjectKey) {
  const t = DIRECTION_TESTS[code];
  if (!t) return [];
  if (t.bySubject && t.bySubject[subjectKey]) return t.bySubject[subjectKey];
  return t.questions || [];
}

// Английский распределяется пропорционально по трём разделам (Listening/Grammar/Reading),
// чтобы при любом размере блока (10 или 30) студент видел все три раздела, а не только первый.
function ktCycleStaged(stageDefs, n) {
  const k = stageDefs.length;
  const base = Math.floor(n / k);
  let rem = n - base * k;
  const out = [];
  stageDefs.forEach((s, i) => {
    const take = base + (i < rem ? 1 : 0);
    ktCycle(s.pool, take).forEach(item => out.push({ ...item, stage: s.key }));
  });
  return out;
}

// Собирает КТ: массив блоков [{id,label,questions:[{q,options,correct}]}].
function assembleKT(typeId, code, lang) {
  const type = KT_TYPES[typeId];
  const n = type.perBlock;
  const langPool = lang === 'en'
    ? ktCycleStaged([
        { key: 'listening', pool: KT_LANG_EN_STAGES.listening },
        { key: 'grammar', pool: KT_LANG_EN_STAGES.grammar },
        { key: 'reading', pool: KT_LANG_EN_STAGES.reading },
      ], n)
    : ktCycle(KT_LANG_POOL[lang], n);
  return {
    typeId, code, lang,
    blocks: [
      { id: 'lang',  label: KT_BLOCK_LABELS.lang + ' · ' + KT_LANGUAGES[lang], questions: langPool },
      { id: 'logic', label: KT_BLOCK_LABELS.logic, questions: ktCycle(KT_LOGIC_POOL, n) },
      { id: 'subj1', label: KT_BLOCK_LABELS.subj1, questions: ktCycle(ktSubjectPool(code, 'subj1'), n) },
      { id: 'subj2', label: KT_BLOCK_LABELS.subj2, questions: ktCycle(ktSubjectPool(code, 'subj2'), n) },
    ],
  };
}

// Правильность ответа: correct — число (один вариант) или массив (несколько верных, Психология).
function ktIsCorrect(item, ua) {
  if (Array.isArray(item.correct)) {
    if (!Array.isArray(ua) || ua.length === 0) return false;
    return item.correct.slice().sort().join(',') === ua.slice().sort().join(',');
  }
  return ua === item.correct;
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
    q: q.q, options: q.options, correct: q.correct, why: q.why, explanations: q.explanations, image: q.image, block: b.id,
    stage: q.stage, audio: q.audio, passage: q.passage, // только для lang-блока (en)
  })));
  activeKT = { code, typeId, lang, flat, answers: new Array(flat.length).fill(null), idx: 0, secondsLeft: KT_TYPES[typeId].timeMin * 60, timer: null };
  renderKTQuestion();
  startKTTimer();
}

function renderKTQuestion() {
  const s = activeKT;
  const item = s.flat[s.idx];
  const blockTag = item.stage ? `${ktBlockLabel(s.code, item.block)} · ${KT_LANG_STAGE_LABELS[item.stage]}` : ktBlockLabel(s.code, item.block);

  const media = item.stage === 'listening'
    ? (item.audio ? `
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
      </div>` : '')
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
    ${item.image ? `<div class="kt-question-image"><img src="${item.image}" alt="Условие вопроса"></div>` : ''}
    ${Array.isArray(item.correct) ? '<p class="kt-multi-hint">Выберите все подходящие варианты</p>' : ''}
    <div class="test-options" id="ktOptions">
      ${item.options.map((o, i) => {
        const isMulti = Array.isArray(item.correct);
        const isSel = isMulti ? (Array.isArray(s.answers[s.idx]) && s.answers[s.idx].includes(i)) : s.answers[s.idx] === i;
        return `
        <button class="test-opt ${isSel ? 'is-selected' : ''}" data-opt="${i}">
          <span class="test-radio ${isMulti ? 'is-checkbox' : ''}" aria-hidden="true"></span><span class="test-opt-label">${esc(o)}</span>
        </button>`;
      }).join('')}
    </div>
    <div class="kt-nav">
      <button class="kt-nav-btn kt-nav-prev" id="ktPrev" ${s.idx === 0 ? 'disabled' : ''} aria-label="Назад">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
      <span class="kt-nav-hint">Нажмите <b>ENTER</b></span>
      <button class="kt-nav-btn kt-nav-next is-primary" id="ktNext">
        <span>${s.idx === s.flat.length - 1 ? 'Завершить' : 'Далее'}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
      </button>
    </div>
  `;
  ktEl().querySelectorAll('[data-opt]').forEach(b => b.addEventListener('click', () => {
    const i = Number(b.dataset.opt);
    if (Array.isArray(item.correct)) {
      const cur = Array.isArray(s.answers[s.idx]) ? s.answers[s.idx].slice() : [];
      const pos = cur.indexOf(i);
      if (pos === -1) cur.push(i); else cur.splice(pos, 1);
      s.answers[s.idx] = cur;
    } else {
      s.answers[s.idx] = i;
    }
    renderKTQuestion();
  }));
  document.getElementById('ktPrev').addEventListener('click', ktPrev);
  document.getElementById('ktNext').addEventListener('click', ktNext);
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
  s.flat.forEach((item, i) => { if (ktIsCorrect(item, s.answers[i])) scores[item.block]++; });
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
function ktBlockLabel(code, block) {
  return (KT_SUBJECT_NAMES[code] && KT_SUBJECT_NAMES[code][block]) || KT_BLOCK_LABELS[block];
}

function openKTReview() {
  const s = activeKT;
  const d = findDirection(s.code);
  document.getElementById('reviewSub').textContent = `${d.code} · КТ · ${KT_TYPES[s.typeId].label} · ${KT_LANGUAGES[s.lang]}`;

  // Навигация по разделам сверху (requirement: клик переходит к вопросам раздела).
  const blockOrder = ['lang', 'logic', 'subj1', 'subj2'];
  const firstIdxByBlock = {};
  s.flat.forEach((item, i) => { if (!(item.block in firstIdxByBlock)) firstIdxByBlock[item.block] = i; });
  document.getElementById('reviewNav').innerHTML = blockOrder.filter(b => b in firstIdxByBlock).map(b => {
    const label = b === 'lang' ? `${ktBlockLabel(s.code, b)} · ${KT_LANGUAGES[s.lang]}` : ktBlockLabel(s.code, b);
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
    const isMulti = Array.isArray(item.correct);
    const correctSet = isMulti ? item.correct : [item.correct];
    const userSet = isMulti ? (Array.isArray(ua) ? ua : []) : (ua == null ? [] : [ua]);
    const wrong = !ktIsCorrect(item, ua);
    const opts = item.options.map((o, oi) => {
      const isCorrectOpt = correctSet.includes(oi);
      const isUserOpt = userSet.includes(oi);
      let cls = 'rev-opt', tag = '';
      if (isCorrectOpt) { cls += ' correct'; tag = isUserOpt ? '<span class="rev-tag ok">Ваш ответ ✓</span>' : '<span class="rev-tag ok">Правильный ответ</span>'; }
      else if (isUserOpt) { cls += ' wrong'; tag = '<span class="rev-tag bad">Ваш ответ ✗</span>'; }
      // Объяснение для студентов по каждому варианту (requirement #4) — если есть в данных.
      const expl = item.explanations && item.explanations[oi]
        ? `<div class="rev-opt-expl">${esc(item.explanations[oi])}</div>` : '';
      return `<div class="${cls}"><div class="rev-opt-row"><span>${esc(o)}</span>${tag}</div>${expl}</div>`;
    }).join('');
    const why = item.explanations ? '' : (item.why
      ? `<div class="rev-why"><b>Почему:</b> ${esc(item.why)}</div>`
      : `<div class="rev-why"><b>Правильный ответ:</b> ${esc(item.options[correctSet[0]])}</div>`);
    const blockTag = item.stage ? `${ktBlockLabel(s.code, item.block)} · ${KT_LANG_STAGE_LABELS[item.stage]}` : ktBlockLabel(s.code, item.block);
    return `
      <div class="rev-item ${wrong ? 'is-wrong' : 'is-ok'}">
        <span class="rev-block">${blockTag}</span>
        <p class="rev-q"><span class="test-qnum">${i + 1}.</span> ${esc(item.q)}</p>
        ${item.image ? `<div class="kt-question-image"><img src="${item.image}" alt="Условие вопроса"></div>` : ''}
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
